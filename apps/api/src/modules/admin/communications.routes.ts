import { Router } from "express";
import { z } from "zod";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { NotificationLogModel } from "../notifications/notification-log.model";
import { PaymentModel } from "../payments/payment.model";
import { StudentModel } from "../students/student.model";
import { sendEmail } from "../../services/mailer";
import { objectIdSchema } from "./admin.schemas";

const emailSchema = z.object({
  audience: z.enum(["ALL", "DEBT", "CLASS"]),
  classId: objectIdSchema.optional(),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(2).max(5000)
}).superRefine((value, context) => {
  if (value.audience === "CLASS" && !value.classId) {
    context.addIssue({
      code: "custom",
      path: ["classId"],
      message: "classId is required for CLASS audience"
    });
  }
});

export const adminCommunicationsRouter = Router();

adminCommunicationsRouter.post("/email", async (request, response, next) => {
  try {
    const input = emailSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    let studentIds: string[] | undefined;

    if (input.audience === "DEBT") {
      studentIds = (await PaymentModel.distinct("studentId", {
        organizationId,
        status: { $in: ["PENDING", "OVERDUE"] }
      })).map((id) => id.toString());
    }

    if (input.audience === "CLASS" && input.classId) {
      studentIds = (await EnrollmentModel.distinct("studentId", {
        organizationId,
        classId: input.classId,
        status: "ACTIVE"
      })).map((id) => id.toString());
    }

    const filter: Record<string, unknown> = {
      organizationId,
      isActive: true,
      email: { $exists: true, $ne: "" }
    };

    if (studentIds) {
      filter._id = { $in: studentIds };
    }

    const students = await StudentModel.find(filter).select("firstName lastName email");
    let sent = 0;
    let failed = 0;

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
          type: input.audience === "DEBT" ? "DEBT_REMINDER" : input.audience === "CLASS" ? "CLASS_REMINDER" : "PROMOTION",
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
          type: input.audience === "DEBT" ? "DEBT_REMINDER" : input.audience === "CLASS" ? "CLASS_REMINDER" : "PROMOTION",
          destination: student.email,
          subject: input.subject,
          message: personalizedMessage,
          status: "FAILED",
          errorMessage: mailError instanceof Error ? mailError.message : "Unknown email error"
        });
      }
    }

    response.json({
      recipients: students.length,
      sent,
      failed
    });
  } catch (error) {
    next(error);
  }
});
