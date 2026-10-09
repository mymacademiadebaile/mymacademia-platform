import { ADJUSTMENT_TYPES, CHARGE_KINDS, COLLECTION_METHODS, MID_MONTH_POLICIES } from "@mym/shared";
import { Router } from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import { Types } from "mongoose";
import { z } from "zod";
import {
  ACADEMY_TIME_ZONE,
  academyNow,
  daysBetween,
  periodOf,
  PERIOD_PATTERN
} from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { toCents, toPesos } from "../../common/money";
import { AuditLogModel } from "../audit/audit-log.model";
import { chargeState, studentBalances } from "../billing/balance-service";
import {
  createManualCharge,
  createMonthlyChargeForEnrollment,
  ensureClassCharge,
  generateMonthlyCharges,
  planMonthlyCharge,
  voidCharge
} from "../billing/charge-service";
import { ChargeModel } from "../billing/charge.model";
import { applyAdjustment, applyCredit, refundCollection, registerCollection } from "../billing/collection-service";
import { availableCreditCents, CollectionModel } from "../billing/collection.model";
import { hasMonthlyCoverage } from "../billing/coverage-service";
import { FinancialAdjustmentModel } from "../billing/financial-adjustment.model";
import { legacyPaymentToChargeView, unmirroredLegacyPayments, type ChargeView } from "../billing/legacy-adapter";
import { MigrationIssueModel } from "../billing/migration-issue.model";
import { PaymentAllocationModel } from "../billing/payment-allocation.model";
import { RefundModel } from "../billing/refund.model";
import { DanceClassModel } from "../classes/class.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { billingModeOn } from "../enrollments/enrollment-validity";
import { ClassSessionModel } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";
import { privateAssetUrl, uploadPrivateBuffer } from "../../services/cloudinary";
import { calendarDateSchema, objectIdSchema, receivedAtInputSchema } from "./admin.schemas";

const periodSchema = z.string().regex(PERIOD_PATTERN, "El período debe tener formato YYYY-MM");
/** Pesos with at most two decimals, converted to integer cents. */
const moneySchema = z
  .number()
  .positive()
  .max(100_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Usá como máximo dos decimales")
  .transform(toCents);

const actorOf = (request: Express.Request) => ({
  organizationId: request.auth!.organizationId,
  userId: request.auth!.userId
});

/** API view of a charge: amounts in pesos plus its state today. */
function presentCharge(charge: ChargeView & Record<string, any>, today = academyNow().date) {
  const state = chargeState(charge, today);
  return {
    id: String(charge._id),
    legacy: Boolean(charge.legacy),
    studentId: String(charge.studentId),
    classId: charge.classId ? String(charge.classId) : null,
    enrollmentId: charge.enrollmentId ? String(charge.enrollmentId) : null,
    kind: charge.kind,
    period: charge.period,
    sessionId: charge.sessionId ? String(charge.sessionId) : null,
    serviceDate: charge.serviceDate ?? null,
    concept: charge.concept,
    dueDate: charge.dueDate,
    listAmount: toPesos(charge.listCents),
    amount: toPesos(charge.amountCents),
    adjustments: toPesos(charge.adjustmentsCents ?? 0),
    owed: toPesos(state.owedCents),
    paid: toPesos(state.paidCents),
    balance: toPesos(state.balanceCents),
    status: state.status,
    overdue: state.overdue,
    origin: charge.origin ?? (charge.legacy ? "MIGRATED" : "MANUAL"),
    joinPolicy: charge.joinPolicy ?? null,
    voidReason: charge.voidReason ?? null,
    legacyPaymentId: charge.legacyPaymentId ? String(charge.legacyPaymentId) : charge.legacy ? String(charge._id) : null,
    createdAt: charge.createdAt
  };
}

function presentCollection(collection: any) {
  return {
    id: String(collection._id),
    studentId: String(collection.studentId),
    receivedAt: collection.receivedAt,
    accountingDate: collection.accountingDate,
    method: collection.method,
    amount: toPesos(collection.amountCents),
    allocated: toPesos(collection.allocatedCents),
    refunded: toPesos(collection.refundedCents),
    credit: toPesos(availableCreditCents(collection)),
    receiptNumber: collection.receiptNumber ?? null,
    notes: collection.notes ?? null,
    hasProof: Boolean(collection.proof?.publicId || collection.legacyProofUrl),
    sessionId: collection.sessionId ? String(collection.sessionId) : null,
    legacyPaymentId: collection.legacyPaymentId ? String(collection.legacyPaymentId) : null
  };
}

export const adminBillingRouter = Router();

/* ----------------------------------------------------------------------------------------- */
/* Settings                                                                                  */
/* ----------------------------------------------------------------------------------------- */

adminBillingRouter.get("/settings", async (request, response, next) => {
  try {
    const organization = await OrganizationModel.findById(request.auth!.organizationId).select("billing").lean<any>();
    response.json({
      monthlyDueDay: organization?.billing?.monthlyDueDay ?? 10,
      midMonthPolicy: organization?.billing?.midMonthPolicy ?? "ASK"
    });
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.patch("/settings", async (request, response, next) => {
  try {
    const input = z
      .object({
        monthlyDueDay: z.number().int().min(1).max(28).optional(),
        midMonthPolicy: z.enum(["ASK", ...MID_MONTH_POLICIES]).optional()
      })
      .parse(request.body);
    const organizationId = request.auth!.organizationId;
    const set: Record<string, unknown> = {};
    if (input.monthlyDueDay !== undefined) set["billing.monthlyDueDay"] = input.monthlyDueDay;
    if (input.midMonthPolicy !== undefined) set["billing.midMonthPolicy"] = input.midMonthPolicy;
    await OrganizationModel.updateOne({ _id: organizationId }, { $set: set });
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: "BILLING_SETTINGS_UPDATED", entityType: "Organization", entityId: new Types.ObjectId(organizationId), metadata: input });
    const organization = await OrganizationModel.findById(organizationId).select("billing").lean<any>();
    response.json({ monthlyDueDay: organization?.billing?.monthlyDueDay ?? 10, midMonthPolicy: organization?.billing?.midMonthPolicy ?? "ASK" });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Charges                                                                                   */
/* ----------------------------------------------------------------------------------------- */

const chargeListSchema = z.object({
  studentId: objectIdSchema.optional(),
  classId: objectIdSchema.optional(),
  period: periodSchema.optional(),
  kind: z.enum(CHARGE_KINDS).optional(),
  status: z.enum(["OPEN", "PAID", "VOID", "OVERDUE", "PARTIAL", "PENDING"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

adminBillingRouter.get("/charges", async (request, response, next) => {
  try {
    const query = chargeListSchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const today = academyNow().date;

    // A monthly enrollment continues until it is explicitly ended. Opening the current month's
    // pending-payments view is the only moment we materialize its monthly obligation; no cron
    // creates charges in advance or for a month the academy has not opened yet.
    if (query.period === periodOf(today)) {
      await generateMonthlyCharges(actorOf(request), query.period);
    }

    const filter: Record<string, unknown> = { organizationId };
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (query.classId) filter.classId = new Types.ObjectId(query.classId);
    if (query.period) filter.period = query.period;
    if (query.kind) filter.kind = query.kind;
    if (query.status === "VOID" || query.status === "PAID") filter.status = query.status;
    if (query.status === "OPEN" || query.status === "PENDING" || query.status === "PARTIAL") filter.status = "OPEN";
    if (query.status === "OVERDUE") Object.assign(filter, { status: "OPEN", dueDate: { $lt: today } });

    const legacyFilter: Record<string, unknown> = { organizationId };
    if (query.studentId) legacyFilter.studentId = new Types.ObjectId(query.studentId);
    if (query.classId) legacyFilter.classId = new Types.ObjectId(query.classId);
    if (query.period) legacyFilter.period = query.period;
    if (query.kind === "OTHER") legacyFilter._id = null;
    if (query.kind) legacyFilter.paymentType = query.kind === "MONTHLY_FEE" ? "MONTHLY" : "PER_CLASS";

    const [charges, legacy] = await Promise.all([
      ChargeModel.find(filter).sort({ dueDate: -1, createdAt: -1 }).lean<ChargeView[]>(),
      unmirroredLegacyPayments(legacyFilter)
    ]);
    let items = [...charges, ...legacy.map(legacyPaymentToChargeView)].map((item) => presentCharge(item, today));
    if (query.status) {
      items = items.filter((item) =>
        query.status === "OPEN" ? ["PENDING", "PARTIAL", "OVERDUE"].includes(item.status) : item.status === query.status
      );
    }
    items.sort((a, b) => b.dueDate.localeCompare(a.dueDate));

    const studentIds = [...new Set(items.map((item) => item.studentId))];
    const classIds = [...new Set(items.map((item) => item.classId).filter(Boolean))];
    const [students, classes] = await Promise.all([
      StudentModel.find({ organizationId, _id: { $in: studentIds } }).select("firstName lastName isActive").lean<any[]>(),
      DanceClassModel.find({ organizationId, _id: { $in: classIds } }).select("name").lean<any[]>()
    ]);
    const studentById = new Map(students.map((item) => [String(item._id), item]));
    const classById = new Map(classes.map((item) => [String(item._id), item]));
    const page = items.slice((query.page - 1) * query.limit, query.page * query.limit).map((item) => ({
      ...item,
      student: studentById.get(item.studentId)
        ? { id: item.studentId, firstName: studentById.get(item.studentId).firstName, lastName: studentById.get(item.studentId).lastName, isActive: studentById.get(item.studentId).isActive }
        : null,
      className: item.classId ? classById.get(item.classId)?.name ?? null : null
    }));

    response.json({ items: page, total: items.length, page: query.page, limit: query.limit });
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.post("/charges", async (request, response, next) => {
  try {
    const input = z
      .object({
        studentId: objectIdSchema,
        classId: objectIdSchema.optional(),
        kind: z.enum(CHARGE_KINDS),
        period: periodSchema,
        serviceDate: calendarDateSchema.optional(),
        concept: z.string().trim().min(2).max(160),
        amount: moneySchema,
        dueDate: calendarDateSchema,
        notes: z.string().trim().max(1000).optional()
      })
      .parse(request.body);
    const organizationId = request.auth!.organizationId;
    // Inactive students may still owe: past obligations can be registered for them.
    const student = await StudentModel.findOne({ _id: input.studentId, organizationId }).lean<any>();
    if (!student) throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");
    if (input.classId && !(await DanceClassModel.exists({ _id: input.classId, organizationId }))) {
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }
    if (input.kind !== "OTHER" && !input.classId) throw new AppError(422, "Indicá la clase", "CLASS_REQUIRED");
    if (input.kind === "CLASS_FEE" && !input.serviceDate) throw new AppError(422, "Indicá la fecha de la clase", "SERVICE_DATE_REQUIRED");
    if (input.serviceDate && periodOf(input.serviceDate) !== input.period) {
      throw new AppError(422, "El período no coincide con la fecha de la clase", "INVALID_PERIOD");
    }
    const charge = await createManualCharge(
      actorOf(request),
      { ...input, amountCents: input.amount },
      student.branchId
    );
    response.status(201).json(presentCharge(charge.toObject()));
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.post("/charges/:id/void", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(request.body);
    const charge = await voidCharge(actorOf(request), id, reason);
    response.json(presentCharge(charge.toObject()));
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.post("/charges/:id/adjustments", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = z
      .object({
        type: z.enum(ADJUSTMENT_TYPES),
        amount: moneySchema,
        reason: z.string().trim().min(3).max(500),
        sourceChargeIds: z.array(objectIdSchema).max(60).optional()
      })
      .parse(request.body);
    const adjustment = await applyAdjustment(actorOf(request), {
      chargeId: id,
      type: input.type,
      amountCents: input.amount,
      reason: input.reason,
      sourceChargeIds: input.sourceChargeIds
    });
    const charge = await ChargeModel.findById(id).lean<ChargeView>();
    response.status(201).json({ adjustment: { ...adjustment.toObject(), amount: toPesos(adjustment.amountCents) }, charge: presentCharge(charge!) });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Monthly fees                                                                              */
/* ----------------------------------------------------------------------------------------- */

/** What generating a period would do, without writing anything. */
adminBillingRouter.get("/monthly/:period/preview", async (request, response, next) => {
  try {
    const period = periodSchema.parse(request.params.period);
    const organizationId = request.auth!.organizationId;
    const classes = await DanceClassModel.find({ organizationId, billingMode: { $in: ["MONTHLY", "BOTH"] } }).lean<any[]>();
    const classById = new Map(classes.map((item) => [String(item._id), item]));
    const enrollments = await EnrollmentModel.find({ organizationId, classId: { $in: classes.map((item) => item._id) } }).lean<any[]>();
    const existing = new Set(
      (await ChargeModel.find({ organizationId, kind: "MONTHLY_FEE", period, status: { $ne: "VOID" } }).select("studentId classId").lean<any[]>())
        .map((item) => `${item.studentId}:${item.classId}`)
    );
    const students = await StudentModel.find({ organizationId, _id: { $in: enrollments.map((item) => item.studentId) } })
      .select("firstName lastName")
      .lean<any[]>();
    const studentById = new Map(students.map((item) => [String(item._id), item]));

    const rows = [];
    for (const enrollment of enrollments) {
      const danceClass = classById.get(String(enrollment.classId));
      const planned = await planMonthlyCharge(organizationId, enrollment, danceClass, period);
      if (!planned.charge && planned.skip !== "NEEDS_DECISION") continue;
      const student = studentById.get(String(enrollment.studentId));
      rows.push({
        enrollmentId: String(enrollment._id),
        student: student ? `${student.firstName} ${student.lastName}` : "",
        studentId: String(enrollment.studentId),
        className: danceClass.name,
        classId: String(danceClass._id),
        amount: planned.charge ? toPesos(planned.charge.amountCents as number) : null,
        dueDate: planned.charge?.dueDate ?? null,
        status: existing.has(`${enrollment.studentId}:${enrollment.classId}`) ? "EXISTS" : planned.skip === "NEEDS_DECISION" ? "NEEDS_DECISION" : "TO_CREATE"
      });
    }
    response.json({
      period,
      toCreate: rows.filter((item) => item.status === "TO_CREATE").length,
      existing: rows.filter((item) => item.status === "EXISTS").length,
      needsDecision: rows.filter((item) => item.status === "NEEDS_DECISION").length,
      items: rows
    });
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.post("/monthly/generate", async (request, response, next) => {
  try {
    const input = z.object({ period: periodSchema, classIds: z.array(objectIdSchema).optional() }).parse(request.body);
    response.json(await generateMonthlyCharges(actorOf(request), input.period, { classIds: input.classIds }));
  } catch (error) {
    next(error);
  }
});

/** First monthly fee of a mid-month enrollment, with the administrator's decision. */
adminBillingRouter.post("/enrollments/:id/monthly-charge", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = z
      .object({ period: periodSchema, policy: z.enum(MID_MONTH_POLICIES).optional(), customAmount: z.number().min(0).max(100_000_000).optional() })
      .parse(request.body);
    const charge = await createMonthlyChargeForEnrollment(actorOf(request), id, input.period, {
      policy: input.policy,
      customCents: input.customAmount === undefined ? undefined : toCents(input.customAmount)
    });
    response.status(201).json(presentCharge(charge.toObject()));
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Collections                                                                               */
/* ----------------------------------------------------------------------------------------- */

const collectionSchema = z.object({
  studentId: objectIdSchema,
  amount: moneySchema,
  method: z.enum(COLLECTION_METHODS),
  receivedAt: receivedAtInputSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  allocations: z.array(z.object({ chargeId: objectIdSchema, amount: moneySchema })).max(60).optional(),
  autoAllocate: z.boolean().optional(),
  discount: z.object({ chargeId: objectIdSchema, amount: moneySchema, reason: z.string().trim().min(3).max(500) }).optional(),
  sessionId: objectIdSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional()
});

adminBillingRouter.get("/collections", async (request, response, next) => {
  try {
    const query = z
      .object({
        studentId: objectIdSchema.optional(),
        from: calendarDateSchema.optional(),
        to: calendarDateSchema.optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(50)
      })
      .parse(request.query);
    const organizationId = request.auth!.organizationId;
    const filter: Record<string, unknown> = { organizationId };
    if (query.studentId) filter.studentId = query.studentId;
    if (query.from || query.to) filter.accountingDate = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const [items, total] = await Promise.all([
      CollectionModel.find(filter).sort({ receivedAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean<any[]>(),
      CollectionModel.countDocuments(filter)
    ]);
    const students = await StudentModel.find({ organizationId, _id: { $in: items.map((item) => item.studentId) } }).select("firstName lastName").lean<any[]>();
    const studentById = new Map(students.map((item) => [String(item._id), item]));
    response.json({
      items: items.map((item) => ({
        ...presentCollection(item),
        student: studentById.get(String(item.studentId)) ?? null
      })),
      total,
      page: query.page,
      limit: query.limit
    });
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.post("/collections", async (request, response, next) => {
  try {
    const input = collectionSchema.parse(request.body);
    const result = await registerCollection(actorOf(request), {
      studentId: input.studentId,
      amountCents: input.amount,
      method: input.method,
      receivedAt: input.receivedAt,
      notes: input.notes,
      allocations: input.allocations?.map((item) => ({ chargeId: item.chargeId, amountCents: item.amount })),
      autoAllocate: input.autoAllocate,
      discount: input.discount ? { chargeId: input.discount.chargeId, amountCents: input.discount.amount, reason: input.discount.reason } : undefined,
      sessionId: input.sessionId,
      idempotencyKey: input.idempotencyKey
    });
    response.status(result.replayed ? 200 : 201).json({
      collection: presentCollection(result.collection),
      allocations: result.allocations.map((item: any) => ({ id: String(item._id), chargeId: String(item.chargeId), amount: toPesos(item.amountCents) })),
      replayed: result.replayed
    });
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.get("/collections/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;
    const collection = await CollectionModel.findOne({ _id: id, organizationId }).lean<any>();
    if (!collection) throw new AppError(404, "Cobro no encontrado", "COLLECTION_NOT_FOUND");
    const [allocations, refunds] = await Promise.all([
      PaymentAllocationModel.find({ organizationId, collectionId: collection._id }).lean<any[]>(),
      RefundModel.find({ organizationId, collectionId: collection._id }).sort({ refundedAt: 1 }).lean<any[]>()
    ]);
    const charges = await ChargeModel.find({ _id: { $in: allocations.map((item) => item.chargeId) } }).lean<ChargeView[]>();
    const chargeById = new Map(charges.map((item) => [String(item._id), item]));
    response.json({
      ...presentCollection(collection),
      allocations: allocations.map((item) => ({
        id: String(item._id),
        chargeId: String(item.chargeId),
        amount: toPesos(item.amountCents),
        reversed: toPesos(item.reversedCents),
        accountingDate: item.accountingDate,
        concept: chargeById.get(String(item.chargeId))?.concept ?? ""
      })),
      refunds: refunds.map((item) => ({
        id: String(item._id),
        amount: toPesos(item.amountCents),
        accountingDate: item.accountingDate,
        method: item.method,
        reason: item.reason,
        chargeId: item.chargeId ? String(item.chargeId) : null
      }))
    });
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.post("/collections/:id/apply-credit", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = z.object({ chargeId: objectIdSchema, amount: moneySchema }).parse(request.body);
    const allocation = await applyCredit(actorOf(request), id, input.chargeId, input.amount);
    response.status(201).json({ id: String(allocation._id), chargeId: String(allocation.chargeId), amount: toPesos(allocation.amountCents) });
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.post("/collections/:id/refunds", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = z
      .object({
        amount: moneySchema,
        reason: z.string().trim().min(3).max(500),
        method: z.enum(COLLECTION_METHODS),
        refundedAt: receivedAtInputSchema.optional(),
        allocationId: objectIdSchema.optional()
      })
      .parse(request.body);
    const refund = await refundCollection(actorOf(request), id, {
      amountCents: input.amount,
      reason: input.reason,
      method: input.method,
      refundedAt: input.refundedAt,
      allocationId: input.allocationId
    });
    response.status(201).json({ ...refund.toObject(), amount: toPesos(refund.amountCents) });
  } catch (error) {
    next(error);
  }
});

const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.mimetype)) {
      callback(new AppError(415, "El comprobante debe ser una imagen o un PDF", "UNSUPPORTED_PROOF_TYPE"));
      return;
    }
    callback(null, true);
  }
});

/** Transfer proof, stored as a private asset (never a public link). */
adminBillingRouter.post("/collections/:id/proof", proofUpload.single("file"), async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;
    if (!request.file) throw new AppError(422, "Seleccioná un comprobante", "PROOF_REQUIRED");
    const collection = await CollectionModel.findOne({ _id: id, organizationId });
    if (!collection) throw new AppError(404, "Cobro no encontrado", "COLLECTION_NOT_FOUND");
    const result = await uploadPrivateBuffer(request.file.buffer, {
      folder: `mym-academia/${organizationId}/collection-proofs`,
      publicId: `collection-${collection.id}-${Date.now()}`
    });
    const previous = collection.proof?.publicId;
    collection.proof = { publicId: result.public_id, resourceType: result.resource_type, format: result.format, uploadedAt: new Date() };
    await collection.save();
    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "COLLECTION_PROOF_UPLOADED",
      entityType: "Collection",
      entityId: collection._id,
      metadata: { publicId: result.public_id, previousPublicId: previous }
    });
    response.json({ hasProof: true });
  } catch (error) {
    next(error);
  }
});

/** Short-lived link to see a proof. Legacy public links are returned as they were. */
adminBillingRouter.get("/collections/:id/proof", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const collection = await CollectionModel.findOne({ _id: id, organizationId: request.auth!.organizationId }).lean<any>();
    if (!collection) throw new AppError(404, "Cobro no encontrado", "COLLECTION_NOT_FOUND");
    if (collection.proof?.publicId) {
      response.json({ url: privateAssetUrl(collection.proof), expiresInSeconds: 300 });
      return;
    }
    if (collection.legacyProofUrl) {
      response.json({ url: collection.legacyProofUrl, legacy: true });
      return;
    }
    throw new AppError(404, "El cobro no tiene comprobante", "PROOF_NOT_FOUND");
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.get("/collections/:id/receipt.pdf", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;
    const collection = await CollectionModel.findOne({ _id: id, organizationId }).lean<any>();
    if (!collection) throw new AppError(404, "Recibo no disponible", "RECEIPT_NOT_FOUND");
    const [organization, student, allocations] = await Promise.all([
      OrganizationModel.findById(organizationId).lean<any>(),
      StudentModel.findById(collection.studentId).select("firstName lastName email").lean<any>(),
      PaymentAllocationModel.find({ collectionId: collection._id }).lean<any[]>()
    ]);
    const charges = await ChargeModel.find({ _id: { $in: allocations.map((item) => item.chargeId) } }).select("concept").lean<any[]>();
    const conceptById = new Map(charges.map((item) => [String(item._id), item.concept]));

    const document = new PDFDocument({ size: "A4", margin: 54 });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${collection.receiptNumber ?? "recibo"}.pdf"`);
    document.pipe(response);
    document.fontSize(20).text(organization?.name ?? "M&M Academia de Baile", { align: "center" });
    document.moveDown(0.4);
    document.fontSize(11).fillColor("#6b21a8").text("RECIBO DE PAGO", { align: "center" });
    document.fillColor("#111111").moveDown(1.5);
    document.fontSize(10).text(`Recibo: ${collection.receiptNumber ?? "—"}`);
    document.text(`Fecha: ${new Date(collection.receivedAt).toLocaleDateString("es-AR", { timeZone: ACADEMY_TIME_ZONE })}`);
    document.moveDown();
    document.text(`Alumno: ${student?.firstName ?? ""} ${student?.lastName ?? ""}`);
    if (student?.email) document.text(`Email: ${student.email}`);
    document.moveDown();
    for (const allocation of allocations) {
      document.text(`${conceptById.get(String(allocation.chargeId)) ?? "Cargo"}: $ ${toPesos(allocation.amountCents).toLocaleString("es-AR")}`);
    }
    const credit = availableCreditCents(collection) + collection.refundedCents;
    if (credit > 0) document.text(`Saldo a favor: $ ${toPesos(availableCreditCents(collection)).toLocaleString("es-AR")}`);
    document.text(`Medio de pago: ${collection.method}`);
    document.moveDown();
    document.fontSize(16).text(`Total abonado: $ ${toPesos(collection.amountCents).toLocaleString("es-AR")}`);
    document.moveDown(2);
    document.fontSize(9).fillColor("#666666").text("Comprobante emitido por el sistema de gestión de M&M Academia de Baile.", { align: "center" });
    document.end();
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Session collection (collect a class from the session view)                                 */
/* ----------------------------------------------------------------------------------------- */

/**
 * Collects what a participant owes for a session in one step: the class fee (created if
 * needed) or, for monthly students, the open balance of the monthly fee of that month.
 */
adminBillingRouter.post("/sessions/:id/collect", async (request, response, next) => {
  try {
    const sessionId = objectIdSchema.parse(request.params.id);
    const input = z
      .object({
        studentId: objectIdSchema,
        method: z.enum(COLLECTION_METHODS),
        amount: moneySchema.optional(),
        receivedAt: receivedAtInputSchema.optional(),
        notes: z.string().trim().max(1000).optional(),
        idempotencyKey: z.string().trim().min(8).max(100).optional()
      })
      .parse(request.body);
    const actor = actorOf(request);
    const session = await ClassSessionModel.findOne({ _id: sessionId, organizationId: actor.organizationId }).lean<any>();
    if (!session) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");

    // A monthly student whose fee of that month was not generated yet: generate it now (the
    // mid-month rules still apply) and collect it, instead of charging a single class.
    const period = periodOf(session.sessionDate);
    const enrollment = await EnrollmentModel.findOne({ organizationId: actor.organizationId, classId: session.classId, studentId: input.studentId }).lean<any>();
    const danceClass = await DanceClassModel.findOne({ _id: session.classId, organizationId: actor.organizationId }).lean<any>();
    const monthlyStudent =
      enrollment &&
      danceClass &&
      (danceClass.billingMode === "MONTHLY" || (danceClass.billingMode === "BOTH" && billingModeOn(enrollment, session.sessionDate) === "MONTHLY"));
    if (monthlyStudent && !(await hasMonthlyCoverage(actor.organizationId, input.studentId, session.classId, period))) {
      await createMonthlyChargeForEnrollment(actor, String(enrollment._id), period, {});
    }

    let charge: any;
    if (await hasMonthlyCoverage(actor.organizationId, input.studentId, session.classId, period)) {
      charge = await ChargeModel.findOne({
        organizationId: actor.organizationId,
        studentId: input.studentId,
        classId: session.classId,
        kind: "MONTHLY_FEE",
        period: periodOf(session.sessionDate),
        status: { $ne: "VOID" }
      });
      if (!charge) {
        throw new AppError(409, "La mensualidad de ese mes está registrada en el sistema anterior; cobrala desde Pagos", "LEGACY_MONTHLY");
      }
    } else {
      const result = await ensureClassCharge(actor, sessionId, input.studentId);
      if (result.covered) throw new AppError(409, "La clase ya está cubierta por la mensualidad", "COVERED_BY_MONTHLY");
      charge = result.charge;
    }
    if (charge.status !== "OPEN" || charge.balanceCents <= 0) {
      throw new AppError(409, "No hay saldo pendiente para esta clase", "NOTHING_TO_COLLECT");
    }
    const amountCents = input.amount ?? charge.balanceCents;
    const result = await registerCollection(actor, {
      studentId: input.studentId,
      amountCents,
      method: input.method,
      receivedAt: input.receivedAt,
      notes: input.notes,
      allocations: [{ chargeId: String(charge._id), amountCents: Math.min(amountCents, charge.balanceCents) }],
      sessionId,
      idempotencyKey: input.idempotencyKey
    });
    const updated = await ChargeModel.findById(charge._id).lean<ChargeView>();
    response.status(result.replayed ? 200 : 201).json({ collection: presentCollection(result.collection), charge: presentCharge(updated!) });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Student account                                                                           */
/* ----------------------------------------------------------------------------------------- */

adminBillingRouter.get("/students/:id/account", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;
    const student = await StudentModel.findOne({ _id: id, organizationId }).lean<any>();
    if (!student) throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");
    const today = academyNow().date;

    const [charges, legacy, collections, refunds, adjustments, balances] = await Promise.all([
      ChargeModel.find({ organizationId, studentId: student._id }).sort({ dueDate: -1 }).lean<ChargeView[]>(),
      unmirroredLegacyPayments({ organizationId, studentId: student._id }),
      CollectionModel.find({ organizationId, studentId: student._id }).sort({ receivedAt: -1 }).lean<any[]>(),
      RefundModel.find({ organizationId, studentId: student._id }).sort({ refundedAt: -1 }).lean<any[]>(),
      FinancialAdjustmentModel.find({ organizationId, studentId: student._id }).sort({ createdAt: -1 }).lean<any[]>(),
      studentBalances(organizationId, [student._id], today)
    ]);
    const classIds = [...new Set([...charges, ...legacy].map((item: any) => item.classId).filter(Boolean).map(String))];
    const classes = await DanceClassModel.find({ organizationId, _id: { $in: classIds } }).select("name").lean<any[]>();
    const classById = new Map(classes.map((item) => [String(item._id), item.name]));
    const balance = balances.get(String(student._id))!;

    response.json({
      student: { id: String(student._id), firstName: student.firstName, lastName: student.lastName, isActive: student.isActive },
      balance: {
        pending: toPesos(balance.pendingCents),
        overdue: toPesos(balance.overdueCents),
        partialCount: balance.partialCount,
        openCount: balance.openCount,
        credit: toPesos(balance.creditCents)
      },
      charges: [...charges, ...legacy.map(legacyPaymentToChargeView)]
        .map((item) => ({ ...presentCharge(item, today), className: item.classId ? classById.get(String(item.classId)) ?? null : null }))
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
      collections: collections.map(presentCollection),
      refunds: refunds.map((item) => ({
        id: String(item._id),
        collectionId: String(item.collectionId),
        amount: toPesos(item.amountCents),
        accountingDate: item.accountingDate,
        method: item.method,
        reason: item.reason
      })),
      adjustments: adjustments.map((item) => ({
        id: String(item._id),
        chargeId: String(item.chargeId),
        type: item.type,
        amount: toPesos(item.amountCents),
        reason: item.reason,
        accountingDate: item.accountingDate
      }))
    });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Cash report                                                                               */
/* ----------------------------------------------------------------------------------------- */

/**
 * Money in and out by Argentina accounting day. Collections count on the day they came in and
 * refunds on the day they went out, so a closed day never changes afterwards.
 */
adminBillingRouter.get("/cash", async (request, response, next) => {
  try {
    const query = z.object({ from: calendarDateSchema, to: calendarDateSchema }).parse(request.query);
    if (query.to < query.from || daysBetween(query.from, query.to) > 366) {
      throw new AppError(422, "Elegí un rango de hasta 366 días", "INVALID_DATE_RANGE");
    }
    const organizationId = new Types.ObjectId(request.auth!.organizationId);
    const range = { $gte: query.from, $lte: query.to };
    const [collections, refunds] = await Promise.all([
      CollectionModel.aggregate<{ _id: { date: string; method: string }; amount: number; count: number }>([
        { $match: { organizationId, accountingDate: range } },
        { $group: { _id: { date: "$accountingDate", method: "$method" }, amount: { $sum: "$amountCents" }, count: { $sum: 1 } } }
      ]),
      RefundModel.aggregate<{ _id: { date: string; method: string }; amount: number; count: number }>([
        { $match: { organizationId, accountingDate: range } },
        { $group: { _id: { date: "$accountingDate", method: "$method" }, amount: { $sum: "$amountCents" }, count: { $sum: 1 } } }
      ])
    ]);
    const days = new Map<string, { date: string; inCents: number; outCents: number }>();
    const methods = new Map<string, { method: string; inCents: number; outCents: number }>();
    for (const row of collections) {
      const day = days.get(row._id.date) ?? { date: row._id.date, inCents: 0, outCents: 0 };
      day.inCents += row.amount;
      days.set(row._id.date, day);
      const method = methods.get(row._id.method) ?? { method: row._id.method, inCents: 0, outCents: 0 };
      method.inCents += row.amount;
      methods.set(row._id.method, method);
    }
    for (const row of refunds) {
      const day = days.get(row._id.date) ?? { date: row._id.date, inCents: 0, outCents: 0 };
      day.outCents += row.amount;
      days.set(row._id.date, day);
      const method = methods.get(row._id.method) ?? { method: row._id.method, inCents: 0, outCents: 0 };
      method.outCents += row.amount;
      methods.set(row._id.method, method);
    }
    const totalIn = collections.reduce((sum, row) => sum + row.amount, 0);
    const totalOut = refunds.reduce((sum, row) => sum + row.amount, 0);
    response.json({
      from: query.from,
      to: query.to,
      collected: toPesos(totalIn),
      refunded: toPesos(totalOut),
      net: toPesos(totalIn - totalOut),
      byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((item) => ({
        date: item.date,
        collected: toPesos(item.inCents),
        refunded: toPesos(item.outCents),
        net: toPesos(item.inCents - item.outCents)
      })),
      byMethod: [...methods.values()].map((item) => ({
        method: item.method,
        collected: toPesos(item.inCents),
        refunded: toPesos(item.outCents),
        net: toPesos(item.inCents - item.outCents)
      }))
    });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Migration review                                                                          */
/* ----------------------------------------------------------------------------------------- */

adminBillingRouter.get("/migration-issues", async (request, response, next) => {
  try {
    const { status } = z.object({ status: z.enum(["OPEN", "RESOLVED"]).default("OPEN") }).parse(request.query);
    const items = await MigrationIssueModel.find({ organizationId: request.auth!.organizationId, status }).sort({ createdAt: -1 }).limit(500).lean();
    response.json({ items });
  } catch (error) {
    next(error);
  }
});

adminBillingRouter.post("/migration-issues/:id/resolve", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { resolution } = z.object({ resolution: z.string().trim().min(3).max(500) }).parse(request.body);
    const organizationId = request.auth!.organizationId;
    const issue = await MigrationIssueModel.findOneAndUpdate(
      { _id: id, organizationId, status: "OPEN" },
      { $set: { status: "RESOLVED", resolution, resolvedAt: new Date(), resolvedByUserId: new Types.ObjectId(request.auth!.userId) } },
      { new: true }
    );
    if (!issue) throw new AppError(404, "Observación no encontrada", "ISSUE_NOT_FOUND");
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: "MIGRATION_ISSUE_RESOLVED", entityType: "MigrationIssue", entityId: issue._id, metadata: { resolution } });
    response.json(issue);
  } catch (error) {
    next(error);
  }
});
