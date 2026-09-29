import { Router } from "express";
import { z } from "zod";
import { PaymentModel } from "../payments/payment.model";
import { StudentModel } from "../students/student.model";
import { NotificationLogModel } from "../notifications/notification-log.model";
import { sendEmail } from "../../services/mailer";
import { objectIdSchema, pageQuerySchema } from "./admin.schemas";

const createPaymentSchema = z.object({
  branchId: objectIdSchema,
  studentId: objectIdSchema,
  concept: z.string().trim().min(2).max(120),
  period: z.string().trim().min(2).max(40),
  amount: z.number().min(0),
  dueDate: z.coerce.date(),
  notes: z.string().trim().max(1000).optional()
});

export const adminPaymentsRouter = Router();

adminPaymentsRouter.get("/", async (request, response, next) => {
  try {
    const query = pageQuerySchema.parse(request.query);
    const filter: Record<string, unknown> = {
      organizationId: request.auth!.organizationId
    };

    if (request.query.status) {
      filter.status = request.query.status;
    }

    const [items, total] = await Promise.all([
      PaymentModel.find(filter)
        .populate("studentId", "firstName lastName email phone")
        .sort({ dueDate: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      PaymentModel.countDocuments(filter)
    ]);

    response.json({ items, total, page: query.page, limit: query.limit });
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.post("/", async (request, response, next) => {
  try {
    const input = createPaymentSchema.parse(request.body);
    const payment = await PaymentModel.create({
      organizationId: request.auth!.organizationId,
      ...input,
      status: "PENDING"
    });

    response.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.post("/:id/mark-paid", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const payment = await PaymentModel.findOneAndUpdate(
      { _id: id, organizationId: request.auth!.organizationId },
      { $set: { status: "PAID", paidAt: new Date() } },
      { new: true }
    );

    if (!payment) {
      response.status(404).json({ error: "PAYMENT_NOT_FOUND" });
      return;
    }

    response.json(payment);
  } catch (error) {
    next(error);
  }
});

adminPaymentsRouter.post("/:id/remind", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const payment = await PaymentModel.findOne({
      _id: id,
      organizationId: request.auth!.organizationId
    });

    if (!payment) {
      response.status(404).json({ error: "PAYMENT_NOT_FOUND" });
      return;
    }

    const student = await StudentModel.findOne({
      _id: payment.studentId,
      organizationId: request.auth!.organizationId
    });

    if (!student?.email) {
      response.status(422).json({ error: "STUDENT_WITHOUT_EMAIL" });
      return;
    }

    const message = `Hola ${student.firstName}, te recordamos que se encuentra pendiente ${payment.concept} (${payment.period}).`;

    await sendEmail({
      to: student.email,
      subject: "Recordatorio de pago - M&M Academia",
      text: message
    });

    await NotificationLogModel.create({
      organizationId: request.auth!.organizationId,
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

    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
