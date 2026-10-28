import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { academyNow, periodOf, weekDayFor } from "../../common/dates";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { AuditLogModel } from "../audit/audit-log.model";
import { UserModel } from "../auth/user.model";
import { ChargeModel } from "../billing/charge.model";
import { CollectionModel } from "../billing/collection.model";
import { PaymentAllocationModel } from "../billing/payment-allocation.model";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { DanceClassModel } from "../classes/class.model";
import { ContactModel } from "../contacts/contact.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { CheckInDeviceModel } from "../check-in/check-in.models";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ProfessorModel } from "../professors/professor.model";
import { generateSessions } from "../scheduling/session-generator";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";
import { TrialBookingModel } from "../trials/trial-booking.model";

const app = createApp();
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const databaseName = `qa_mym_${runId}`;
let database: Awaited<ReturnType<typeof startReplicaSet>>;
let organizationId: string, branchId: string, token: string;
const admin = (call: request.Test) => call.set("Authorization", `Bearer ${token}`);

beforeAll(async () => {
  database = await startReplicaSet(databaseName);
  expect(database.databaseName).toBe(databaseName);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
  const organization = await OrganizationModel.create({ name: `Academia QA ${runId}`, slug: `qa-${runId}` });
  const branch = await BranchModel.create({ organizationId: organization._id, name: `Sede QA ${runId}` });
  const user = await UserModel.create({ organizationId: organization._id, branchIds: [branch._id], email: `admin-${runId}@example.test`,
    passwordHash: "isolated-qa-only", firstName: "Admin", lastName: "Ficticio", role: "ADMIN" });
  organizationId = String(organization._id);
  branchId = String(branch._id);
  token = jwt.sign({ sub: String(user._id), organizationId, role: "ADMIN" }, env.JWT_ACCESS_SECRET);
}, 120_000);

afterAll(async () => {
  vi.useRealTimers();
  if (database) await database.stop(); // The replica set owns this named QA database exclusively.
});

it("runs prospect → trial → conversion → monthly collection and per-class reception on isolated records", async () => {
  const today = academyNow().date, period = periodOf(today), day = weekDayFor(today);
  const disciplines = ["Bachata", "Femme Heels", "Reggaetón", "Full Body"];
  const catalogs = await CatalogItemModel.create([
    ...disciplines.map((name) => ({ organizationId, type: "DISCIPLINE", name, normalizedName: `${name.toLowerCase()}-${runId}` })),
    { organizationId, type: "SEGMENT", name: "Adultos QA", normalizedName: `adultos-${runId}` },
    { organizationId, type: "LEVEL", name: "Inicial QA", normalizedName: `inicial-${runId}` }
  ]);
  const professors = [];
  for (let index = 0; index < 4; index++) {
    const created = await admin(request(app).post("/api/admin/professors")).send({ branchIds: [branchId], disciplineIds: [String(catalogs[index]._id)],
      email: `prof-${index}-${runId}@example.test`, password: "QALocalOnly-1234", firstName: "Docente", lastName: `Ficticio${index}`,
      displayName: `${disciplines[index]} QA ${runId}` });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    professors.push(created.body);
  }
  expect(await ProfessorModel.countDocuments({ organizationId })).toBe(4);
  const edited = await admin(request(app).patch(`/api/admin/professors/${professors[3]._id}`)).send({ bioShort: "Clase funcional de prueba" });
  expect(edited.status).toBe(200);
  const classes = [];
  for (let index = 0; index < 4; index++) {
    const hour = String(18 + index).padStart(2, "0");
    const created = await admin(request(app).post("/api/admin/classes")).send({ branchId, name: `${disciplines[index]} QA ${runId}`,
      professorIds: [professors[index]._id], disciplineIds: [String(catalogs[index]._id)], segmentIds: [String(catalogs[4]._id)],
      levelIds: [String(catalogs[5]._id)], capacity: index === 2 ? 2 : 12, billingMode: index === 1 ? "PER_CLASS" : "BOTH",
      pricePerClass: 8000, monthlyPrice: 30000, freeTrialEnabled: true,
      schedules: [{ day, startTime: `${hour}:00`, endTime: `${String(19 + index).padStart(2, "0")}:00` }] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    classes.push(created.body);
  }
  expect((await generateSessions(organizationId, { from: today, to: today })).created).toBe(4);
  expect((await generateSessions(organizationId, { from: today, to: today })).created).toBe(0);
  const sessions = await ClassSessionModel.find({ organizationId, sessionDate: today });
  expect(sessions).toHaveLength(4);
  const sessionFor = (index: number) => sessions.find((item) => String(item.classId) === String(classes[index]._id))!;

  const sources = ["INSTAGRAM", "WHATSAPP", "WEBSITE", "RECEPTION", "INSTAGRAM", "WHATSAPP", "WEBSITE", "RECEPTION"];
  const contacts = [];
  for (let index = 0; index < 8; index++) {
    const created = await admin(request(app).post("/api/admin/contacts")).send({ branchId, firstName: "Interesado", lastName: `QA${runId}${index}`,
      email: `contact-${index}-${runId}@example.test`, source: { platform: sources[index] },
      creationKey: `qa-contact-${runId}-${index}` });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    contacts.push(created.body);
  }
  expect(await StudentModel.countDocuments({ organizationId })).toBe(0);
  const duplicate = await admin(request(app).post("/api/admin/contacts")).send({ branchId, firstName: "Interesado", lastName: `QA${runId}0`,
    email: `contact-0-${runId}@example.test`, creationKey: `qa-duplicate-${runId}` });
  expect(duplicate.status).toBe(409);
  expect(await ContactModel.countDocuments({ organizationId })).toBe(8);
  const search = await admin(request(app).get("/api/admin/contacts")).query({ q: `QA${runId}0` });
  expect(search.body.items.map((item: { _id: string }) => item._id)).toEqual([contacts[0]._id]);
  const editedContact = await admin(request(app).patch(`/api/admin/contacts/${contacts[0]._id}`)).send({ notes: "Interés en clase gratuita" });
  expect(editedContact.status).toBe(200);

  const trial = await admin(request(app).post("/api/admin/trials")).send({ contactId: contacts[0]._id, sessionId: String(sessionFor(0)._id) });
  expect(trial.status, JSON.stringify(trial.body)).toBe(201);
  expect(await StudentModel.exists({ _id: contacts[0]._id })).toBeNull();
  const presentTrial = await admin(request(app).patch(`/api/admin/trials/${trial.body._id}`)).send({ status: "COMPLETED" });
  expect(presentTrial.status, JSON.stringify(presentTrial.body)).toBe(200);
  expect(await ChargeModel.countDocuments({ studentId: contacts[0]._id })).toBe(0);
  const unconverted = await admin(request(app).post("/api/admin/trials")).send({ contactId: contacts[1]._id, sessionId: String(sessionFor(2)._id) });
  expect(unconverted.status).toBe(201);
  expect((await admin(request(app).patch(`/api/admin/trials/${unconverted.body._id}`)).send({ status: "COMPLETED" })).status).toBe(200);
  expect(await StudentModel.exists({ _id: contacts[1]._id })).toBeNull();
  expect(await ChargeModel.countDocuments({ studentId: contacts[1]._id })).toBe(0);
  const converted = await admin(request(app).post(`/api/admin/trials/${trial.body._id}/convert`)).send({ billingPreference: "MONTHLY" });
  expect(converted.status, JSON.stringify(converted.body)).toBe(200);
  const again = await admin(request(app).post(`/api/admin/trials/${trial.body._id}/convert`)).send({ billingPreference: "MONTHLY" });
  expect(again.status).toBe(200);
  expect(String(again.body.enrollment._id)).toBe(String(converted.body.enrollment._id));
  expect(await StudentModel.countDocuments({ _id: contacts[0]._id })).toBe(1);
  expect(await EnrollmentModel.countDocuments({ studentId: contacts[0]._id, classId: classes[0]._id })).toBe(1);
  expect((await TrialBookingModel.findById(trial.body._id))?.status).toBe("CONVERTED");

  const students = [];
  for (let index = 0; index < 9; index++) {
    const created = await admin(request(app).post("/api/admin/students")).send({ branchId, firstName: "Alumno", lastName: `QA${runId}${index}`,
      email: `student-${index}-${runId}@example.test` });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    students.push(created.body);
  }
  expect(await StudentModel.countDocuments({ organizationId })).toBe(10);
  const monthlyEnrollment = await admin(request(app).post("/api/admin/enrollments")).send({ classId: classes[0]._id,
    studentId: students[1]._id, billingPreference: "MONTHLY", startDate: today, joinPolicy: "FULL" });
  expect(monthlyEnrollment.status, JSON.stringify(monthlyEnrollment.body)).toBe(201);
  const perClassEnrollment = await admin(request(app).post("/api/admin/enrollments")).send({ classId: classes[1]._id,
    studentId: students[0]._id, billingPreference: "PER_CLASS", startDate: today });
  expect(perClassEnrollment.status, JSON.stringify(perClassEnrollment.body)).toBe(201);
  expect((await admin(request(app).post("/api/admin/enrollments")).send({ classId: classes[1]._id,
    studentId: students[0]._id, billingPreference: "PER_CLASS", startDate: today })).status).toBe(409);
  expect((await admin(request(app).post("/api/admin/enrollments")).send({ classId: classes[2]._id,
    studentId: students[1]._id, billingPreference: "PER_CLASS", startDate: today })).status).toBe(201);

  const firstMonth = await admin(request(app).post(`/api/admin/billing/enrollments/${converted.body.enrollment._id}/monthly-charge`))
    .send({ period, policy: "FULL" });
  expect(firstMonth.status, JSON.stringify(firstMonth.body)).toBe(201);
  const generated = await admin(request(app).post("/api/admin/billing/monthly/generate")).send({ period });
  expect(generated.status).toBe(200);
  expect((await admin(request(app).post("/api/admin/billing/monthly/generate")).send({ period })).body.created).toBe(0);
  expect(await ChargeModel.countDocuments({ organizationId, kind: "MONTHLY_FEE", period })).toBe(2);
  const convertedCharge = await ChargeModel.findOne({ studentId: contacts[0]._id, kind: "MONTHLY_FEE", period });
  expect(convertedCharge?.amountCents).toBe(3_000_000);
  const paid = await admin(request(app).post("/api/admin/billing/collections")).send({ studentId: contacts[0]._id, amount: 30000,
    method: "CASH", allocations: [{ chargeId: String(convertedCharge!._id), amount: 30000 }], idempotencyKey: `qa-monthly-${runId}` });
  expect(paid.status, JSON.stringify(paid.body)).toBe(201);
  expect((await admin(request(app).post("/api/admin/billing/collections")).send({ studentId: contacts[0]._id, amount: 30000,
    method: "CASH", allocations: [{ chargeId: String(convertedCharge!._id), amount: 30000 }], idempotencyKey: `qa-monthly-${runId}` })).body.replayed).toBe(true);
  expect((await ChargeModel.findById(convertedCharge!._id))?.balanceCents).toBe(0);
  const unpaidMonthly = await ChargeModel.findOne({ studentId: students[1]._id, kind: "MONTHLY_FEE", period });
  expect(unpaidMonthly?.balanceCents).toBe(3_000_000);
  const partial = await admin(request(app).post("/api/admin/billing/collections")).send({ studentId: students[1]._id, amount: 5000,
    method: "CASH", allocations: [{ chargeId: String(unpaidMonthly!._id), amount: 5000 }], idempotencyKey: `qa-partial-${runId}` });
  expect(partial.status).toBe(201);
  expect((await ChargeModel.findById(unpaidMonthly!._id))?.balanceCents).toBe(2_500_000);

  const access = await admin(request(app).post("/api/admin/check-in/access-code")).send({ branchId });
  expect(access.status).toBe(201);
  const tablet = request.agent(app);
  expect((await tablet.post("/api/check-in/activate").send({ code: access.body.activationCode })).status).toBe(200);
  expect((await tablet.get("/api/check-in/device")).status).toBe(200);
  const qr = await admin(request(app).post(`/api/admin/check-in/contacts/${students[0]._id}/credential/rotate`)).send({});
  expect(qr.status).toBe(200);
  const scanned = await tablet.post("/api/check-in/scan").send({ qr: qr.body.qr });
  expect(scanned.status, JSON.stringify(scanned.body)).toBe(200);
  expect(scanned.body.kind).toBe("SUCCESS");
  expect((await tablet.post("/api/check-in/scan").send({ qr: qr.body.qr })).body.kind).toBe("WARNING");
  expect(await ClassAttendanceModel.countDocuments({ studentId: students[0]._id, status: "PRESENT" })).toBe(1);
  const classCharge = await ChargeModel.findOne({ studentId: students[0]._id, kind: "CLASS_FEE" });
  expect(classCharge?.amountCents).toBe(800_000);
  expect(await ChargeModel.countDocuments({ studentId: students[0]._id, kind: "CLASS_FEE" })).toBe(1);
  const collected = await admin(request(app).post("/api/admin/billing/collections")).send({ studentId: students[0]._id,
    amount: 8000, method: "CASH", allocations: [{ chargeId: String(classCharge!._id), amount: 8000 }], idempotencyKey: `qa-class-${runId}` });
  expect(collected.status, JSON.stringify(collected.body)).toBe(201);
  expect((await ChargeModel.findById(classCharge!._id))?.balanceCents).toBe(0);
  const secondAccess = await admin(request(app).post("/api/admin/check-in/devices")).send({ branchId, name: `Tablet secundaria ${runId}` });
  expect(secondAccess.status).toBe(201);
  const secondTablet = request.agent(app);
  expect((await secondTablet.post("/api/check-in/activate").send({ code: secondAccess.body.activationCode })).status).toBe(200);
  expect((await secondTablet.get("/api/check-in/device")).status).toBe(200);
  const reception = await admin(request(app).get("/api/admin/check-in/reception")).query({ date: today });
  expect(reception.body.arrivals.some((row: { studentId: string }) => row.studentId === students[0]._id)).toBe(true);
  const detail = await admin(request(app).get(`/api/admin/students/${students[0]._id}`));
  expect(detail.body.financial.paidAmount).toBe(8000);
  expect(detail.body.financial.openCount).toBe(0);
  const pendingList = await admin(request(app).get("/api/admin/billing/charges")).query({ studentId: students[1]._id, period });
  expect(pendingList.body.items[0].balance).toBe(25000);
  const professorToken = jwt.sign({ sub: String((await ProfessorModel.findById(professors[0]._id))!.userId), organizationId, role: "PROFESSOR" }, env.JWT_ACCESS_SECRET);
  expect((await request(app).post("/api/admin/billing/collections").set("Authorization", `Bearer ${professorToken}`).send({})).status).toBe(403);
  expect((await tablet.get("/api/admin/students")).status).toBe(401);
  const devices = await admin(request(app).get("/api/admin/check-in/devices"));
  expect(devices.body.items.find((item: { id: string }) => item.id === access.body.deviceId).accessState).toBe("ACTIVE");
  expect(JSON.stringify(devices.body)).not.toContain(access.body.activationCode);
  expect((await admin(request(app).post("/api/admin/check-in/access-code/revoke")).send({ branchId })).status).toBe(204);
  expect((await tablet.post("/api/check-in/scan").send({ qr: qr.body.qr })).status).toBe(401);
  expect((await secondTablet.get("/api/check-in/device")).status).toBe(401);
  expect((await admin(request(app).get("/api/admin/check-in/devices"))).body.items.filter((item: { accessState: string }) => item.accessState === "REVOKED")).toHaveLength(2);
  expect(await CollectionModel.countDocuments({ organizationId })).toBe(3);
  expect(await PaymentAllocationModel.countDocuments({ organizationId })).toBe(3);
  expect(await AuditLogModel.countDocuments({ organizationId })).toBeGreaterThan(0);
  expect(await DanceClassModel.countDocuments({ organizationId })).toBe(4);
  expect(await ContactModel.countDocuments({ organizationId, _id: { $in: contacts.map((item) => item._id) } })).toBe(8);
  expect(await StudentModel.countDocuments({ organizationId, contactId: { $exists: false } })).toBe(0);
  expect((await ContactModel.findById(contacts[0]._id))?.source.platform).toBe("INSTAGRAM");
  for (const enrollment of await EnrollmentModel.find({ organizationId })) {
    expect(await StudentModel.exists({ _id: enrollment.studentId, organizationId })).toBeTruthy();
    expect(await DanceClassModel.exists({ _id: enrollment.classId, organizationId })).toBeTruthy();
  }
  for (const attendance of await ClassAttendanceModel.find({ organizationId })) {
    expect(await ClassSessionModel.exists({ _id: attendance.sessionId, organizationId })).toBeTruthy();
    expect(await ContactModel.exists({ _id: attendance.studentId, organizationId })).toBeTruthy();
  }
  for (const allocation of await PaymentAllocationModel.find({ organizationId })) {
    expect(await ChargeModel.exists({ _id: allocation.chargeId, organizationId })).toBeTruthy();
    expect(await CollectionModel.exists({ _id: allocation.collectionId, organizationId })).toBeTruthy();
  }
  expect(await CheckInDeviceModel.countDocuments({ organizationId, revokedAt: { $exists: true } })).toBe(2);
}, 90_000);
