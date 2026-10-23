import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import request from "supertest";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { DanceClassModel } from "../classes/class.model";
import { ContactModel } from "../contacts/contact.model";
import { OpportunityModel } from "../contacts/opportunity.model";
import { StudentModel } from "../students/student.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { loadSessionParticipants, setSessionAttendance } from "../sessions/session-service";
import { freezeRoster } from "../sessions/roster-service";
import { ChargeModel } from "../billing/charge.model";
import { bookTrial, cancelTrial, convertTrial } from "./trial-service";
import { TrialBookingModel } from "./trial-booking.model";
import { TrialBenefitModel } from "./trial-benefit.model";
import { runIdentityMigration } from "../../scripts/migrate-identity";
import { convertContact } from "../contacts/conversion-service";

const app = createApp();
let database: Awaited<ReturnType<typeof startReplicaSet>>;
let org: Types.ObjectId, branch: Types.ObjectId, user: Types.ObjectId, token: string;
let sequence = 0;
const actor = () => ({ organizationId: String(org), userId: String(user) });
const auth = (test: request.Test) => test.set("Authorization", `Bearer ${token}`);
async function person() {
  return ContactModel.create({ organizationId: org, branchId: branch, firstName: "Interesada", lastName: `Apellido${++sequence}` });
}
async function group(capacity = 10) {
  const danceClass = await DanceClassModel.create({ organizationId: org, branchId: branch, name: `Salsa ${++sequence}`,
    capacity, billingMode: "PER_CLASS", pricePerClass: 5000, freeTrialEnabled: true, professorIds: [new Types.ObjectId()], schedules: [] });
  const session = await ClassSessionModel.create({ organizationId: org, branchId: branch, classId: danceClass._id,
    sessionDate: "2026-10-23", startTime: "18:00", endTime: "19:00", status: "SCHEDULED" });
  return { danceClass, session };
}
const mark = (session: Awaited<ReturnType<typeof group>>["session"], id: Types.ObjectId, status: "PRESENT" | "ABSENT" = "PRESENT") =>
  setSessionAttendance(String(org), session, String(id), status, String(user), { origin: "ADMIN" });

beforeAll(async () => {
  database = await startReplicaSet();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-23T20:55:00Z"));
  org = (await OrganizationModel.create({ name: "Academia", slug: "identity-tests" }))._id;
  branch = (await BranchModel.create({ organizationId: org, name: "Centro" }))._id;
  user = new Types.ObjectId();
  token = jwt.sign({ sub: String(user), organizationId: String(org), role: "ADMIN" }, env.JWT_ACCESS_SECRET);
}, 120000);
afterAll(async () => { vi.useRealTimers(); await database.stop(); });

describe("identity and trial invariants", () => {
  it("creates a contact once under concurrent retries and rejects cross-tenant references", async () => {
    const input = { branchId: String(branch), firstName: "María", lastName: "Pérez", email: "maria@example.com", creationKey: "identity-create-123456789" };
    const responses = await Promise.all([auth(request(app).post("/api/admin/contacts")).send(input), auth(request(app).post("/api/admin/contacts")).send(input)]);
    expect(responses.map((item) => item.status)).toEqual([201, 201]);
    expect(responses[0].body._id).toBe(responses[1].body._id);
    expect(await StudentModel.countDocuments()).toBe(0);
    const other = await OrganizationModel.create({ name: "Otra", slug: "other-identity" });
    const foreign = await BranchModel.create({ name: "Ajena", organizationId: other._id });
    expect((await auth(request(app).post("/api/admin/contacts")).send({ ...input, email: "new@example.com", branchId: String(foreign._id), creationKey: "another-key-123456789" })).status).toBe(422);
    expect((await auth(request(app).get(`/api/admin/contacts/${new Types.ObjectId()}`))).status).toBe(404);
  });

  it("books an interested person without a Student and shows the same participant to admin/professor", async () => {
    const contact = await person(), { danceClass, session } = await group();
    const booking = await bookTrial(actor(), { contactId: String(contact._id), sessionId: String(session._id) });
    expect(await StudentModel.exists({ _id: contact._id })).toBeNull();
    const participants = await loadSessionParticipants(String(org), session, danceClass);
    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({ studentId: String(contact._id), billingType: "FREE", participantType: "TRIAL" });
    expect(booking.contactId?.equals(contact._id)).toBe(true);
    expect((await TrialBenefitModel.findOne({ contactId: contact._id }))?.consumedAt).toBeUndefined();
  });

  it("allows only one concurrent active reservation per person/group, including another session", async () => {
    const contact = await person(), { session } = await group();
    const second = await ClassSessionModel.create({ organizationId: org, branchId: branch, classId: session.classId,
      sessionDate: session.sessionDate, startTime: "19:00", endTime: "20:00" });
    const results = await Promise.allSettled([session, second].map((item) => bookTrial(actor(), { contactId: String(contact._id), sessionId: String(item._id) })));
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await TrialBookingModel.countDocuments({ studentId: contact._id })).toBe(1);
  });

  it("serializes the last seat across different contacts", async () => {
    const a = await person(), b = await person(), { session } = await group(1);
    const results = await Promise.allSettled([a, b].map((contact) => bookTrial(actor(), { contactId: String(contact._id), sessionId: String(session._id) })));
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  });

  it("consumes only PRESENT, blocks a second trial in that group and permits a different group", async () => {
    const contact = await person(), { session } = await group();
    await bookTrial(actor(), { contactId: String(contact._id), sessionId: String(session._id) });
    await Promise.all([mark(session, contact._id), mark(session, contact._id)]);
    expect(await ChargeModel.countDocuments({ studentId: contact._id })).toBe(0);
    const benefit = await TrialBenefitModel.findOne({ contactId: contact._id }); expect(benefit?.consumedAt).toBeInstanceOf(Date);
    const next = await ClassSessionModel.create({ organizationId: org, branchId: branch, classId: session.classId, sessionDate: "2026-10-24", startTime: "18:00", endTime: "19:00" });
    await expect(bookTrial(actor(), { contactId: String(contact._id), sessionId: String(next._id) })).rejects.toMatchObject({ code: "TRIAL_CONSUMED" });
    const other = await group();
    await expect(bookTrial(actor(), { contactId: String(contact._id), sessionId: String(other.session._id) })).resolves.toBeDefined();
  });

  it("releases cancellation and absence without deleting history", async () => {
    const contact = await person(), { session } = await group();
    const first = await bookTrial(actor(), { contactId: String(contact._id), sessionId: String(session._id) });
    await cancelTrial(actor(), String(first._id));
    const second = await bookTrial(actor(), { contactId: String(contact._id), sessionId: String(session._id) });
    await mark(session, contact._id, "ABSENT");
    expect((await TrialBookingModel.findById(second._id))?.status).toBe("CANCELLED");
    const later = await ClassSessionModel.create({ organizationId: org, branchId: branch, classId: session.classId, sessionDate: "2026-10-24", startTime: "18:00", endTime: "19:00" });
    await bookTrial(actor(), { contactId: String(contact._id), sessionId: String(later._id) });
    expect(await TrialBookingModel.countDocuments({ studentId: contact._id })).toBe(3);
  });

  it("converts concurrently once, preserving identity, consumed trial and another commercial opportunity", async () => {
    const contact = await person(), { session } = await group(), other = await group();
    const trial = await bookTrial(actor(), { contactId: String(contact._id), sessionId: String(session._id) });
    await mark(session, contact._id);
    await OpportunityModel.create({ organizationId: org, contactId: contact._id, classId: other.danceClass._id });
    const results = await Promise.all([convertTrial(actor(), String(trial._id), {}), convertTrial(actor(), String(trial._id), {})]);
    expect(String(results[0].enrollment._id)).toBe(String(results[1].enrollment._id));
    expect(await StudentModel.countDocuments({ _id: contact._id, contactId: contact._id })).toBe(1);
    expect(await EnrollmentModel.countDocuments({ studentId: contact._id })).toBe(1);
    expect((await TrialBookingModel.findById(trial._id))?.consumedAt).toBeInstanceOf(Date);
    expect(await OpportunityModel.countDocuments({ contactId: contact._id, status: "OPEN" })).toBe(1);
    expect(await ClassAttendanceModel.countDocuments({ studentId: contact._id, status: "PRESENT" })).toBe(1);
  });

  it("accepts an authorized courtesy without consuming or restoring the trial benefit", async () => {
    const contact = await person(), { session } = await group();
    await expect(bookTrial(actor(), { contactId: String(contact._id), sessionId: String(session._id), kind: "COURTESY" })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await bookTrial(actor(), { contactId: String(contact._id), sessionId: String(session._id), kind: "COURTESY", notes: "Invitación de administración" });
    await mark(session, contact._id);
    expect(await TrialBenefitModel.countDocuments({ contactId: contact._id })).toBe(0);
    expect(await ChargeModel.countDocuments({ studentId: contact._id })).toBe(0);
    const later = await ClassSessionModel.create({ organizationId: org, branchId: branch, classId: session.classId, sessionDate: "2026-10-24", startTime: "18:00", endTime: "19:00" });
    await expect(bookTrial(actor(), { contactId: String(contact._id), sessionId: String(later._id) })).resolves.toBeDefined();
  });

  it("adds a legitimate trial after freezing without recalculating historical participants", async () => {
    const a = await person(), b = await person(), { session } = await group();
    await bookTrial(actor(), { contactId: String(a._id), sessionId: String(session._id) });
    await freezeRoster(String(org), session);
    await bookTrial(actor(), { contactId: String(b._id), sessionId: String(session._id) });
    await mark(session, b._id);
    expect(await ClassAttendanceModel.countDocuments({ sessionId: session._id })).toBe(2);
    expect((await ClassAttendanceModel.findOne({ studentId: a._id, sessionId: session._id }))?.status).toBe("EXPECTED");
  });

  it("migrates a legacy profile additively, dry-runs without writes and reapplies idempotently", async () => {
    const student = await StudentModel.create({ organizationId: org, branchId: branch, firstName: "Histórica", lastName: "Migración" });
    const before = await ContactModel.countDocuments();
    const dry = await runIdentityMigration(mongoose.connection.db!);
    expect(dry.contactsMissing).toBe(1);
    expect(await ContactModel.countDocuments()).toBe(before);
    const report = await runIdentityMigration(mongoose.connection.db!, true);
    expect(report.issues).toHaveLength(0);
    expect((await ContactModel.findById(student._id))?.firstName).toBe(student.firstName);
    expect((await StudentModel.findById(student._id))?.contactId?.equals(student._id)).toBe(true);
    await runIdentityMigration(mongoose.connection.db!, true);
    expect(await ContactModel.countDocuments()).toBe(before + 1);
  });

  it("converts a contact directly without requiring a free trial or duplicating a profile", async () => {
    const contact = await person(), { danceClass, session } = await group();
    await DanceClassModel.updateOne({ _id: danceClass._id }, { $set: { freeTrialEnabled: false } });
    const results = await Promise.all([1, 2].map(() => convertContact(actor(), String(contact._id), { classId: String(danceClass._id) })));
    expect(String(results[0].enrollment._id)).toBe(String(results[1].enrollment._id));
    expect(await StudentModel.countDocuments({ _id: contact._id })).toBe(1);
    expect(await TrialBookingModel.countDocuments({ studentId: contact._id })).toBe(0);
    await bookTrial(actor(), { contactId: String(contact._id), sessionId: String(session._id), kind: "COURTESY", notes: "Cortesía por invitación" });
    await mark(session, contact._id);
    expect(await ChargeModel.countDocuments({ studentId: contact._id })).toBe(0);
  });

  it("refuses ambiguous migration before writing even an unrelated contact", async () => {
    const student = await StudentModel.create({ organizationId: org, branchId: branch, firstName: "Pendiente", lastName: "Revisión" });
    const trial = await TrialBookingModel.create({ organizationId: org, branchId: branch, classId: new Types.ObjectId(), studentId: student._id, scheduledFor: new Date(), status: "COMPLETED" });
    const report = await runIdentityMigration(mongoose.connection.db!);
    expect(report.issues.some((issue) => issue.trialId === String(trial._id))).toBe(true);
    await expect(runIdentityMigration(mongoose.connection.db!, true)).rejects.toThrow("REQUIRES_REVIEW");
    expect(await ContactModel.findById(student._id)).toBeNull();
  });
});
