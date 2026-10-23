import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { debtReminderPolicy, DebtReminderSettingsModel } from "../notifications/debt-reminder-settings.model";
import { previewDebtReminder, sendDebtReminder } from "../notifications/debt-reminder-service";
import { NotificationLogModel } from "../notifications/notification-log.model";
import { objectIdSchema } from "./admin.schemas";

export const adminDebtRemindersRouter = Router();
adminDebtRemindersRouter.get("/settings", async (request, response, next) => {
  try { response.json(await debtReminderPolicy(request.auth!.organizationId)); } catch (error) { next(error); }
});
adminDebtRemindersRouter.patch("/settings", async (request, response, next) => {
  try {
    const input = z.object({ enabled: z.boolean(), automaticEnabled: z.boolean(), minimumDaysBetween: z.number().int().min(1).max(60),
      daysOverdue: z.number().int().min(1).max(90), includeBreakdown: z.boolean() }).parse(request.body);
    if (input.automaticEnabled && !input.enabled) throw new AppError(422, "Habilitá los recordatorios antes de activar la programación", "REMINDERS_DISABLED");
    const organizationId = request.auth!.organizationId;
    const settings = await DebtReminderSettingsModel.findOneAndUpdate({ organizationId }, { $set: { ...input, updatedByUserId: request.auth!.userId } }, { upsert: true, new: true });
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: "DEBT_REMINDER_POLICY_UPDATED", entityType: "DebtReminderSettings", entityId: settings._id,
      metadata: { enabled: settings.enabled, automaticEnabled: settings.automaticEnabled, minimumDaysBetween: settings.minimumDaysBetween, daysOverdue: settings.daysOverdue } });
    response.json(settings);
  } catch (error) { next(error); }
});
adminDebtRemindersRouter.get("/students/:id/preview", async (request, response, next) => {
  try { response.json(await previewDebtReminder(request.auth!.organizationId, objectIdSchema.parse(request.params.id))); }
  catch (error) { next(error); }
});
adminDebtRemindersRouter.post("/students/:id/send", async (request, response, next) => {
  try {
    const { idempotencyKey } = z.object({ idempotencyKey: z.string().min(16).max(100) }).parse(request.body);
    response.json(await sendDebtReminder({ organizationId: request.auth!.organizationId, userId: request.auth!.userId }, objectIdSchema.parse(request.params.id), idempotencyKey));
  } catch (error) { next(error); }
});
adminDebtRemindersRouter.get("/students/:id/history", async (request, response, next) => {
  try { response.json({ items: await NotificationLogModel.find({ organizationId: request.auth!.organizationId, studentId: objectIdSchema.parse(request.params.id), type: "DEBT_REMINDER" })
    .select("destination subject message status errorMessage sentAt createdAt").sort({ createdAt: -1 }).limit(30) }); }
  catch (error) { next(error); }
});
