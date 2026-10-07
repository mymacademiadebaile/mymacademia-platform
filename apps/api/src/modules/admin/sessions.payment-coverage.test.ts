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
import { ClassSessionModel } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";

type Mode = "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE";
type PaymentKind = "PER_CLASS" | "MONTHLY";
type PaymentStatus = "PAID" | "PENDING" | "CANCELLED";

const SESSION_DATE = "2026-09-05";

let mongod: MongoMemoryServer;
const app = createApp();
const ids = {} as Record<string, Types.ObjectId>;
let token: string;
let counter = 0;

const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

async function setup(mode: Mode, preference?: PaymentKind, sessionDate = SESSION_DATE) {
  const danceClass = await DanceClassModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    name: `Clase ${mode} ${++counter}`,
    professorIds: [new Types.ObjectId()],
    capacity: 20,
    billingMode: mode,
    pricePerClass: 8000,
    monthlyPrice: 25000,
    schedules: [{ day: "SATURDAY", startTime: "18:00", endTime: "19:00" }]
  });
  const student = await StudentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    firstName: `Alumno${++counter}`,
    lastName: "Test"
  });
  const enrollment = await EnrollmentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    classId: danceClass._id,
    studentId: student._id,
    billingPreference: preference,
    // Enrolled before the sessions under test: rosters only include valid enrollments.
    enrolledAt: new Date("2026-01-01T12:00:00.000Z")
  });
  const session = await ClassSessionModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    classId: danceClass._id,
    sessionDate,
    startTime: "18:00",
    endTime: "19:00"
  });

  return { danceClass, student, enrollment, session };
}

function addPayment(
  ctx: { danceClass: { _id: Types.ObjectId }; student: { _id: Types.ObjectId } },
  type: PaymentKind,
  when: string,
  status: PaymentStatus,
  extra: Record<string, unknown> = {}
) {
  const classDate = new Date(`${when}T12:00:00.000Z`);
  return PaymentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    studentId: ctx.student._id,
    classId: ctx.danceClass._id,
    paymentType: type,
    classDate: type === "PER_CLASS" ? classDate : undefined,
    concept: type === "PER_CLASS" ? `Clase ${when}` : `Mensual ${when.slice(0, 7)}`,
    period: when.slice(0, 7),
    amount: type === "PER_CLASS" ? 8000 : 25000,
    dueDate: new Date("2099-01-01T12:00:00.000Z"),
    status,
    ...extra
  });
}

async function participantOf(ctx: { session: { _id: Types.ObjectId }; student: { _id: Types.ObjectId } }) {
  const response = await auth(request(app).get(`/api/admin/sessions/${ctx.session._id}`));
  expect(response.status).toBe(200);
  const participant = response.body.participants.find(
    (item: { studentId: string }) => item.studentId === String(ctx.student._id)
  );
  expect(participant).toBeDefined();
  return participant;
}

const changePreference = (enrollmentId: Types.ObjectId, billingPreference: PaymentKind) =>
  auth(request(app).patch(`/api/admin/enrollments/${enrollmentId}/billing-preference`)).send({
    billingPreference
  });

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

describe("GET /admin/sessions/:id: historical payment coverage", () => {
  it("PER_CLASS payment keeps covering the session after switching to MONTHLY", async () => {
    const ctx = await setup("BOTH", "PER_CLASS");
    const paid = await addPayment(ctx, "PER_CLASS", SESSION_DATE, "PAID");

    expect((await changePreference(ctx.enrollment._id, "MONTHLY")).status).toBe(200);
    const participant = await participantOf(ctx);

    // The change applies from today on: a past session keeps the mode it had on its day.
    expect(participant.billingType).toBe("PER_CLASS");
    expect(participant.payment).toMatchObject({
      status: "PAID",
      paymentType: "PER_CLASS",
      paymentId: String(paid._id),
      amount: 8000
    });
  });

  it("MONTHLY payment keeps covering the month after switching to PER_CLASS", async () => {
    const ctx = await setup("BOTH", "MONTHLY");
    const paid = await addPayment(ctx, "MONTHLY", SESSION_DATE, "PAID");

    expect((await changePreference(ctx.enrollment._id, "PER_CLASS")).status).toBe(200);
    const participant = await participantOf(ctx);

    // The change applies from today on: a past session keeps the mode it had on its day.
    expect(participant.billingType).toBe("MONTHLY");
    expect(participant.payment).toMatchObject({
      status: "PAID",
      paymentType: "MONTHLY",
      paymentId: String(paid._id),
      amount: 25000
    });
  });

  it("PER_CLASS PAID wins over MONTHLY PENDING, and reports the PAID payment", async () => {
    const ctx = await setup("BOTH", "MONTHLY");
    const paid = await addPayment(ctx, "PER_CLASS", SESSION_DATE, "PAID");
    await addPayment(ctx, "MONTHLY", SESSION_DATE, "PENDING");

    const participant = await participantOf(ctx);

    expect(participant.payment).toMatchObject({
      status: "PAID",
      paymentType: "PER_CLASS",
      paymentId: String(paid._id),
      amount: 8000
    });
  });

  it("MONTHLY PAID wins over PER_CLASS PENDING", async () => {
    const ctx = await setup("BOTH", "PER_CLASS");
    await addPayment(ctx, "PER_CLASS", SESSION_DATE, "PENDING");
    const paid = await addPayment(ctx, "MONTHLY", SESSION_DATE, "PAID");

    const participant = await participantOf(ctx);

    expect(participant.payment).toMatchObject({
      status: "PAID",
      paymentType: "MONTHLY",
      paymentId: String(paid._id)
    });
  });

  it("a CANCELLED payment does not cover the session", async () => {
    const ctx = await setup("BOTH", "PER_CLASS");
    await addPayment(ctx, "PER_CLASS", SESSION_DATE, "CANCELLED");

    const participant = await participantOf(ctx);

    expect(participant.payment.status).toBe("NONE");
    expect(participant.payment.paymentType).toBeNull();
    expect(participant.payment.paymentId).toBeUndefined();
    expect(participant.payment.amount).toBe(8000);
  });

  it("a CANCELLED payment next to a valid one of the other type resolves to the valid one", async () => {
    const ctx = await setup("BOTH", "PER_CLASS");
    await addPayment(ctx, "PER_CLASS", SESSION_DATE, "CANCELLED");
    await addPayment(ctx, "MONTHLY", SESSION_DATE, "PAID");

    const participant = await participantOf(ctx);

    expect(participant.payment).toMatchObject({ status: "PAID", paymentType: "MONTHLY" });
  });

  it("orders OVERDUE above PENDING, and PENDING above NONE", async () => {
    const overdue = await setup("BOTH", "MONTHLY");
    await addPayment(overdue, "PER_CLASS", SESSION_DATE, "PENDING", {
      dueDate: new Date("2020-01-01T12:00:00.000Z")
    });
    await addPayment(overdue, "MONTHLY", SESSION_DATE, "PENDING");
    expect((await participantOf(overdue)).payment).toMatchObject({
      status: "OVERDUE",
      paymentType: "PER_CLASS"
    });

    const pending = await setup("BOTH", "MONTHLY");
    await addPayment(pending, "MONTHLY", SESSION_DATE, "PENDING");
    expect((await participantOf(pending)).payment).toMatchObject({
      status: "PENDING",
      paymentType: "MONTHLY"
    });

    const none = await setup("BOTH", "MONTHLY");
    const participant = await participantOf(none);
    expect(participant.billingType).toBe("MONTHLY");
    expect(participant.payment).toMatchObject({ status: "NONE", paymentType: null, amount: 25000 });
  });

  it("FREE classes stay FREE even with legacy payments", async () => {
    const ctx = await setup("FREE");
    await addPayment(ctx, "PER_CLASS", SESSION_DATE, "PAID");
    await addPayment(ctx, "MONTHLY", SESSION_DATE, "PENDING");

    const participant = await participantOf(ctx);

    expect(participant.billingType).toBe("FREE");
    expect(participant.payment.status).toBe("FREE");
    expect(participant.payment.paymentType).toBeNull();
    expect(participant.payment.paymentId).toBeUndefined();
  });

  it("a MONTHLY payment of September does not cover an October session", async () => {
    const ctx = await setup("MONTHLY", "MONTHLY", "2026-10-05");
    await addPayment(ctx, "MONTHLY", "2026-09-05", "PAID");

    const participant = await participantOf(ctx);

    expect(participant.payment).toMatchObject({ status: "NONE", paymentType: null });
  });

  it("a PER_CLASS payment of another day does not cover the session", async () => {
    const ctx = await setup("PER_CLASS", "PER_CLASS");
    await addPayment(ctx, "PER_CLASS", "2026-09-04", "PAID");

    const participant = await participantOf(ctx);

    expect(participant.payment).toMatchObject({ status: "NONE", paymentType: null });
  });

  it("a PER_CLASS payment covers the day whatever time it has inside that day", async () => {
    const ctx = await setup("PER_CLASS", "PER_CLASS");
    await addPayment(ctx, "PER_CLASS", SESSION_DATE, "PAID", {
      classDate: new Date(`${SESSION_DATE}T23:30:00.000Z`)
    });

    expect((await participantOf(ctx)).payment).toMatchObject({ status: "PAID", paymentType: "PER_CLASS" });
  });

  it.each([
    ["PER_CLASS", "PER_CLASS", "PER_CLASS", 8000],
    ["MONTHLY", "MONTHLY", "MONTHLY", 25000]
  ] as const)("regression: plain %s class with a %s payment", async (mode, preference, type, amount) => {
    const ctx = await setup(mode, preference);
    await addPayment(ctx, type, SESSION_DATE, "PAID");

    const participant = await participantOf(ctx);

    expect(participant.billingType).toBe(mode);
    expect(participant.payment).toMatchObject({ status: "PAID", paymentType: type, amount });
  });

  it("does not modify payments when reading the session", async () => {
    const ctx = await setup("BOTH", "MONTHLY");
    const perClass = await addPayment(ctx, "PER_CLASS", SESSION_DATE, "PAID");
    const monthly = await addPayment(ctx, "MONTHLY", SESSION_DATE, "PENDING");
    const read = () => PaymentModel.collection.find({ studentId: ctx.student._id }).sort({ _id: 1 }).toArray();
    const before = await read();

    await participantOf(ctx);
    await participantOf(ctx);

    expect(await read()).toEqual(before);
    expect(before.map((item) => String(item._id))).toEqual(
      [perClass._id, monthly._id].map(String).sort()
    );
  });

  it("ignores payments of another organization with the same student and class ids", async () => {
    const ctx = await setup("PER_CLASS", "PER_CLASS");
    await addPayment(ctx, "PER_CLASS", SESSION_DATE, "PAID", {
      organizationId: ids.otherOrg,
      branchId: ids.otherBranch
    });

    const participant = await participantOf(ctx);

    expect(participant.payment).toMatchObject({ status: "NONE", paymentType: null });
    expect(participant.payment.paymentId).toBeUndefined();
  });
});
