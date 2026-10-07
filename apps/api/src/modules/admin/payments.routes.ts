import { PAYMENT_TYPES } from "@mym/shared";
import { containsText } from "../../common/regex";
import ExcelJS from "exceljs";
import { Router } from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { ACADEMY_TIME_ZONE, toDateOnly } from "../../common/dates";
import { uploadBuffer } from "../../services/cloudinary";
import { sendEmail } from "../../services/mailer";
import { AuditLogModel } from "../audit/audit-log.model";
import { NotificationLogModel } from "../notifications/notification-log.model";
import {
  PAYMENT_METHODS,
  PaymentModel
} from "../payments/payment.model";
import {
  assertNoActiveDuplicate,
  loadChargeContext,
  resolveChargeDates,
  rethrowDuplicateCharge
} from "../payments/payment-charge";
import { nextReceiptNumber } from "../payments/sequence.model";
import { StudentModel } from "../students/student.model";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { OrganizationModel } from "../core/organization.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { sessionEnrollmentIds } from "../sessions/session-booking-service";
import {
  dateOnlyInputSchema,
  objectIdSchema,
  pageQuerySchema,
  receivedAtInputSchema
} from "./admin.schemas";
import {
  effectivePaymentStatus,
  notYetDuePaymentFilter,
  overduePaymentFilter
} from "../payments/payment-status";

const createPaymentSchema = z.object({
  branchId: objectIdSchema.optional(),
  studentId: objectIdSchema,
  classId: objectIdSchema,
  paymentType: z.enum(PAYMENT_TYPES).default("MONTHLY"),
  sessionId: objectIdSchema.optional(),
  classDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato YYYY-MM-DD").optional(),
  concept: z.string().trim().min(2).max(120),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El período debe tener formato YYYY-MM").optional(),
  amount: z.number().positive().max(100_000_000),
  dueDate: dateOnlyInputSchema,
  notes: z.string().trim().max(1000).optional().or(z.literal(""))
}).superRefine((value, context) => {
  if (value.paymentType === "PER_CLASS" && !value.classDate) {
    context.addIssue({ code: "custom", path: ["classDate"], message: "Indicá la fecha de la clase" });
  }
  if (value.paymentType === "MONTHLY" && !value.period) {
    context.addIssue({ code: "custom", path: ["period"], message: "Indicá el período mensual" });
  }
  if (value.paymentType === "MONTHLY" && value.classDate) {
    context.addIssue({ code: "custom", path: ["classDate"], message: "Un pago mensual no lleva fecha de clase" });
  }
});

const quickChargeSchema = z.object({
  studentId: objectIdSchema,
  classId: objectIdSchema,
  paymentType: z.enum(PAYMENT_TYPES),
  sessionId: objectIdSchema.optional(),
  classDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  amount: z.number().positive().max(100_000_000).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default("OTHER"),
  paidAt: receivedAtInputSchema.optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal(""))
}).superRefine((value, context) => {
  if (value.paymentType === "PER_CLASS" && !value.classDate) {
    context.addIssue({ code: "custom", path: ["classDate"], message: "Indicá la fecha de la clase" });
  }
  if (value.paymentType === "MONTHLY" && !value.period) {
    context.addIssue({ code: "custom", path: ["period"], message: "Indicá el período mensual" });
  }
});
const markPaidSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS).default("OTHER"),
  paidAt: receivedAtInputSchema.optional()
});

const cancelSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

const listQuerySchema = pageQuerySchema.extend({
  status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELLED"]).optional(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  branchId: objectIdSchema.optional(),
  classId: objectIdSchema.optional(),
  paymentType: z.enum(PAYMENT_TYPES).optional()
});

const upload = multer({
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

const effectiveStatus = effectivePaymentStatus;

/** Money cannot be received in the future; a small skew covers clocks of different devices. */
function assertNotFutureReceipt(receivedAt: Date) {
  if (receivedAt.getTime() > Date.now() + 5 * 60_000) {
    throw new AppError(422, "La fecha de cobro no puede ser futura", "FUTURE_PAYMENT_DATE");
  }
}

/** A per-class charge issued from a session must belong to that exact booked occurrence. */
async function resolveChargeSession(input: {
  organizationId: string;
  classId: string;
  enrollmentId: Types.ObjectId;
  paymentType: "PER_CLASS" | "MONTHLY";
  sessionId?: string;
  classDate?: string;
}) {
  if (!input.sessionId) return undefined;
  if (input.paymentType !== "PER_CLASS") {
    throw new AppError(422, "Sólo un pago por clase puede vincularse a un turno", "INVALID_PAYMENT_SESSION");
  }
  const session = await ClassSessionModel.findOne({
    _id: input.sessionId,
    organizationId: input.organizationId,
    classId: input.classId,
    status: { $ne: "CANCELLED" }
  });
  if (!session || (input.classDate && session.sessionDate !== input.classDate)) {
    throw new AppError(422, "El turno no coincide con la clase y fecha cobradas", "INVALID_PAYMENT_SESSION");
  }
  const enrolled = await sessionEnrollmentIds(input.organizationId, session);
  if (!enrolled.some((item) => item._id.equals(input.enrollmentId))) {
    throw new AppError(422, "El alumno no tiene una reserva en ese turno", "STUDENT_NOT_BOOKED");
  }
  return session;
}

async function buildPaymentFilter(
  organizationId: string,
  query: z.infer<typeof listQuerySchema>
) {
  const filter: Record<string, unknown> = { organizationId };

  if (query.period) filter.period = query.period;
  if (query.branchId) filter.branchId = query.branchId;
  if (query.classId) filter.classId = query.classId;
  if (query.paymentType) filter.paymentType = query.paymentType;

  if (query.status === "OVERDUE") {
    Object.assign(filter, overduePaymentFilter());
  } else if (query.status === "PENDING") {
    Object.assign(filter, notYetDuePaymentFilter());
  } else if (query.status) {
    filter.status = query.status;
  }

  if (query.q) {
    const studentIds = await StudentModel.find({
      organizationId,
      $or: [
        { firstName: containsText(query.q) },
        { lastName: containsText(query.q) },
        { email: containsText(query.q) },
        { phone: containsText(query.q) }
      ]
    }).distinct("_id");

    filter.$and = [
      ...(Array.isArray(filter.$and) ? (filter.$and as object[]) : []),
      {
        $or: [
          { studentId: { $in: studentIds } },
          { concept: containsText(query.q) },
          { receiptNumber: containsText(query.q) }
        ]
      }
    ];
  }

  return filter;
}

export const adminPaymentsRouter = Router();

adminPaymentsRouter.get("/", async (request, response, next) => {
  try {
    const query = listQuerySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const filter = await buildPaymentFilter(organizationId, query);

    const [items, total] = await Promise.all([
      PaymentModel.find(filter)
        .populate("studentId", "firstName lastName email phone branchId")
        .populate("classId", "name billingMode pricePerClass monthlyPrice freeTrialEnabled status")
        .sort({ dueDate: -1, createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      PaymentModel.countDocuments(filter)
    ]);

    response.json({
      items: items.map((payment) => ({
        ...payment.toObject(),
        effectiveStatus: effectiveStatus(payment)
      })),
      total,
      page: query.page,
      limit: query.limit
    });
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.get("/summary", async (request, response, next) => {
  try {
    const query = z.object({
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
      branchId: objectIdSchema.optional()
    }).parse(request.query);

    const organizationId = request.auth!.organizationId;
    const filter: Record<string, unknown> = { organizationId };
    if (query.period) filter.period = query.period;
    if (query.branchId) filter.branchId = query.branchId;

    const payments = await PaymentModel.find(filter).select("amount status dueDate");

    const summary = payments.reduce(
      (result, payment) => {
        const status = effectiveStatus(payment);
        if (status !== "CANCELLED") {
          result.total += payment.amount;
          result.count += 1;
        }

        if (status === "PAID") {
          result.paidAmount += payment.amount;
          result.paidCount += 1;
        } else if (status === "OVERDUE") {
          result.overdueAmount += payment.amount;
          result.overdueCount += 1;
        } else if (status === "PENDING") {
          result.pendingAmount += payment.amount;
          result.pendingCount += 1;
        } else if (status === "CANCELLED") {
          result.cancelledAmount += payment.amount;
          result.cancelledCount += 1;
        }

        return result;
      },
      {
        total: 0,
        count: 0,
        paidAmount: 0,
        paidCount: 0,
        pendingAmount: 0,
        pendingCount: 0,
        overdueAmount: 0,
        overdueCount: 0,
        cancelledAmount: 0,
        cancelledCount: 0
      }
    );

    response.json(summary);
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.get("/export.xlsx", async (request, response, next) => {
  try {
    const query = listQuerySchema.omit({ page: true, limit: true }).parse(request.query);
    const organizationId = request.auth!.organizationId;
    const filter = await buildPaymentFilter(
      organizationId,
      { ...query, page: 1, limit: 100 }
    );

    const payments = await PaymentModel.find(filter)
      .populate("studentId", "firstName lastName email phone")
      .populate("classId", "name monthlyPrice")
      .sort({ dueDate: -1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Pagos");

    sheet.columns = [
      { header: "Recibo", key: "receipt", width: 16 },
      { header: "Alumno", key: "student", width: 30 },
      { header: "Clase", key: "className", width: 26 },
      { header: "Tipo", key: "paymentType", width: 14 },
      { header: "Concepto", key: "concept", width: 24 },
      { header: "Período", key: "period", width: 12 },
      { header: "Vencimiento", key: "dueDate", width: 16 },
      { header: "Importe", key: "amount", width: 14 },
      { header: "Estado", key: "status", width: 14 },
      { header: "Medio", key: "method", width: 16 },
      { header: "Fecha pago", key: "paidAt", width: 16 }
    ];

    for (const payment of payments) {
      const student = payment.studentId as unknown as {
        firstName: string;
        lastName: string;
      };

      sheet.addRow({
        receipt: payment.receiptNumber ?? "",
        student: `${student.firstName} ${student.lastName}`,
        className: payment.classId && typeof payment.classId === "object" && "name" in payment.classId ? String((payment.classId as unknown as { name: string }).name) : "",
        paymentType: payment.paymentType === "PER_CLASS" ? "Por clase" : "Mensual",
        concept: payment.concept,
        period: payment.period,
        dueDate: payment.dueDate,
        amount: payment.amount,
        status: effectiveStatus(payment),
        method: payment.paymentMethod ?? "",
        paidAt: payment.paidAt ?? ""
      });
    }

    sheet.getRow(1).font = { bold: true };
    sheet.getColumn("amount").numFmt = '"$" #,##0.00';

    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="pagos-${query.period ?? "todos"}.xlsx"`
    );

    await workbook.xlsx.write(response);
    response.end();
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.get("/:id/receipt.pdf", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const payment = await PaymentModel.findOne({
      _id: id,
      organizationId,
      status: "PAID"
    }).populate("studentId", "firstName lastName email phone").populate("classId", "name");

    if (!payment) {
      throw new AppError(404, "Recibo no disponible", "RECEIPT_NOT_FOUND");
    }

    const organization = await OrganizationModel.findById(organizationId);
    const student = payment.studentId as unknown as {
      firstName: string;
      lastName: string;
      email?: string;
    };

    const document = new PDFDocument({ size: "A4", margin: 54 });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${payment.receiptNumber ?? "recibo"}.pdf"`
    );
    document.pipe(response);

    document
      .fontSize(20)
      .text(organization?.name ?? "M&M Academia de Baile", { align: "center" });
    document.moveDown(0.4);
    document.fontSize(11).fillColor("#6b21a8").text("RECIBO DE PAGO", { align: "center" });
    document.fillColor("#111111").moveDown(1.5);

    document.fontSize(10).text(`Recibo: ${payment.receiptNumber ?? "—"}`);
    document.text(`Fecha: ${(payment.paidAt ?? new Date()).toLocaleDateString("es-AR", { timeZone: ACADEMY_TIME_ZONE })}`);
    document.moveDown();
    document.text(`Alumno: ${student.firstName} ${student.lastName}`);
    if (student.email) document.text(`Email: ${student.email}`);
    document.moveDown();
    if (payment.classId && typeof payment.classId === "object" && "name" in payment.classId) {
      document.text(`Clase: ${String((payment.classId as unknown as { name: string }).name)}`);
    }
    document.text(`Concepto: ${payment.concept}`);
    document.text(`Período: ${payment.period}`);
    document.text(`Medio de pago: ${payment.paymentMethod ?? "OTHER"}`);
    document.moveDown();
    document.fontSize(16).text(`Total abonado: $ ${payment.amount.toLocaleString("es-AR")}`);
    document.moveDown(2);
    document.fontSize(9).fillColor("#666666").text(
      "Comprobante emitido por el sistema de gestión de M&M Academia de Baile.",
      { align: "center" }
    );

    document.end();
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.post("/quick-charge", async (request, response, next) => {
  try {
    const input = quickChargeSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const { student, danceClass, enrollment } = await loadChargeContext(
      organizationId,
      input,
      input.paymentType
    );

    const { classDate, classDateKey, period } = resolveChargeDates({
      paymentType: input.paymentType,
      classDate: input.classDate,
      period: input.paymentType === "MONTHLY" ? input.period : undefined
    });
    const session = await resolveChargeSession({
      organizationId, classId: input.classId, enrollmentId: enrollment._id,
      paymentType: input.paymentType, sessionId: input.sessionId, classDate: classDateKey
    });
    const defaultAmount =
      input.paymentType === "PER_CLASS"
        ? danceClass.pricePerClass ?? 0
        : danceClass.monthlyPrice ?? 0;
    const amount = input.amount ?? defaultAmount;

    if (amount <= 0) {
      throw new AppError(422, "Configurá un importe mayor a cero para registrar el cobro", "INVALID_PAYMENT_AMOUNT");
    }

    await assertNoActiveDuplicate({
      organizationId,
      studentId: student._id,
      classId: danceClass._id,
      paymentType: input.paymentType,
      sessionId: session?._id,
      classDateKey,
      period
    });

    const paidAt = input.paidAt ?? new Date();
    assertNotFutureReceipt(paidAt);
    const receiptNumber = await nextReceiptNumber(new Types.ObjectId(organizationId));
    const payment = await PaymentModel.create({
      organizationId,
      branchId: student.branchId,
      studentId: student._id,
      classId: danceClass._id,
      paymentType: input.paymentType,
      sessionId: session?._id,
      classDate,
      concept: input.paymentType === "PER_CLASS" ? "Clase · " + danceClass.name : "Mensualidad · " + danceClass.name,
      period,
      amount,
      dueDate: classDate ?? toDateOnly(paidAt),
      status: "PAID",
      paidAt,
      paymentMethod: input.paymentMethod,
      receiptNumber,
      notes: input.notes?.trim() || undefined,
      paidByUserId: new Types.ObjectId(request.auth!.userId)
    }).catch((error) => rethrowDuplicateCharge(error, input.paymentType));

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PAYMENT_QUICK_CHARGE",
      entityType: "Payment",
      entityId: payment._id,
      metadata: {
        studentId: student._id,
        classId: danceClass._id,
        paymentType: input.paymentType,
        sessionId: session?._id,
        classDate,
        period,
        amount,
        paymentMethod: input.paymentMethod,
        receiptNumber
      }
    });

    response.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});
adminPaymentsRouter.post("/", async (request, response, next) => {
  try {
    const input = createPaymentSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const { student, danceClass, enrollment } = await loadChargeContext(
      organizationId,
      input,
      input.paymentType
    );

    if (input.branchId && input.branchId !== student.branchId.toString()) {
      throw new AppError(
        422,
        "La sede de la cuota no coincide con la del alumno",
        "PAYMENT_BRANCH_MISMATCH"
      );
    }

    const { classDate, classDateKey, period } = resolveChargeDates(input);
    const session = await resolveChargeSession({
      organizationId, classId: input.classId, enrollmentId: enrollment._id,
      paymentType: input.paymentType, sessionId: input.sessionId, classDate: classDateKey
    });

    await assertNoActiveDuplicate({
      organizationId,
      studentId: student._id,
      classId: danceClass._id,
      paymentType: input.paymentType,
      sessionId: session?._id,
      classDateKey,
      period
    });

    const payment = await PaymentModel.create({
      organizationId,
      branchId: student.branchId,
      studentId: student._id,
      classId: danceClass._id,
      paymentType: input.paymentType,
      sessionId: session?._id,
      classDate,
      concept: input.concept,
      period,
      amount: input.amount,
      dueDate: input.dueDate,
      notes: input.notes?.trim() || undefined,
      status: "PENDING"
    }).catch((error) => rethrowDuplicateCharge(error, input.paymentType));

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PAYMENT_CREATED",
      entityType: "Payment",
      entityId: payment._id,
      metadata: {
        studentId: student._id,
        classId: danceClass._id,
        paymentType: payment.paymentType,
        sessionId: payment.sessionId,
        period: payment.period,
        classDate: payment.classDate,
        amount: payment.amount
      }
    });

    response.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.post("/:id/mark-paid", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = markPaidSchema.parse(request.body ?? {});
    const organizationId = request.auth!.organizationId;

    const payment = await PaymentModel.findOne({
      _id: id,
      organizationId
    });

    if (!payment) {
      throw new AppError(404, "Pago no encontrado", "PAYMENT_NOT_FOUND");
    }

    if (payment.status === "CANCELLED") {
      throw new AppError(409, "No se puede cobrar una cuota cancelada", "PAYMENT_CANCELLED");
    }

    if (payment.status === "PAID") {
      response.json(payment);
      return;
    }

    if (input.paidAt) assertNotFutureReceipt(input.paidAt);

    // A receipt number is consumed before the conditional update. If another request wins the
    // transition, that number stays unused (a gap), which is preferable to a duplicate receipt.
    const receiptNumber =
      payment.receiptNumber ??
      await nextReceiptNumber(new Types.ObjectId(organizationId));

    // Atomic transition: only one concurrent request can move the payment to PAID.
    const paid = await PaymentModel.findOneAndUpdate(
      { _id: payment._id, organizationId, status: { $in: ["PENDING", "OVERDUE"] } },
      {
        $set: {
          status: "PAID",
          paidAt: input.paidAt ?? new Date(),
          paymentMethod: input.paymentMethod,
          receiptNumber,
          paidByUserId: new Types.ObjectId(request.auth!.userId)
        }
      },
      { new: true }
    );

    if (!paid) {
      // Lost the race (or the payment changed meanwhile): answer from the current state, no side effects.
      const current = await PaymentModel.findOne({ _id: payment._id, organizationId });
      if (!current) throw new AppError(404, "Pago no encontrado", "PAYMENT_NOT_FOUND");
      if (current.status === "CANCELLED") {
        throw new AppError(409, "No se puede cobrar una cuota cancelada", "PAYMENT_CANCELLED");
      }
      response.json(current);
      return;
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PAYMENT_MARKED_PAID",
      entityType: "Payment",
      entityId: paid._id,
      metadata: {
        amount: paid.amount,
        paymentMethod: paid.paymentMethod,
        receiptNumber: paid.receiptNumber
      }
    });

    response.json(paid);
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.post("/:id/cancel", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = cancelSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const payment = await PaymentModel.findOne({
      _id: id,
      organizationId
    });

    if (!payment) {
      throw new AppError(404, "Pago no encontrado", "PAYMENT_NOT_FOUND");
    }

    if (payment.status === "CANCELLED") {
      response.json(payment);
      return;
    }

    const previousStatus = payment.status;
    // Atomic, and it releases the charge identity: $unset removes the active-charge key for real.
    const cancelled = await PaymentModel.findOneAndUpdate(
      { _id: payment._id, organizationId, status: { $ne: "CANCELLED" } },
      {
        $set: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledByUserId: new Types.ObjectId(request.auth!.userId),
          cancellationReason: input.reason
        },
        $unset: { activeChargeKey: 1 }
      },
      { new: true }
    );

    if (!cancelled) {
      // Another request cancelled it first: idempotent, no second audit event.
      const current = await PaymentModel.findOne({ _id: payment._id, organizationId });
      if (!current) throw new AppError(404, "Pago no encontrado", "PAYMENT_NOT_FOUND");
      response.json(current);
      return;
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PAYMENT_CANCELLED",
      entityType: "Payment",
      entityId: payment._id,
      metadata: {
        previousStatus,
        reason: input.reason,
        receiptNumber: payment.receiptNumber
      }
    });

    response.json(cancelled);
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.post(
  "/:id/proof",
  upload.single("file"),
  async (request, response, next) => {
    try {
      const id = objectIdSchema.parse(request.params.id);
      const organizationId = request.auth!.organizationId;

      if (!request.file) {
        throw new AppError(422, "Seleccioná un comprobante", "PROOF_REQUIRED");
      }

      const payment = await PaymentModel.findOne({
        _id: id,
        organizationId,
        status: { $ne: "CANCELLED" }
      });

      if (!payment) {
        throw new AppError(404, "Pago no encontrado", "PAYMENT_NOT_FOUND");
      }

      const result = await uploadBuffer(request.file.buffer, {
        folder: `mym-academia/${organizationId}/payment-proofs`,
        publicId: `payment-${payment.id}`
      });

      payment.proofUrl = result.secure_url;
      await payment.save();

      await AuditLogModel.create({
        organizationId,
        actorUserId: request.auth!.userId,
        action: "PAYMENT_PROOF_UPLOADED",
        entityType: "Payment",
        entityId: payment._id,
        metadata: { proofUrl: payment.proofUrl }
      });

      response.json({ proofUrl: payment.proofUrl });
    } catch (error) {
      next(error);
    }
  }
);

adminPaymentsRouter.post("/:id/remind", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const payment = await PaymentModel.findOne({
      _id: id,
      organizationId,
      status: { $nin: ["PAID", "CANCELLED"] }
    });

    if (!payment) {
      throw new AppError(404, "Cuota pendiente no encontrada", "PAYMENT_NOT_FOUND");
    }

    const student = await StudentModel.findOne({
      _id: payment.studentId,
      organizationId
    });

    if (!student?.email) {
      throw new AppError(
        422,
        "El alumno no tiene email cargado",
        "STUDENT_WITHOUT_EMAIL"
      );
    }

    const message =
      `Hola ${student.firstName}, te recordamos que se encuentra pendiente ${payment.concept} (${payment.period}) por $ ${payment.amount.toLocaleString("es-AR")}.`;

    try {
      await sendEmail({
        to: student.email,
        subject: "Recordatorio de pago - M&M Academia",
        text: message
      });

      await NotificationLogModel.create({
        organizationId,
        actorUserId: request.auth!.userId,
        studentId: student._id,
        channel: "EMAIL",
        type: "DEBT_REMINDER",
        destination: student.email,
        subject: "Recordatorio de pago - M&M Academia",
        message,
        status: "SENT",
        sentAt: new Date()
      });
    } catch (mailError) {
      await NotificationLogModel.create({
        organizationId,
        actorUserId: request.auth!.userId,
        studentId: student._id,
        channel: "EMAIL",
        type: "DEBT_REMINDER",
        destination: student.email,
        subject: "Recordatorio de pago - M&M Academia",
        message,
        status: "FAILED",
        errorMessage: mailError instanceof Error ? mailError.message : "Unknown email error"
      });

      throw mailError;
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PAYMENT_REMINDER_SENT",
      entityType: "Payment",
      entityId: payment._id,
      metadata: { studentId: student._id, channel: "EMAIL" }
    });

    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
