import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { OrganizationModel } from "../core/organization.model";
import { BranchModel } from "../core/branch.model";
import { ContactModel } from "../contacts/contact.model";
import { StudentModel } from "../students/student.model";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { freezeRoster } from "../sessions/roster-service";
import { ChargeModel } from "../billing/charge.model";
import { generateMonthlyCharges } from "../billing/charge-service";
import { bookTrial, convertTrial } from "../trials/trial-service";
import { CheckInAttemptModel, CheckInCredentialModel, CheckInDeviceModel } from "./check-in.models";
import { TrialBenefitModel } from "../trials/trial-benefit.model";
import { rotateCredential } from "./credentials-service";
import { withinCheckInWindow } from "./check-in-window";
import { activationRateLimiter } from "./check-in.routes";
import { UserModel } from "../auth/user.model";

const app = createApp();
let db: Awaited<ReturnType<typeof startReplicaSet>>, org: Types.ObjectId, branch: Types.ObjectId, user: Types.ObjectId, adminToken: string;
let sequence = 0;
const actor = () => ({ organizationId: String(org), userId: String(user) });
const admin = (test: request.Test) => test.set("Authorization", `Bearer ${adminToken}`);
async function device(branchId = branch) {
  const created = await admin(request(app).post("/api/admin/check-in/devices")).send({ name: `Tablet ${++sequence}`, branchId: String(branchId) });
  expect(created.status).toBe(201);
  const agent = request.agent(app);
  const activated = await agent.post("/api/check-in/activate").send({ code: created.body.activationCode });
  expect(activated.status).toBe(200);
  return { agent, id: created.body.device.id, activationCode: created.body.activationCode, cookie: activated.headers["set-cookie"] };
}
async function scenario(mode: "PER_CLASS" | "MONTHLY" | "FREE" = "PER_CLASS", academic = true) {
  const contact = await ContactModel.create({ organizationId: org, branchId: branch, firstName: "Lucía", lastName: `QR${++sequence}` });
  const danceClass = await DanceClassModel.create({ organizationId: org, branchId: branch, name: `Clase ${sequence}`, professorIds: [], capacity: 10,
    billingMode: mode, pricePerClass: 5000, monthlyPrice: 30000, freeTrialEnabled: true, schedules: [] });
  const session = await ClassSessionModel.create({ organizationId: org, branchId: branch, classId: danceClass._id, sessionDate: "2026-10-23", startTime: "18:00", endTime: "19:00" });
  if (academic) {
    await StudentModel.create({ _id: contact._id, contactId: contact._id, organizationId: org, branchId: branch, firstName: contact.firstName, lastName: contact.lastName });
    await EnrollmentModel.create({ organizationId: org, branchId: branch, studentId: contact._id, classId: danceClass._id, billingPreference: mode === "FREE" ? undefined : mode,
      periods: [{ startDate: "2026-10-01" }], billingChanges: mode === "FREE" ? [] : [{ effectiveDate: "2026-10-01", mode }] });
  }
  const credential = await rotateCredential(actor(), String(contact._id));
  if (!("qr" in credential)) throw new Error("Expected QR");
  return { contact, danceClass, session, qr: credential.qr };
}
beforeAll(async () => {
  db = await startReplicaSet(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-23T21:00:00Z"));
  org = (await OrganizationModel.create({ name: "M&M", slug: "kiosk-tests" }))._id;
  branch = (await BranchModel.create({ organizationId: org, name: "Centro" }))._id; user = new Types.ObjectId();
  adminToken = jwt.sign({ sub: String(user), organizationId: String(org), role: "ADMIN" }, env.JWT_ACCESS_SECRET);
  await UserModel.create({ _id: user, organizationId: org, email: "kiosk-admin@example.test", firstName: "Admin", lastName: "Kiosco", passwordHash: "unused-test-hash", role: "ADMIN" });
}, 120000);
beforeEach(() => { vi.setSystemTime(new Date("2026-10-23T21:00:00Z")); activationRateLimiter.resetKey("::ffff:127.0.0.1"); activationRateLimiter.resetKey("127.0.0.1"); });
afterAll(async () => { vi.useRealTimers(); await db.stop(); });

describe("authorized QR reception", () => {
  it("registers by DNI without an active QR, shares duplicate protection and keeps the DNI out of results/logs", async () => {
    const s = await scenario(), access = await device(), dni = String(31000000 + ++sequence);
    const saved = await admin(request(app).patch(`/api/admin/contacts/${s.contact._id}`)).send({ dni: `${dni.slice(0, 2)}.${dni.slice(2, 5)}.${dni.slice(5)}` });
    expect(saved.status).toBe(200); expect(saved.body.dni).toBe(dni);
    expect((await StudentModel.findById(s.contact._id))?.dni).toBe(dni);
    for (const resource of ["contacts", "students"]) {
      const found = await admin(request(app).get(`/api/admin/${resource}`)).query({ q: `${dni.slice(0, 2)}.${dni.slice(2, 5)}.${dni.slice(5)}` });
      expect(found.status).toBe(200);
      expect(found.body.items.map((item: { _id: string }) => item._id)).toEqual([String(s.contact._id)]);
    }
    await rotateCredential(actor(), String(s.contact._id), true);
    const result = await access.agent.post("/api/check-in/scan").send({ dni });
    expect(result.status).toBe(200); expect(result.body.kind).toBe("SUCCESS");
    expect(JSON.stringify(result.body)).not.toContain(dni);
    expect((await ClassAttendanceModel.findOne({ studentId: s.contact._id }))?.checkInMethod).toBe("DNI");
    expect((await access.agent.post("/api/check-in/scan").send({ dni })).body.kind).toBe("WARNING");
    expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(1);
    const unknown = await access.agent.post("/api/check-in/scan").send({ dni: "99888777" });
    expect(unknown.status).toBe(422); expect(unknown.body).not.toHaveProperty("firstName");
    expect(JSON.stringify(await CheckInAttemptModel.find({ deviceId: access.id }).lean())).not.toContain("99888777");
  });
  it("serializes QR and DNI arriving together into one present and charge", async () => {
    const s = await scenario(), access = await device(), dni = String(31000000 + ++sequence);
    await admin(request(app).patch(`/api/admin/students/${s.contact._id}`)).send({ dni });
    expect((await ContactModel.findById(s.contact._id))?.dni).toBe(dni);
    const results = await Promise.all([{ dni }, { qr: s.qr }].map((body) => access.agent.post("/api/check-in/scan").send(body)));
    expect(results.map((item) => item.body.kind).sort()).toEqual(["SUCCESS", "WARNING"]);
    expect(await ClassAttendanceModel.countDocuments({ studentId: s.contact._id, status: "PRESENT" })).toBe(1);
    expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(1);
    expect(["QR", "DNI"]).toContain((await ClassAttendanceModel.findOne({ studentId: s.contact._id }))?.checkInMethod);
  });
  it("selects exactly one eligible class when using DNI", async () => {
    const s = await scenario(), access = await device(), dni = String(31000000 + ++sequence);
    await admin(request(app).patch(`/api/admin/contacts/${s.contact._id}`)).send({ dni });
    const next = await ClassSessionModel.create({ organizationId: org, branchId: branch, classId: s.danceClass._id,
      sessionDate: "2026-10-23", startTime: "18:15", endTime: "19:15" });
    const scan = await access.agent.post("/api/check-in/scan").send({ dni });
    expect(scan.body.kind).toBe("SELECT"); expect(scan.body.sessions).toHaveLength(2);
    expect(await ClassAttendanceModel.countDocuments({ studentId: s.contact._id, status: "PRESENT" })).toBe(0);
    expect((await access.agent.post("/api/check-in/present").send({ dni, sessionId: String(next._id) })).body.kind).toBe("SUCCESS");
    expect(await ClassAttendanceModel.countDocuments({ studentId: s.contact._id, status: "PRESENT" })).toBe(1);
  });
  it.each(["TRIAL", "COURTESY"] as const)("uses the same %s benefit rules with DNI", async (kind) => {
    const s = await scenario("PER_CLASS", false), access = await device(), dni = String(31000000 + ++sequence);
    await admin(request(app).patch(`/api/admin/contacts/${s.contact._id}`)).send({ dni });
    await bookTrial(actor(), { contactId: String(s.contact._id), sessionId: String(s.session._id), kind, notes: "Invitación de prueba automatizada" });
    expect((await access.agent.post("/api/check-in/scan").send({ dni })).body.kind).toBe("SUCCESS");
    expect(await StudentModel.exists({ _id: s.contact._id })).toBeNull();
    expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(0);
    const benefit = await TrialBenefitModel.findOne({ contactId: s.contact._id });
    if (kind === "TRIAL") expect(benefit?.consumedAt).toBeInstanceOf(Date); else expect(benefit).toBeNull();
  });
  it("refuses invalid DNI, mixed credentials, wrong branches and ambiguous legacy identities", async () => {
    const access = await device();
    expect((await access.agent.post("/api/check-in/scan").send({ dni: "letters" })).status).toBe(400);
    expect((await access.agent.post("/api/check-in/scan").send({ dni: "12345678", qr: "also-a-qr" })).status).toBe(400);
    const other = await BranchModel.create({ organizationId: org, name: "Sede DNI" });
    await ContactModel.create({ organizationId: org, branchId: other._id, firstName: "Otra", lastName: "Sede", dni: "88777666" });
    expect((await access.agent.post("/api/check-in/scan").send({ dni: "88777666" })).status).toBe(422);
    await StudentModel.create([1, 2].map((number) => ({ organizationId: org, branchId: branch, firstName: "Histórico", lastName: `Ambiguo ${number}`, dni: "77666555" })));
    const result = await access.agent.post("/api/check-in/scan").send({ dni: "77666555" });
    expect(result.status).toBe(409); expect(result.body.error).toBe("DNI_REQUIRES_REVIEW");
    expect(await ContactModel.countDocuments({ dni: "77666555" })).toBe(0);
    await BranchModel.deleteOne({ _id: other._id });
  });
  it("prevents concurrent contact/student creation with the same DNI and synchronizes clearing it", async () => {
    const dni = String(31000000 + ++sequence), data = { branchId: String(branch), firstName: "Persona", lastName: "Documento", dni };
    const results = await Promise.all([
      admin(request(app).post("/api/admin/contacts")).send({ ...data, creationKey: `dni-create-${dni}-abcdef` }),
      admin(request(app).post("/api/admin/students")).send(data)
    ]);
    expect(results.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(await ContactModel.countDocuments({ organizationId: org, dni })).toBe(1);
    const student = await scenario(), originalDni = String(31000000 + ++sequence);
    expect((await admin(request(app).patch(`/api/admin/students/${student.contact._id}`)).send({ dni: originalDni })).status).toBe(200);
    const blocked = await admin(request(app).patch(`/api/admin/contacts/${student.contact._id}`)).send({ dni });
    expect(blocked.status).toBe(409);
    expect((await StudentModel.findById(student.contact._id))?.dni).toBe(originalDni);
    expect((await admin(request(app).patch(`/api/admin/contacts/${student.contact._id}`)).send({ dni: "" })).status).toBe(200);
    expect((await StudentModel.findById(student.contact._id))?.dni).toBeUndefined();
    expect((await ContactModel.findById(student.contact._id))?.dni).toBeUndefined();
  });
  it("opens and persists attendance from canonical www when APP_ORIGIN is the apex, rejecting unrelated origins", async () => {
    const original = env.APP_ORIGIN;
    env.APP_ORIGIN = "https://mymacademiadebaile.com.ar";
    try {
      const origin = "https://www.mymacademiadebaile.com.ar", agent = request.agent(app), s = await scenario();
      const opened = await admin(agent.post("/api/check-in/authorize")).set("Origin", origin).send({});
      expect(opened.status).toBe(200);
      expect(opened.headers["access-control-allow-origin"]).toBe(origin);
      expect(opened.headers["access-control-allow-credentials"]).toBe("true");
      const result = await agent.post("/api/check-in/scan").set("Origin", origin).send({ qr: s.qr });
      expect(result.status).toBe(200); expect(result.body.kind).toBe("SUCCESS");
      expect(await ClassAttendanceModel.countDocuments({ studentId: s.contact._id, status: "PRESENT" })).toBe(1);
      expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(1);
      const blocked = await agent.post("/api/check-in/scan").set("Origin", "https://example.invalid").send({ qr: s.qr });
      expect(blocked.status).toBe(403); expect(blocked.body.error).toBe("INVALID_ORIGIN");
      expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
      const retry = await agent.post("/api/check-in/scan").set("Origin", env.APP_ORIGIN).send({ qr: s.qr });
      expect(retry.body.kind).toBe("WARNING");
      expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(1);
    } finally { env.APP_ORIGIN = original; }
  });
  it("authorizes directly with an admin login, preserves the login and reuses kiosk settings", async () => {
    const agent = request.agent(app);
    const opened = await agent.post("/api/check-in/authorize").set("Cookie", `mym_access=${adminToken}`).send({});
    expect(opened.status).toBe(200);
    expect(opened.body.branchId).toBe(String(branch));
    expect(opened.headers["set-cookie"].join(" ")).not.toMatch(/mym_access=|mym_refresh=/);
    expect(opened.body).not.toHaveProperty("sessionHash");
    expect(opened.body).not.toHaveProperty("activationCode");
    await CheckInDeviceModel.updateOne({ _id: opened.body.id }, { $set: { soundEnabled: false } });
    const again = await admin(agent.post("/api/check-in/authorize")).send({});
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(opened.body.id);
    expect(again.body.soundEnabled).toBe(false);
    const status = await agent.get("/api/check-in/device");
    expect(status.status).toBe(200);
    expect(status.headers["set-cookie"]).toBeUndefined();
  });
  it("requires an active admin and never authorizes another organization's branch", async () => {
    expect((await request(app).post("/api/check-in/authorize").send({})).status).toBe(401);
    const professor = jwt.sign({ sub: String(user), organizationId: String(org), role: "PROFESSOR" }, env.JWT_ACCESS_SECRET);
    expect((await request(app).post("/api/check-in/authorize").set("Authorization", `Bearer ${professor}`).send({})).status).toBe(403);
    expect((await admin(request(app).post("/api/check-in/authorize")).send({ branchId: String(new Types.ObjectId()) })).status).toBe(422);
    await UserModel.updateOne({ _id: user }, { $set: { isActive: false } });
    try { expect((await admin(request(app).post("/api/check-in/authorize")).send({})).status).toBe(401); }
    finally { await UserModel.updateOne({ _id: user }, { $set: { isActive: true } }); }
  });
  it("allows the same SUPER_ADMIN role accepted by the administrative panel", async () => {
    const superAdmin = await UserModel.create({ organizationId: org, email: "kiosk-superadmin@example.test", firstName: "Super", lastName: "Admin", passwordHash: "unused-test-hash", role: "SUPER_ADMIN" });
    const token = jwt.sign({ sub: String(superAdmin._id), organizationId: String(org), role: "SUPER_ADMIN" }, env.JWT_ACCESS_SECRET);
    const response = await request(app).post("/api/check-in/authorize").set("Authorization", `Bearer ${token}`).send({ branchId: String(branch) });
    expect(response.status).toBe(200); expect(response.body.branchId).toBe(String(branch));
    expect((await CheckInDeviceModel.findById(response.body.id))?.authorizedByUserId.equals(superAdmin._id)).toBe(true);
  });
  it("asks only for the branch when the academy has several active locations", async () => {
    const second = await BranchModel.create({ organizationId: org, name: "Otra sede" });
    try {
      const missing = await admin(request(app).post("/api/check-in/authorize")).send({});
      expect(missing.status).toBe(409);
      expect(missing.body.details.branches.map((item: { id: string }) => item.id)).toContain(String(second._id));
      const selected = await admin(request(app).post("/api/check-in/authorize")).send({ branchId: String(second._id) });
      expect(selected.status).toBe(200); expect(selected.body.branchId).toBe(String(second._id));
    } finally { await BranchModel.deleteOne({ _id: second._id }); }
  });
  it("requires a device, uses one-time activation and never returns its secret", async () => {
    expect((await request(app).post("/api/check-in/scan").send({ qr: "x" })).status).toBe(401);
    const kiosk = await device();
    expect((await request(app).post("/api/check-in/activate").send({ code: kiosk.activationCode })).status).toBe(401);
    expect(kiosk.cookie.join(" ")).toContain("HttpOnly"); expect(kiosk.cookie.join(" ")).toContain("SameSite=Strict");
    const status = await kiosk.agent.get("/api/check-in/device"); expect(status.body).not.toHaveProperty("sessionHash");
    expect((await kiosk.agent.get("/api/admin/contacts")).status).toBe(401);
  });
  it("stores only hashes and rejects invalid/revoked QR credentials", async () => {
    const s = await scenario(), kiosk = await device();
    const stored = await CheckInCredentialModel.findOne({ contactId: s.contact._id }).select("+tokenHash");
    expect(stored?.tokenHash).not.toContain(s.qr.slice(12));
    expect((await kiosk.agent.post("/api/check-in/scan").send({ qr: "not-a-qr" })).status).toBe(401);
    await rotateCredential(actor(), String(s.contact._id), true);
    expect((await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr })).status).toBe(401);
    expect(await ClassAttendanceModel.countDocuments({ studentId: s.contact._id, status: "PRESENT" })).toBe(0);
  });
  it("automatically registers the only eligible class and exposes no financial amount", async () => {
    const s = await scenario(), kiosk = await device();
    const result = await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr });
    expect(result.status).toBe(200); expect(result.body.kind).toBe("SUCCESS");
    expect(result.body.financialNotice).toContain("pago pendiente");
    expect(JSON.stringify(result.body)).not.toMatch(/5000|500000|Cents|email|studentId/);
    expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(1);
    const row = await ClassAttendanceModel.findOne({ studentId: s.contact._id }); expect(row).toMatchObject({ origin: "KIOSK", status: "PRESENT" });
    expect(String(row?.deviceId)).toBe(kiosk.id);
    const retry = await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr }); expect(retry.body.kind).toBe("WARNING");
    expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(1);
  });
  it("serializes two devices scanning the same person", async () => {
    const s = await scenario(), a = await device(), b = await device();
    const results = await Promise.all([a.agent, b.agent].map((agent) => agent.post("/api/check-in/scan").send({ qr: s.qr })));
    expect(results.map((item) => item.body.kind).sort()).toEqual(["SUCCESS", "WARNING"]);
    expect(await ClassAttendanceModel.countDocuments({ studentId: s.contact._id, status: "PRESENT" })).toBe(1);
    expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(1);
  });
  it.each(["MONTHLY", "FREE"] as const)("does not charge an additional class for %s", async (mode) => {
    const s = await scenario(mode), kiosk = await device();
    if (mode === "MONTHLY") await generateMonthlyCharges(actor(), "2026-10", { studentIds: [s.contact._id] });
    expect((await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr })).body.kind).toBe("SUCCESS");
    expect(await ChargeModel.countDocuments({ studentId: s.contact._id, kind: "CLASS_FEE" })).toBe(0);
  });
  it("lets a contact attend a trial, keeps the QR at conversion and cannot reopen the benefit", async () => {
    const s = await scenario("PER_CLASS", false), kiosk = await device();
    const trial = await bookTrial(actor(), { contactId: String(s.contact._id), sessionId: String(s.session._id) });
    expect((await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr })).body.kind).toBe("SUCCESS");
    expect(await StudentModel.exists({ _id: s.contact._id })).toBeNull();
    await convertTrial(actor(), String(trial._id), {});
    expect((await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr })).body.kind).toBe("WARNING");
    expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(0);
  });
  it("offers several sessions, records only the selected one and permits a separate later check-in", async () => {
    const s = await scenario(), kiosk = await device();
    const second = await ClassSessionModel.create({ organizationId: org, branchId: branch, classId: s.danceClass._id, sessionDate: "2026-10-23", startTime: "18:15", endTime: "19:15" });
    const scan = await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr });
    expect(scan.body.kind).toBe("SELECT"); expect(scan.body.sessions).toHaveLength(2);
    expect(await ClassAttendanceModel.countDocuments({ studentId: s.contact._id })).toBe(0);
    const chosen = await kiosk.agent.post("/api/check-in/present").send({ qr: s.qr, sessionId: String(second._id) }); expect(chosen.body.kind).toBe("SUCCESS");
    expect(await ClassAttendanceModel.countDocuments({ studentId: s.contact._id, status: "PRESENT" })).toBe(1);
    const later = await kiosk.agent.post("/api/check-in/present").send({ qr: s.qr, sessionId: String(s.session._id) }); expect(later.body.kind).toBe("SUCCESS");
    expect(await ChargeModel.countDocuments({ studentId: s.contact._id })).toBe(2);
  });
  it("rejects sessions outside the configured window and cancelled sessions", async () => {
    const s = await scenario(), kiosk = await device();
    vi.setSystemTime(new Date("2026-10-23T20:14:00Z"));
    expect((await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr })).status).toBe(422);
    vi.setSystemTime(new Date("2026-10-23T21:00:00Z"));
    await ClassSessionModel.updateOne({ _id: s.session._id }, { $set: { status: "CANCELLED" } });
    expect((await kiosk.agent.post("/api/check-in/present").send({ qr: s.qr, sessionId: String(s.session._id) })).status).toBe(422);
  });
  it("rejects revoked and expired devices, other branches and foreign origins", async () => {
    const s = await scenario(), kiosk = await device();
    expect((await kiosk.agent.post("/api/check-in/scan").set("Origin", "https://foreign.example").send({ qr: s.qr })).status).toBe(403);
    const otherBranch = await BranchModel.create({ organizationId: org, name: "Otra sede" }); const other = await device(otherBranch._id);
    expect((await other.agent.post("/api/check-in/scan").send({ qr: s.qr })).status).toBe(422);
    await admin(request(app).post(`/api/admin/check-in/devices/${kiosk.id}/revoke`));
    expect((await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr })).status).toBe(401);
    await CheckInDeviceModel.updateOne({ _id: other.id }, { $set: { sessionExpiresAt: new Date("2026-10-23T20:59:00Z") } });
    expect((await other.agent.get("/api/check-in/device")).status).toBe(401);
  });
  it("appends a valid late enrollment to the frozen roster and preserves its original rows", async () => {
    const s = await scenario(), kiosk = await device();
    const old = await ContactModel.create({ organizationId: org, branchId: branch, firstName: "Otra", lastName: "Persona" });
    await ClassAttendanceModel.create({ organizationId: org, sessionId: s.session._id, studentId: old._id, participantType: "AUTHORIZED", status: "EXPECTED" });
    await freezeRoster(String(org), s.session);
    // Simulate the profile joining after the freeze, rather than recomputing the historical snapshot.
    await ClassAttendanceModel.deleteOne({ sessionId: s.session._id, studentId: s.contact._id });
    const result = await kiosk.agent.post("/api/check-in/scan").send({ qr: s.qr }); expect(result.body.kind).toBe("SUCCESS");
    expect((await ClassAttendanceModel.findOne({ sessionId: s.session._id, studentId: old._id }))?.status).toBe("EXPECTED");
    expect(await ClassAttendanceModel.countDocuments({ sessionId: s.session._id })).toBe(2);
  });
  it("evaluates Argentina days and configurable inclusive boundaries", () => {
    const session = { sessionDate: "2026-10-23", startTime: "18:00", endTime: "19:00", status: "SCHEDULED" }, settings = { beforeMinutes: 45, afterMinutes: 20 };
    expect(withinCheckInWindow(session, settings, new Date("2026-10-23T20:15:00Z"))).toBe(true);
    expect(withinCheckInWindow(session, settings, new Date("2026-10-23T21:20:00Z"))).toBe(true);
    expect(withinCheckInWindow(session, settings, new Date("2026-10-23T21:20:01Z"))).toBe(false);
    expect(withinCheckInWindow(session, { beforeMinutes: 5, afterMinutes: 5 }, new Date("2026-10-23T20:15:00Z"))).toBe(false);
  });
});
