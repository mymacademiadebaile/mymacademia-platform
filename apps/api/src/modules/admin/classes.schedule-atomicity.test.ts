import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { AuditLogModel } from "../audit/audit-log.model";
import { UserModel } from "../auth/user.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ProfessorModel } from "../professors/professor.model";
import { ClassScheduleModel } from "../scheduling/class-schedule.model";
import { generateSessions } from "../scheduling/session-generator";
import { ClassSessionModel, slotKeyOf } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";

const NOW = "2026-10-07T15:00:00.000Z";
const app = createApp();
let database: { stop: () => Promise<void> };
let counter = 0;

type Context = {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  professorId: Types.ObjectId;
  token: string;
};

type Slot = { day: "MONDAY" | "TUESDAY" | "WEDNESDAY"; startTime: string; endTime: string };

const at = (iso: string) => vi.setSystemTime(new Date(iso));
const admin = (token: string, test: request.Test) => test.set("Authorization", `Bearer ${token}`);

async function context(): Promise<Context> {
  const suffix = ++counter;
  const organization = await OrganizationModel.create({ name: `SCH ${suffix}`, slug: `sch-${suffix}` });
  const branch = await BranchModel.create({ organizationId: organization._id, name: `Sede ${suffix}` });
  const user = await UserModel.create({
    organizationId: organization._id,
    email: `admin-${suffix}@sch.test`,
    passwordHash: "not-used",
    firstName: "Admin",
    lastName: "SCH",
    role: "ADMIN",
    branchIds: [branch._id]
  });
  const professorUser = await UserModel.create({
    organizationId: organization._id,
    email: `profesor-${suffix}@sch.test`,
    passwordHash: "not-used",
    firstName: "Profe",
    lastName: "SCH",
    role: "PROFESSOR",
    branchIds: [branch._id]
  });
  const professor = await ProfessorModel.create({ organizationId: organization._id, userId: professorUser._id, displayName: `Profe ${suffix}` });
  return {
    organizationId: organization._id,
    branchId: branch._id,
    professorId: professor._id,
    token: jwt.sign({ sub: String(user._id), organizationId: String(organization._id), role: "ADMIN" }, env.JWT_ACCESS_SECRET)
  };
}

async function danceClass(context: Context, slots: Slot[], name = `Clase ${++counter}`) {
  const created = await DanceClassModel.create({
    organizationId: context.organizationId,
    branchId: context.branchId,
    name,
    professorIds: [context.professorId],
    capacity: 20,
    billingMode: "BOTH",
    pricePerClass: 8000,
    monthlyPrice: 30000,
    schedules: slots
  });
  await ClassScheduleModel.insertMany(
    slots.map((slot) => ({
      organizationId: context.organizationId,
      branchId: context.branchId,
      classId: created._id,
      seriesId: new Types.ObjectId(),
      ...slot,
      validFrom: "2026-09-01",
      professorIds: []
    }))
  );
  return created;
}

async function scheduleSnapshot(classId: Types.ObjectId) {
  return (await ClassScheduleModel.find({ classId }).sort({ day: 1, startTime: 1, validFrom: 1 }).lean()).map((item) => ({
    id: String(item._id),
    seriesId: String(item.seriesId),
    day: item.day,
    startTime: item.startTime,
    endTime: item.endTime,
    validFrom: item.validFrom,
    validTo: item.validTo ?? null
  }));
}

async function sessionSnapshot(classId: Types.ObjectId) {
  return (await ClassSessionModel.find({ classId }).sort({ sessionDate: 1, startTime: 1 }).lean()).map((item) => ({
    id: String(item._id),
    date: item.sessionDate,
    startTime: item.startTime,
    endTime: item.endTime,
    status: item.status,
    slotKey: item.slotKey ?? null,
    scheduleId: item.scheduleId ? String(item.scheduleId) : null
  }));
}

beforeAll(async () => {
  database = await startReplicaSet();
  vi.useFakeTimers({ toFake: ["Date"] });
  at(NOW);
}, 120_000);

beforeEach(() => at(NOW));

afterAll(async () => {
  vi.useRealTimers();
  await database.stop();
});

describe("PATCH /admin/classes/:id schedule atomicity", () => {
  it("prevalidates every change and persists nothing when the second requested slot conflicts", async () => {
    const ctx = await context();
    const target = await danceClass(ctx, [
      { day: "MONDAY", startTime: "18:00", endTime: "19:00" },
      { day: "WEDNESDAY", startTime: "19:00", endTime: "20:00" }
    ]);
    // This group intentionally has an empty legacy cache: the test proves that canonical rules,
    // not only DanceClass.schedules, participate in the complete prevalidation.
    const occupied = await danceClass(ctx, [{ day: "WEDNESDAY", startTime: "20:00", endTime: "21:00" }]);
    await DanceClassModel.updateOne({ _id: occupied._id }, { $set: { schedules: [] } });
    await generateSessions(String(ctx.organizationId), { from: "2026-10-07", to: "2026-10-21", classIds: [target._id] });

    const beforeClass = await DanceClassModel.findById(target._id).lean();
    const beforeRules = await scheduleSnapshot(target._id);
    const beforeSessions = await sessionSnapshot(target._id);
    const beforeAudits = await AuditLogModel.countDocuments({ entityId: target._id });

    const response = await admin(
      ctx.token,
      request(app)
        .patch(`/api/admin/classes/${target._id}`)
        .send({
          name: "No debe persistir",
          schedules: [
            { day: "MONDAY", startTime: "17:00", endTime: "18:00" },
            { day: "WEDNESDAY", startTime: "20:00", endTime: "21:00" }
          ]
        })
    );

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("PROFESSOR_CONFLICT");
    expect(await DanceClassModel.findById(target._id).lean()).toMatchObject({
      name: beforeClass!.name,
      schedules: beforeClass!.schedules
    });
    expect(await scheduleSnapshot(target._id)).toEqual(beforeRules);
    expect(await sessionSnapshot(target._id)).toEqual(beforeSessions);
    expect(await AuditLogModel.countDocuments({ entityId: target._id })).toBe(beforeAudits);
  });

  it("rolls back class, rules, sessions, enrollments and audit when the second reconciliation fails", async () => {
    const ctx = await context();
    const target = await danceClass(ctx, [
      { day: "MONDAY", startTime: "18:00", endTime: "19:00" },
      { day: "WEDNESDAY", startTime: "19:00", endTime: "20:00" }
    ]);
    await generateSessions(String(ctx.organizationId), { from: "2026-10-07", to: "2026-10-21", classIds: [target._id] });

    // The first change (Monday) is valid. The second one collides with a manually kept session,
    // so reconcileFutureSessions throws after the first series has already been processed.
    await ClassSessionModel.create({
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      classId: target._id,
      sessionDate: "2026-10-14",
      startTime: "20:00",
      endTime: "21:00",
      status: "SCHEDULED",
      origin: "EXTRA",
      manualOverride: true,
      slotKey: slotKeyOf({ classId: target._id, sessionDate: "2026-10-14", startTime: "20:00" }),
      professorIds: [],
      substitute: false,
      statusHistory: [],
      lockVersion: 0
    });
    const student = await StudentModel.create({ organizationId: ctx.organizationId, branchId: ctx.branchId, firstName: "Alumno", lastName: "SCH" });
    const enrollment = await EnrollmentModel.create({
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      classId: target._id,
      studentId: student._id,
      status: "ACTIVE",
      billingPreference: "PER_CLASS",
      billingChanges: [{ effectiveDate: "2026-09-01", mode: "PER_CLASS" }],
      periods: [{ startDate: "2026-09-01" }]
    });

    const beforeClass = await DanceClassModel.findById(target._id).lean();
    const beforeRules = await scheduleSnapshot(target._id);
    const beforeSessions = await sessionSnapshot(target._id);
    const beforeAudits = await AuditLogModel.countDocuments({ entityId: target._id });

    const response = await admin(
      ctx.token,
      request(app)
        .patch(`/api/admin/classes/${target._id}`)
        .send({
          name: "No debe persistir",
          billingMode: "MONTHLY",
          schedules: [
            { day: "MONDAY", startTime: "17:00", endTime: "18:00" },
            { day: "WEDNESDAY", startTime: "20:00", endTime: "21:00" }
          ]
        })
    );

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("SESSION_SLOT_TAKEN");
    expect(await DanceClassModel.findById(target._id).lean()).toMatchObject({
      name: beforeClass!.name,
      billingMode: "BOTH",
      schedules: beforeClass!.schedules
    });
    expect(await scheduleSnapshot(target._id)).toEqual(beforeRules);
    expect(await sessionSnapshot(target._id)).toEqual(beforeSessions);
    expect((await EnrollmentModel.findById(enrollment._id).lean())?.billingPreference).toBe("PER_CLASS");
    expect(await AuditLogModel.countDocuments({ entityId: target._id })).toBe(beforeAudits);
  });

  it("serializes concurrent schedule edits so that only one conflicting target is committed", async () => {
    const ctx = await context();
    const first = await danceClass(ctx, [{ day: "MONDAY", startTime: "18:00", endTime: "19:00" }]);
    const second = await danceClass(ctx, [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]);
    const body = { schedules: [{ day: "WEDNESDAY", startTime: "17:00", endTime: "18:00" }] };

    const responses = await Promise.all([
      admin(ctx.token, request(app).patch(`/api/admin/classes/${first._id}`).send(body)),
      admin(ctx.token, request(app).patch(`/api/admin/classes/${second._id}`).send(body))
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error).toBe("PROFESSOR_CONFLICT");
    const committed = await ClassScheduleModel.countDocuments({
      organizationId: ctx.organizationId,
      classId: { $in: [first._id, second._id] },
      day: "WEDNESDAY",
      startTime: "17:00",
      validTo: { $exists: false }
    });
    expect(committed).toBe(1);
  });

  it("is repeatable: retrying the same weekly payload does not duplicate rules or sessions", async () => {
    const ctx = await context();
    const target = await danceClass(ctx, [{ day: "MONDAY", startTime: "18:00", endTime: "19:00" }]);
    const body = { schedules: [{ day: "MONDAY", startTime: "17:00", endTime: "18:00" }] };

    const first = await admin(ctx.token, request(app).patch(`/api/admin/classes/${target._id}`).send(body));
    expect(first.status).toBe(200);
    const rulesAfterFirst = await scheduleSnapshot(target._id);
    const sessionsAfterFirst = await sessionSnapshot(target._id);

    const second = await admin(ctx.token, request(app).patch(`/api/admin/classes/${target._id}`).send(body));
    expect(second.status).toBe(200);
    expect(await scheduleSnapshot(target._id)).toEqual(rulesAfterFirst);
    expect(await sessionSnapshot(target._id)).toEqual(sessionsAfterFirst);
  });
});
