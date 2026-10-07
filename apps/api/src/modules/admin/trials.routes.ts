import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { resolveBillingPreference } from "../enrollments/billing-preference";
import { assertSeriesCapacity, currentRules, keysOf, resolveSelection } from "../enrollments/enrollment-capacity";
import { newEnrollmentFields, recordBillingChange, reopenEnrollment } from "../enrollments/enrollment-service";
import { academyDateOf, academyInstant, academyNow, isCalendarDate } from "../../common/dates";
import { withTransaction } from "../../common/transaction";
import { ENROLLABLE_CLASS_STATUSES } from "../classes/class.model";
import { generateSessions } from "../scheduling/session-generator";
import { ClassSessionModel } from "../sessions/class-session.model";
import { rosterCounts } from "../sessions/roster-service";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { TRIAL_STATUSES, TrialBookingModel } from "../trials/trial-booking.model";
import { objectIdSchema } from "./admin.schemas";

const createTrialSchema = z.object({
  classId: objectIdSchema,
  studentId: objectIdSchema,
  /** Calendar day of the trial ("YYYY-MM-DD"); a full instant is read as its Argentina day. */
  scheduledFor: z
    .union([z.string().trim(), z.date()])
    .refine((value) => !Number.isNaN(new Date(value).getTime()) || isCalendarDate(value), "La fecha no es válida"),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});

const updateTrialSchema = z.object({
  status: z.enum(TRIAL_STATUSES).refine(
    (value) => value === "COMPLETED" || value === "CANCELLED",
    "Sólo se puede completar o cancelar desde este endpoint"
  )
});

const convertTrialSchema = z.object({
  billingPreference: z.enum(["PER_CLASS", "MONTHLY"]).optional(),
  seriesIds: z.array(objectIdSchema).min(1).max(14).optional(),
  scheduleKeys: z.array(z.string().min(1).max(64)).min(1).max(14).optional()
});

export const adminTrialsRouter = Router();

adminTrialsRouter.get("/", async (request, response, next) => {
  try {
    const classId = objectIdSchema.parse(request.query.classId);
    const organizationId = request.auth!.organizationId;

    const items = await TrialBookingModel.find({
      organizationId,
      classId
    })
      .populate("studentId", "firstName lastName email phone branchId isActive")
      .sort({ scheduledFor: 1, createdAt: 1 });

    response.json({ items });
  } catch (error) {
    next(error);
  }
});

adminTrialsRouter.post("/", async (request, response, next) => {
  try {
    const input = createTrialSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const [danceClass, student] = await Promise.all([
      DanceClassModel.findOne({
        _id: input.classId,
        organizationId,
        status: { $in: ENROLLABLE_CLASS_STATUSES }
      }),
      StudentModel.findOne({
        _id: input.studentId,
        organizationId,
        isActive: true
      })
    ]);

    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada o inactiva", "CLASS_NOT_FOUND");
    }
    if (!danceClass.freeTrialEnabled) {
      throw new AppError(422, "Esta clase no admite prueba gratuita", "FREE_TRIAL_NOT_ENABLED");
    }
    if (!student) {
      throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");
    }
    if (!danceClass.branchId.equals(student.branchId)) {
      throw new AppError(422, "El alumno y la clase deben pertenecer a la misma sede", "STUDENT_BRANCH_MISMATCH");
    }

    const [activeEnrollment, duplicateTrial] = await Promise.all([
      EnrollmentModel.exists({
        organizationId,
        classId: danceClass._id,
        studentId: student._id,
        status: "ACTIVE"
      }),
      TrialBookingModel.exists({
        organizationId,
        classId: danceClass._id,
        studentId: student._id,
        status: "SCHEDULED"
      })
    ]);

    if (activeEnrollment) {
      throw new AppError(409, "El alumno ya está inscripto en esta clase", "STUDENT_ALREADY_ENROLLED");
    }
    if (duplicateTrial) {
      throw new AppError(409, "El alumno ya tiene una prueba agendada para esta clase", "TRIAL_ALREADY_SCHEDULED");
    }

    // The trial must fall on a day the group meets, today or later, and with a free seat.
    // A day without zone ("2026-10-08" or "2026-10-08T12:00:00") is that calendar day.
    const raw = input.scheduledFor;
    const trialDate =
      typeof raw === "string" && isCalendarDate(raw.slice(0, 10)) && !/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(raw)
        ? raw.slice(0, 10)
        : academyDateOf(new Date(raw));
    if (trialDate < academyNow().date) {
      throw new AppError(422, "La prueba debe ser hoy o en una fecha futura", "TRIAL_IN_PAST");
    }
    await generateSessions(organizationId, { from: trialDate, to: trialDate, classIds: [danceClass._id] });
    const sessions = await ClassSessionModel.find({
      organizationId,
      classId: danceClass._id,
      sessionDate: trialDate,
      status: "SCHEDULED"
    }).lean<any[]>();
    if (!sessions.length) {
      throw new AppError(422, "La clase no se dicta ese día", "TRIAL_NOT_A_CLASS_DAY");
    }
    const counts = await rosterCounts(organizationId, sessions);
    if (!sessions.some((session) => (counts.get(String(session._id)) ?? 0) < danceClass.capacity)) {
      throw new AppError(409, "La clase no tiene cupo ese día", "SESSION_CAPACITY_REACHED");
    }

    const trial = await TrialBookingModel.create({
      organizationId,
      branchId: danceClass.branchId,
      classId: danceClass._id,
      studentId: student._id,
      // Noon in Argentina: the trial belongs to that calendar day whatever the server zone is.
      scheduledFor: academyInstant(trialDate, "12:00"),
      status: "SCHEDULED",
      notes: input.notes?.trim() || undefined
    });

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "TRIAL_BOOKED",
      entityType: "TrialBooking",
      entityId: trial._id,
      metadata: {
        classId: danceClass._id,
        studentId: student._id,
        scheduledFor: trial.scheduledFor
      }
    });

    response.status(201).json(trial);
  } catch (error) {
    next(error);
  }
});

adminTrialsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateTrialSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const trial = await TrialBookingModel.findOne({
      _id: id,
      organizationId
    });

    if (!trial) {
      throw new AppError(404, "Prueba no encontrada", "TRIAL_NOT_FOUND");
    }
    if (trial.status === "CONVERTED") {
      throw new AppError(409, "La prueba ya fue convertida en inscripción", "TRIAL_ALREADY_CONVERTED");
    }

    trial.status = input.status;
    await trial.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: input.status === "COMPLETED" ? "TRIAL_COMPLETED" : "TRIAL_CANCELLED",
      entityType: "TrialBooking",
      entityId: trial._id
    });

    response.json(trial);
  } catch (error) {
    next(error);
  }
});

adminTrialsRouter.post("/:id/convert", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = convertTrialSchema.parse(request.body ?? {});
    const organizationId = request.auth!.organizationId;

    const trial = await TrialBookingModel.findOne({
      _id: id,
      organizationId,
      status: { $in: ["SCHEDULED", "COMPLETED"] }
    });

    if (!trial) {
      throw new AppError(404, "Prueba disponible para convertir no encontrada", "TRIAL_NOT_CONVERTIBLE");
    }

    const [danceClass, student] = await Promise.all([
      DanceClassModel.findOne({
        _id: trial.classId,
        organizationId,
        status: { $in: ENROLLABLE_CLASS_STATUSES }
      }).lean<any>(),
      StudentModel.findOne({
        _id: trial.studentId,
        organizationId,
        isActive: true
      })
    ]);

    if (!danceClass || !student) {
      throw new AppError(404, "Alumno o clase ya no están disponibles", "TRIAL_TARGET_NOT_AVAILABLE");
    }

    // Converting books the student in the chosen slots, with the same capacity rule as enrolling.
    const rules = await currentRules(organizationId, danceClass);
    const seriesIds = resolveSelection(rules, input);
    const startDate = academyNow().date;

    const enrollment = await withTransaction(async (dbSession) => {
      const existing = await EnrollmentModel.findOne({
        organizationId,
        classId: trial.classId,
        studentId: trial.studentId
      }).session(dbSession ?? null);
      if (existing?.status === "ACTIVE") return existing;
      await assertSeriesCapacity(organizationId, danceClass, seriesIds, rules, dbSession, existing?._id);

      const billingPreference = resolveBillingPreference(
        danceClass.billingMode,
        input.billingPreference,
        existing?.billingPreference
      );
      if (existing) {
        reopenEnrollment(existing, startDate);
        recordBillingChange(existing, billingPreference, startDate, request.auth!.userId);
        existing.branchId = danceClass.branchId;
        existing.seriesIds = seriesIds;
        existing.scheduleKeys = keysOf(rules, seriesIds);
        return existing.save({ session: dbSession });
      }
      const [created] = await EnrollmentModel.create(
        [{
          organizationId,
          branchId: danceClass.branchId,
          classId: danceClass._id,
          studentId: student._id,
          ...newEnrollmentFields({ startDate, billingPreference, userId: request.auth!.userId }),
          seriesIds,
          scheduleKeys: keysOf(rules, seriesIds)
        }],
        { session: dbSession }
      );
      return created;
    });
    const billingPreference = enrollment.billingPreference;

    trial.status = "CONVERTED";
    trial.convertedEnrollmentId = enrollment!._id;
    await trial.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "TRIAL_CONVERTED_TO_ENROLLMENT",
      entityType: "TrialBooking",
      entityId: trial._id,
      metadata: {
        enrollmentId: enrollment!._id,
        classId: danceClass._id,
        studentId: student._id,
        billingPreference: billingPreference ?? null
      }
    });

    response.json({ trial, enrollment });
  } catch (error) {
    next(error);
  }
});
