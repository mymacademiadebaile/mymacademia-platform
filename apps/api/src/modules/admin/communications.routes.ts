import { Router } from "express";
import { containsText } from "../../common/regex";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { sendEmail } from "../../services/mailer";
import { AuditLogModel } from "../audit/audit-log.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { NotificationLogModel } from "../notifications/notification-log.model";
import { studentIdsWithOverdueDebt } from "../billing/balance-service";
import { StudentModel } from "../students/student.model";
import { objectIdSchema, pageQuerySchema } from "./admin.schemas";

const audienceSchema = z.object({
  audience: z.enum(["ALL", "DEBT", "CLASS", "STUDENT"]),
  classId: objectIdSchema.optional(),
  studentId: objectIdSchema.optional()
}).superRefine((value, context) => {
  if (value.audience === "CLASS" && !value.classId) {
    context.addIssue({
      code: "custom",
      path: ["classId"],
      message: "classId is required for CLASS audience"
    });
  }

  if (value.audience === "STUDENT" && !value.studentId) {
    context.addIssue({
      code: "custom",
      path: ["studentId"],
      message: "studentId is required for STUDENT audience"
    });
  }
});

const emailSchema = audienceSchema.extend({
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(2).max(5000)
});

const whatsappSchema = z.object({
  studentId: objectIdSchema,
  message: z.string().trim().min(1).max(5000),
  type: z.enum(["DEBT_REMINDER", "CLASS_REMINDER", "PROMOTION", "PAYMENT_RECEIPT"]).default("PROMOTION")
});

const historyQuerySchema = pageQuerySchema.extend({
  channel: z.enum(["EMAIL", "WHATSAPP"]).optional(),
  status: z.enum(["PENDING", "SENT", "FAILED", "OPENED"]).optional(),
  type: z.enum(["DEBT_REMINDER", "CLASS_REMINDER", "PROMOTION", "PAYMENT_RECEIPT"]).optional()
});

async function resolveAudienceStudents(
  organizationId: string,
  audience: "ALL" | "DEBT" | "CLASS" | "STUDENT",
  classId?: string,
  studentId?: string
) {
  let studentIds: string[] | undefined;

  if (audience === "DEBT") {
    studentIds = (await studentIdsWithOverdueDebt(organizationId)).map((id) => String(id));
  }

  if (audience === "CLASS" && classId) {
    studentIds = (await EnrollmentModel.distinct("studentId", {
      organizationId,
      classId,
      status: "ACTIVE"
    })).map((id) => id.toString());
  }

  if (audience === "STUDENT" && studentId) {
    studentIds = [studentId];
  }

  const filter: Record<string, unknown> = {
    organizationId,
    isActive: true,
    email: { $exists: true, $ne: "" }
  };

  if (studentIds) {
    filter._id = { $in: studentIds };
  }

  return StudentModel.find(filter)
    .select("firstName lastName email phone")
    .sort({ lastName: 1, firstName: 1 });
}

function audienceNotificationType(audience: "ALL" | "DEBT" | "CLASS" | "STUDENT") {
  return audience === "DEBT"
    ? "DEBT_REMINDER"
    : audience === "CLASS"
      ? "CLASS_REMINDER"
      : "PROMOTION";
}

export const adminCommunicationsRouter = Router();

adminCommunicationsRouter.post("/preview", async (request, response, next) => {
  try {
    const input = audienceSchema.parse(request.body);
    const students = await resolveAudienceStudents(
      request.auth!.organizationId,
      input.audience,
      input.classId,
      input.studentId
    );

    response.json({
      recipients: students.length,
      sample: students.slice(0, 5).map((student) => ({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.email
      }))
    });
  } catch (error) {
    next(error);
  }
});

adminCommunicationsRouter.get("/history", async (request, response, next) => {
  try {
    const query = historyQuerySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const filter: Record<string, unknown> = { organizationId };

    if (query.channel) filter.channel = query.channel;
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.q) {
      filter.$or = [
        { destination: containsText(query.q) },
        { subject: containsText(query.q) },
        { message: containsText(query.q) }
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      NotificationLogModel.find(filter)
        .populate("studentId", "firstName lastName email phone")
        .populate("actorUserId", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit),
      NotificationLogModel.countDocuments(filter)
    ]);

    response.json({
      items,
      total,
      page: query.page,
      limit: query.limit
    });
  } catch (error) {
    next(error);
  }
});

adminCommunicationsRouter.post("/email", async (request, response, next) => {
  try {
    const input = emailSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const students = await resolveAudienceStudents(
      organizationId,
      input.audience,
      input.classId,
      input.studentId
    );

    let sent = 0;
    let failed = 0;
    const type = audienceNotificationType(input.audience);

    for (const student of students) {
      if (!student.email) continue;

      const personalizedMessage = input.message.replaceAll("{{nombre}}", student.firstName);

      try {
        await sendEmail({
          to: student.email,
          subject: input.subject,
          text: personalizedMessage
        });

        await NotificationLogModel.create({
          organizationId,
          actorUserId: request.auth!.userId,
          studentId: student._id,
          channel: "EMAIL",
          type,
          destination: student.email,
          subject: input.subject,
          message: personalizedMessage,
          status: "SENT",
          sentAt: new Date()
        });

        sent += 1;
      } catch (mailError) {
        failed += 1;

        await NotificationLogModel.create({
          organizationId,
          actorUserId: request.auth!.userId,
          studentId: student._id,
          channel: "EMAIL",
          type,
          destination: student.email,
          subject: input.subject,
          message: personalizedMessage,
          status: "FAILED",
          errorMessage: mailError instanceof Error ? mailError.message : "Unknown email error"
        });
      }
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "EMAIL_CAMPAIGN_SENT",
      entityType: "NotificationLog",
      metadata: {
        audience: input.audience,
        classId: input.classId,
        studentId: input.studentId,
        recipients: students.length,
        sent,
        failed,
        subject: input.subject
      }
    });

    response.json({
      recipients: students.length,
      sent,
      failed
    });
  } catch (error) {
    next(error);
  }
});

adminCommunicationsRouter.post("/whatsapp", async (request, response, next) => {
  try {
    const input = whatsappSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const student = await StudentModel.findOne({
      _id: input.studentId,
      organizationId,
      isActive: true
    }).select("firstName lastName phone");

    if (!student) {
      throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");
    }

    if (!student.phone) {
      throw new AppError(422, "El alumno no tiene teléfono cargado", "STUDENT_PHONE_REQUIRED");
    }

    const phone = student.phone.replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(input.message)}`;

    const log = await NotificationLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      studentId: student._id,
      channel: "WHATSAPP",
      type: input.type,
      destination: student.phone,
      message: input.message,
      status: "OPENED",
      sentAt: new Date()
    });

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "WHATSAPP_OPENED",
      entityType: "NotificationLog",
      entityId: log._id,
      metadata: {
        studentId: student._id,
        type: input.type
      }
    });

    response.status(201).json({ url, log });
  } catch (error) {
    next(error);
  }
});

adminCommunicationsRouter.post("/history/:id/retry", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const log = await NotificationLogModel.findOne({
      _id: id,
      organizationId,
      channel: "EMAIL",
      status: "FAILED"
    });

    if (!log) {
      throw new AppError(
        404,
        "No encontramos un email fallido para reintentar",
        "FAILED_NOTIFICATION_NOT_FOUND"
      );
    }

    try {
      await sendEmail({
        to: log.destination,
        subject: log.subject || "M&M Academia",
        text: log.message
      });

      log.status = "SENT";
      log.sentAt = new Date();
      log.errorMessage = undefined;
      await log.save();

      await AuditLogModel.create({
        organizationId,
        actorUserId: request.auth!.userId,
        action: "EMAIL_RETRIED",
        entityType: "NotificationLog",
        entityId: log._id,
        metadata: { destination: log.destination, result: "SENT" }
      });

      response.json(log);
    } catch (mailError) {
      log.errorMessage = mailError instanceof Error ? mailError.message : "Unknown email error";
      await log.save();

      await AuditLogModel.create({
        organizationId,
        actorUserId: request.auth!.userId,
        action: "EMAIL_RETRIED",
        entityType: "NotificationLog",
        entityId: log._id,
        metadata: { destination: log.destination, result: "FAILED" }
      });

      throw new AppError(502, "El reintento de email falló", "EMAIL_RETRY_FAILED");
    }
  } catch (error) {
    next(error);
  }
});
