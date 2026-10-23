import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());
const mailFailureMessage = vi.hoisted(() => vi.fn(() => "No se pudo enviar el correo. Intentá nuevamente más tarde."));
vi.mock("../../services/mailer", () => ({ sendEmail, mailFailureMessage }));

import { createApp } from "../../app";
import { DebtReminderSettingsModel } from "../notifications/debt-reminder-settings.model";
import { academyInstant } from "../../common/dates";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { UserModel } from "../auth/user.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { NotificationLogModel } from "../notifications/notification-log.model";
import { PaymentModel } from "../payments/payment.model";
import { SequenceModel } from "../payments/sequence.model";
import { ClassScheduleModel } from "../scheduling/class-schedule.model";
import { generateSessions } from "../scheduling/session-generator";
import { ClassSessionModel } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";
import { ChargeModel } from "./charge.model";
import { CollectionModel } from "./collection.model";

/**
 * Screens that used to charge through the legacy /admin/payments endpoints (class detail,
 * session view, student file) now go through /admin/billing. These tests pin the contracts they
 * rely on and that none of them creates a legacy Payment.
 */

const NOW = "2026-10-07T15:00:00.000Z";
const app = createApp();
let database: { stop: () => Promise<void> };
let token: string;
let counter = 0;
const ids = {} as Record<string, Types.ObjectId>;

const admin = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);
const key = () => `key-${Date.now()}-${++counter}-abcdefgh`;

async function setup(billingMode: "BOTH" | "MONTHLY" | "PER_CLASS" = "BOTH", email?: string) {
  const danceClass = await DanceClassModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    name: `Grupo ${++counter}`,
    professorIds: [],
    capacity: 20,
    billingMode,
    status: "ACTIVE",
    pricePerClass: 8000,
    monthlyPrice: 30000,
    schedules: []
  });
  const student = await StudentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    firstName: `Alumno${++counter}`,
    lastName: "Test",
    email,
    isActive: true
  });
  await EnrollmentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    classId: danceClass._id,
    studentId: student._id,
    status: "ACTIVE",
    billingPreference: "PER_CLASS",
    billingChanges: [{ effectiveDate: "2026-09-01", mode: "PER_CLASS" }],
    periods: [{ startDate: "2026-09-01" }],
    enrolledAt: new Date("2026-09-01T12:00:00.000Z")
  });
  return { danceClass, student };
}

beforeAll(async () => {
  database = await startReplicaSet();
  // The clock keeps ticking (as in production): a frozen clock hid write conflicts on timestamps.
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(NOW));
  const org = await OrganizationModel.create({ name: "Academia", slug: `screens-${Date.now()}` });
  const branch = await BranchModel.create({ organizationId: org._id, name: "La Plata" });
  const user = await UserModel.create({
    organizationId: org._id,
    email: "admin-screens@example.com",
    passwordHash: "x",
    firstName: "Ada",
    lastName: "Admin",
    role: "ADMIN"
  });
  Object.assign(ids, { org: org._id, branch: branch._id, admin: user._id });
  await DebtReminderSettingsModel.create({ organizationId: org._id, enabled: true, updatedByUserId: user._id });
  token = jwt.sign({ sub: String(user._id), organizationId: String(org._id), role: "ADMIN" }, env.JWT_ACCESS_SECRET);
}, 120_000);

beforeEach(() => {
  vi.setSystemTime(new Date(NOW));
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(undefined);
});

afterAll(async () => {
  vi.useRealTimers();
  await database.stop();
});

describe("POST /billing/classes/:id/collect", () => {
  it("creates the class fee and collects it at once, without a legacy Payment, and replays by key", async () => {
    const { danceClass, student } = await setup();
    const body = {
      studentId: String(student._id),
      paymentType: "PER_CLASS",
      serviceDate: "2026-10-05",
      amount: 8000,
      method: "CASH",
      idempotencyKey: key()
    };
    // The receipt counter is ensured once, before the transaction: touching it again inside would conflict with it.
    const ensureCounter = vi.spyOn(SequenceModel, "updateOne");
    const first = await admin(request(app).post(`/api/admin/billing/classes/${danceClass._id}/collect`)).send(body);
    expect(ensureCounter).toHaveBeenCalledTimes(1);
    ensureCounter.mockRestore();
    expect(first.status).toBe(201);
    expect(first.body.charge).toMatchObject({ kind: "CLASS_FEE", status: "PAID", serviceDate: "2026-10-05", amount: 8000, paid: 8000 });
    expect(first.body.collection).toMatchObject({ amount: 8000, allocated: 8000 });
    expect(first.body.collection.receiptNumber).toBeTruthy();

    const again = await admin(request(app).post(`/api/admin/billing/classes/${danceClass._id}/collect`)).send(body);
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(again.body.collection.id).toBe(first.body.collection.id);
    expect(await ChargeModel.countDocuments({ studentId: student._id })).toBe(1);
    expect(await CollectionModel.countDocuments({ studentId: student._id })).toBe(1);
    expect(await PaymentModel.countDocuments({ studentId: student._id })).toBe(0);

    // Another attempt (new key) for the same day does not create a second charge.
    const duplicate = await admin(request(app).post(`/api/admin/billing/classes/${danceClass._id}/collect`)).send({ ...body, idempotencyKey: key() });
    expect(duplicate.status).toBe(409);
    expect(await ChargeModel.countDocuments({ studentId: student._id })).toBe(1);
  });

  it("leaves no orphan charge when the collection fails", async () => {
    const { danceClass, student } = await setup();
    const response = await admin(request(app).post(`/api/admin/billing/classes/${danceClass._id}/collect`)).send({
      studentId: String(student._id),
      paymentType: "PER_CLASS",
      serviceDate: "2026-10-05",
      amount: 8000,
      method: "CASH",
      receivedAt: academyInstant("2026-10-09", "10:00").toISOString(),
      idempotencyKey: key()
    });
    expect(response.status).toBe(422);
    expect(await ChargeModel.countDocuments({ studentId: student._id })).toBe(0);
    expect(await CollectionModel.countDocuments({ studentId: student._id })).toBe(0);
  });

  it("collects an existing open monthly fee instead of creating a second one", async () => {
    const { danceClass, student } = await setup();
    const created = await admin(request(app).post("/api/admin/billing/charges")).send({
      studentId: String(student._id),
      classId: String(danceClass._id),
      kind: "MONTHLY_FEE",
      period: "2026-10",
      concept: "Mensualidad · Grupo",
      amount: 30000,
      dueDate: "2026-10-10"
    });
    expect(created.status).toBe(201);
    const response = await admin(request(app).post(`/api/admin/billing/classes/${danceClass._id}/collect`)).send({
      studentId: String(student._id),
      paymentType: "MONTHLY",
      period: "2026-10",
      amount: 30000,
      method: "TRANSFER",
      idempotencyKey: key()
    });
    expect(response.status).toBe(201);
    expect(response.body.charge).toMatchObject({ id: created.body.id, status: "PAID" });
    expect(await ChargeModel.countDocuments({ studentId: student._id })).toBe(1);
    expect(await PaymentModel.countDocuments({ studentId: student._id })).toBe(0);
  });

  it("requires an idempotency key and the date or period of the type", async () => {
    const { danceClass, student } = await setup();
    const base = { studentId: String(student._id), method: "CASH" };
    const path = `/api/admin/billing/classes/${danceClass._id}/collect`;
    expect((await admin(request(app).post(path)).send({ ...base, paymentType: "PER_CLASS", serviceDate: "2026-10-05" })).status).toBe(400);
    expect((await admin(request(app).post(path)).send({ ...base, paymentType: "PER_CLASS", idempotencyKey: key() })).status).toBe(400);
    expect((await admin(request(app).post(path)).send({ ...base, paymentType: "MONTHLY", idempotencyKey: key() })).status).toBe(400);
  });
});

describe("marking a charge as paid and collecting from a session", () => {
  it("pays an open charge in full through /collections with no legacy Payment, once per key", async () => {
    const { danceClass, student } = await setup();
    const charge = (
      await admin(request(app).post("/api/admin/billing/charges")).send({
        studentId: String(student._id),
        classId: String(danceClass._id),
        kind: "MONTHLY_FEE",
        period: "2026-10",
        concept: "Mensualidad · Grupo",
        amount: 30000,
        dueDate: "2026-10-10"
      })
    ).body;
    const body = {
      studentId: String(student._id),
      amount: 30000,
      method: "CASH",
      allocations: [{ chargeId: charge.id, amount: 30000 }],
      idempotencyKey: key()
    };
    const first = await admin(request(app).post("/api/admin/billing/collections")).send(body);
    expect(first.status).toBe(201);
    const replay = await admin(request(app).post("/api/admin/billing/collections")).send(body);
    expect(replay.status).toBe(200);
    expect(await CollectionModel.countDocuments({ studentId: student._id })).toBe(1);
    expect(await PaymentModel.countDocuments({ studentId: student._id })).toBe(0);

    const account = await admin(request(app).get(`/api/admin/billing/students/${student._id}/account`));
    const row = account.body.charges.find((item: any) => item.id === charge.id);
    expect(row).toMatchObject({ status: "PAID", lastCollection: { id: first.body.collection.id } });

    // Receipt PDF and email use the collection.
    const pdf = await admin(request(app).get(`/api/admin/billing/collections/${first.body.collection.id}/receipt.pdf`));
    expect(pdf.status).toBe(200);
  });

  it("collects a class from its session without creating a legacy Payment", async () => {
    const { danceClass, student } = await setup("PER_CLASS");
    await ClassScheduleModel.create({
      organizationId: ids.org,
      branchId: ids.branch,
      classId: danceClass._id,
      seriesId: new Types.ObjectId(),
      day: "MONDAY",
      startTime: "18:00",
      endTime: "19:00",
      validFrom: "2026-09-01",
      professorIds: []
    });
    await generateSessions(String(ids.org), { from: "2026-10-05", to: "2026-10-05", classIds: [danceClass._id] });
    const session = await ClassSessionModel.findOne({ organizationId: ids.org, classId: danceClass._id, sessionDate: "2026-10-05" });
    const response = await admin(request(app).post(`/api/admin/billing/sessions/${session!._id}/collect`)).send({
      studentId: String(student._id),
      method: "CASH",
      idempotencyKey: key()
    });
    expect(response.status).toBe(201);
    expect(response.body.charge).toMatchObject({ kind: "CLASS_FEE", status: "PAID" });
    expect(await PaymentModel.countDocuments({ studentId: student._id })).toBe(0);
  });
});

describe("POST /billing/charges/:id/remind and receipt email", () => {
  async function openCharge(studentId: Types.ObjectId, classId: Types.ObjectId) {
    const response = await admin(request(app).post("/api/admin/billing/charges")).send({
      studentId: String(studentId),
      classId: String(classId),
      kind: "MONTHLY_FEE",
      period: "2026-10",
      concept: "Mensualidad · Grupo",
      amount: 30000,
      dueDate: "2026-10-10"
    });
    return response.body.id as string;
  }

  it("emails the debt reminder and logs it like the legacy reminder", async () => {
    const { danceClass, student } = await setup("BOTH", "alumno@example.com");
    const chargeId = await openCharge(student._id, danceClass._id);
    const response = await admin(request(app).post(`/api/admin/billing/charges/${chargeId}/remind`));
    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alumno@example.com", subject: "Recordatorio de pago - M&M Academia", text: expect.stringContaining("Vencimiento: 10/10/2026") })
    );
    const log = await NotificationLogModel.findOne({ studentId: student._id, type: "DEBT_REMINDER" }).lean();
    expect(log).toMatchObject({ status: "SENT", channel: "EMAIL", destination: "alumno@example.com" });
  });

  it("logs a failed delivery and rejects students without email or paid charges", async () => {
    const withMail = await setup("BOTH", "falla@example.com");
    const failing = await openCharge(withMail.student._id, withMail.danceClass._id);
    sendEmail.mockRejectedValueOnce(new Error("SMTP caído"));
    expect((await admin(request(app).post(`/api/admin/billing/charges/${failing}/remind`))).status).toBe(502);
    expect(await NotificationLogModel.findOne({ studentId: withMail.student._id, status: "FAILED" }).lean()).toMatchObject({
      errorMessage: "No se pudo enviar el correo. Intentá nuevamente más tarde."
    });

    const noMail = await setup("BOTH");
    const withoutEmail = await openCharge(noMail.student._id, noMail.danceClass._id);
    expect((await admin(request(app).post(`/api/admin/billing/charges/${withoutEmail}/remind`))).status).toBe(422);

    await admin(request(app).post("/api/admin/billing/collections")).send({
      studentId: String(withMail.student._id),
      amount: 30000,
      method: "CASH",
      allocations: [{ chargeId: failing, amount: 30000 }],
      idempotencyKey: key()
    });
    expect((await admin(request(app).post(`/api/admin/billing/charges/${failing}/remind`))).status).toBe(404);
  });

  it("emails the receipt of a collection", async () => {
    const { danceClass, student } = await setup("BOTH", "recibo@example.com");
    const chargeId = await openCharge(student._id, danceClass._id);
    const collected = await admin(request(app).post("/api/admin/billing/collections")).send({
      studentId: String(student._id),
      amount: 30000,
      method: "CASH",
      allocations: [{ chargeId, amount: 30000 }],
      idempotencyKey: key()
    });
    const response = await admin(request(app).post(`/api/admin/billing/collections/${collected.body.collection.id}/receipt/email`));
    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "recibo@example.com" }));
  });
});
