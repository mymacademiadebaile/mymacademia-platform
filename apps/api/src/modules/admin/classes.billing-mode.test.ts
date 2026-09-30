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
import { PaymentModel } from "../payments/payment.model";
import { StudentModel } from "../students/student.model";

type Mode = "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE";
type Preference = "PER_CLASS" | "MONTHLY";

let mongod: MongoMemoryServer;
const app = createApp();
const ids = {} as Record<string, Types.ObjectId>;
let token: string;
let counter = 0;

const patchClass = (classId: Types.ObjectId, body: object) =>
  request(app)
    .patch(`/api/admin/classes/${classId}`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);

async function createClass(billingMode: Mode, organizationId = ids.org, branchId = ids.branch) {
  return DanceClassModel.create({
    organizationId,
    branchId,
    name: `Clase ${billingMode} ${++counter}`,
    professorIds: [new Types.ObjectId()],
    capacity: 20,
    billingMode,
    pricePerClass: 8000,
    monthlyPrice: 25000,
    schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]
  });
}

async function enroll(
  classId: Types.ObjectId,
  fields: { billingPreference?: string; status?: "ACTIVE" | "INACTIVE" } = {},
  organizationId = ids.org,
  branchId = ids.branch
) {
  const student = await StudentModel.create({
    organizationId,
    branchId,
    firstName: `Alumno${++counter}`,
    lastName: "Test"
  });
  const enrollment = await EnrollmentModel.create({
    organizationId,
    branchId,
    classId,
    studentId: student._id,
    status: fields.status ?? "ACTIVE"
  });

  // Written through the driver so legacy/invalid values and absent fields are possible.
  if (fields.billingPreference !== undefined) {
    await EnrollmentModel.collection.updateOne(
      { _id: enrollment._id },
      { $set: { billingPreference: fields.billingPreference } }
    );
  }

  return { student, enrollment };
}

const raw = (id: Types.ObjectId) => EnrollmentModel.collection.findOne({ _id: id });

async function expectPreference(id: Types.ObjectId, expected: string | undefined) {
  const stored = await raw(id);
  if (expected === undefined) {
    expect(stored).not.toHaveProperty("billingPreference");
  } else {
    expect(stored?.billingPreference).toBe(expected);
  }
}

/** Creates a class in `from` mode with ACTIVE enrollments, patches it to `to`, returns the enrollments. */
async function changeMode(from: Mode, to: Mode, preferences: Array<Preference | string | undefined>) {
  const danceClass = await createClass(from);
  const enrollments = [];
  for (const billingPreference of preferences) {
    enrollments.push((await enroll(danceClass._id, { billingPreference })).enrollment);
  }

  const response = await patchClass(danceClass._id, { billingMode: to });
  return { response, danceClass, enrollments };
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

describe("PATCH /admin/classes/:id: billingMode change reconciles ACTIVE enrollments", () => {
  it("BOTH -> PER_CLASS sets every ACTIVE enrollment to PER_CLASS", async () => {
    const { response, enrollments } = await changeMode("BOTH", "PER_CLASS", ["PER_CLASS", "MONTHLY"]);

    expect(response.status).toBe(200);
    for (const enrollment of enrollments) await expectPreference(enrollment._id, "PER_CLASS");
  });

  it("BOTH -> MONTHLY sets every ACTIVE enrollment to MONTHLY", async () => {
    const { response, enrollments } = await changeMode("BOTH", "MONTHLY", ["PER_CLASS", "MONTHLY"]);

    expect(response.status).toBe(200);
    for (const enrollment of enrollments) await expectPreference(enrollment._id, "MONTHLY");
  });

  it("BOTH -> FREE removes the field for real", async () => {
    const { response, enrollments } = await changeMode("BOTH", "FREE", ["PER_CLASS", "MONTHLY"]);

    expect(response.status).toBe(200);
    for (const enrollment of enrollments) await expectPreference(enrollment._id, undefined);
  });

  it.each([
    ["PER_CLASS", "PER_CLASS"],
    ["MONTHLY", "MONTHLY"]
  ] as const)("FREE -> %s gives ACTIVE enrollments without preference that mode", async (to, expected) => {
    const { response, enrollments } = await changeMode("FREE", to, [undefined]);

    expect(response.status).toBe(200);
    await expectPreference(enrollments[0]!._id, expected);
  });

  it("FREE -> BOTH gives ACTIVE enrollments without preference PER_CLASS", async () => {
    const { response, enrollments } = await changeMode("FREE", "BOTH", [undefined]);

    expect(response.status).toBe(200);
    await expectPreference(enrollments[0]!._id, "PER_CLASS");
  });

  it.each([
    ["PER_CLASS", "PER_CLASS"],
    ["MONTHLY", "MONTHLY"]
  ] as const)("%s -> BOTH keeps the existing %s preference", async (from, preference) => {
    const { response, enrollments } = await changeMode(from, "BOTH", [preference]);

    expect(response.status).toBe(200);
    await expectPreference(enrollments[0]!._id, preference);
  });

  it("-> BOTH keeps valid preferences and fixes missing or legacy ones", async () => {
    const { response, enrollments } = await changeMode("MONTHLY", "BOTH", [
      "PER_CLASS",
      "MONTHLY",
      undefined,
      "LEGACY_VALUE"
    ]);

    expect(response.status).toBe(200);
    await expectPreference(enrollments[0]!._id, "PER_CLASS");
    await expectPreference(enrollments[1]!._id, "MONTHLY");
    await expectPreference(enrollments[2]!._id, "PER_CLASS");
    await expectPreference(enrollments[3]!._id, "PER_CLASS");
  });

  it("does not touch INACTIVE enrollments", async () => {
    const danceClass = await createClass("BOTH");
    const active = await enroll(danceClass._id, { billingPreference: "MONTHLY" });
    const inactive = await enroll(danceClass._id, { billingPreference: "MONTHLY", status: "INACTIVE" });
    const inactiveLegacy = await enroll(danceClass._id, { status: "INACTIVE" });

    const response = await patchClass(danceClass._id, { billingMode: "PER_CLASS" });

    expect(response.status).toBe(200);
    await expectPreference(active.enrollment._id, "PER_CLASS");
    await expectPreference(inactive.enrollment._id, "MONTHLY");
    await expectPreference(inactiveLegacy.enrollment._id, undefined);
  });

  it("does not reconcile when billingMode is not part of the PATCH", async () => {
    const danceClass = await createClass("BOTH");
    const { enrollment } = await enroll(danceClass._id, { billingPreference: "MONTHLY" });

    const response = await patchClass(danceClass._id, { name: "Nuevo nombre", capacity: 25 });

    expect(response.status).toBe(200);
    await expectPreference(enrollment._id, "MONTHLY");
  });

  it("does not reconcile when billingMode is sent with the same value", async () => {
    const danceClass = await createClass("PER_CLASS");
    // A legacy inconsistency that only a real mode change is allowed to repair.
    const { enrollment } = await enroll(danceClass._id, { billingPreference: "MONTHLY" });

    const response = await patchClass(danceClass._id, { billingMode: "PER_CLASS" });

    expect(response.status).toBe(200);
    await expectPreference(enrollment._id, "MONTHLY");
  });

  it("keeps historical payments untouched", async () => {
    const danceClass = await createClass("BOTH");
    const { student, enrollment } = await enroll(danceClass._id, { billingPreference: "PER_CLASS" });
    const classDate = new Date("2026-09-10T12:00:00.000Z");
    const payment = await PaymentModel.create({
      organizationId: ids.org,
      branchId: ids.branch,
      studentId: student._id,
      classId: danceClass._id,
      paymentType: "PER_CLASS",
      classDate,
      concept: "Clase 2026-09-10",
      period: "2026-09",
      amount: 8000,
      dueDate: classDate,
      status: "PAID"
    });
    const before = await PaymentModel.collection.findOne({ _id: payment._id });

    const response = await patchClass(danceClass._id, { billingMode: "MONTHLY" });

    expect(response.status).toBe(200);
    await expectPreference(enrollment._id, "MONTHLY");
    const after = await PaymentModel.collection.findOne({ _id: payment._id });
    expect(after).toEqual(before);
    expect(after).toMatchObject({ paymentType: "PER_CLASS", amount: 8000, status: "PAID", classDate });
  });

  it("only reconciles enrollments of the same organization and class", async () => {
    const danceClass = await createClass("BOTH");
    const otherClass = await createClass("BOTH");
    const foreignClass = await createClass("BOTH", ids.otherOrg, ids.otherBranch);

    const mine = await enroll(danceClass._id, { billingPreference: "MONTHLY" });
    const sameOrgOtherClass = await enroll(otherClass._id, { billingPreference: "MONTHLY" });
    const foreignOwn = await enroll(
      foreignClass._id,
      { billingPreference: "MONTHLY" },
      ids.otherOrg,
      ids.otherBranch
    );
    // Adversarial: another organization's enrollment that points at this class id.
    const foreignPointingHere = await enroll(
      danceClass._id,
      { billingPreference: "MONTHLY" },
      ids.otherOrg,
      ids.otherBranch
    );

    const response = await patchClass(danceClass._id, { billingMode: "PER_CLASS" });

    expect(response.status).toBe(200);
    await expectPreference(mine.enrollment._id, "PER_CLASS");
    await expectPreference(sameOrgOtherClass.enrollment._id, "MONTHLY");
    await expectPreference(foreignOwn.enrollment._id, "MONTHLY");
    await expectPreference(foreignPointingHere.enrollment._id, "MONTHLY");
  });

  it("cannot reconcile a class of another organization", async () => {
    const foreignClass = await createClass("BOTH", ids.otherOrg, ids.otherBranch);
    const foreign = await enroll(
      foreignClass._id,
      { billingPreference: "MONTHLY" },
      ids.otherOrg,
      ids.otherBranch
    );

    const response = await patchClass(foreignClass._id, { billingMode: "PER_CLASS" });

    expect(response.status).toBe(404);
    expect((await DanceClassModel.findById(foreignClass._id))?.billingMode).toBe("BOTH");
    await expectPreference(foreign.enrollment._id, "MONTHLY");
  });

  it("does not reconcile when a previous validation fails", async () => {
    const danceClass = await createClass("BOTH");
    const { enrollment } = await enroll(danceClass._id, { billingPreference: "MONTHLY" });

    const response = await patchClass(danceClass._id, {
      billingMode: "PER_CLASS",
      professorIds: [String(new Types.ObjectId())]
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await DanceClassModel.findById(danceClass._id))?.billingMode).toBe("BOTH");
    await expectPreference(enrollment._id, "MONTHLY");
  });

  it("records the billing mode change and the reconciled count in the single CLASS_UPDATED event", async () => {
    const { response, danceClass } = await changeMode("BOTH", "MONTHLY", ["PER_CLASS", "MONTHLY"]);
    expect(response.status).toBe(200);

    const events = await AuditLogModel.find({ entityId: danceClass._id, action: "CLASS_UPDATED" });

    expect(events).toHaveLength(1);
    const metadata = events[0]!.metadata as {
      before: { billingMode: string };
      after: { billingMode: string };
      enrollmentsReconciled: number;
    };
    expect(metadata.before.billingMode).toBe("BOTH");
    expect(metadata.after.billingMode).toBe("MONTHLY");
    // Only the PER_CLASS enrollment actually changed; the MONTHLY one was already correct.
    expect(metadata.enrollmentsReconciled).toBe(1);
  });
});
