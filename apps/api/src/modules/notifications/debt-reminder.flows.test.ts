import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("../../services/mailer", () => ({ sendEmail, mailFailureMessage: () => "No se pudo enviar el correo. Intentá nuevamente más tarde." }));
import { createApp } from "../../app";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { OrganizationModel } from "../core/organization.model";
import { BranchModel } from "../core/branch.model";
import { ContactModel } from "../contacts/contact.model";
import { StudentModel } from "../students/student.model";
import { ChargeModel } from "../billing/charge.model";
import { NotificationLogModel } from "./notification-log.model";
import { debtReminderPolicy, DebtReminderSettingsModel } from "./debt-reminder-settings.model";
import { previewDebtReminder, processScheduledDebtReminders, sendDebtReminder } from "./debt-reminder-service";

let db: Awaited<ReturnType<typeof startReplicaSet>>, counter = 0;
const app = createApp();
async function setup(enabled = true, email = "lucia@example.test") {
  const org = await OrganizationModel.create({ name: "M&M", slug: `reminder-${++counter}` });
  const branch = await BranchModel.create({ organizationId: org._id, name: "Centro" }), user = new Types.ObjectId();
  const contact = await ContactModel.create({ organizationId: org._id, branchId: branch._id, firstName: "Lucía", lastName: "Pérez", email: email || undefined });
  await StudentModel.create({ _id: contact._id, contactId: contact._id, organizationId: org._id, branchId: branch._id, firstName: contact.firstName, lastName: contact.lastName, email: email || undefined });
  const charge = await ChargeModel.create({ organizationId: org._id, branchId: branch._id, studentId: contact._id, kind: "OTHER", period: "2026-10", concept: "Clases de octubre",
    listCents: 3000000, amountCents: 3000000, balanceCents: 3000000, dueDate: "2026-10-10", status: "OPEN", origin: "MANUAL" });
  if (enabled) await DebtReminderSettingsModel.create({ organizationId: org._id, enabled: true, updatedByUserId: user });
  const actor = { organizationId: String(org._id), userId: String(user) };
  const token = jwt.sign({ sub: String(user), organizationId: String(org._id), role: "ADMIN" }, env.JWT_ACCESS_SECRET);
  return { org, contact, charge, actor, token };
}
beforeAll(async () => { db = await startReplicaSet(); vi.useFakeTimers({ toFake: ["Date"] }); }, 120000);
beforeEach(() => { vi.setSystemTime(new Date("2026-10-23T18:00:00Z")); sendEmail.mockReset(); sendEmail.mockResolvedValue(undefined); });
afterAll(async () => { vi.useRealTimers(); await db.stop(); });

describe("debt reminders", () => {
  it("defaults to disabled for both manual and automatic processing", async () => {
    const s = await setup(false);
    expect(await debtReminderPolicy(s.actor.organizationId)).toMatchObject({ enabled: false, automaticEnabled: false });
    await expect(sendDebtReminder(s.actor, String(s.contact._id), "manual-disabled-123456")).rejects.toMatchObject({ code: "REMINDERS_DISABLED" });
    expect(await processScheduledDebtReminders(s.actor.organizationId)).toMatchObject({ enabled: false, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("previews without sending and recalculates the amount when processing", async () => {
    const s = await setup();
    expect((await previewDebtReminder(s.actor.organizationId, String(s.contact._id))).balance.pendingCents).toBe(3000000);
    expect(sendEmail).not.toHaveBeenCalled();
    await ChargeModel.updateOne({ _id: s.charge._id }, { $set: { paidCents: 1000000, balanceCents: 2000000 } });
    await sendDebtReminder(s.actor, String(s.contact._id), "manual-current-1234567");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("Saldo pendiente: $ 20.000") }));
    expect(sendEmail.mock.calls[0][0].text).toContain("Vencimiento: 10/10/2026");
    expect((await NotificationLogModel.findOne({ studentId: s.contact._id }))?.status).toBe("SENT");
  });
  it("does not send to a regularized account, to an opt-out or without an email", async () => {
    const paid = await setup(); await ChargeModel.updateOne({ _id: paid.charge._id }, { $set: { status: "PAID", balanceCents: 0, paidCents: 3000000 } });
    await expect(sendDebtReminder(paid.actor, String(paid.contact._id), "regularized-123456789")).rejects.toMatchObject({ code: "NO_DEBT" });
    const opted = await setup(); await ContactModel.updateOne({ _id: opted.contact._id }, { $set: { "preferences.emailReminders": false } });
    await expect(sendDebtReminder(opted.actor, String(opted.contact._id), "opt-out-123456789012")).rejects.toMatchObject({ code: "CONTACT_OPTED_OUT" });
    const noEmail = await setup(true, "");
    await expect(sendDebtReminder(noEmail.actor, String(noEmail.contact._id), "no-email-123456789012")).rejects.toMatchObject({ code: "STUDENT_WITHOUT_EMAIL" });
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent retries with the same delivery key", async () => {
    const s = await setup();
    await Promise.all([1, 2].map(() => sendDebtReminder(s.actor, String(s.contact._id), "same-request-123456789")));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(await NotificationLogModel.countDocuments({ studentId: s.contact._id })).toBe(1);
  });
  it("enforces frequency under concurrent different keys", async () => {
    const s = await setup();
    const results = await Promise.allSettled([1, 2].map((id) => sendDebtReminder(s.actor, String(s.contact._id), `different-key-1234567-${id}`)));
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-31T18:00:00Z"));
    await sendDebtReminder(s.actor, String(s.contact._id), "after-frequency-1234567"); expect(sendEmail).toHaveBeenCalledTimes(2);
  });
  it("records sanitized errors and never automatically resends an uncertain attempt", async () => {
    const s = await setup(); sendEmail.mockRejectedValueOnce(new Error("password=never-log-this smtp://private"));
    await expect(sendDebtReminder(s.actor, String(s.contact._id), "failed-delivery-1234567")).rejects.toMatchObject({ code: "REMINDER_DELIVERY_FAILED" });
    const replay = await sendDebtReminder(s.actor, String(s.contact._id), "failed-delivery-1234567");
    expect(replay).toMatchObject({ status: "FAILED", replay: true }); expect(sendEmail).toHaveBeenCalledTimes(1);
    const log = await NotificationLogModel.findOne({ studentId: s.contact._id }); expect(log?.errorMessage).not.toContain("never-log-this");
    await expect(sendDebtReminder(s.actor, String(s.contact._id), "another-attempt-1234567")).rejects.toMatchObject({ code: "REMINDER_FREQUENCY" });
  });
  it("does not resend a PENDING delivery after an ambiguous process interruption", async () => {
    const s = await setup();
    await NotificationLogModel.create({ organizationId: s.org._id, studentId: s.contact._id, channel: "EMAIL", type: "DEBT_REMINDER", destination: "lucia@example.test",
      message: "Intento incierto", status: "PENDING", deliveryKey: `${s.contact._id}:interrupted-123456789` });
    expect(await sendDebtReminder(s.actor, String(s.contact._id), "interrupted-123456789")).toMatchObject({ status: "PENDING", replay: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("automates only when explicitly enabled and after the configured overdue threshold", async () => {
    const s = await setup();
    expect((await processScheduledDebtReminders(s.actor.organizationId)).sent).toBe(0);
    await DebtReminderSettingsModel.updateOne({ organizationId: s.org._id }, { $set: { automaticEnabled: true, daysOverdue: 20 } });
    expect((await processScheduledDebtReminders(s.actor.organizationId)).sent).toBe(0);
    await DebtReminderSettingsModel.updateOne({ organizationId: s.org._id }, { $set: { daysOverdue: 7 } });
    expect((await processScheduledDebtReminders(s.actor.organizationId)).sent).toBe(1);
    expect((await processScheduledDebtReminders(s.actor.organizationId)).sent).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it("authorizes preview/send, rejects foreign identities and blocks the old bulk debt bypass", async () => {
    const s = await setup(), foreign = await setup();
    expect((await request(app).get(`/api/admin/debt-reminders/students/${s.contact._id}/preview`)).status).toBe(401);
    const auth = (test: request.Test) => test.set("Authorization", `Bearer ${s.token}`);
    expect((await auth(request(app).get(`/api/admin/debt-reminders/students/${foreign.contact._id}/preview`))).status).toBe(404);
    const preview = await auth(request(app).get(`/api/admin/debt-reminders/students/${s.contact._id}/preview`)); expect(preview.body.eligible).toBe(true);
    expect((await auth(request(app).post(`/api/admin/debt-reminders/students/${s.contact._id}/send`)).send({ idempotencyKey: "authorized-send-123456789" })).body.status).toBe("SENT");
    expect((await auth(request(app).post("/api/admin/communications/email")).send({ audience: "DEBT", subject: "Aviso", message: "Texto viejo" })).body.error).toBe("USE_DEBT_REMINDERS");
  });
});
