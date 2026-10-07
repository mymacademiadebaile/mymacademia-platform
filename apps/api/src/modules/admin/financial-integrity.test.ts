import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { academyNow, addDays } from "../../common/dates";
import { env } from "../../config/env";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
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
    name: `Clase ${++counter}`,
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
    billingPreference: "PER_CLASS"
  });
  return { danceClass, student };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PaymentModel.init();
  const org = await OrganizationModel.create({ name: "Test", slug: "integrity" });
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

describe("due dates in Argentina", () => {
  it("a charge due today is pending, not overdue", async () => {
    const ctx = await setup();
    const today = academyNow().date;
    const created = await auth(request(app).post("/api/admin/payments")).send({
      studentId: String(ctx.student._id),
      classId: String(ctx.danceClass._id),
      paymentType: "MONTHLY",
      period: today.slice(0, 7),
      concept: "Cuota",
      amount: 25000,
      dueDate: today
    });
    expect(created.status).toBe(201);
    expect(created.body.dueDate.slice(0, 10)).toBe(today);

    const list = await auth(request(app).get(`/api/admin/payments?classId=${ctx.danceClass._id}`));
    expect(list.body.items[0].effectiveStatus).toBe("PENDING");
  });

  it("rejects money received in the future", async () => {
    const ctx = await setup();
    const response = await auth(request(app).post("/api/admin/payments/quick-charge")).send({
      studentId: String(ctx.student._id),
      classId: String(ctx.danceClass._id),
      paymentType: "MONTHLY",
      period: academyNow().date.slice(0, 7),
      paidAt: addDays(academyNow().date, 2)
    });
    expect(response.status).toBe(422);
    expect(response.body.error).toBe("FUTURE_PAYMENT_DATE");
  });
});

describe("double charge guard", () => {
  it("does not charge a class of a month that is already paid monthly", async () => {
    const ctx = await setup("BOTH");
    const monthly = await auth(request(app).post("/api/admin/payments/quick-charge")).send({
      studentId: String(ctx.student._id),
      classId: String(ctx.danceClass._id),
      paymentType: "MONTHLY",
      period: "2026-09"
    });
    expect(monthly.status).toBe(201);

    const perClass = await auth(request(app).post("/api/admin/payments/quick-charge")).send({
      studentId: String(ctx.student._id),
      classId: String(ctx.danceClass._id),
      paymentType: "PER_CLASS",
      classDate: "2026-09-15"
    });
    expect(perClass.status).toBe(409);
    expect(perClass.body.error).toBe("COVERED_BY_MONTHLY");
  });
});

describe("student filters", () => {
  it("debtors of a class are only that class' students", async () => {
    const a = await setup();
    const b = await setup();
    for (const ctx of [a, b]) {
      await PaymentModel.create({
        organizationId: ids.org,
        branchId: ids.branch,
        studentId: ctx.student._id,
        classId: ctx.danceClass._id,
        paymentType: "MONTHLY",
        concept: "Cuota",
        period: "2026-01",
        amount: 1000,
        dueDate: new Date("2026-01-10T12:00:00.000Z")
      });
    }

    const response = await auth(
      request(app).get(`/api/admin/students?debt=true&classId=${a.danceClass._id}`)
    );
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: any) => item._id)).toEqual([String(a.student._id)]);
  });

  it("treats search text literally", async () => {
    const response = await auth(request(app).get("/api/admin/students?q=(%5B"));
    expect(response.status).toBe(200);
  });
});

describe("client errors", () => {
  it("answers malformed JSON with 400", async () => {
    const response = await auth(request(app).post("/api/admin/payments"))
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_JSON");
  });
});
