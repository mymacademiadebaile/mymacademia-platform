import { type ClientSession } from "mongoose";
import { academyNow, addDays } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { toPesos } from "../../common/money";
import { withRequiredTransaction } from "../../common/required-transaction";
import { mailFailureMessage, sendEmail } from "../../services/mailer";
import { AuditLogModel } from "../audit/audit-log.model";
import { chargeState, openCharges, studentBalances, studentIdsWithOverdueDebt } from "../billing/balance-service";
import { formatDateDmy } from "../billing/reminder-message";
import { ContactModel } from "../contacts/contact.model";
import { StudentModel } from "../students/student.model";
import { ensureLocks, touchLocks } from "../scheduling/resource-lock.model";
import { DEFAULT_REMINDER_POLICY, debtReminderPolicy, DebtReminderSettingsModel } from "./debt-reminder-settings.model";
import { NotificationLogModel } from "./notification-log.model";

type Actor = { organizationId: string; userId: string };
type Policy = typeof DEFAULT_REMINDER_POLICY;

/** Financial values come exclusively from the central balance/charge view, at processing time. */
export async function previewDebtReminder(organizationId: string, studentId: string, policy?: Policy, session?: ClientSession) {
  const settings = policy ?? await debtReminderPolicy(organizationId);
  const student = await StudentModel.findOne({ _id: studentId, organizationId }).session(session ?? null);
  if (!student) throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");
  const contact = await ContactModel.findOne({ _id: studentId, organizationId }).session(session ?? null);
  const balances = await studentBalances(organizationId, [studentId], academyNow().date, session);
  const balance = balances.get(studentId)!;
  const charges = (await openCharges(organizationId, { studentIds: [studentId] }, session)).map((charge) => ({
    id: String(charge._id), concept: charge.concept, dueDate: charge.dueDate, remainingCents: chargeState(charge).balanceCents
  })).filter((charge) => charge.remainingCents > 0);
  const email = contact ? contact.email : student.email;
  const reason = !settings.enabled ? "REMINDERS_DISABLED" : contact?.preferences?.emailReminders === false ? "CONTACT_OPTED_OUT"
    : !email ? "STUDENT_WITHOUT_EMAIL" : balance.pendingCents <= 0 ? "NO_DEBT" : null;
  const money = (cents: number) => `$ ${toPesos(cents).toLocaleString("es-AR")}`;
  const subject = "Recordatorio de pago - M&M Academia";
  const lines = [`Hola ${contact?.firstName ?? student.firstName},`,
    "Esperamos que estés muy bien. Te escribimos desde M&M Academia porque registramos un saldo pendiente. Te compartimos el detalle para que puedas revisarlo.",
    `Saldo pendiente: ${money(balance.pendingCents)}. De ese saldo, ${money(balance.overdueCents)} está vencido.`,
    ...(balance.creditCents > 0 ? [`También tenés ${money(balance.creditCents)} a favor, disponible para aplicar. Podemos ayudarte a revisarlo en recepción.`] : []),
    ...(settings.includeBreakdown ? charges.map((charge) => `• ${charge.concept}: ${money(charge.remainingCents)} · Vencimiento: ${formatDateDmy(charge.dueDate)}`) : []),
    "Si ya realizaste el pago, por favor avisanos para verificarlo. Ante cualquier duda, estamos para ayudarte. Muchas gracias.", "M&M Academia de Baile"];
  return { personName: `${contact?.firstName ?? student.firstName} ${contact?.lastName ?? student.lastName}`, destination: email, subject, message: lines.join("\n\n"), balance, charges, eligible: !reason, reason };
}

/** Reserve before SMTP. A replay/uncertain PENDING never sends again, including after a process crash. */
export async function sendDebtReminder(actor: Actor, studentId: string, requestKey: string, options: { automated?: boolean; chargeId?: string } = {}) {
  const settings = await debtReminderPolicy(actor.organizationId);
  if (!settings.enabled || (options.automated && !settings.automaticEnabled)) throw new AppError(422, "Los recordatorios no están habilitados", "REMINDERS_DISABLED");
  const keys = [`reminder:${studentId}`]; await ensureLocks(actor.organizationId, keys);
  const reservation = await withRequiredTransaction(async (session) => {
    await touchLocks(actor.organizationId, keys, session);
    const deliveryKey = `${studentId}:${requestKey}`;
    const replay = await NotificationLogModel.findOne({ organizationId: actor.organizationId, deliveryKey }).session(session);
    if (replay) return { log: replay, send: false };
    const preview = await previewDebtReminder(actor.organizationId, studentId, settings, session);
    if (options.chargeId && !preview.charges.some((charge) => charge.id === options.chargeId)) throw new AppError(404, "Cuota pendiente no encontrada", "PAYMENT_NOT_FOUND");
    if (preview.reason) {
      const messages: Record<string, string> = { CONTACT_OPTED_OUT: "Esta persona no acepta recordatorios de deuda por email", STUDENT_WITHOUT_EMAIL: "El alumno no tiene email cargado", NO_DEBT: "La cuenta ya está regularizada", REMINDERS_DISABLED: "Los recordatorios están deshabilitados" };
      throw new AppError(422, messages[preview.reason]!, preview.reason);
    }
    const cutoff = new Date(Date.now() - settings.minimumDaysBetween * 24 * 60 * 60000);
    if (await NotificationLogModel.exists({ organizationId: actor.organizationId, studentId, type: "DEBT_REMINDER", channel: "EMAIL", createdAt: { $gte: cutoff }, status: { $ne: "SKIPPED" } }).session(session)) {
      throw new AppError(429, `Ya se procesó un recordatorio recientemente. La frecuencia mínima es de ${settings.minimumDaysBetween} días.`, "REMINDER_FREQUENCY");
    }
    const [log] = await NotificationLogModel.create([{ organizationId: actor.organizationId, actorUserId: actor.userId, studentId,
      channel: "EMAIL", type: "DEBT_REMINDER", destination: preview.destination, subject: preview.subject, message: preview.message, status: "PENDING", deliveryKey }], { session });
    await AuditLogModel.create([{ organizationId: actor.organizationId, actorUserId: actor.userId, action: "DEBT_REMINDER_RESERVED", entityType: "NotificationLog", entityId: log._id,
      metadata: { studentId, automated: options.automated ?? false } }], { session });
    return { log, send: true };
  });
  if (!reservation.send) return { status: reservation.log.status, replay: true, logId: String(reservation.log._id) };
  // Recheck after reservation, immediately before contacting SMTP; previews are never send payloads.
  const latestSettings = await debtReminderPolicy(actor.organizationId);
  const current = await previewDebtReminder(actor.organizationId, studentId, latestSettings);
  const automaticAllowed = !options.automated || (latestSettings.automaticEnabled && current.charges.some((charge) => charge.dueDate <= addDays(academyNow().date, -latestSettings.daysOverdue)));
  if (!current.eligible || !automaticAllowed) {
    await NotificationLogModel.updateOne({ _id: reservation.log._id }, { $set: { status: "SKIPPED", errorMessage: "No enviado: cambió la deuda o la autorización de contacto" } });
    return { status: "SKIPPED", replay: false, logId: String(reservation.log._id) };
  }
  await NotificationLogModel.updateOne({ _id: reservation.log._id }, { $set: { destination: current.destination, subject: current.subject, message: current.message } });
  try { await sendEmail({ to: current.destination!, subject: current.subject, text: current.message }); }
  catch (error) {
    await NotificationLogModel.updateOne({ _id: reservation.log._id }, { $set: { status: "FAILED", errorMessage: mailFailureMessage(error) } });
    throw new AppError(502, "No pudimos confirmar el envío. Revisá el historial antes de volver a enviar.", "REMINDER_DELIVERY_FAILED");
  }
  await NotificationLogModel.updateOne({ _id: reservation.log._id }, { $set: { status: "SENT", sentAt: new Date() }, $unset: { errorMessage: 1 } });
  await AuditLogModel.create({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "DEBT_REMINDER_SENT", entityType: "NotificationLog", entityId: reservation.log._id });
  return { status: "SENT", replay: false, logId: String(reservation.log._id) };
}

/** Called only by the existing authenticated daily job. Both administrative switches default off. */
export async function processScheduledDebtReminders(organizationId: string, now = new Date()) {
  const settings = await DebtReminderSettingsModel.findOne({ organizationId, enabled: true, automaticEnabled: true }).lean();
  const result = { enabled: Boolean(settings), sent: 0, skipped: 0, failed: 0 };
  if (!settings) return result;
  const today = academyNow(now).date, threshold = addDays(today, -settings.daysOverdue);
  for (const id of await studentIdsWithOverdueDebt(organizationId, now)) {
    if (result.sent + result.failed >= 100) break;
    try {
      const preview = await previewDebtReminder(organizationId, String(id), settings);
      if (!preview.eligible || !preview.charges.some((charge) => charge.dueDate <= threshold)) { result.skipped++; continue; }
      const sent = await sendDebtReminder({ organizationId, userId: String(settings.updatedByUserId) }, String(id), `automatic:${today}`, { automated: true });
      if (sent.status === "SENT" && !sent.replay) result.sent++; else result.skipped++;
    } catch (error) { if (error instanceof AppError && error.code === "REMINDER_FREQUENCY") result.skipped++; else result.failed++; }
  }
  return result;
}
