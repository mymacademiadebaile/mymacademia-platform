import { PAYMENT_TYPES } from "@mym/shared";
import ExcelJS from "exceljs";
import { Router } from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { uploadBuffer } from "../../services/cloudinary";
import { sendEmail } from "../../services/mailer";
import { AuditLogModel } from "../audit/audit-log.model";
import { NotificationLogModel } from "../notifications/notification-log.model";
import {
  PAYMENT_METHODS,
  PaymentModel
} from "../payments/payment.model";
import { nextReceiptNumber } from "../payments/sequence.model";
import { StudentModel } from "../students/student.model";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { OrganizationModel } from "../core/organization.model";
import { objectIdSchema, pageQuerySchema } from "./admin.schemas";

const createPaymentSchema = z.object({
  branchId: objectIdSchema.optional(),
  studentId: objectIdSchema,
  classId: objectIdSchema,
  paymentType: z.enum(PAYMENT_TYPES).default("MONTHLY"),
  classDate: z.coerce.date().optional(),
  concept: z.string().trim().min(2).max(120),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El período debe tener formato YYYY-MM"),
  amount: z.number().positive(),
  dueDate: z.coerce.date(),
  notes: z.string().trim().max(1000).optional().or(z.literal(""))
});

const quickChargeSchema = z.object({
  studentId: objectIdSchema,
  classId: objectIdSchema,
  paymentType: z.enum(PAYMENT_TYPES),
  classDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  period: z.string().regex(/^\\d{4}-(0[1-9]|1[0-2])$/).optional(),
  amount: z.number().positive().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default("OTHER"),
  paidAt: z.coerce.date().optional(),
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
  paidAt: z.coerce.date().optional()
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
      callback(new Error("UNSUPPORTED_PROOF_TYPE"));
      return;
    }
    callback(null, true);
  }
});

function effectiveStatus(payment: {
  status: string;
  dueDate: Date;
}) {
  if (payment.status === "PENDING" && payment.dueDate.getTime() < Date.now()) {
    return "OVERDUE";
  }
  return payment.status;
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
    filter.$or = [
      { status: "OVERDUE" },
      { status: "PENDING", dueDate: { $lt: new Date() } }
    ];
  } else if (query.status === "PENDING") {
    filter.status = "PENDING";
    filter.dueDate = { $gte: new Date() };
  } else if (query.status) {
    filter.status = query.status;
  }

  if (query.q) {
    const studentIds = await StudentModel.find({
      organizationId,
      $or: [
        { firstName: { $regex: query.q, $options: "i" } },
        { lastName: { $regex: query.q, $options: "i" } },
        { email: { $regex: query.q, $options: "i" } },
        { phone: { $regex: query.q, $options: "i" } }
      ]
    }).distinct("_id");

    filter.$and = [
      ...(Array.isArray(filter.$and) ? (filter.$and as object[]) : []),
      {
        $or: [
          { studentId: { $in: studentIds } },
          { concept: { $regex: query.q, $options: "i" } },
          { receiptNumber: { $regex: query.q, $options: "i" } }
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
        result.total += payment.amount;
        result.count += 1;

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
    document.text(`Fecha: ${(payment.paidAt ?? new Date()).toLocaleDateString("es-AR")}`);
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

    const [student, danceClass, enrollment] = await Promise.all([
      StudentModel.findOne({ _id: input.studentId, organizationId, isActive: true }),
      DanceClassModel.findOne({ _id: input.classId, organizationId, status: "ACTIVE" }),
      EnrollmentModel.findOne({
        organizationId,
        classId: input.classId,
        studentId: input.studentId,
        status: "ACTIVE"
      })
    ]);

    if (!student) throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");
    if (!danceClass) throw new AppError(404, "Clase no encontrada o inactiva", "CLASS_NOT_FOUND");
    if (!enrollment) {
      throw new AppError(422, "El alumno debe estar inscripto en la clase", "PAYMENT_REQUIRES_ACTIVE_ENROLLMENT");
    }
    if (!danceClass.branchId.equals(student.branchId)) {
      throw new AppError(422, "El alumno y la clase deben pertenecer a la misma sede", "PAYMENT_CLASS_BRANCH_MISMATCH");
    }

    const billingMode = danceClass.billingMode ?? "MONTHLY";
    const allowed =
      billingMode === "BOTH" ||
      (billingMode === "PER_CLASS" && input.paymentType === "PER_CLASS") ||
      (billingMode === "MONTHLY" && input.paymentType === "MONTHLY");

    if (!allowed) {
      throw new AppError(422, "La modalidad de cobro no está habilitada para esta clase", "PAYMENT_TYPE_NOT_ALLOWED");
    }

    const classDate =
      input.paymentType === "PER_CLASS" && input.classDate
        ? new Date(input.classDate + "T12:00:00.000Z")
        : undefined;
    const period =
      input.paymentType === "PER_CLASS"
        ? input.classDate!.slice(0, 7)
        : input.period!;
    const defaultAmount =
      input.paymentType === "PER_CLASS"
        ? danceClass.pricePerClass ?? 0
        : danceClass.monthlyPrice ?? 0;
    const amount = input.amount ?? defaultAmount;

    if (amount <= 0) {
      throw new AppError(422, "Configurá un importe mayor a cero para registrar el cobro", "INVALID_PAYMENT_AMOUNT");
    }

    const duplicateFilter: Record<string, unknown> = {
      organizationId,
      studentId: student._id,
      classId: danceClass._id,
      paymentType: input.paymentType,
      status: { $ne: "CANCELLED" }
    };
    if (input.paymentType === "PER_CLASS") duplicateFilter.classDate = classDate;
    else duplicateFilter.period = period;

    if (await PaymentModel.exists(duplicateFilter)) {
      throw new AppError(
        409,
        input.paymentType === "PER_CLASS"
          ? "Ya existe un pago para esa clase y fecha"
          : "Ya existe un pago mensual para ese período",
        "PAYMENT_ALREADY_EXISTS"
      );
    }

    const receiptNumber = await nextReceiptNumber(new Types.ObjectId(organizationId));
    const paidAt = input.paidAt ?? new Date();
    const payment = await PaymentModel.create({
      organizationId,
      branchId: student.branchId,
      studentId: student._id,
      classId: danceClass._id,
      paymentType: input.paymentType,
      classDate,
      concept: input.paymentType === "PER_CLASS" ? "Clase · " + danceClass.name : "Mensualidad · " + danceClass.name,
      period,
      amount,
      dueDate: classDate ?? paidAt,
      status: "PAID",
      paidAt,
      paymentMethod: input.paymentMethod,
      receiptNumber,
      notes: input.notes?.trim() || undefined,
      paidByUserId: new Types.ObjectId(request.auth!.userId)
    });

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

    const student = await StudentModel.findOne({
      _id: input.studentId,
      organizationId,
      isActive: true
    });

    if (!student) {
      throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");
    }

    const [danceClass, enrollment] = await Promise.all([
      DanceClassModel.findOne({
        _id: input.classId,
        organizationId
      }),
      EnrollmentModel.findOne({
        organizationId,
        classId: input.classId,
        studentId: student._id,
        status: "ACTIVE"
      })
    ]);

    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }

    if (!danceClass.branchId.equals(student.branchId)) {
      throw new AppError(
        422,
        "El alumno y la clase deben pertenecer a la misma sede",
        "PAYMENT_CLASS_BRANCH_MISMATCH"
      );
    }

    if (!enrollment) {
      throw new AppError(
        422,
        "El alumno debe estar inscripto activamente en la clase para generar una cuota",
        "PAYMENT_REQUIRES_ACTIVE_ENROLLMENT"
      );
    }

    if (input.branchId && input.branchId !== student.branchId.toString()) {
      throw new AppError(
        422,
        "La sede de la cuota no coincide con la del alumno",
        "PAYMENT_BRANCH_MISMATCH"
      );
    }

    const duplicate = await PaymentModel.exists({
      organizationId,
      studentId: student._id,
      classId: danceClass._id,
      period: input.period,
      concept: input.concept,
      status: { $ne: "CANCELLED" }
    });

    if (duplicate) {
      throw new AppError(
        409,
        "Ya existe una cuota con ese concepto y período para el alumno",
        "PAYMENT_ALREADY_EXISTS"
      );
    }

    const payment = await PaymentModel.create({
      organizationId,
      branchId: student.branchId,
      studentId: student._id,
      classId: danceClass._id,
      paymentType: input.paymentType,
      classDate: input.classDate,
      concept: input.concept,
      period: input.period,
      amount: input.amount,
      dueDate: input.dueDate,
      notes: input.notes?.trim() || undefined,
      status: "PENDING"
    });

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

    const receiptNumber =
      payment.receiptNumber ??
      await nextReceiptNumber(new Types.ObjectId(organizationId));

    payment.status = "PAID";
    payment.paidAt = input.paidAt ?? new Date();
    payment.paymentMethod = input.paymentMethod;
    payment.receiptNumber = receiptNumber;
    payment.paidByUserId = new Types.ObjectId(request.auth!.userId);
    await payment.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PAYMENT_MARKED_PAID",
      entityType: "Payment",
      entityId: payment._id,
      metadata: {
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        receiptNumber
      }
    });

    response.json(payment);
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
    payment.status = "CANCELLED";
    payment.cancelledAt = new Date();
    payment.cancelledByUserId = new Types.ObjectId(request.auth!.userId);
    payment.cancellationReason = input.reason;
    await payment.save();

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

    response.json(payment);
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
