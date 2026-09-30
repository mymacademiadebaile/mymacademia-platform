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
import { StudentModel } from "../students/student.model";
import { TrialBookingModel } from "../trials/trial-booking.model";

type Mode = "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE";
type Preference = "PER_CLASS" | "MONTHLY";

let mongod: MongoMemoryServer;
const app = createApp();
const ids = {} as Record<string, Types.ObjectId>;
let token: string;
let counter = 0;

const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

async function createClass(billingMode: Mode) {
  return DanceClassModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    name: `Clase ${billingMode} ${++counter}`,
    professorIds: [new Types.ObjectId()],
    capacity: 20,
    billingMode,
    pricePerClass: 8000,
    monthlyPrice: 25000,
    schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]
  });
}

async function createStudent() {
  return StudentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    firstName: `Alumno${++counter}`,
    lastName: "Test"
  });
}

async function enrollRaw(
  classId: Types.ObjectId,
  studentId: Types.ObjectId,
  fields: Record<string, unknown> = {}
) {
  return EnrollmentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    classId,
    studentId,
    ...fields
  });
}

// Reads the raw document so an absent field is distinguishable from null/undefined.
const rawEnrollment = (id: Types.ObjectId | string) =>
  EnrollmentModel.collection.findOne({ _id: new Types.ObjectId(String(id)) });

const move = (enrollmentId: Types.ObjectId, targetClassId: Types.ObjectId, body: object = {}) =>
  auth(request(app).post(`/api/admin/enrollments/${enrollmentId}/move`)).send({
    targetClassId: String(targetClassId),
    ...body
  });

const enrollRequest = (classId: Types.ObjectId, studentId: Types.ObjectId, body: object = {}) =>
  auth(request(app).post("/api/admin/enrollments")).send({
    classId: String(classId),
    studentId: String(studentId),
    ...body
  });

/** Enrolls a fresh student in a source class and moves them to a target class. */
async function moveScenario(
  sourceMode: Mode,
  sourcePreference: Preference | undefined,
  targetMode: Mode,
  body: object = {}
) {
  const [source, target, student] = await Promise.all([
    createClass(sourceMode),
    createClass(targetMode),
    createStudent()
  ]);
  const enrollment = await enrollRaw(source._id, student._id, { billingPreference: sourcePreference });
  const response = await move(enrollment._id, target._id, body);
  return { response, enrollment };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

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

describe("POST /admin/enrollments/:id/move: billingPreference", () => {
  it.each([
    ["PER_CLASS", "PER_CLASS", "MONTHLY", "MONTHLY"],
    ["MONTHLY", "MONTHLY", "PER_CLASS", "PER_CLASS"],
    ["MONTHLY", "MONTHLY", "BOTH", "MONTHLY"],
    ["PER_CLASS", "PER_CLASS", "BOTH", "PER_CLASS"]
  ] as const)(
    "%s (%s) -> %s ends as %s",
    async (sourceMode, sourcePreference, targetMode, expected) => {
      const { response } = await moveScenario(sourceMode, sourcePreference, targetMode);

      expect(response.status).toBe(200);
      expect(response.body.billingPreference).toBe(expected);
      expect((await rawEnrollment(response.body._id))?.billingPreference).toBe(expected);
    }
  );

  it("FREE -> BOTH without preference defaults to PER_CLASS", async () => {
    const { response } = await moveScenario("FREE", undefined, "BOTH");

    expect(response.status).toBe(200);
    expect(response.body.billingPreference).toBe("PER_CLASS");
  });

  it("BOTH -> BOTH honours an explicit MONTHLY", async () => {
    const { response } = await moveScenario("BOTH", "PER_CLASS", "BOTH", {
      billingPreference: "MONTHLY"
    });

    expect(response.status).toBe(200);
    expect(response.body.billingPreference).toBe("MONTHLY");
  });

  it("moving to a FREE class leaves the field absent", async () => {
    const { response } = await moveScenario("MONTHLY", "MONTHLY", "FREE");

    expect(response.status).toBe(200);
    const stored = await rawEnrollment(response.body._id);
    expect(stored).not.toBeNull();
    expect(stored).not.toHaveProperty("billingPreference");
  });

  it("rejects an explicit preference the target class does not allow, without moving", async () => {
    const { response, enrollment } = await moveScenario("BOTH", "PER_CLASS", "PER_CLASS", {
      billingPreference: "MONTHLY"
    });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("INVALID_BILLING_PREFERENCE");
    expect((await EnrollmentModel.findById(enrollment._id))?.status).toBe("ACTIVE");
  });

  it("rejects preferences outside PER_CLASS/MONTHLY", async () => {
    const source = await createClass("BOTH");
    const target = await createClass("BOTH");
    const student = await createStudent();
    const enrollment = await enrollRaw(source._id, student._id, { billingPreference: "PER_CLASS" });

    for (const value of ["FREE", "BOTH", "whatever"]) {
      const response = await move(enrollment._id, target._id, { billingPreference: value });
      expect(response.status).toBe(400);
    }
  });

  it("re-resolves a reactivated INACTIVE enrollment against the target class", async () => {
    const [source, target, student] = await Promise.all([
      createClass("PER_CLASS"),
      createClass("PER_CLASS"),
      createStudent()
    ]);
    const enrollment = await enrollRaw(source._id, student._id, { billingPreference: "PER_CLASS" });
    const stale = await enrollRaw(target._id, student._id, {
      status: "INACTIVE",
      billingPreference: "MONTHLY",
      endedAt: new Date("2024-01-01")
    });

    const response = await move(enrollment._id, target._id);

    expect(response.status).toBe(200);
    expect(response.body._id).toBe(String(stale._id));
    const stored = await rawEnrollment(stale._id);
    expect(stored?.status).toBe("ACTIVE");
    expect(stored?.billingPreference).toBe("PER_CLASS");
    expect(stored).not.toHaveProperty("endedAt");
  });

  it("drops the stale preference when the reactivated enrollment's class is now FREE", async () => {
    const [source, target, student] = await Promise.all([
      createClass("MONTHLY"),
      createClass("FREE"),
      createStudent()
    ]);
    const enrollment = await enrollRaw(source._id, student._id, { billingPreference: "MONTHLY" });
    const stale = await enrollRaw(target._id, student._id, {
      status: "INACTIVE",
      billingPreference: "MONTHLY",
      endedAt: new Date("2024-01-01")
    });

    const response = await move(enrollment._id, target._id);

    expect(response.status).toBe(200);
    const stored = await rawEnrollment(stale._id);
    expect(stored).not.toHaveProperty("billingPreference");
    expect(stored).not.toHaveProperty("endedAt");
  });
});

describe("POST /admin/enrollments: create and reactivate", () => {
  it.each([
    ["PER_CLASS", undefined, "PER_CLASS"],
    ["MONTHLY", undefined, "MONTHLY"],
    ["BOTH", undefined, "PER_CLASS"],
    ["BOTH", "MONTHLY", "MONTHLY"],
    ["FREE", undefined, undefined]
  ] as const)("new enrollment in %s requesting %s ends as %s", async (mode, requested, expected) => {
    const [danceClass, student] = await Promise.all([createClass(mode), createStudent()]);

    const response = await enrollRequest(
      danceClass._id,
      student._id,
      requested ? { billingPreference: requested } : {}
    );

    expect(response.status).toBe(201);
    expect(response.body.billingPreference).toBe(expected);
  });

  it("rejects an incompatible explicit preference", async () => {
    const [danceClass, student] = await Promise.all([createClass("MONTHLY"), createStudent()]);

    const response = await enrollRequest(danceClass._id, student._id, { billingPreference: "PER_CLASS" });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("INVALID_BILLING_PREFERENCE");
  });

  it("reactivation clears endedAt and re-resolves the preference", async () => {
    const [danceClass, student] = await Promise.all([createClass("PER_CLASS"), createStudent()]);
    const stale = await enrollRaw(danceClass._id, student._id, {
      status: "INACTIVE",
      billingPreference: "MONTHLY",
      endedAt: new Date("2024-01-01")
    });

    const response = await enrollRequest(danceClass._id, student._id);

    expect(response.status).toBe(201);
    const stored = await rawEnrollment(stale._id);
    expect(stored?.status).toBe("ACTIVE");
    expect(stored?.billingPreference).toBe("PER_CLASS");
    expect(stored).not.toHaveProperty("endedAt");
  });

  it("reactivation in a BOTH class keeps the previous valid preference if none is requested", async () => {
    const [danceClass, student] = await Promise.all([createClass("BOTH"), createStudent()]);
    await enrollRaw(danceClass._id, student._id, {
      status: "INACTIVE",
      billingPreference: "MONTHLY",
      endedAt: new Date("2024-01-01")
    });

    const response = await enrollRequest(danceClass._id, student._id);

    expect(response.status).toBe(201);
    expect(response.body.billingPreference).toBe("MONTHLY");
  });

  it("ACTIVE -> INACTIVE (endedAt set) -> reactivated has no endedAt", async () => {
    const [danceClass, student] = await Promise.all([createClass("MONTHLY"), createStudent()]);
    const created = await enrollRequest(danceClass._id, student._id);
    const enrollmentId = created.body._id;

    const ended = await auth(request(app).delete(`/api/admin/enrollments/${enrollmentId}`));
    expect(ended.status).toBe(204);
    expect(await rawEnrollment(enrollmentId)).toHaveProperty("endedAt");

    const again = await enrollRequest(danceClass._id, student._id);

    expect(again.status).toBe(201);
    const stored = await rawEnrollment(enrollmentId);
    expect(stored?.status).toBe("ACTIVE");
    expect(stored).not.toHaveProperty("endedAt");
  });
});

describe("POST /admin/trials/:id/convert: billingPreference", () => {
  async function trialFor(mode: Mode) {
    const [danceClass, student] = await Promise.all([createClass(mode), createStudent()]);
    const trial = await TrialBookingModel.create({
      organizationId: ids.org,
      branchId: ids.branch,
      classId: danceClass._id,
      studentId: student._id,
      scheduledFor: new Date("2099-03-10T12:00:00.000Z"),
      status: "COMPLETED"
    });
    return { danceClass, student, trial };
  }

  const convert = (trialId: Types.ObjectId, body?: object) => {
    const req = auth(request(app).post(`/api/admin/trials/${trialId}/convert`));
    return body ? req.send(body) : req;
  };

  it.each([
    ["PER_CLASS", undefined, "PER_CLASS"],
    ["MONTHLY", undefined, "MONTHLY"],
    ["BOTH", undefined, "PER_CLASS"],
    ["BOTH", "MONTHLY", "MONTHLY"],
    ["FREE", undefined, undefined]
  ] as const)("class %s requesting %s ends as %s", async (mode, requested, expected) => {
    const { trial } = await trialFor(mode);

    const response = await convert(
      trial._id,
      requested ? { billingPreference: requested } : undefined
    );

    expect(response.status).toBe(200);
    expect(response.body.enrollment.billingPreference).toBe(expected);
    const stored = await rawEnrollment(response.body.enrollment._id);
    if (expected) expect(stored?.billingPreference).toBe(expected);
    else expect(stored).not.toHaveProperty("billingPreference");
  });

  it("rejects an incompatible explicit preference and keeps the trial convertible", async () => {
    const { trial } = await trialFor("MONTHLY");

    const response = await convert(trial._id, { billingPreference: "PER_CLASS" });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("INVALID_BILLING_PREFERENCE");
    expect((await TrialBookingModel.findById(trial._id))?.status).toBe("COMPLETED");
  });

  it("rejects preferences outside PER_CLASS/MONTHLY", async () => {
    const { trial } = await trialFor("BOTH");

    expect((await convert(trial._id, { billingPreference: "FREE" })).status).toBe(400);
  });

  it("reactivates an INACTIVE enrollment applying the same rules", async () => {
    const { danceClass, student, trial } = await trialFor("PER_CLASS");
    const stale = await enrollRaw(danceClass._id, student._id, {
      status: "INACTIVE",
      billingPreference: "MONTHLY",
      endedAt: new Date("2024-01-01")
    });

    const response = await convert(trial._id);

    expect(response.status).toBe(200);
    expect(response.body.enrollment._id).toBe(String(stale._id));
    const stored = await rawEnrollment(stale._id);
    expect(stored?.status).toBe("ACTIVE");
    expect(stored?.billingPreference).toBe("PER_CLASS");
    expect(stored).not.toHaveProperty("endedAt");
  });
});
