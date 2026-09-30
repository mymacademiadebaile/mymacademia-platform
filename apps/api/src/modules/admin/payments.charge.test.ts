import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import { StudentModel } from "../students/student.model";

type Mode = "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE";

let mongod: MongoMemoryServer;
const app = createApp();
const ids = {} as Record<string, Types.ObjectId>;
let token: string;
let counter = 0;

const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

async function setup(
  mode: Mode,
  options: { enrollment?: "ACTIVE" | "INACTIVE" | "NONE"; organizationId?: Types.ObjectId; branchId?: Types.ObjectId } = {}
) {
  const organizationId = options.organizationId ?? ids.org;
  const branchId = options.branchId ?? ids.branch;
  const danceClass = await DanceClassModel.create({
    organizationId,
    branchId,
    name: `Clase ${mode} ${++counter}`,
    professorIds: [new Types.ObjectId()],
    capacity: 20,
    billingMode: mode,
    pricePerClass: 8000,
    monthlyPrice: 25000,
    schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]
  });
  const student = await StudentModel.create({
    organizationId,
    branchId,
    firstName: `Alumno${++counter}`,
    lastName: "Test"
  });
  const enrollmentState = options.enrollment ?? "ACTIVE";
  if (enrollmentState !== "NONE") {
    await EnrollmentModel.create({
      organizationId,
      branchId,
      classId: danceClass._id,
      studentId: student._id,
      status: enrollmentState,
      billingPreference: mode === "FREE" ? undefined : mode === "BOTH" ? "PER_CLASS" : mode
    });
  }
  return { danceClass, student };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

const manual = (ctx: Ctx, body: Record<string, unknown>) =>
  auth(request(app).post("/api/admin/payments")).send({
    studentId: String(ctx.student._id),
    classId: String(ctx.danceClass._id),
    concept: "Cuota",
    amount: 8000,
    dueDate: "2026-09-30",
    ...body
  });

const quick = (ctx: Ctx, body: Record<string, unknown>) =>
  auth(request(app).post("/api/admin/payments/quick-charge")).send({
    studentId: String(ctx.student._id),
    classId: String(ctx.danceClass._id),
    ...body
  });

const perClass = (date: string, extra: Record<string, unknown> = {}) => ({
  paymentType: "PER_CLASS",
  classDate: date,
  ...extra
});
const monthly = (period: string, extra: Record<string, unknown> = {}) => ({
  paymentType: "MONTHLY",
  period,
  amount: 25000,
  ...extra
});

const countPayments = (ctx: Ctx) => PaymentModel.countDocuments({ studentId: ctx.student._id });

function addPayment(ctx: Ctx, type: "PER_CLASS" | "MONTHLY", when: string, status: string) {
  return PaymentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    studentId: ctx.student._id,
    classId: ctx.danceClass._id,
    paymentType: type,
    classDate: type === "PER_CLASS" ? new Date(`${when}T12:00:00.000Z`) : undefined,
    concept: "Previo",
    period: when.slice(0, 7),
    amount: 8000,
    dueDate: new Date("2099-01-01T12:00:00.000Z"),
    status
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const org = await OrganizationModel.create({ name: "Test", slug: "test" });
  const otherOrg = await OrganizationModel.create({ name: "Other", slug: "other" });
  const branch = await BranchModel.create({ organizationId: org._id, name: "La Plata" });
  const otherBranch = await BranchModel.create({ organizationId: otherOrg._id, name: "Ajena" });
  Object.assign(ids, {
    org: org._id,
    otherOrg: otherOrg._id,
    branch: branch._id,
    otherBranch: otherBranch._id
  });

  token = jwt.sign(
    { sub: String(new Types.ObjectId()), organizationId: String(org._id), role: "ADMIN" },
    env.JWT_ACCESS_SECRET
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("POST /admin/payments: PER_CLASS", () => {
  it("creates a pending payment for an enrolled student, stored at the canonical class day", async () => {
    const ctx = await setup("PER_CLASS");

    const response = await manual(ctx, perClass("2026-09-29"));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      paymentType: "PER_CLASS",
      status: "PENDING",
      classDate: "2026-09-29T12:00:00.000Z",
      period: "2026-09"
    });
  });

  it("rejects MONTHLY in a PER_CLASS class", async () => {
    const ctx = await setup("PER_CLASS");

    const response = await manual(ctx, monthly("2026-09"));

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("PAYMENT_TYPE_NOT_ALLOWED");
    expect(await countPayments(ctx)).toBe(0);
  });

  it("requires classDate", async () => {
    const ctx = await setup("PER_CLASS");

    const response = await manual(ctx, { paymentType: "PER_CLASS", period: "2026-09" });

    expect(response.status).toBe(400);
    expect(await countPayments(ctx)).toBe(0);
  });

  it("accepts a period that matches the class day and rejects one that does not", async () => {
    const ctx = await setup("PER_CLASS");

    expect((await manual(ctx, perClass("2026-09-29", { period: "2026-09" }))).status).toBe(201);
    const mismatch = await manual(ctx, perClass("2026-09-30", { period: "2026-10" }));
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error).toBe("INVALID_PERIOD");
  });

  it("rejects an impossible calendar date", async () => {
    const ctx = await setup("PER_CLASS");

    const response = await manual(ctx, perClass("2026-02-31"));

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("INVALID_CLASS_DATE");
  });

  it("allows different days", async () => {
    const ctx = await setup("PER_CLASS");

    expect((await manual(ctx, perClass("2026-09-29"))).status).toBe(201);
    expect((await manual(ctx, perClass("2026-09-30"))).status).toBe(201);
    expect(await countPayments(ctx)).toBe(2);
  });

  it("duplicates by day, not by concept", async () => {
    const ctx = await setup("PER_CLASS");

    expect((await manual(ctx, perClass("2026-09-29", { concept: "Clase uno" }))).status).toBe(201);
    const second = await manual(ctx, perClass("2026-09-29", { concept: "Otro texto" }));

    expect(second.status).toBe(409);
    expect(second.body.error).toBe("PAYMENT_ALREADY_EXISTS");
    expect(await countPayments(ctx)).toBe(1);
  });

  it("a legacy payment at a different hour of the same day is still a duplicate", async () => {
    const ctx = await setup("PER_CLASS");
    await PaymentModel.create({
      organizationId: ids.org,
      branchId: ids.branch,
      studentId: ctx.student._id,
      classId: ctx.danceClass._id,
      paymentType: "PER_CLASS",
      classDate: new Date("2026-09-29T00:00:00.000Z"),
      concept: "Legacy",
      period: "2026-09",
      amount: 8000,
      dueDate: new Date("2026-09-29T00:00:00.000Z")
    });

    expect((await manual(ctx, perClass("2026-09-29"))).status).toBe(409);
  });

  it("a CANCELLED payment does not block a new one", async () => {
    const ctx = await setup("PER_CLASS");
    await addPayment(ctx, "PER_CLASS", "2026-09-29", "CANCELLED");

    expect((await manual(ctx, perClass("2026-09-29"))).status).toBe(201);
  });
});

describe("POST /admin/payments: MONTHLY", () => {
  it("creates a pending monthly payment", async () => {
    const ctx = await setup("MONTHLY");

    const response = await manual(ctx, monthly("2026-09"));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ paymentType: "MONTHLY", period: "2026-09", status: "PENDING" });
    expect(response.body.classDate).toBeUndefined();
  });

  it("rejects PER_CLASS in a MONTHLY class", async () => {
    const ctx = await setup("MONTHLY");

    const response = await manual(ctx, perClass("2026-09-29"));

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("PAYMENT_TYPE_NOT_ALLOWED");
    expect(await countPayments(ctx)).toBe(0);
  });

  it("requires a period and rejects a class date", async () => {
    const ctx = await setup("MONTHLY");

    expect((await manual(ctx, { paymentType: "MONTHLY" })).status).toBe(400);
    expect((await manual(ctx, monthly("2026-09", { classDate: "2026-09-29" }))).status).toBe(400);
    expect(await countPayments(ctx)).toBe(0);
  });

  it("duplicates by period, not by concept", async () => {
    const ctx = await setup("MONTHLY");

    expect((await manual(ctx, monthly("2026-09", { concept: "Cuota septiembre" }))).status).toBe(201);
    const second = await manual(ctx, monthly("2026-09", { concept: "Mensualidad septiembre" }));

    expect(second.status).toBe(409);
    expect(second.body.error).toBe("PAYMENT_ALREADY_EXISTS");
    expect(await countPayments(ctx)).toBe(1);
  });

  it("allows different months", async () => {
    const ctx = await setup("MONTHLY");

    expect((await manual(ctx, monthly("2026-09"))).status).toBe(201);
    expect((await manual(ctx, monthly("2026-10"))).status).toBe(201);
  });

  it("a CANCELLED payment does not block a new one", async () => {
    const ctx = await setup("MONTHLY");
    await addPayment(ctx, "MONTHLY", "2026-09-01", "CANCELLED");

    expect((await manual(ctx, monthly("2026-09"))).status).toBe(201);
  });

  it("a PAID month blocks another manual payment for that month", async () => {
    const ctx = await setup("MONTHLY");
    await addPayment(ctx, "MONTHLY", "2026-09-01", "PAID");

    expect((await manual(ctx, monthly("2026-09", { concept: "Otro concepto" }))).status).toBe(409);
  });
});

describe("POST /admin/payments: BOTH, FREE and enrollment", () => {
  it("BOTH accepts PER_CLASS and MONTHLY", async () => {
    const ctx = await setup("BOTH");

    expect((await manual(ctx, perClass("2026-09-29"))).status).toBe(201);
    expect((await manual(ctx, monthly("2026-09"))).status).toBe(201);
  });

  it("BOTH does not compare against billingPreference (same as quick-charge; P2-10 pending)", async () => {
    const ctx = await setup("BOTH"); // enrollment preference is PER_CLASS

    expect((await manual(ctx, monthly("2026-09"))).status).toBe(201);
    expect((await quick(ctx, monthly("2026-10"))).status).toBe(201);
  });

  it.each([perClass("2026-09-29"), monthly("2026-09")])("FREE class rejects %j", async (body) => {
    const ctx = await setup("FREE");

    const manualResponse = await manual(ctx, body);
    const quickResponse = await quick(ctx, body);

    expect(manualResponse.status).toBe(422);
    expect(manualResponse.body.error).toBe("PAYMENT_TYPE_NOT_ALLOWED");
    expect(quickResponse.status).toBe(422);
    expect(quickResponse.body.error).toBe("PAYMENT_TYPE_NOT_ALLOWED");
    expect(await countPayments(ctx)).toBe(0);
  });

  it("rejects a student without enrollment", async () => {
    const ctx = await setup("BOTH", { enrollment: "NONE" });

    const response = await manual(ctx, perClass("2026-09-29"));

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("PAYMENT_REQUIRES_ACTIVE_ENROLLMENT");
    expect(await countPayments(ctx)).toBe(0);
  });

  it("rejects a student with an INACTIVE enrollment", async () => {
    const ctx = await setup("BOTH", { enrollment: "INACTIVE" });

    const response = await manual(ctx, perClass("2026-09-29"));

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("PAYMENT_REQUIRES_ACTIVE_ENROLLMENT");
    expect(await countPayments(ctx)).toBe(0);
  });

  it("rejects an inactive class like quick-charge does", async () => {
    const ctx = await setup("BOTH");
    await DanceClassModel.updateOne({ _id: ctx.danceClass._id }, { status: "INACTIVE" });

    expect((await manual(ctx, perClass("2026-09-29"))).status).toBe(404);
    expect((await quick(ctx, perClass("2026-09-29"))).status).toBe(404);
  });

  it("rejects a branch that does not match the student", async () => {
    const ctx = await setup("BOTH");

    const response = await manual(ctx, perClass("2026-09-29", { branchId: String(ids.otherBranch) }));

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("PAYMENT_BRANCH_MISMATCH");
  });

  it("rejects non-positive and absurd amounts", async () => {
    const ctx = await setup("BOTH");

    expect((await manual(ctx, perClass("2026-09-29", { amount: 0 }))).status).toBe(400);
    expect((await manual(ctx, perClass("2026-09-29", { amount: -5 }))).status).toBe(400);
    expect((await manual(ctx, perClass("2026-09-29", { amount: 1e12 }))).status).toBe(400);
  });
});

describe("multi-tenancy", () => {
  it("cannot combine ids of another organization", async () => {
    const mine = await setup("BOTH");
    const foreign = await setup("BOTH", { organizationId: ids.otherOrg, branchId: ids.otherBranch });

    const foreignStudent = await auth(request(app).post("/api/admin/payments")).send({
      studentId: String(foreign.student._id),
      classId: String(mine.danceClass._id),
      concept: "Cuota",
      amount: 8000,
      dueDate: "2026-09-30",
      ...perClass("2026-09-29")
    });
    const foreignClass = await auth(request(app).post("/api/admin/payments")).send({
      studentId: String(mine.student._id),
      classId: String(foreign.danceClass._id),
      concept: "Cuota",
      amount: 8000,
      dueDate: "2026-09-30",
      ...perClass("2026-09-29")
    });
    const foreignQuick = await auth(request(app).post("/api/admin/payments/quick-charge")).send({
      studentId: String(foreign.student._id),
      classId: String(foreign.danceClass._id),
      ...perClass("2026-09-29")
    });

    expect(foreignStudent.status).toBe(404);
    expect(foreignClass.status).toBe(404);
    expect(foreignQuick.status).toBe(404);
    expect(await PaymentModel.countDocuments({ studentId: { $in: [foreign.student._id, mine.student._id] } })).toBe(0);
  });

  it("a payment of another organization does not count as a duplicate", async () => {
    const ctx = await setup("PER_CLASS");
    await PaymentModel.create({
      organizationId: ids.otherOrg,
      branchId: ids.otherBranch,
      studentId: ctx.student._id,
      classId: ctx.danceClass._id,
      paymentType: "PER_CLASS",
      classDate: new Date("2026-09-29T12:00:00.000Z"),
      concept: "Ajeno",
      period: "2026-09",
      amount: 8000,
      dueDate: new Date("2026-09-29T12:00:00.000Z")
    });

    expect((await manual(ctx, perClass("2026-09-29"))).status).toBe(201);
  });
});

describe("POST /admin/payments/quick-charge: shared rules", () => {
  it("PER_CLASS charges the price of the class as PAID with a receipt", async () => {
    const ctx = await setup("PER_CLASS");

    const response = await quick(ctx, { paymentType: "PER_CLASS", classDate: "2026-09-29" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "PAID",
      amount: 8000,
      classDate: "2026-09-29T12:00:00.000Z",
      period: "2026-09"
    });
    expect(response.body.receiptNumber).toBeTruthy();
  });

  it("MONTHLY charges the monthly price", async () => {
    const ctx = await setup("MONTHLY");

    const response = await quick(ctx, { paymentType: "MONTHLY", period: "2026-09" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: "PAID", amount: 25000, period: "2026-09" });
  });

  it("keeps ignoring a stray period in PER_CLASS and a stray classDate in MONTHLY", async () => {
    const perClassCtx = await setup("PER_CLASS");
    const monthlyCtx = await setup("MONTHLY");

    const a = await quick(perClassCtx, { paymentType: "PER_CLASS", classDate: "2026-09-29", period: "2026-01" });
    const b = await quick(monthlyCtx, { paymentType: "MONTHLY", period: "2026-09", classDate: "2026-09-29" });

    expect(a.status).toBe(201);
    expect(a.body.period).toBe("2026-09");
    expect(b.status).toBe(201);
    expect(b.body.classDate).toBeUndefined();
  });

  it("rejects duplicates across endpoints (manual pending, then quick charge) for the same day", async () => {
    const ctx = await setup("PER_CLASS");

    expect((await manual(ctx, perClass("2026-09-29"))).status).toBe(201);
    const response = await quick(ctx, { paymentType: "PER_CLASS", classDate: "2026-09-29" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("PAYMENT_ALREADY_EXISTS");
  });

  it("rejects a disallowed type and missing enrollment", async () => {
    const wrongType = await setup("PER_CLASS");
    const notEnrolled = await setup("BOTH", { enrollment: "NONE" });

    const a = await quick(wrongType, { paymentType: "MONTHLY", period: "2026-09" });
    const b = await quick(notEnrolled, { paymentType: "PER_CLASS", classDate: "2026-09-29" });

    expect(a.status).toBe(422);
    expect(a.body.error).toBe("PAYMENT_TYPE_NOT_ALLOWED");
    expect(b.status).toBe(422);
    expect(b.body.error).toBe("PAYMENT_REQUIRES_ACTIVE_ENROLLMENT");
  });

  it("rejects a zero amount when the class has no price", async () => {
    const ctx = await setup("PER_CLASS");
    await DanceClassModel.updateOne({ _id: ctx.danceClass._id }, { pricePerClass: 0 });

    const response = await quick(ctx, { paymentType: "PER_CLASS", classDate: "2026-09-29" });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("INVALID_PAYMENT_AMOUNT");
  });
});
