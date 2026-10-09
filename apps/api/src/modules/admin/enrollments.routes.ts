import { MID_MONTH_POLICIES } from "@mym/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { academyNow, addDays, periodBounds, periodOf } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { toCents } from "../../common/money";
import { withTransaction } from "../../common/transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { createMonthlyChargeForEnrollment, planMonthlyCharge } from "../billing/charge-service";
import { DanceClassModel, ENROLLABLE_CLASS_STATUSES } from "../classes/class.model";
import { resolveBillingPreference } from "../enrollments/billing-preference";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import {
  closeEnrollment,
  newEnrollmentFields,
  recordBillingChange,
  reopenEnrollment
} from "../enrollments/enrollment-service";
import { enrollmentPeriods, openPeriod } from "../enrollments/enrollment-validity";
import { assertSeriesCapacity, currentRules, keysOf, resolveSelection } from "../enrollments/enrollment-capacity";
import { StudentModel } from "../students/student.model";
import { calendarDateSchema, objectIdSchema } from "./admin.schemas";

const billingPreferenceSchema = z.enum(["PER_CLASS", "MONTHLY"]);
const monthlyPlanSchema = z.union([z.literal(4), z.literal(8)]);
const priceOverrideSchema = z.object({
  monthly: z.number().min(0).max(100_000_000).optional().nullable(),
  perClass: z.number().min(0).max(100_000_000).optional().nullable(),
  note: z.string().trim().max(300).optional()
});

const createEnrollmentSchema = z.object({
  classId: objectIdSchema,
  studentId: objectIdSchema,
  billingPreference: billingPreferenceSchema.optional(),
  monthlyPlan: monthlyPlanSchema.optional(),
  /** Legacy slot keys ("DAY:HH:MM:HH:MM"); `seriesIds` is preferred. */
  scheduleKeys: z.array(z.string().min(1).max(64)).min(1).max(14).optional(),
  seriesIds: z.array(objectIdSchema).min(1).max(14).optional(),
  startDate: calendarDateSchema.optional(),
  /** How to bill the first month when the student joins after the 1st. */
  joinPolicy: z.enum(MID_MONTH_POLICIES).optional(),
  joinCustomAmount: z.number().min(0).max(100_000_000).optional(),
  priceOverride: priceOverrideSchema.optional()
});

const updateBillingPreferenceSchema = z.object({
  billingPreference: billingPreferenceSchema,
  effectiveDate: calendarDateSchema.optional()
});
const updateScheduleKeysSchema = z.object({ scheduleKeys: z.array(z.string().min(1).max(64)).min(1).max(14) });
const updateSeriesSchema = z.object({ seriesIds: z.array(objectIdSchema).min(1).max(14) });
const moveEnrollmentSchema = z.object({
  targetClassId: objectIdSchema,
  billingPreference: billingPreferenceSchema.optional(),
  scheduleKeys: z.array(z.string().min(1).max(64)).min(1).max(14).optional(),
  seriesIds: z.array(objectIdSchema).min(1).max(14).optional(),
  date: calendarDateSchema.optional()
});
const endEnrollmentSchema = z.object({
  endDate: calendarDateSchema.optional(),
  reason: z.string().trim().max(300).optional()
});

export const adminEnrollmentsRouter = Router();

function priceOverrideCents(input?: z.infer<typeof priceOverrideSchema>) {
  if (!input) return undefined;
  return {
    monthlyCents: input.monthly === null || input.monthly === undefined ? undefined : toCents(input.monthly),
    perClassCents: input.perClass === null || input.perClass === undefined ? undefined : toCents(input.perClass),
    note: input.note || undefined
  };
}

/** What the first month needs after (re)enrolling a monthly student. */
async function firstMonthStatus(organizationId: string, enrollment: any, danceClass: any) {
  const start = openPeriod(enrollment)?.startDate ?? academyNow().date;
  const period = periodOf(start);
  const planned = await planMonthlyCharge(organizationId, enrollment, danceClass, period);
  return { period, startDate: start, needsDecision: planned.skip === "NEEDS_DECISION", applies: Boolean(planned.charge) || planned.skip === "NEEDS_DECISION" };
}

adminEnrollmentsRouter.get("/", async (request, response, next) => {
  try {
    const classId = objectIdSchema.parse(request.query.classId);
    const organizationId = request.auth!.organizationId;

    const danceClass = await DanceClassModel.findOne({ _id: classId, organizationId });
    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }

    const items = await EnrollmentModel.find({ organizationId, classId, status: "ACTIVE" })
      .populate("studentId", "firstName lastName email phone isActive branchId")
      .sort({ enrolledAt: 1 });

    // Inactive students keep their enrollment row until it is closed, but never take a seat.
    const occupied = items.filter((item: any) => item.studentId?.isActive !== false).length;
    response.json({
      items,
      capacity: danceClass.capacity,
      occupied,
      available: Math.max(0, danceClass.capacity - occupied)
    });
  } catch (error) {
    next(error);
  }
});

adminEnrollmentsRouter.get("/student/:studentId", async (request, response, next) => {
  try {
    const studentId = objectIdSchema.parse(request.params.studentId);
    const { includeHistory } = z.object({ includeHistory: z.enum(["true", "false"]).optional() }).parse(request.query);
    const organizationId = request.auth!.organizationId;

    const student = await StudentModel.findOne({ _id: studentId, organizationId });
    if (!student) {
      throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");
    }
    if (!student.isActive && includeHistory !== "true") {
      throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");
    }

    const items = await EnrollmentModel.find({
      organizationId,
      studentId,
      ...(includeHistory === "true" ? {} : { status: "ACTIVE" })
    })
      .populate("classId", "name branchId billingMode pricePerClass monthlyPrice freeTrialEnabled status schedules")
      .sort({ enrolledAt: -1 })
      .lean<any[]>();

    response.json({
      items: items.map((item) => ({ ...item, periods: enrollmentPeriods(item) }))
    });
  } catch (error) {
    next(error);
  }
});

adminEnrollmentsRouter.post("/", async (request, response, next) => {
  try {
    const input = createEnrollmentSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const userId = request.auth!.userId;

    const [danceClass, student] = await Promise.all([
      DanceClassModel.findOne({ _id: input.classId, organizationId, status: { $in: ENROLLABLE_CLASS_STATUSES } }).lean<any>(),
      StudentModel.findOne({ _id: input.studentId, organizationId, isActive: true })
    ]);

    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada o archivada", "CLASS_NOT_FOUND");
    }
    if (!student) {
      throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");
    }
    if (student.branchId.toString() !== danceClass.branchId.toString()) {
      throw new AppError(422, "El alumno y la clase deben pertenecer a la misma sede", "STUDENT_BRANCH_MISMATCH");
    }
    if (input.joinPolicy === "CUSTOM" && input.joinCustomAmount === undefined) {
      throw new AppError(422, "Indicá el importe personalizado del primer mes", "CUSTOM_AMOUNT_REQUIRED");
    }

    const startDate = input.startDate ?? academyNow().date;
    if (startDate < addDays(academyNow().date, -31)) {
      throw new AppError(422, "La fecha de inicio no puede ser anterior a un mes", "START_DATE_TOO_OLD");
    }
    const rules = await currentRules(organizationId, danceClass);
    const seriesIds = resolveSelection(rules, input);

    const enrollment = await withTransaction(async (dbSession) => {
      const existing = await EnrollmentModel.findOne({ organizationId, classId: danceClass._id, studentId: student._id }).session(dbSession ?? null);
      if (existing?.status === "ACTIVE") {
        throw new AppError(409, "El alumno ya está inscripto", "STUDENT_ALREADY_ENROLLED");
      }
      await assertSeriesCapacity(organizationId, danceClass, seriesIds, rules, dbSession, existing?._id);

      const billingPreference = resolveBillingPreference(danceClass.billingMode, input.billingPreference, existing?.billingPreference);
      const monthlyPlan = billingPreference === "MONTHLY" && input.monthlyPlan !== undefined
        ? input.monthlyPlan
        : undefined;
      const conditions = {
        branchId: danceClass.branchId,
        seriesIds,
        scheduleKeys: keysOf(rules, seriesIds),
        ...(monthlyPlan ? { monthlyPlan } : {}),
        ...(input.priceOverride ? { priceOverride: priceOverrideCents(input.priceOverride) } : {}),
        ...(input.joinPolicy ? { joinPolicy: input.joinPolicy } : {}),
        ...(input.joinCustomAmount !== undefined ? { joinCustomCents: toCents(input.joinCustomAmount) } : {})
      };

      let saved;
      if (existing) {
        reopenEnrollment(existing, startDate);
        recordBillingChange(existing, billingPreference, startDate, userId);
        Object.assign(existing, conditions);
        saved = await existing.save({ session: dbSession });
      } else {
        [saved] = await EnrollmentModel.create(
          [{
            organizationId,
            classId: danceClass._id,
            studentId: student._id,
            ...newEnrollmentFields({ startDate, billingPreference, userId }),
            ...conditions
          }],
          { session: dbSession }
        );
      }

      await AuditLogModel.create(
        [{
          organizationId,
          actorUserId: userId,
          action: existing ? "ENROLLMENT_REACTIVATED" : "ENROLLMENT_CREATED",
          entityType: "Enrollment",
          entityId: saved._id,
          metadata: { classId: danceClass._id, studentId: student._id, startDate, billingPreference, monthlyPlan, seriesIds, joinPolicy: input.joinPolicy }
        }],
        { session: dbSession }
      );
      return saved;
    });

    // First monthly fee: created now when there is nothing to decide, or with the decision taken.
    let firstMonth: Awaited<ReturnType<typeof firstMonthStatus>> & { chargeId?: string } = await firstMonthStatus(organizationId, enrollment.toObject(), danceClass);
    if (firstMonth.applies && (!firstMonth.needsDecision || input.joinPolicy)) {
      try {
        const charge = await createMonthlyChargeForEnrollment(
          { organizationId, userId },
          String(enrollment._id),
          firstMonth.period,
          { policy: input.joinPolicy, customCents: input.joinCustomAmount === undefined ? undefined : toCents(input.joinCustomAmount) }
        );
        firstMonth = { ...firstMonth, needsDecision: false, chargeId: String(charge._id) };
      } catch (error) {
        // An existing fee for that month (for example generated earlier) is fine.
        if (!(error instanceof AppError && error.code === "CHARGE_ALREADY_EXISTS")) throw error;
        firstMonth = { ...firstMonth, needsDecision: false };
      }
    }

    response.status(201).json({ ...enrollment.toObject(), firstMonth });
  } catch (error) {
    next(error);
  }
});

/** Legacy selection by slot keys (older screens). */
adminEnrollmentsRouter.patch("/:id/schedule-keys", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateScheduleKeysSchema.parse(request.body);
    response.json(await updateSelection(request, id, { scheduleKeys: input.scheduleKeys }));
  } catch (error) {
    next(error);
  }
});

adminEnrollmentsRouter.patch("/:id/series", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateSeriesSchema.parse(request.body);
    response.json(await updateSelection(request, id, { seriesIds: input.seriesIds }));
  } catch (error) {
    next(error);
  }
});

async function updateSelection(request: Express.Request, id: string, selection: { seriesIds?: string[]; scheduleKeys?: string[] }) {
  const organizationId = request.auth!.organizationId;
  const enrollment = await EnrollmentModel.findOne({ _id: id, organizationId, status: "ACTIVE" });
  if (!enrollment) throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
  const danceClass = await DanceClassModel.findOne({ _id: enrollment.classId, organizationId, status: { $in: ENROLLABLE_CLASS_STATUSES } }).lean<any>();
  if (!danceClass) throw new AppError(404, "Clase no encontrada o archivada", "CLASS_NOT_FOUND");
  const rules = await currentRules(organizationId, danceClass);
  const seriesIds = resolveSelection(rules, selection);

  return withTransaction(async (dbSession) => {
    await assertSeriesCapacity(organizationId, danceClass, seriesIds, rules, dbSession, enrollment._id);
    const before = { seriesIds: enrollment.seriesIds.map(String), scheduleKeys: enrollment.scheduleKeys };
    const updated = await EnrollmentModel.findOneAndUpdate(
      { _id: enrollment._id, status: "ACTIVE" },
      { $set: { seriesIds, scheduleKeys: keysOf(rules, seriesIds) } },
      { new: true, session: dbSession }
    );
    if (!updated) throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
    await AuditLogModel.create(
      [{
        organizationId,
        actorUserId: request.auth!.userId,
        action: "ENROLLMENT_SCHEDULES_UPDATED",
        entityType: "Enrollment",
        entityId: enrollment._id,
        metadata: { classId: enrollment.classId, studentId: enrollment.studentId, before, after: { seriesIds: seriesIds.map(String), scheduleKeys: updated.scheduleKeys } }
      }],
      { session: dbSession }
    );
    return updated;
  });
}

/**
 * Moves a student to another group from `date` on: the origin closes the day before and the
 * target opens that day, in one transaction (never "enrolled nowhere" after a failure).
 */
adminEnrollmentsRouter.post("/:id/move", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = moveEnrollmentSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const userId = request.auth!.userId;
    const date = input.date ?? academyNow().date;

    const preview = await EnrollmentModel.findOne({ _id: id, organizationId, status: "ACTIVE" }).lean<any>();
    if (!preview) {
      throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
    }
    const [student, targetClass] = await Promise.all([
      StudentModel.findOne({ _id: preview.studentId, organizationId, isActive: true }),
      DanceClassModel.findOne({ _id: input.targetClassId, organizationId, status: { $in: ENROLLABLE_CLASS_STATUSES } }).lean<any>()
    ]);
    if (!student || !targetClass) {
      throw new AppError(404, "Alumno o clase de destino no disponibles", "MOVE_TARGET_NOT_FOUND");
    }
    if (targetClass._id.equals(preview.classId)) {
      throw new AppError(422, "Seleccioná una clase diferente", "SAME_CLASS");
    }
    if (!targetClass.branchId.equals(student.branchId)) {
      throw new AppError(422, "La clase debe pertenecer a la misma sede", "STUDENT_BRANCH_MISMATCH");
    }
    const rules = await currentRules(organizationId, targetClass);
    const seriesIds = resolveSelection(rules, input);

    const targetEnrollment = await withTransaction(async (dbSession) => {
      const enrollment = await EnrollmentModel.findOne({ _id: id, organizationId, status: "ACTIVE" }).session(dbSession ?? null);
      if (!enrollment) throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
      const targetExisting = await EnrollmentModel.findOne({ organizationId, classId: targetClass._id, studentId: student._id }).session(dbSession ?? null);
      if (targetExisting?.status === "ACTIVE") {
        throw new AppError(409, "El alumno ya está en la clase de destino", "STUDENT_ALREADY_ENROLLED");
      }
      await assertSeriesCapacity(organizationId, targetClass, seriesIds, rules, dbSession, targetExisting?._id);

      const billingPreference = resolveBillingPreference(
        targetClass.billingMode,
        input.billingPreference,
        enrollment.billingPreference ?? targetExisting?.billingPreference
      );
      const sourceClassId = enrollment.classId;
      closeEnrollment(enrollment, addDays(date, -1), "Cambio de clase");
      await enrollment.save({ session: dbSession });

      let target;
      if (targetExisting) {
        reopenEnrollment(targetExisting, date);
        recordBillingChange(targetExisting, billingPreference, date, userId);
        targetExisting.branchId = targetClass.branchId;
        targetExisting.seriesIds = seriesIds;
        targetExisting.scheduleKeys = keysOf(rules, seriesIds);
        target = await targetExisting.save({ session: dbSession });
      } else {
        [target] = await EnrollmentModel.create(
          [{
            organizationId,
            branchId: targetClass.branchId,
            classId: targetClass._id,
            studentId: student._id,
            ...newEnrollmentFields({ startDate: date, billingPreference, userId }),
            seriesIds,
            scheduleKeys: keysOf(rules, seriesIds)
          }],
          { session: dbSession }
        );
      }

      await AuditLogModel.create(
        [{
          organizationId,
          actorUserId: userId,
          action: "ENROLLMENT_MOVED",
          entityType: "Enrollment",
          entityId: target._id,
          metadata: { studentId: student._id, sourceClassId, targetClassId: targetClass._id, date, billingPreference: billingPreference ?? null }
        }],
        { session: dbSession }
      );
      return target;
    });

    const firstMonth = await firstMonthStatus(organizationId, targetEnrollment.toObject(), targetClass);
    response.json({ ...targetEnrollment.toObject(), firstMonth });
  } catch (error) {
    next(error);
  }
});

/**
 * Changes the billing mode from a day on. Charges already issued stay as they are: switching
 * from per-class to monthly never erases class fees; recognizing them as credit is an explicit
 * adjustment on the monthly fee (POST /admin/billing/charges/:id/adjustments).
 */
adminEnrollmentsRouter.patch("/:id/billing-preference", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateBillingPreferenceSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const enrollment = await EnrollmentModel.findOne({ _id: id, organizationId, status: "ACTIVE" });
    if (!enrollment) {
      throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
    }
    const danceClass = await DanceClassModel.findOne({ _id: enrollment.classId, organizationId, status: { $in: ENROLLABLE_CLASS_STATUSES } }).lean<any>();
    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada o archivada", "CLASS_NOT_FOUND");
    }

    const effectiveDate = input.effectiveDate ?? academyNow().date;
    if (effectiveDate < periodBounds(periodOf(academyNow().date)).from) {
      throw new AppError(422, "El cambio de modalidad no puede regir desde un mes anterior", "RETROACTIVE_BILLING_CHANGE");
    }
    const previous = enrollment.billingPreference;
    const billingPreference = resolveBillingPreference(danceClass.billingMode, input.billingPreference);
    recordBillingChange(enrollment, billingPreference, effectiveDate, request.auth!.userId);
    await enrollment.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "ENROLLMENT_BILLING_UPDATED",
      entityType: "Enrollment",
      entityId: enrollment._id,
      metadata: { classId: enrollment.classId, studentId: enrollment.studentId, from: previous, billingPreference, effectiveDate }
    });

    const monthly = billingPreference === "MONTHLY"
      ? await planMonthlyCharge(organizationId, enrollment.toObject(), danceClass, periodOf(effectiveDate))
      : undefined;
    response.json({
      ...enrollment.toObject(),
      monthlyCharge: monthly
        ? { period: periodOf(effectiveDate), needsDecision: monthly.skip === "NEEDS_DECISION", ready: Boolean(monthly.charge) }
        : undefined
    });
  } catch (error) {
    next(error);
  }
});

/** Commercial conditions (custom prices) of an enrollment. */
adminEnrollmentsRouter.patch("/:id/conditions", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = priceOverrideSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const enrollment = await EnrollmentModel.findOne({ _id: id, organizationId });
    if (!enrollment) throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
    const before = enrollment.priceOverride ? { ...enrollment.priceOverride } : null;
    enrollment.priceOverride = priceOverrideCents(input);
    await enrollment.save();
    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "ENROLLMENT_CONDITIONS_UPDATED",
      entityType: "Enrollment",
      entityId: enrollment._id,
      metadata: { before, after: enrollment.priceOverride }
    });
    response.json(enrollment);
  } catch (error) {
    next(error);
  }
});

/** Ends the enrollment. History, attendance and debts before the end date stay untouched. */
adminEnrollmentsRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = endEnrollmentSchema.parse({ ...(request.query ?? {}), ...(request.body ?? {}) });
    const organizationId = request.auth!.organizationId;

    const enrollment = await EnrollmentModel.findOne({ _id: id, organizationId, status: "ACTIVE" });
    if (!enrollment) {
      throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
    }
    const lastDay = input.endDate ?? academyNow().date;
    closeEnrollment(enrollment, lastDay, input.reason);
    await enrollment.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "ENROLLMENT_ENDED",
      entityType: "Enrollment",
      entityId: enrollment._id,
      metadata: { classId: enrollment.classId, studentId: enrollment.studentId, endDate: lastDay, reason: input.reason }
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
