import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { academyInstant, dateRange, weekDayFor } from "../../common/dates";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { UserModel } from "../auth/user.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import { ProfessorModel } from "../professors/professor.model";
import { ClassScheduleModel } from "../scheduling/class-schedule.model";
import { changeScheduleSeries, createScheduleSeries } from "../scheduling/schedule-commands";
import { generateSessions } from "../scheduling/session-generator";
import {
  changeSessionStatus,
  rescheduleSession,
  updateSingleSession
} from "../scheduling/session-commands";
import { ClassSessionModel } from "../sessions/class-session.model";
import { loadRoster } from "../sessions/roster-service";
import { setSessionAttendance } from "../sessions/session-service";
import { StudentModel } from "../students/student.model";
import { studentBalances } from "./balance-service";
import { ensureClassCharge, generateMonthlyCharges } from "./charge-service";
import { ChargeModel } from "./charge.model";
import { refundCollection, registerCollection } from "./collection-service";
import { sessionCoverage } from "./coverage-service";
import { runSchedulingBillingMigration } from "./migration";

/**
 * End-to-end flows of the scheduling and billing redesign. They run on an in-memory replica
 * set (real transactions) with a frozen clock: Wednesday 2026-10-07, 12:00 in Argentina.
 * Nothing depends on the day the suite runs.
 */

const NOW = "2026-10-07T15:00:00.000Z";
const app = createApp();
let database: { stop: () => Promise<void> };
let adminToken: string;
let professorToken: string;
let counter = 0;
const ids = {} as Record<string, Types.ObjectId>;

const actor = () => ({ organizationId: String(ids.org), userId: String(ids.admin) });
const admin = (req: request.Test) => req.set("Authorization", `Bearer ${adminToken}`);
const at = (iso: string) => vi.setSystemTime(new Date(iso));

async function professor(name: string) {
  const user = await UserModel.create({
    organizationId: ids.org,
    email: `${name.toLowerCase()}${++counter}@example.com`,
    passwordHash: "x",
    firstName: name,
    lastName: "Profe",
    role: "PROFESSOR",
    branchIds: [ids.branch]
  });
  return ProfessorModel.create({ organizationId: ids.org, userId: user._id, displayName: name });
}

/** A group whose recurring schedule starts on `validFrom` (created through the rule service). */
async function group(options: {
  name?: string;
  billingMode?: "MONTHLY" | "PER_CLASS" | "BOTH" | "FREE";
  slots: Array<{ day: string; startTime: string; endTime: string; spaceId?: string }>;
  validFrom?: string;
  capacity?: number;
  professorId?: Types.ObjectId;
}) {
  const danceClass = await DanceClassModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    name: options.name ?? `Grupo ${++counter}`,
    professorIds: [options.professorId ?? ids.professorA],
    capacity: options.capacity ?? 20,
    billingMode: options.billingMode ?? "BOTH",
    pricePerClass: 8000,
    monthlyPrice: 30000,
    schedules: []
  });
  for (const slot of options.slots) {
    await ClassScheduleModel.create({
      organizationId: ids.org,
      branchId: ids.branch,
      classId: danceClass._id,
      seriesId: new Types.ObjectId(),
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      validFrom: options.validFrom ?? "2026-09-01",
      spaceId: slot.spaceId ? new Types.ObjectId(slot.spaceId) : undefined,
      professorIds: []
    });
  }
  return danceClass;
}

async function student(name = "Alumno") {
  return StudentModel.create({ organizationId: ids.org, branchId: ids.branch, firstName: `${name}${++counter}`, lastName: "Test" });
}

async function enroll(classId: Types.ObjectId, studentId: Types.ObjectId, mode: "MONTHLY" | "PER_CLASS", startDate = "2026-09-01") {
  return EnrollmentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    classId,
    studentId,
    status: "ACTIVE",
    billingPreference: mode,
    billingChanges: [{ effectiveDate: startDate, mode }],
    periods: [{ startDate }],
    enrolledAt: new Date(startDate + "T12:00:00.000Z")
  });
}

async function sessionsOf(classId: Types.ObjectId, from: string, to: string) {
  await generateSessions(String(ids.org), { from, to, classIds: [classId] });
  return ClassSessionModel.find({ organizationId: ids.org, classId, sessionDate: { $gte: from, $lte: to } }).sort({ sessionDate: 1, startTime: 1 });
}

beforeAll(async () => {
  database = await startReplicaSet();
  vi.useFakeTimers({ toFake: ["Date"] });
  at(NOW);

  const org = await OrganizationModel.create({ name: "Academia", slug: `flows-${Date.now()}` });
  const branch = await BranchModel.create({ organizationId: org._id, name: "La Plata" });
  Object.assign(ids, { org: org._id, branch: branch._id });
  const adminUser = await UserModel.create({
    organizationId: org._id,
    email: "admin@example.com",
    passwordHash: "x",
    firstName: "Ada",
    lastName: "Admin",
    role: "ADMIN"
  });
  ids.admin = adminUser._id;
  const a = await professor("Ana");
  const b = await professor("Beto");
  Object.assign(ids, { professorA: a._id, professorB: b._id });
  adminToken = jwt.sign({ sub: String(adminUser._id), organizationId: String(org._id), role: "ADMIN" }, env.JWT_ACCESS_SECRET);
  professorToken = jwt.sign({ sub: String(a.userId), organizationId: String(org._id), role: "PROFESSOR" }, env.JWT_ACCESS_SECRET);
}, 120_000);

beforeEach(() => at(NOW));

afterAll(async () => {
  vi.useRealTimers();
  await database.stop();
});

describe("1-2. monthly fee: same price whatever the number of sessions, no attendance limit", () => {
  it("covers the 4 or 5 Tuesdays of a month and the 9 Monday+Thursday sessions of October", async () => {
    const tuesday = await group({ billingMode: "MONTHLY", slots: [{ day: "TUESDAY", startTime: "19:00", endTime: "20:00" }] });
    const twice = await group({
      billingMode: "MONTHLY",
      slots: [
        { day: "MONDAY", startTime: "19:00", endTime: "20:00" },
        { day: "THURSDAY", startTime: "19:00", endTime: "20:00" }
      ]
    });
    const juan = await student("Juan");
    await enroll(tuesday._id, juan._id, "MONTHLY");
    await enroll(twice._id, juan._id, "MONTHLY");

    expect(await sessionsOf(tuesday._id, "2026-10-01", "2026-10-31")).toHaveLength(4);
    expect(await sessionsOf(tuesday._id, "2026-12-01", "2026-12-31")).toHaveLength(5);
    const october = await sessionsOf(twice._id, "2026-10-01", "2026-10-31");
    expect(october).toHaveLength(9);

    await generateMonthlyCharges(actor(), "2026-10");
    await generateMonthlyCharges(actor(), "2026-12");
    const fees = await ChargeModel.find({ studentId: juan._id, kind: "MONTHLY_FEE" }).lean();
    // Two groups x two months, always the same monthly price.
    expect(fees.map((fee) => fee.amountCents)).toEqual([3_000_000, 3_000_000, 3_000_000, 3_000_000]);

    const fee = fees.find((item) => item.classId.equals(twice._id) && item.period === "2026-10")!;
    await registerCollection(actor(), { studentId: String(juan._id), amountCents: 3_000_000, method: "CASH", allocations: [{ chargeId: String(fee._id), amountCents: 3_000_000 }] });

    // Every one of the nine sessions is covered, and attending all of them is allowed.
    for (const session of october) {
      const coverage = await sessionCoverage(String(ids.org), session, twice, [{ studentId: String(juan._id), billingType: "MONTHLY" }]);
      expect(coverage.get(String(juan._id))?.status).toBe("PAID");
      await setSessionAttendance(String(ids.org), session, String(juan._id), "PRESENT", String(ids.admin));
    }
  });
});

describe("3-4. per-class billing and monthly coverage", () => {
  it("charges a class, collects it with the real collection date and never charges a monthly student", async () => {
    const danceClass = await group({ billingMode: "BOTH", slots: [{ day: "WEDNESDAY", startTime: "18:00", endTime: "19:00" }] });
    const daily = await student("Diaria");
    const monthly = await student("Mensual");
    await enroll(danceClass._id, daily._id, "PER_CLASS");
    await enroll(danceClass._id, monthly._id, "MONTHLY");
    const [session] = await sessionsOf(danceClass._id, "2026-09-30", "2026-09-30");

    const response = await admin(request(app).post(`/api/admin/billing/sessions/${session._id}/collect`)).send({
      studentId: String(daily._id),
      method: "CASH"
    });
    expect(response.status).toBe(201);
    expect(response.body.charge).toMatchObject({ kind: "CLASS_FEE", status: "PAID", serviceDate: "2026-09-30" });
    // Collected today (Oct 7th), not on the class day.
    expect(response.body.collection.accountingDate).toBe("2026-10-07");

    // A second attempt finds the same charge: no duplicate.
    const again = await ensureClassCharge(actor(), String(session._id), String(daily._id));
    expect(again).toMatchObject({ covered: false, created: false });

    await generateMonthlyCharges(actor(), "2026-09");
    const covered = await ensureClassCharge(actor(), String(session._id), String(monthly._id));
    expect(covered).toMatchObject({ covered: true, reason: "MONTHLY" });
    expect(await ChargeModel.countDocuments({ studentId: monthly._id, kind: "CLASS_FEE" })).toBe(0);
  });
});

describe("5-6. one student, different modes per group, and switching per-class to monthly", () => {
  it("generates monthly fees only where the student is monthly and keeps class fees on a switch", async () => {
    const bachata = await group({ billingMode: "BOTH", slots: [{ day: "MONDAY", startTime: "20:00", endTime: "21:00" }] });
    const reggaeton = await group({ billingMode: "BOTH", slots: [{ day: "FRIDAY", startTime: "20:00", endTime: "21:00" }] });
    const juan = await student("Juan");
    await enroll(bachata._id, juan._id, "MONTHLY");
    const perClass = await enroll(reggaeton._id, juan._id, "PER_CLASS");

    await generateMonthlyCharges(actor(), "2026-10");
    const fees = await ChargeModel.find({ studentId: juan._id, kind: "MONTHLY_FEE" }).lean();
    expect(fees.map((item) => String(item.classId))).toEqual([String(bachata._id)]);

    const [friday] = await sessionsOf(reggaeton._id, "2026-10-02", "2026-10-02");
    const { charge } = (await ensureClassCharge(actor(), String(friday._id), String(juan._id))) as any;
    await registerCollection(actor(), { studentId: String(juan._id), amountCents: 800_000, method: "CASH", allocations: [{ chargeId: String(charge._id), amountCents: 800_000 }] });

    // Switch to monthly from Oct 7th: mid-month, so the first fee needs a decision.
    const switched = await admin(request(app).patch(`/api/admin/enrollments/${perClass._id}/billing-preference`)).send({
      billingPreference: "MONTHLY",
      effectiveDate: "2026-10-07"
    });
    expect(switched.status).toBe(200);
    expect(switched.body.monthlyCharge).toMatchObject({ period: "2026-10", needsDecision: true });

    const created = await admin(request(app).post(`/api/admin/billing/enrollments/${perClass._id}/monthly-charge`)).send({
      period: "2026-10",
      policy: "FULL"
    });
    expect(created.status).toBe(201);

    // The admin recognizes the paid class as credit on the monthly fee, explicitly.
    const credit = await admin(request(app).post(`/api/admin/billing/charges/${created.body.id}/adjustments`)).send({
      type: "CREDIT_TRANSFER",
      amount: 8000,
      reason: "Clase del 2/10 ya abonada",
      sourceChargeIds: [String(charge._id)]
    });
    expect(credit.status).toBe(201);
    expect(credit.body.charge).toMatchObject({ owed: 22000, balance: 22000 });
    // The class fee is still there, paid.
    expect(await ChargeModel.findById(charge._id).lean()).toMatchObject({ status: "PAID", paidCents: 800_000 });
  });
});

describe("7. joining and leaving mid-month", () => {
  it("asks how to bill a mid-month join, prorates on request and keeps history after leaving", async () => {
    const danceClass = await group({ billingMode: "MONTHLY", slots: [{ day: "THURSDAY", startTime: "18:00", endTime: "19:00" }] });
    const ana = await student("Ana");

    const pending = await admin(request(app).post("/api/admin/enrollments")).send({
      classId: String(danceClass._id),
      studentId: String(ana._id),
      startDate: "2026-10-15"
    });
    expect(pending.status).toBe(201);
    expect(pending.body.firstMonth).toMatchObject({ period: "2026-10", needsDecision: true });
    expect(await ChargeModel.countDocuments({ studentId: ana._id })).toBe(0);

    // October Thursdays: 1, 8, 15, 22, 29 -> 3 of 5 left from the 15th.
    const prorated = await admin(request(app).post(`/api/admin/billing/enrollments/${pending.body._id}/monthly-charge`)).send({
      period: "2026-10",
      policy: "PRORATED"
    });
    expect(prorated.status).toBe(201);
    expect(prorated.body.amount).toBe(18000);

    // Next month is always full and generated automatically.
    await generateMonthlyCharges(actor(), "2026-11");
    expect((await ChargeModel.findOne({ studentId: ana._id, period: "2026-11" }).lean())?.amountCents).toBe(3_000_000);

    at("2026-10-22T21:30:00.000Z");
    const [session22] = await sessionsOf(danceClass._id, "2026-10-22", "2026-10-22");
    await setSessionAttendance(String(ids.org), session22, String(ana._id), "PRESENT", String(ids.admin));
    const left = await admin(request(app).delete(`/api/admin/enrollments/${pending.body._id}`)).send({ endDate: "2026-10-22" });
    expect(left.status).toBe(204);

    const [session29] = await sessionsOf(danceClass._id, "2026-10-29", "2026-10-29");
    expect((await loadRoster(String(ids.org), session29)).map((item) => item.studentId)).not.toContain(String(ana._id));
    expect((await loadRoster(String(ids.org), session22)).map((item) => item.studentId)).toContain(String(ana._id));
    // Debts stay collectable after leaving.
    const balances = await studentBalances(String(ids.org), [ana._id]);
    expect(balances.get(String(ana._id))!.pendingCents).toBe(1_800_000 + 3_000_000);
  });
});

describe("8-9. changing one session or the following ones", () => {
  it("keeps identity, roster and attendance", async () => {
    const danceClass = await group({ slots: [{ day: "MONDAY", startTime: "15:00", endTime: "16:00" }] });
    const sofia = await student("Sofia");
    await enroll(danceClass._id, sofia._id, "PER_CLASS");
    const sessions = await sessionsOf(danceClass._id, "2026-10-05", "2026-10-26");
    const [past, oct12, oct19, oct26] = sessions;
    await setSessionAttendance(String(ids.org), past, String(sofia._id), "PRESENT", String(ids.admin));

    // Only this session.
    await updateSingleSession(actor(), String(oct12._id), { startTime: "16:00", endTime: "17:00", reason: "Ensayo" });
    await generateSessions(String(ids.org), { from: "2026-10-05", to: "2026-10-31", classIds: [danceClass._id] });
    const moved = await ClassSessionModel.findById(oct12._id).lean();
    expect(moved).toMatchObject({ startTime: "16:00", manualOverride: true });
    expect(await ClassSessionModel.countDocuments({ classId: danceClass._id, sessionDate: "2026-10-12" })).toBe(1);

    // This and the following ones, from Oct 19th.
    const rule = await ClassScheduleModel.findOne({ classId: danceClass._id }).lean();
    await changeScheduleSeries(actor(), String(rule!.seriesId), "2026-10-19", { startTime: "14:30", endTime: "15:30" });
    const after = await ClassSessionModel.find({ classId: danceClass._id, sessionDate: { $in: ["2026-10-05", "2026-10-19", "2026-10-26"] } })
      .sort({ sessionDate: 1 })
      .lean();
    expect(after.map((item) => [String(item._id), item.startTime])).toEqual([
      [String(past._id), "15:00"],
      [String(oct19._id), "14:30"],
      [String(oct26._id), "14:30"]
    ]);
    expect((await loadRoster(String(ids.org), oct19)).map((item) => item.studentId)).toContain(String(sofia._id));
    expect((await loadRoster(String(ids.org), past)).find((item) => item.studentId === String(sofia._id))?.attendanceStatus).toBe("PRESENT");
    // The edited session of the 12th was not overwritten.
    expect((await ClassSessionModel.findById(oct12._id).lean())?.startTime).toBe("16:00");
  });
});

describe("10-11. suspension, reschedule and makeup without a second charge", () => {
  it("moves the roster and the payment to the new date", async () => {
    const danceClass = await group({ billingMode: "PER_CLASS", slots: [{ day: "FRIDAY", startTime: "19:00", endTime: "20:00" }] });
    const lu = await student("Lu");
    await enroll(danceClass._id, lu._id, "PER_CLASS");
    const [friday] = await sessionsOf(danceClass._id, "2026-10-09", "2026-10-09");
    const { charge } = (await ensureClassCharge(actor(), String(friday._id), String(lu._id))) as any;
    await registerCollection(actor(), { studentId: String(lu._id), amountCents: 800_000, method: "TRANSFER", allocations: [{ chargeId: String(charge._id), amountCents: 800_000 }] });

    await changeSessionStatus(actor(), String(friday._id), "SUSPENDED", "Corte de luz");
    await expect(changeSessionStatus(actor(), String(friday._id), "COMPLETED")).rejects.toMatchObject({ code: "INVALID_SESSION_TRANSITION" });
    const { original, replacement } = await rescheduleSession(actor(), String(friday._id), {
      date: "2026-10-12",
      startTime: "21:00",
      endTime: "22:00",
      reason: "Recuperación"
    });
    expect(original.status).toBe("RESCHEDULED");
    expect(original.statusHistory.map((item) => item.to)).toEqual(["SUSPENDED", "RESCHEDULED"]);
    expect((await loadRoster(String(ids.org), replacement)).map((item) => item.studentId)).toEqual([String(lu._id)]);

    const coverage = await sessionCoverage(String(ids.org), replacement, danceClass, [{ studentId: String(lu._id), billingType: "PER_CLASS" }]);
    expect(coverage.get(String(lu._id))?.status).toBe("PAID");
    const again = await ensureClassCharge(actor(), String(replacement._id), String(lu._id));
    expect(again).toMatchObject({ covered: false, created: false });
    expect(await ChargeModel.countDocuments({ studentId: lu._id })).toBe(1);

    // A completed session cannot be cancelled silently.
    await changeSessionStatus(actor(), String(replacement._id), "COMPLETED");
    await expect(changeSessionStatus(actor(), String(replacement._id), "CANCELLED", "x")).rejects.toMatchObject({ code: "INVALID_SESSION_TRANSITION" });
  });
});

describe("12-14. spaces and professors", () => {
  it("allows simultaneous classes in different spaces and rejects space or professor conflicts", async () => {
    const space1 = await admin(request(app).post("/api/admin/spaces")).send({ branchId: String(ids.branch), name: `Pista 1 ${++counter}` });
    const space2 = await admin(request(app).post("/api/admin/spaces")).send({ branchId: String(ids.branch), name: `Pista 2 ${++counter}` });
    expect(space1.status).toBe(201);

    const bachata = await group({ slots: [], professorId: ids.professorA });
    const reggaeton = await group({ slots: [], professorId: ids.professorB });
    const stretching = await group({ slots: [], professorId: ids.professorB });
    const slot = { day: "SATURDAY" as const, startTime: "19:00", endTime: "20:00" };

    await createScheduleSeries(actor(), String(bachata._id), { ...slot, spaceId: space1.body._id }, "2026-10-10");
    await createScheduleSeries(actor(), String(reggaeton._id), { ...slot, spaceId: space2.body._id }, "2026-10-10");

    await expect(
      createScheduleSeries(actor(), String(stretching._id), { ...slot, spaceId: space1.body._id }, "2026-10-10")
    ).rejects.toMatchObject({ code: "SPACE_CONFLICT" });
    // Same professor as reggaeton at the same time, in a free space.
    const space3 = await admin(request(app).post("/api/admin/spaces")).send({ branchId: String(ids.branch), name: `Pista 3 ${++counter}` });
    await expect(
      createScheduleSeries(actor(), String(stretching._id), { ...slot, spaceId: space3.body._id }, "2026-10-10")
    ).rejects.toMatchObject({ code: "PROFESSOR_CONFLICT" });

    // Session level: an extra session in an occupied space.
    await generateSessions(String(ids.org), { from: "2026-10-10", to: "2026-10-10" });
    const extra = await admin(request(app).post("/api/admin/sessions")).send({
      classId: String(stretching._id),
      date: "2026-10-10",
      startTime: "19:30",
      endTime: "20:30",
      spaceId: space1.body._id
    });
    expect(extra.status).toBe(409);
    expect(extra.body.error).toBe("SPACE_CONFLICT");
  });
});

describe("15-16. idempotent generation", () => {
  it("never duplicates sessions or monthly fees, even concurrently", async () => {
    const danceClass = await group({ billingMode: "MONTHLY", slots: [{ day: "TUESDAY", startTime: "10:00", endTime: "11:00" }] });
    const students = await Promise.all([student(), student(), student()]);
    for (const item of students) await enroll(danceClass._id, item._id, "MONTHLY");

    await Promise.all([1, 2, 3].map(() => generateSessions(String(ids.org), { from: "2026-10-01", to: "2026-11-30", classIds: [danceClass._id] })));
    await generateSessions(String(ids.org), { from: "2026-10-01", to: "2026-11-30", classIds: [danceClass._id] });
    expect(await ClassSessionModel.countDocuments({ classId: danceClass._id })).toBe(dateRange("2026-10-01", "2026-11-30").filter((day) => weekDayFor(day) === "TUESDAY").length);

    await Promise.all([1, 2, 3].map(() => generateMonthlyCharges(actor(), "2026-10", { classIds: [danceClass._id] })));
    await generateMonthlyCharges(actor(), "2026-10", { classIds: [danceClass._id] });
    expect(await ChargeModel.countDocuments({ classId: danceClass._id, period: "2026-10" })).toBe(3);
  });
});

describe("17. last seat", () => {
  it("gives the last seat to only one of two simultaneous enrollments", async () => {
    const danceClass = await group({ capacity: 1, slots: [{ day: "SUNDAY", startTime: "11:00", endTime: "12:00" }] });
    const [first, second] = await Promise.all([student(), student()]);
    const responses = await Promise.all(
      [first, second].map((item) =>
        admin(request(app).post("/api/admin/enrollments")).send({ classId: String(danceClass._id), studentId: String(item._id), billingPreference: "PER_CLASS" })
      )
    );
    expect(responses.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(await EnrollmentModel.countDocuments({ classId: danceClass._id, status: "ACTIVE" })).toBe(1);
  });
});

describe("18. attendance history", () => {
  it("keeps past rosters after a drop and does not add new students to past sessions", async () => {
    const danceClass = await group({ slots: [{ day: "MONDAY", startTime: "17:00", endTime: "18:00" }] });
    const old = await student("Antiguo");
    const enrollment = await enroll(danceClass._id, old._id, "PER_CLASS");
    const [past] = await sessionsOf(danceClass._id, "2026-10-05", "2026-10-05");
    await setSessionAttendance(String(ids.org), past, String(old._id), "ABSENT", String(ids.admin));

    await admin(request(app).delete(`/api/admin/enrollments/${enrollment._id}`)).send({});
    const newcomer = await student("Nuevo");
    await enroll(danceClass._id, newcomer._id, "PER_CLASS", "2026-10-07");

    const roster = await loadRoster(String(ids.org), (await ClassSessionModel.findById(past._id))!);
    expect(roster.map((item) => item.studentId)).toEqual([String(old._id)]);
    expect(roster[0].attendanceStatus).toBe("ABSENT");
  });
});

describe("19-21. partial payments, credit, refunds and Argentina dates", () => {
  it("handles partial and multi-charge collections, credit and refunds without changing closed days", async () => {
    const danceClass = await group({ billingMode: "MONTHLY", slots: [{ day: "WEDNESDAY", startTime: "20:00", endTime: "21:00" }] });
    const pau = await student("Pau");
    await enroll(danceClass._id, pau._id, "MONTHLY");
    await generateMonthlyCharges(actor(), "2026-10");
    const fee = (await ChargeModel.findOne({ studentId: pau._id, period: "2026-10" }))!;
    expect(fee.dueDate).toBe("2026-10-10");

    // Due on the 10th: at 22:30 of the 10th (Argentina) it is still not overdue.
    at("2026-10-11T01:30:00.000Z");
    expect((await studentBalances(String(ids.org), [pau._id])).get(String(pau._id))!.overdueCents).toBe(0);
    at("2026-10-11T03:30:00.000Z");
    expect((await studentBalances(String(ids.org), [pau._id])).get(String(pau._id))!.overdueCents).toBe(3_000_000);

    // Partial payment late on Oct 31st belongs to Oct 31st.
    at("2026-11-01T02:30:00.000Z");
    const partial = await registerCollection(actor(), { studentId: String(pau._id), amountCents: 1_000_000, method: "CASH", autoAllocate: true });
    expect(partial.collection.accountingDate).toBe("2026-10-31");
    expect((await ChargeModel.findById(fee._id).lean())?.balanceCents).toBe(2_000_000);

    // Rest plus extra money: the fee is paid and 5,000 pesos remain as credit.
    at("2026-11-02T15:00:00.000Z");
    const rest = await registerCollection(actor(), {
      studentId: String(pau._id),
      amountCents: 2_500_000,
      method: "TRANSFER",
      autoAllocate: true,
      idempotencyKey: "pau-2026-11-02"
    });
    const replay = await registerCollection(actor(), { studentId: String(pau._id), amountCents: 2_500_000, method: "TRANSFER", autoAllocate: true, idempotencyKey: "pau-2026-11-02" });
    expect(replay.replayed).toBe(true);
    expect((await ChargeModel.findById(fee._id).lean())?.status).toBe("PAID");
    expect((await studentBalances(String(ids.org), [pau._id])).get(String(pau._id))!.creditCents).toBe(500_000);

    const before = await admin(request(app).get("/api/admin/billing/cash?from=2026-10-31&to=2026-10-31"));
    expect(before.body).toMatchObject({ collected: 10000, refunded: 0 });

    // A week later the October payment is refunded: October 31st does not change.
    at("2026-11-09T15:00:00.000Z");
    const allocation = partial.allocations[0];
    await refundCollection(actor(), String(partial.collection._id), {
      amountCents: 1_000_000,
      reason: "Devolución acordada",
      method: "CASH",
      allocationId: String(allocation._id)
    });
    const after = await admin(request(app).get("/api/admin/billing/cash?from=2026-10-31&to=2026-10-31"));
    expect(after.body).toMatchObject({ collected: 10000, refunded: 0 });
    const refundDay = await admin(request(app).get("/api/admin/billing/cash?from=2026-11-09&to=2026-11-09"));
    expect(refundDay.body).toMatchObject({ collected: 0, refunded: 10000, net: -10000 });
    // The fee is owed again for the refunded part; the credit can pay it.
    expect((await ChargeModel.findById(fee._id).lean())).toMatchObject({ status: "OPEN", balanceCents: 1_000_000 });
    expect(rest.collection.accountingDate).toBe("2026-11-02");
  });
});

describe("22. migration", () => {
  it("mirrors legacy payments once and reports ambiguous history", async () => {
    const danceClass = await group({ billingMode: "BOTH", slots: [{ day: "THURSDAY", startTime: "21:00", endTime: "22:00" }] });
    const leo = await student("Leo");
    await enroll(danceClass._id, leo._id, "PER_CLASS");
    const base = {
      organizationId: ids.org,
      branchId: ids.branch,
      studentId: leo._id,
      classId: danceClass._id,
      concept: "Legacy",
      dueDate: new Date("2026-09-10T12:00:00.000Z")
    };
    await PaymentModel.create([
      { ...base, paymentType: "MONTHLY", period: "2026-08", amount: 25000, status: "PAID", paidAt: new Date("2026-08-05T15:00:00.000Z"), paymentMethod: "CASH", receiptNumber: `L-${++counter}` },
      { ...base, paymentType: "MONTHLY", period: "2026-09", amount: 25000, status: "PENDING" },
      { ...base, paymentType: "PER_CLASS", period: "2026-07", classDate: new Date("2026-07-02T12:00:00.000Z"), amount: 8000, status: "CANCELLED", paidAt: new Date("2026-07-02T15:00:00.000Z"), cancelledAt: new Date("2026-07-03T15:00:00.000Z") }
    ]);

    const dry = await runSchedulingBillingMigration({ apply: false });
    expect(dry.mode).toBe("DRY_RUN");
    expect(await ChargeModel.countDocuments({ studentId: leo._id })).toBe(0);

    await runSchedulingBillingMigration({ apply: true });
    const charges = await ChargeModel.countDocuments({ studentId: leo._id });
    await runSchedulingBillingMigration({ apply: true });
    expect(await ChargeModel.countDocuments({ studentId: leo._id })).toBe(charges);
    expect(charges).toBe(3);

    const balance = (await studentBalances(String(ids.org), [leo._id])).get(String(leo._id))!;
    expect(balance.pendingCents).toBe(2_500_000);
    const issues = await admin(request(app).get("/api/admin/billing/migration-issues"));
    expect(issues.body.items.some((item: any) => item.kind === "LEGACY_PAID_THEN_CANCELLED")).toBe(true);
    // A second monthly fee for a month already billed in the old system is never generated.
    await generateMonthlyCharges(actor(), "2026-09");
    expect(await ChargeModel.countDocuments({ studentId: leo._id, period: "2026-09" })).toBe(1);
  });
});

describe("23. permissions", () => {
  it("keeps billing and calendar administration for administrators", async () => {
    for (const path of ["/api/admin/billing/charges", "/api/admin/calendar?from=2026-10-01&to=2026-10-07", "/api/admin/billing/cash?from=2026-10-01&to=2026-10-07"]) {
      const response = await request(app).get(path).set("Authorization", `Bearer ${professorToken}`);
      expect(response.status).toBe(403);
    }
    const calendar = await admin(request(app).get("/api/admin/calendar?from=2026-10-05&to=2026-10-11"));
    expect(calendar.status).toBe(200);
  });

  it("rejects collections dated in the future", async () => {
    const someone = await student();
    const response = await admin(request(app).post("/api/admin/billing/collections")).send({
      studentId: String(someone._id),
      amount: 100,
      method: "CASH",
      receivedAt: academyInstant("2026-10-09", "10:00").toISOString()
    });
    expect(response.status).toBe(422);
  });
});
