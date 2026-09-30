import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ACTIVE_CHARGE_INDEX_NAME } from "../payments/active-charge-key";
import { PaymentModel } from "../payments/payment.model";
import { StudentModel } from "../students/student.model";

let mongod: MongoMemoryServer;
const app = createApp();
const ids = {} as Record<string, Types.ObjectId>;
let token: string;
let counter = 0;

const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

async function setup(mode: "PER_CLASS" | "MONTHLY" | "BOTH" = "BOTH") {
  const danceClass = await DanceClassModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    name: `Clase ${mode} ${++counter}`,
    professorIds: [new Types.ObjectId()],
    capacity: 20,
    billingMode: mode,
    pricePerClass: 8000,
    monthlyPrice: 25000,
    schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]
  });
  const student = await StudentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    firstName: `Alumno${++counter}`,
    lastName: "Test"
  });
  await EnrollmentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    classId: danceClass._id,
    studentId: student._id,
    billingPreference: mode === "MONTHLY" ? "MONTHLY" : "PER_CLASS"
  });
  return { danceClass, student };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

const quick = (ctx: Ctx, body: Record<string, unknown>) =>
  auth(request(app).post("/api/admin/payments/quick-charge")).send({
    studentId: String(ctx.student._id),
    classId: String(ctx.danceClass._id),
    ...body
  });

const manual = (ctx: Ctx, body: Record<string, unknown>) =>
  auth(request(app).post("/api/admin/payments")).send({
    studentId: String(ctx.student._id),
    classId: String(ctx.danceClass._id),
    concept: "Cuota",
    amount: 8000,
    dueDate: "2026-09-30",
    ...body
  });

const perClass = (classDate: string) => ({ paymentType: "PER_CLASS", classDate });
const monthly = (period: string) => ({ paymentType: "MONTHLY", period, amount: 25000 });

const rawPayments = (ctx: Ctx) => PaymentModel.collection.find({ studentId: ctx.student._id }).toArray();
const statuses = (responses: request.Response[]) => responses.map((item) => item.status).sort();

function rawPaymentFields(ctx: Ctx, extra: Record<string, unknown> = {}) {
  return {
    organizationId: ids.org,
    branchId: ids.branch,
    studentId: ctx.student._id,
    classId: ctx.danceClass._id,
    paymentType: "PER_CLASS" as const,
    classDate: new Date("2026-09-29T12:00:00.000Z"),
    concept: "Clase",
    period: "2026-09",
    amount: 8000,
    dueDate: new Date("2099-01-01T12:00:00.000Z"),
    ...extra
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Make sure the unique index really exists before any concurrency test runs.
  await PaymentModel.init();

  const org = await OrganizationModel.create({ name: "Test", slug: "test" });
  const branch = await BranchModel.create({ organizationId: org._id, name: "La Plata" });
  Object.assign(ids, { org: org._id, branch: branch._id });

  token = jwt.sign(
    { sub: String(new Types.ObjectId()), organizationId: String(org._id), role: "ADMIN" },
    env.JWT_ACCESS_SECRET
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("active charge unique index", () => {
  it("exists, is unique and only covers documents with a key", async () => {
    const indexes = await PaymentModel.collection.indexes();
    const index = indexes.find((item) => item.name === ACTIVE_CHARGE_INDEX_NAME);

    expect(index).toBeDefined();
    expect(index?.unique).toBe(true);
    expect(index?.key).toEqual({ organizationId: 1, activeChargeKey: 1 });
    expect(index?.partialFilterExpression).toEqual({ activeChargeKey: { $type: "string" } });
  });

  it("makes MongoDB reject two concurrent creates of the same charge", async () => {
    const ctx = await setup();

    const results = await Promise.allSettled([
      PaymentModel.create(rawPaymentFields(ctx)),
      PaymentModel.create(rawPaymentFields(ctx, { concept: "Otro texto" }))
    ]);

    const rejected = results.filter((item) => item.status === "rejected") as PromiseRejectedResult[];
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason.code).toBe(11000);
    expect(rejected[0]!.reason.keyPattern).toHaveProperty("activeChargeKey");
    expect(await rawPayments(ctx)).toHaveLength(1);
  });

  it("allows any number of CANCELLED payments for the same identity (no key stored)", async () => {
    const ctx = await setup();

    for (let i = 0; i < 3; i += 1) {
      await PaymentModel.create(rawPaymentFields(ctx, { status: "CANCELLED" }));
    }
    await PaymentModel.create(rawPaymentFields(ctx, { status: "PENDING" }));

    const stored = await rawPayments(ctx);
    expect(stored).toHaveLength(4);
    expect(stored.filter((item) => item.activeChargeKey !== undefined)).toHaveLength(1);
    expect(stored.filter((item) => item.status === "CANCELLED").every((item) => !("activeChargeKey" in item))).toBe(true);
  });

  it("allows the same day for another student and the same student on another day", async () => {
    const a = await setup();
    const b = await setup();

    await PaymentModel.create(rawPaymentFields(a));
    await PaymentModel.create(rawPaymentFields(b));
    await PaymentModel.create(rawPaymentFields(a, { classDate: new Date("2026-09-30T12:00:00.000Z") }));

    expect(await rawPayments(a)).toHaveLength(2);
  });

  it("treats two legacy hours of the same class day as the same charge", async () => {
    const ctx = await setup();
    await PaymentModel.create(rawPaymentFields(ctx, { classDate: new Date("2026-09-29T00:00:00.000Z") }));

    await expect(
      PaymentModel.create(rawPaymentFields(ctx, { classDate: new Date("2026-09-29T12:00:00.000Z") }))
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe("concurrent charges through the API", () => {
  it("two simultaneous PER_CLASS quick-charges: one 201, one 409, one Payment", async () => {
    const ctx = await setup("PER_CLASS");

    const responses = await Promise.all([
      quick(ctx, perClass("2026-09-29")),
      quick(ctx, perClass("2026-09-29"))
    ]);

    expect(statuses(responses)).toEqual([201, 409]);
    expect(responses.find((item) => item.status === 409)?.body.error).toBe("PAYMENT_ALREADY_EXISTS");
    expect(await rawPayments(ctx)).toHaveLength(1);

    // Another day is still allowed.
    expect((await quick(ctx, perClass("2026-09-30"))).status).toBe(201);
  });

  it("manual and quick-charge at the same time: exactly one wins", async () => {
    const ctx = await setup("PER_CLASS");

    const responses = await Promise.all([
      manual(ctx, perClass("2026-09-29")),
      quick(ctx, perClass("2026-09-29"))
    ]);

    expect(statuses(responses)).toEqual([201, 409]);
    expect(responses.find((item) => item.status === 409)?.body.error).toBe("PAYMENT_ALREADY_EXISTS");
    expect(await rawPayments(ctx)).toHaveLength(1);
  });

  it("several simultaneous requests still leave exactly one active payment", async () => {
    const ctx = await setup("PER_CLASS");

    const responses = await Promise.all([
      quick(ctx, perClass("2026-09-29")),
      manual(ctx, perClass("2026-09-29")),
      quick(ctx, perClass("2026-09-29")),
      manual(ctx, perClass("2026-09-29"))
    ]);

    expect(responses.filter((item) => item.status === 201)).toHaveLength(1);
    expect(responses.filter((item) => item.status === 409)).toHaveLength(3);
    expect(await rawPayments(ctx)).toHaveLength(1);
  });

  it("two simultaneous MONTHLY charges: one 201, one 409, one Payment; another month is allowed", async () => {
    const ctx = await setup("MONTHLY");

    const responses = await Promise.all([
      quick(ctx, monthly("2026-09")),
      manual(ctx, monthly("2026-09"))
    ]);

    expect(statuses(responses)).toEqual([201, 409]);
    expect(await rawPayments(ctx)).toHaveLength(1);
    expect((await quick(ctx, monthly("2026-10"))).status).toBe(201);
  });

  it("never exposes the internal key in API responses", async () => {
    const ctx = await setup("PER_CLASS");

    const created = await manual(ctx, perClass("2026-09-29"));
    const listed = await auth(request(app).get("/api/admin/payments"));

    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty("activeChargeKey");
    expect(JSON.stringify(listed.body)).not.toContain("activeChargeKey");
    expect((await rawPayments(ctx))[0]).toHaveProperty("activeChargeKey");
  });
});

describe("cancelling releases the identity", () => {
  it("removes the key from the stored document and allows charging the same day again", async () => {
    const ctx = await setup("PER_CLASS");
    const created = await manual(ctx, perClass("2026-09-29"));
    expect(created.status).toBe(201);
    expect(await manual(ctx, perClass("2026-09-29"))).toMatchObject({ status: 409 });

    const cancelled = await auth(request(app).post(`/api/admin/payments/${created.body._id}/cancel`)).send({
      reason: "Cargado por error"
    });
    expect(cancelled.status).toBe(200);

    const stored = await PaymentModel.collection.findOne({ _id: new Types.ObjectId(created.body._id) });
    expect(stored?.status).toBe("CANCELLED");
    expect(stored).not.toHaveProperty("activeChargeKey");

    const again = await quick(ctx, perClass("2026-09-29"));
    expect(again.status).toBe(201);
    const active = (await rawPayments(ctx)).filter((item) => item.activeChargeKey !== undefined);
    expect(active).toHaveLength(1);
    expect(String(active[0]!._id)).toBe(again.body._id);
  });

  it("keeps the key while a PENDING payment becomes PAID", async () => {
    const ctx = await setup("PER_CLASS");
    const created = await manual(ctx, perClass("2026-09-29"));

    await auth(request(app).post(`/api/admin/payments/${created.body._id}/mark-paid`)).send({});

    const stored = await PaymentModel.collection.findOne({ _id: new Types.ObjectId(created.body._id) });
    expect(stored?.status).toBe("PAID");
    expect(stored?.activeChargeKey).toContain("PER_CLASS:");
    expect((await quick(ctx, perClass("2026-09-29"))).status).toBe(409);
  });
});

describe("POST /admin/payments/:id/mark-paid: concurrency", () => {
  async function pendingPayment() {
    const ctx = await setup("PER_CLASS");
    const created = await manual(ctx, perClass("2026-09-29"));
    expect(created.status).toBe(201);
    return { ctx, id: String(created.body._id) };
  }

  const markPaid = (id: string) =>
    auth(request(app).post(`/api/admin/payments/${id}/mark-paid`)).send({ paymentMethod: "CASH" });

  it("two simultaneous requests: both 200, one PAID payment, one receipt, one audit event", async () => {
    const { id } = await pendingPayment();

    const responses = await Promise.all([markPaid(id), markPaid(id)]);

    expect(statuses(responses)).toEqual([200, 200]);
    expect(responses.every((item) => item.body.status === "PAID")).toBe(true);

    const stored = await PaymentModel.collection.findOne({ _id: new Types.ObjectId(id) });
    expect(stored?.status).toBe("PAID");
    expect(stored?.receiptNumber).toMatch(/^REC-\d{6}$/);
    // Both responses describe the final state, with the receipt that was actually stored.
    expect(responses.map((item) => item.body.receiptNumber)).toEqual([stored?.receiptNumber, stored?.receiptNumber]);

    const events = await AuditLogModel.find({ entityId: new Types.ObjectId(id), action: "PAYMENT_MARKED_PAID" });
    expect(events).toHaveLength(1);
  });

  it("many simultaneous requests still produce a single transition", async () => {
    const { id } = await pendingPayment();

    const responses = await Promise.all([markPaid(id), markPaid(id), markPaid(id), markPaid(id), markPaid(id)]);

    expect(responses.every((item) => item.status === 200)).toBe(true);
    expect(new Set(responses.map((item) => item.body.receiptNumber)).size).toBe(1);
    expect(await AuditLogModel.countDocuments({ entityId: new Types.ObjectId(id), action: "PAYMENT_MARKED_PAID" })).toBe(1);
  });

  it("a later request on an already PAID payment is idempotent and adds no side effects", async () => {
    const { id } = await pendingPayment();
    const first = await markPaid(id);

    const second = await markPaid(id);

    expect(second.status).toBe(200);
    expect(second.body.receiptNumber).toBe(first.body.receiptNumber);
    expect(await AuditLogModel.countDocuments({ entityId: new Types.ObjectId(id), action: "PAYMENT_MARKED_PAID" })).toBe(1);
  });

  it("does not pay a cancelled payment", async () => {
    const { id } = await pendingPayment();
    await auth(request(app).post(`/api/admin/payments/${id}/cancel`)).send({ reason: "Error de carga" });

    const response = await markPaid(id);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("PAYMENT_CANCELLED");
    expect((await PaymentModel.collection.findOne({ _id: new Types.ObjectId(id) }))?.status).toBe("CANCELLED");
  });
});
