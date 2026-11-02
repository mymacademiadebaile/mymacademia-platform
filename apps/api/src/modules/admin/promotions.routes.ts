import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { academyNow, periodOf } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { toCents, toPesos } from "../../common/money";
import { withTransaction } from "../../common/transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { planMonthlyCharge, priceCents } from "../billing/charge-service";
import { ChargeModel } from "../billing/charge.model";
import { applyPromotionToExistingCharge, quotePromotion, recordPromotionAdjustment } from "../promotions/promotion-service";
import { DanceClassModel, ENROLLABLE_CLASS_STATUSES } from "../classes/class.model";
import { resolveMonthlyPlan } from "../classes/monthly-plans";
import { resolveBillingPreference } from "../enrollments/billing-preference";
import { assertSeriesCapacity, currentRules, keysOf, resolveSelection } from "../enrollments/enrollment-capacity";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { newEnrollmentFields } from "../enrollments/enrollment-service";
import { PromotionModel, PROMOTION_CHARGE_KINDS, PROMOTION_KINDS } from "../promotions/promotion.model";
import { PromotionPairModel } from "../promotions/promotion-pair.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";
import { calendarDateSchema, objectIdSchema } from "./admin.schemas";

export const adminPromotionsRouter = Router();

const money = z.number().min(0).max(100_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Usá como máximo dos decimales");
const createSchema = z.object({
  classId: objectIdSchema,
  name: z.string().trim().min(3).max(120),
  kind: z.enum(PROMOTION_KINDS),
  appliesTo: z.enum(PROMOTION_CHARGE_KINDS),
  percent: z.number().positive().max(100).optional(),
  value: money.optional(),
  registrationFrom: calendarDateSchema.optional(),
  registrationTo: calendarDateSchema.optional(),
  benefitFrom: calendarDateSchema,
  benefitTo: calendarDateSchema,
  sessionId: objectIdSchema.optional()
}).superRefine((value, context) => {
  if (value.benefitTo < value.benefitFrom) context.addIssue({ code: "custom", path: ["benefitTo"], message: "La fecha final precede al inicio" });
  if (value.kind === "TWO_FOR_ONE") {
    if (!value.registrationFrom || !value.registrationTo || value.registrationTo < value.registrationFrom) {
      context.addIssue({ code: "custom", path: ["registrationTo"], message: "Indicá una ventana de inscripción válida" });
    }
    if (value.registrationFrom && value.benefitTo < value.registrationFrom) {
      context.addIssue({ code: "custom", path: ["benefitTo"], message: "El beneficio debe terminar después de que abra la inscripción" });
    }
    if (value.registrationTo && value.benefitTo < value.registrationTo) {
      context.addIssue({ code: "custom", path: ["registrationTo"], message: "La inscripción debe cerrar antes de que termine el beneficio" });
    }
  } else if (value.registrationFrom || value.registrationTo) {
    context.addIssue({ code: "custom", path: ["registrationFrom"], message: "La ventana de inscripción es solo para 2x1" });
  }
  if (value.kind === "PERCENT" && (value.percent === undefined || Math.round(value.percent * 100) <= 0)) {
    context.addIssue({ code: "custom", path: ["percent"], message: "Indicá el porcentaje" });
  }
  if (["AMOUNT_OFF", "FINAL_PRICE"].includes(value.kind) && value.value === undefined) {
    context.addIssue({ code: "custom", path: ["value"], message: "Indicá el importe" });
  }
  if (value.kind === "AMOUNT_OFF" && value.value === 0) {
    context.addIssue({ code: "custom", path: ["value"], message: "El descuento debe ser mayor a cero" });
  }
});

adminPromotionsRouter.get("/", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;
    const promotions = await PromotionModel.find({ organizationId }).sort({ createdAt: -1 }).lean();
    const [pairs, sessions] = await Promise.all([
      PromotionPairModel.find({ organizationId, promotionId: { $in: promotions.map((item) => item._id) } }).lean(),
      ClassSessionModel.find({ organizationId, _id: { $in: promotions.map((item) => item.sessionId).filter(Boolean) } })
        .select("sessionDate startTime endTime").lean()
    ]);
    const students = await StudentModel.find({ organizationId, _id: { $in: pairs.flatMap((pair) => [pair.payerStudentId, pair.beneficiaryStudentId]) } })
      .select("firstName lastName").lean();
    const nameById = new Map(students.map((student) => [String(student._id), `${student.firstName} ${student.lastName}`]));
    const sessionById = new Map(sessions.map((session) => [String(session._id), session]));
    response.json({
      items: promotions.map((item) => ({
        ...item,
        session: item.sessionId ? sessionById.get(String(item.sessionId)) ?? null : null,
        pairs: pairs.filter((pair) => String(pair.promotionId) === String(item._id)).map((pair) => ({
          ...pair,
          payerName: nameById.get(String(pair.payerStudentId)) ?? "Alumno",
          beneficiaryName: nameById.get(String(pair.beneficiaryStudentId)) ?? "Alumno"
        }))
      }))
    });
  } catch (error) { next(error); }
});

adminPromotionsRouter.post("/", async (request, response, next) => {
  try {
    const input = createSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const danceClass = await DanceClassModel.findOne({ _id: input.classId, organizationId });
    if (!danceClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    if (danceClass.billingMode === "FREE" ||
      input.appliesTo === "MONTHLY_FEE" && danceClass.billingMode === "PER_CLASS" ||
      input.appliesTo === "CLASS_FEE" && danceClass.billingMode === "MONTHLY") {
      throw new AppError(422, "La clase no admite esa modalidad de promoción", "PROMOTION_BILLING_MODE");
    }
    if (input.sessionId) {
      const session = await ClassSessionModel.findOne({ _id: input.sessionId, organizationId, classId: input.classId }).lean();
      if (!session || session.sessionDate < input.benefitFrom || session.sessionDate > input.benefitTo) {
        throw new AppError(422, "La sesión debe pertenecer a la clase y estar dentro del beneficio", "PROMOTION_SESSION_INVALID");
      }
    }
    const overlapping = await PromotionModel.findOne({
      organizationId, classId: input.classId, appliesTo: input.appliesTo, status: "ACTIVE",
      benefitFrom: { $lte: input.benefitTo }, benefitTo: { $gte: input.benefitFrom },
      ...(input.kind === "TWO_FOR_ONE" ? { kind: { $ne: "TWO_FOR_ONE" } } : {})
    }).lean();
    if (overlapping) throw new AppError(409, "Ya hay una promoción activa de esa clase y modalidad en esas fechas", "PROMOTION_OVERLAP");
    const { promotion, appliedExisting } = await withTransaction(async (dbSession) => {
      await DanceClassModel.updateOne({ _id: input.classId, organizationId }, { $inc: { lockVersion: 1 } }, { session: dbSession });
      const concurrentOverlap = await PromotionModel.exists({
        organizationId, classId: input.classId, appliesTo: input.appliesTo, status: "ACTIVE",
        benefitFrom: { $lte: input.benefitTo }, benefitTo: { $gte: input.benefitFrom },
        ...(input.kind === "TWO_FOR_ONE" ? { kind: { $ne: "TWO_FOR_ONE" } } : {})
      }).session(dbSession ?? null);
      if (concurrentOverlap) throw new AppError(409, "Ya hay una promoción activa de esa clase y modalidad en esas fechas", "PROMOTION_OVERLAP");
      const [promotion] = await PromotionModel.create([{
        organizationId, classId: input.classId, name: input.name, kind: input.kind,
        appliesTo: input.appliesTo, benefitFrom: input.benefitFrom, benefitTo: input.benefitTo,
        registrationFrom: input.registrationFrom, registrationTo: input.registrationTo,
        sessionId: input.sessionId,
        percentBasisPoints: input.percent === undefined ? undefined : Math.round(input.percent * 100),
        valueCents: input.value === undefined ? undefined : toCents(input.value),
        status: "ACTIVE", createdByUserId: request.auth!.userId
      }], { session: dbSession });
      let appliedExisting = 0;
      if (input.kind !== "TWO_FOR_ONE") {
        const scope = input.appliesTo === "MONTHLY_FEE"
          ? { period: { $gte: input.benefitFrom.slice(0, 7), $lte: input.benefitTo.slice(0, 7) } }
          : { serviceDate: { $gte: input.benefitFrom, $lte: input.benefitTo } };
        const charges = await ChargeModel.find({
          organizationId, classId: input.classId, kind: input.appliesTo,
          status: { $ne: "VOID" }, promotionId: { $exists: false }, ...scope
        }).session(dbSession ?? null);
        const enrollments = await EnrollmentModel.find({
          organizationId, _id: { $in: charges.map((charge) => charge.enrollmentId).filter(Boolean) }
        }).session(dbSession ?? null).lean();
        const byId = new Map(enrollments.map((item) => [String(item._id), item]));
        for (const charge of charges) {
          const applied = await applyPromotionToExistingCharge(charge, {
            organizationId, classId: input.classId, studentId: charge.studentId,
            enrollment: charge.enrollmentId ? byId.get(String(charge.enrollmentId)) : null,
            kind: input.appliesTo, period: charge.period, serviceDate: charge.serviceDate,
            sessionId: charge.sessionId, amountCents: charge.amountCents
          }, dbSession, request.auth!.userId);
          if (applied) appliedExisting += 1;
        }
      }
      await AuditLogModel.create([{ organizationId, actorUserId: request.auth!.userId, action: "PROMOTION_CREATED", entityType: "Promotion", entityId: promotion._id, metadata: { ...input, appliedExisting } }], { session: dbSession });
      return { promotion, appliedExisting };
    });
    response.status(201).json({ ...promotion.toObject(), appliedExisting });
  } catch (error) { next(error); }
});

adminPromotionsRouter.post("/:id/deactivate", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;
    const promotion = await PromotionModel.findOneAndUpdate({ _id: id, organizationId }, { $set: { status: "INACTIVE" } }, { new: true });
    if (!promotion) throw new AppError(404, "Promoción no encontrada", "PROMOTION_NOT_FOUND");
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: "PROMOTION_DEACTIVATED", entityType: "Promotion", entityId: promotion._id });
    response.json(promotion);
  } catch (error) { next(error); }
});

adminPromotionsRouter.get("/:id/eligible-students", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;
    const promotion = await PromotionModel.findOne({ _id: id, organizationId, kind: "TWO_FOR_ONE", status: "ACTIVE" }).lean();
    if (!promotion) throw new AppError(404, "Promoción 2x1 activa no encontrada", "PROMOTION_NOT_FOUND");
    const danceClass = await DanceClassModel.findOne({ _id: promotion.classId, organizationId }).select("branchId").lean();
    if (!danceClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    const [students, enrolledIds] = await Promise.all([
      StudentModel.find({ organizationId, branchId: danceClass.branchId, isActive: true }).select("firstName lastName").sort({ lastName: 1, firstName: 1 }).lean(),
      EnrollmentModel.distinct("studentId", { organizationId, classId: promotion.classId })
    ]);
    const enrolled = new Set(enrolledIds.map(String));
    response.json({ items: students.filter((student) => !enrolled.has(String(student._id))) });
  } catch (error) { next(error); }
});

adminPromotionsRouter.post("/:id/pairs/:pairId/void", async (request, response, next) => {
  try {
    const promotionId = objectIdSchema.parse(request.params.id);
    const pairId = objectIdSchema.parse(request.params.pairId);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(request.body);
    const organizationId = request.auth!.organizationId;
    const pair = await PromotionPairModel.findOneAndUpdate(
      { _id: pairId, promotionId, organizationId, voidedAt: { $exists: false } },
      { $set: { voidedAt: new Date(), voidReason: reason, voidedByUserId: request.auth!.userId } },
      { new: true }
    );
    if (!pair) throw new AppError(404, "Pareja activa no encontrada", "PROMOTION_PAIR_NOT_FOUND");
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: "PROMOTION_PAIR_VOIDED", entityType: "PromotionPair", entityId: pair._id, metadata: { reason } });
    response.json(pair);
  } catch (error) { next(error); }
});

const enrollPairSchema = z.object({
  payerStudentId: objectIdSchema,
  beneficiaryStudentId: objectIdSchema,
  startDate: calendarDateSchema.optional(),
  billingPreference: z.enum(["MONTHLY", "PER_CLASS"]).optional(),
  monthlyPlan: z.union([z.literal(4), z.literal(8)]).optional(),
  seriesIds: z.array(objectIdSchema).max(14).optional(),
  joinPolicy: z.enum(["FULL", "PRORATED", "CUSTOM"]).optional(),
  joinCustomAmount: money.optional()
});

adminPromotionsRouter.post("/:id/pair-preview", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = enrollPairSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const promotion = await PromotionModel.findOne({ _id: id, organizationId, kind: "TWO_FOR_ONE", status: "ACTIVE" }).lean();
    if (!promotion) throw new AppError(404, "Promoción 2x1 activa no encontrada", "PROMOTION_NOT_FOUND");
    const startDate = input.startDate ?? academyNow().date;
    if (!promotion.registrationFrom || !promotion.registrationTo ||
      academyNow().date < promotion.registrationFrom || academyNow().date > promotion.registrationTo ||
      startDate < promotion.registrationFrom || startDate > promotion.registrationTo || startDate > promotion.benefitTo) {
      throw new AppError(422, "La fecha no califica para esta promoción", "PROMOTION_REGISTRATION_CLOSED");
    }
    if (input.payerStudentId === input.beneficiaryStudentId) throw new AppError(422, "Elegí dos personas diferentes", "PROMOTION_PAIR_SAME_STUDENT");
    const [danceClass, students, alreadyEnrolled] = await Promise.all([
      DanceClassModel.findOne({ _id: promotion.classId, organizationId }).lean<any>(),
      StudentModel.find({ organizationId, _id: { $in: [input.payerStudentId, input.beneficiaryStudentId] }, isActive: true }).lean(),
      EnrollmentModel.exists({ organizationId, classId: promotion.classId, studentId: { $in: [input.payerStudentId, input.beneficiaryStudentId] } })
    ]);
    if (!danceClass || students.length !== 2 || students.some((student) => String(student.branchId) !== String(danceClass.branchId))) {
      throw new AppError(422, "Elegí dos alumnos activos de la sede", "PROMOTION_PAIR_CONTEXT_NOT_FOUND");
    }
    if (alreadyEnrolled) throw new AppError(409, "El 2x1 es para nuevos inscriptos de esta clase", "PROMOTION_REQUIRES_NEW_ENROLLMENT");
    const mode = resolveBillingPreference(danceClass.billingMode, input.billingPreference);
    if (promotion.appliesTo === "MONTHLY_FEE" && mode !== "MONTHLY" || promotion.appliesTo === "CLASS_FEE" && mode !== "PER_CLASS") {
      throw new AppError(422, "Elegí la modalidad que cubre el 2x1", "PROMOTION_PAIR_BILLING_MODE");
    }
    const monthlyPlan = mode === "MONTHLY" ? resolveMonthlyPlan(danceClass, input.monthlyPlan) : undefined;
    const rules = await currentRules(organizationId, danceClass);
    const seriesIds = resolveSelection(rules, input);
    if (mode === "PER_CLASS") {
      const base = priceCents(danceClass, { monthlyPlan }, "CLASS_FEE");
      const serviceDate = promotion.benefitFrom < startDate ? startDate : promotion.benefitFrom;
      const quote = await quotePromotion({
        organizationId, classId: danceClass._id, studentId: input.beneficiaryStudentId,
        kind: "CLASS_FEE", period: periodOf(serviceDate), serviceDate, sessionId: promotion.sessionId,
        amountCents: base, assumeBeneficiaryPromotionId: id
      });
      response.json({ kind: "CLASS_FEE", period: periodOf(serviceDate), payer: toPesos(base), beneficiary: toPesos(base - (quote?.discountCents ?? 0)) });
      return;
    }
    const draft = (studentId: string) => ({
      _id: new Types.ObjectId(), organizationId: new Types.ObjectId(organizationId), branchId: danceClass.branchId,
      classId: danceClass._id, studentId: new Types.ObjectId(studentId), status: "ACTIVE",
      periods: [{ startDate }], billingPreference: "MONTHLY", billingChanges: [{ effectiveDate: startDate, mode: "MONTHLY" }],
      seriesIds, monthlyPlan, joinPolicy: input.joinPolicy,
      joinCustomCents: input.joinCustomAmount === undefined ? undefined : toCents(input.joinCustomAmount)
    });
    const period = periodOf(startDate);
    const options = { policy: input.joinPolicy, customCents: input.joinCustomAmount === undefined ? undefined : toCents(input.joinCustomAmount) };
    const [payer, beneficiary] = await Promise.all([
      planMonthlyCharge(organizationId, draft(input.payerStudentId), danceClass, period, options),
      planMonthlyCharge(organizationId, draft(input.beneficiaryStudentId), danceClass, period, { ...options, assumeBeneficiaryPromotionId: id })
    ]);
    if (!payer.charge || !beneficiary.charge) throw new AppError(422, "Definí cómo cobrar el primer mes para ver el importe", "PROMOTION_PREVIEW_NEEDS_DECISION");
    response.json({
      kind: "MONTHLY_FEE", period,
      payer: toPesos(payer.charge.balanceCents as number),
      beneficiary: toPesos(beneficiary.charge.balanceCents as number),
      discount: toPesos(beneficiary.charge.promotionDiscountCents as number ?? 0)
    });
  } catch (error) { next(error); }
});

adminPromotionsRouter.post("/:id/enroll-pair", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = enrollPairSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const userId = request.auth!.userId;
    const startDate = input.startDate ?? academyNow().date;
    if (input.payerStudentId === input.beneficiaryStudentId) throw new AppError(422, "Elegí dos personas diferentes", "PROMOTION_PAIR_SAME_STUDENT");
    if (input.joinPolicy === "CUSTOM" && input.joinCustomAmount === undefined) throw new AppError(422, "Indicá el importe del primer mes", "CUSTOM_AMOUNT_REQUIRED");
    const promotion = await PromotionModel.findOne({ _id: id, organizationId, kind: "TWO_FOR_ONE", status: "ACTIVE" });
    if (!promotion) throw new AppError(404, "Promoción 2x1 activa no encontrada", "PROMOTION_NOT_FOUND");
    const registrationDay = academyNow().date;
    if (!promotion.registrationFrom || !promotion.registrationTo ||
      registrationDay < promotion.registrationFrom || registrationDay > promotion.registrationTo ||
      startDate < promotion.registrationFrom || startDate > promotion.registrationTo || startDate > promotion.benefitTo) {
      throw new AppError(422, "La fecha de inscripción está fuera de la promoción", "PROMOTION_REGISTRATION_CLOSED");
    }
    const [danceClass, payer, beneficiary] = await Promise.all([
      DanceClassModel.findOne({ _id: promotion.classId, organizationId, status: { $in: ENROLLABLE_CLASS_STATUSES } }).lean<any>(),
      StudentModel.findOne({ _id: input.payerStudentId, organizationId, isActive: true }),
      StudentModel.findOne({ _id: input.beneficiaryStudentId, organizationId, isActive: true })
    ]);
    if (!danceClass || !payer || !beneficiary) throw new AppError(404, "Clase o alumnos no disponibles", "PROMOTION_PAIR_CONTEXT_NOT_FOUND");
    if (!payer.branchId.equals(danceClass.branchId) || !beneficiary.branchId.equals(danceClass.branchId)) {
      throw new AppError(422, "Ambos alumnos deben pertenecer a la sede de la clase", "PROMOTION_PAIR_BRANCH_MISMATCH");
    }
    const billingPreference = resolveBillingPreference(danceClass.billingMode, input.billingPreference);
    if (promotion.appliesTo === "MONTHLY_FEE" && billingPreference !== "MONTHLY" ||
      promotion.appliesTo === "CLASS_FEE" && billingPreference !== "PER_CLASS") {
      throw new AppError(422, "Elegí la modalidad que cubre el 2x1", "PROMOTION_PAIR_BILLING_MODE");
    }
    const monthlyPlan = billingPreference === "MONTHLY" ? resolveMonthlyPlan(danceClass, input.monthlyPlan) : undefined;
    if (billingPreference === "MONTHLY" && startDate.slice(8) !== "01" && !input.joinPolicy) {
      throw new AppError(422, "Definí cómo cobrar el primer mes", "FIRST_MONTH_POLICY_REQUIRED");
    }
    const rules = await currentRules(organizationId, danceClass);
    const seriesIds = resolveSelection(rules, input);
    const result = await withTransaction(async (dbSession) => {
      const prior = await EnrollmentModel.find({ organizationId, classId: danceClass._id, studentId: { $in: [payer._id, beneficiary._id] } })
        .session(dbSession ?? null);
      if (prior.length) throw new AppError(409, "El 2x1 es para nuevos inscriptos de esta clase", "PROMOTION_REQUIRES_NEW_ENROLLMENT");
      const assigned = await PromotionPairModel.exists({ organizationId, classId: danceClass._id,
        voidedAt: { $exists: false },
        participantIds: { $in: [payer._id, beneficiary._id] }, benefitFrom: { $lte: promotion.benefitTo }, benefitTo: { $gte: promotion.benefitFrom } })
        .session(dbSession ?? null);
      if (assigned) throw new AppError(409, "Uno de los alumnos ya pertenece a otro 2x1 de esa clase", "PROMOTION_PAIR_OVERLAP");

      const enrollments = [];
      for (const student of [payer, beneficiary]) {
        await assertSeriesCapacity(organizationId, danceClass, seriesIds, rules, dbSession);
        const [enrollment] = await EnrollmentModel.create([{
          organizationId, branchId: danceClass.branchId, classId: danceClass._id, studentId: student._id,
          ...newEnrollmentFields({ startDate, billingPreference, userId }),
          seriesIds, scheduleKeys: keysOf(rules, seriesIds), monthlyPlan,
          joinPolicy: input.joinPolicy,
          joinCustomCents: input.joinCustomAmount === undefined ? undefined : toCents(input.joinCustomAmount)
        }], { session: dbSession });
        enrollments.push(enrollment);
      }
      const [pair] = await PromotionPairModel.create([{
        organizationId, promotionId: promotion._id, classId: danceClass._id,
        payerStudentId: payer._id, beneficiaryStudentId: beneficiary._id,
        payerEnrollmentId: enrollments[0]._id, beneficiaryEnrollmentId: enrollments[1]._id,
        participantIds: [payer._id, beneficiary._id], assignedAt: new Date(),
        benefitFrom: promotion.benefitFrom, benefitTo: promotion.benefitTo,
        createdByUserId: userId
      }], { session: dbSession });
      const charges = [];
      if (billingPreference === "MONTHLY") {
        for (const enrollment of enrollments) {
          const planned = await planMonthlyCharge(organizationId, enrollment.toObject(), danceClass, periodOf(startDate), {
            policy: input.joinPolicy,
            customCents: input.joinCustomAmount === undefined ? undefined : toCents(input.joinCustomAmount),
            dbSession
          });
          if (planned.charge) {
            const [charge] = await ChargeModel.create([{ ...planned.charge, createdByUserId: userId }], { session: dbSession });
            await recordPromotionAdjustment(charge, dbSession, userId);
            charges.push(charge);
          }
        }
      }
      await AuditLogModel.create([{
        organizationId, actorUserId: userId, action: "PROMOTION_PAIR_ENROLLED", entityType: "PromotionPair", entityId: pair._id,
        metadata: { promotionId: promotion._id, payerStudentId: payer._id, beneficiaryStudentId: beneficiary._id, startDate }
      }], { session: dbSession });
      return { pair, enrollments, charges };
    });
    response.status(201).json({ pair: result.pair, enrollmentIds: result.enrollments.map((item) => String(item._id)), charges: result.charges.map((item) => ({ id: String(item._id), amount: toPesos(item.amountCents + item.adjustmentsCents) })) });
  } catch (error) { next(error); }
});
