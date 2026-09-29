import { Router } from "express";
import { z } from "zod";
import { NotificationLogModel } from "../notifications/notification-log.model";
import { PaymentModel } from "../payments/payment.model";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const adminNotificationsRouter = Router();

adminNotificationsRouter.get("/", async (request, response, next) => {
  try {
    const { limit } = querySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const now = new Date();

    const [notifications, overduePayments, failedCommunications] = await Promise.all([
      NotificationLogModel.find({ organizationId })
        .populate("studentId", "firstName lastName")
        .sort({ createdAt: -1 })
        .limit(limit),
      PaymentModel.find({
        organizationId,
        $or: [
          { status: "OVERDUE" },
          { status: "PENDING", dueDate: { $lt: now } }
        ]
      }).select("amount"),
      NotificationLogModel.countDocuments({
        organizationId,
        status: "FAILED"
      })
    ]);

    const overdueAmount = overduePayments.reduce(
      (total, payment) => total + payment.amount,
      0
    );

    response.json({
      attention: {
        overdueCount: overduePayments.length,
        overdueAmount,
        failedCommunications
      },
      items: notifications.map((notification) => {
        const student =
          notification.studentId &&
          typeof notification.studentId === "object" &&
          "firstName" in notification.studentId
            ? notification.studentId as unknown as { firstName: string; lastName: string }
            : null;

        return {
          id: notification.id,
          channel: notification.channel,
          type: notification.type,
          status: notification.status,
          subject: notification.subject,
          message: notification.message,
          destination: notification.destination,
          studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
          sentAt: notification.sentAt,
          createdAt: notification.get("createdAt")
        };
      })
    });
  } catch (error) {
    next(error);
  }
});
