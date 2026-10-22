import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());
const mailFailureMessage = vi.hoisted(() => vi.fn(() => "No se pudo enviar el correo. Intentá nuevamente más tarde."));
const uploadPrivateBuffer = vi.hoisted(() => vi.fn());
vi.mock("../../services/mailer", () => ({ sendEmail, mailFailureMessage }));
vi.mock("../../services/cloudinary", () => ({
  uploadPrivateBuffer,
  privateAssetUrl: () => "https://signed.example/proof?expires=300"
}));

import { createApp } from "../../app";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { UserModel } from "../auth/user.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { ChargeModel } from "./charge.model";
import { CollectionModel } from "./collection.model";

/**
 * A collection registered by mistake is voided, never deleted: it leaves every total, the money
 * applied to its charges is released and the receipt stays on record marked as voided.
 * Also covers the mid-month switch to monthly (plan + first-month decision).
 */

const NOW = "2026-10-07T15:00:00.000Z";
const app = createApp();
let database: { stop: () => Promise<void> };
let token: string;
let counter = 0;
const ids = {} as Record<string, Types.ObjectId>;

const admin = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);
const key = () => `key-${Date.now()}-${++counter}-abcdefgh`;

async function setup() {
  const danceClass = await DanceClassModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    name: `Grupo ${++counter}`,
    professorIds: [],
    capacity: 20,
    billingMode: "BOTH",
    status: "ACTIVE",
    pricePerClass: 8000,
    monthlyPrice: 30000,
    monthlyPrice4: 30000,
    monthlyPrice8: 50000,
    schedules: []
  });
  const student = await StudentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    firstName: `Alumno${++counter}`,
    lastName: "Test",
    isActive: true
  });
  const enrollment = await EnrollmentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    classId: danceClass._id,
    studentId: student._id,
    status: "ACTIVE",
    billingPreference: "PER_CLASS",
    billingChanges: [{ effectiveDate: "2026-09-01", mode: "PER_CLASS" }],
    periods: [{ startDate: "2026-09-01" }],
    enrolledAt: new Date("2026-09-01T12:00:00.000Z")
  });
  return { danceClass, student, enrollment };
}

async function charge(studentId: Types.ObjectId, amount = 8000) {
  const response = await admin(request(app).post("/api/admin/billing/charges")).send({
    studentId: String(studentId),
    kind: "OTHER",
    period: "2026-10",
    concept: "Matrícula",
    amount,
    dueDate: "2026-10-05"
  });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function collect(studentId: Types.ObjectId, chargeId: string, amount: number, allocated = amount) {
  const response = await admin(request(app).post("/api/admin/billing/collections")).send({
    studentId: String(studentId),
    amount,
    method: "CASH",
    allocations: [{ chargeId, amount: allocated }],
    idempotencyKey: key()
  });
  expect(response.status).toBe(201);
  return response.body.collection.id as string;
}

const cash = async () =>
  (await admin(request(app).get("/api/admin/billing/cash?from=2026-10-01&to=2026-10-31"))).body as { collected: number };
const account = async (studentId: Types.ObjectId) =>
  (await admin(request(app).get(`/api/admin/billing/students/${studentId}/account`))).body;

beforeAll(async () => {
  database = await startReplicaSet();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(NOW));
  const org = await OrganizationModel.create({ name: "Academia", slug: `void-${Date.now()}` });
  const branch = await BranchModel.create({ organizationId: org._id, name: "La Plata" });
  const user = await UserModel.create({
    organizationId: org._id,
    email: "admin-void@example.com",
    passwordHash: "x",
    firstName: "Ada",
    lastName: "Admin",
    role: "ADMIN"
  });
  Object.assign(ids, { org: org._id, branch: branch._id, admin: user._id });
  token = jwt.sign({ sub: String(user._id), organizationId: String(org._id), role: "ADMIN" }, env.JWT_ACCESS_SECRET);
}, 120_000);

beforeEach(() => {
  vi.setSystemTime(new Date(NOW));
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(undefined);
  uploadPrivateBuffer.mockReset();
  uploadPrivateBuffer.mockResolvedValue({ public_id: "mym/proof-1", resource_type: "image", format: "png" });
});

afterAll(async () => {
  vi.useRealTimers();
  await database.stop();
});

describe("POST /billing/collections/:id/void", () => {
  it("takes the collection out of cash, releases the charge and keeps the record", async () => {
    const { student } = await setup();
    const chargeId = await charge(student._id);
    const before = (await cash()).collected;
    const collectionId = await collect(student._id, chargeId, 8000);
    expect((await cash()).collected).toBe(before + 8000);
    expect((await ChargeModel.findById(chargeId))!.status).toBe("PAID");

    const voided = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "Cobrado al alumno equivocado" });
    expect(voided.status).toBe(201);
    expect(voided.body.collection).toMatchObject({ voided: true, voidReason: "Cobrado al alumno equivocado", amount: 8000, credit: 0, allocated: 0 });

    const released = await ChargeModel.findById(chargeId);
    expect(released).toMatchObject({ status: "OPEN", paidCents: 0, balanceCents: 800000 });
    expect((await cash()).collected).toBe(before);

    const stored = await CollectionModel.findById(collectionId);
    expect(stored).toMatchObject({ allocatedCents: 0 });
    expect(stored!.receiptNumber).toBeTruthy();
    expect(String(stored!.voidedByUserId)).toBe(String(ids.admin));

    const view = await account(student._id);
    const row = view.collections.find((item: { id: string }) => item.id === collectionId);
    expect(row.voided).toBe(true);
    expect(view.balance.credit).toBe(0);
    expect(view.charges.find((item: { id: string }) => item.id === chargeId).lastCollection).toBeNull();

    const pdf = await admin(request(app).get(`/api/admin/billing/collections/${collectionId}/receipt.pdf`));
    expect(pdf.status).toBe(200);
  });

  it("is harmless when repeated and refuses to email a voided receipt", async () => {
    const { student } = await setup();
    await StudentModel.updateOne({ _id: student._id }, { $set: { email: "alumno@example.com" } });
    const chargeId = await charge(student._id);
    const collectionId = await collect(student._id, chargeId, 8000);
    const first = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "Error de carga" });
    const again = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "Error de carga" });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect((await ChargeModel.findById(chargeId))!.paidCents).toBe(0);

    const email = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/receipt/email`));
    expect(email.status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("also removes the debt when the charge itself was a mistake", async () => {
    const { student } = await setup();
    const chargeId = await charge(student._id);
    const collectionId = await collect(student._id, chargeId, 8000);
    const response = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "Cargo equivocado", voidCharges: true });
    expect(response.status).toBe(201);
    expect(await ChargeModel.findById(chargeId)).toMatchObject({ status: "VOID", balanceCents: 0 });
    expect((await account(student._id)).balance.pending).toBe(0);
  });

  it("drops unapplied credit of the voided collection from the balance", async () => {
    const { student } = await setup();
    const chargeId = await charge(student._id);
    const collectionId = await collect(student._id, chargeId, 10000, 8000);
    expect((await account(student._id)).balance.credit).toBe(2000);
    await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "Importe mal cargado" });
    expect((await account(student._id)).balance.credit).toBe(0);
  });

  it("refuses to void a collection that already has refunds, and asks for a reason", async () => {
    const { student } = await setup();
    const chargeId = await charge(student._id);
    const collectionId = await collect(student._id, chargeId, 10000, 8000);
    const refund = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/refunds`)).send({ amount: 1000, reason: "Devolución", method: "CASH" });
    expect(refund.status).toBe(201);

    const blocked = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "Error" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("COLLECTION_HAS_REFUNDS");
    expect((await CollectionModel.findById(collectionId))!.voidedAt).toBeUndefined();

    const noReason = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "" });
    expect(noReason.status).toBe(400);
  });

  it("does not allow refunds or credit application on a voided collection", async () => {
    const { student } = await setup();
    const chargeId = await charge(student._id);
    const collectionId = await collect(student._id, chargeId, 10000, 8000);
    await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "Error de carga" });
    const refund = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/refunds`)).send({ amount: 1000, reason: "Devolución", method: "CASH" });
    expect(refund.status).toBe(409);
    const credit = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/apply-credit`)).send({ chargeId, amount: 1000 });
    expect(credit.status).toBe(409);
  });
});

describe("switching to monthly in the middle of the month", () => {
  it("stores the plan and creates the first month with the administrator's decision", async () => {
    const { student, enrollment } = await setup();
    const switched = await admin(request(app).patch(`/api/admin/enrollments/${enrollment._id}/billing-preference`)).send({ billingPreference: "MONTHLY", monthlyPlan: 8 });
    expect(switched.status).toBe(200);
    expect(switched.body.monthlyPlan).toBe(8);
    expect(switched.body.monthlyCharge).toMatchObject({ period: "2026-10", needsDecision: true, ready: false });

    // Without the decision the fee cannot be created.
    const undecided = await admin(request(app).post(`/api/admin/billing/enrollments/${enrollment._id}/monthly-charge`)).send({ period: "2026-10" });
    expect(undecided.status).toBe(422);
    expect(undecided.body.error).toBe("MONTHLY_CHARGE_NEEDS_DECISION");

    const decided = await admin(request(app).post(`/api/admin/billing/enrollments/${enrollment._id}/monthly-charge`)).send({ period: "2026-10", policy: "CUSTOM", customAmount: 15000 });
    expect(decided.status).toBe(201);
    expect(decided.body).toMatchObject({ kind: "MONTHLY_FEE", amount: 15000, listAmount: 50000, joinPolicy: "CUSTOM" });
    expect(await ChargeModel.countDocuments({ studentId: student._id, kind: "MONTHLY_FEE", status: "OPEN" })).toBe(1);

    // The same decision cannot create a second fee for the month.
    const again = await admin(request(app).post(`/api/admin/billing/enrollments/${enrollment._id}/monthly-charge`)).send({ period: "2026-10", policy: "FULL" });
    expect(again.status).toBe(409);
  });

  it("lists the enrollments waiting for a decision in the monthly preview", async () => {
    const { student, enrollment } = await setup();
    await admin(request(app).patch(`/api/admin/enrollments/${enrollment._id}/billing-preference`)).send({ billingPreference: "MONTHLY", monthlyPlan: 4 });
    const preview = await admin(request(app).get("/api/admin/billing/monthly/2026-10/preview"));
    expect(preview.status).toBe(200);
    const row = preview.body.items.find((item: { studentId: string }) => item.studentId === String(student._id));
    expect(row).toMatchObject({ status: "NEEDS_DECISION", enrollmentId: String(enrollment._id) });
  });
});

describe("transfer proof", () => {
  it("attaches a proof to a collection and serves a short-lived link", async () => {
    const { student } = await setup();
    const chargeId = await charge(student._id);
    const collectionId = await collect(student._id, chargeId, 8000);

    const missing = await admin(request(app).get(`/api/admin/billing/collections/${collectionId}/proof`));
    expect(missing.status).toBe(404);

    const upload = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/proof`)).attach("file", Buffer.from("png-bytes"), {
      filename: "comprobante.png",
      contentType: "image/png"
    });
    expect(upload.status).toBe(200);
    expect(uploadPrivateBuffer).toHaveBeenCalledTimes(1);

    const link = await admin(request(app).get(`/api/admin/billing/collections/${collectionId}/proof`));
    expect(link.body.url).toContain("signed.example");
    const list = await admin(request(app).get(`/api/admin/billing/collections?studentId=${student._id}`));
    expect(list.body.items[0].hasProof).toBe(true);
  });

  it("rejects files that are not an image or a PDF, and a missing file", async () => {
    const { student } = await setup();
    const chargeId = await charge(student._id);
    const collectionId = await collect(student._id, chargeId, 8000);
    const text = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/proof`)).attach("file", Buffer.from("hola"), {
      filename: "nota.txt",
      contentType: "text/plain"
    });
    expect(text.status).toBe(415);
    const none = await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/proof`));
    expect(none.status).toBe(422);
    expect(uploadPrivateBuffer).not.toHaveBeenCalled();
  });
});

describe("a voided collection leaves every report", () => {
  const range = "from=2026-10-01&to=2026-10-31";
  const overview = async () => (await admin(request(app).get(`/api/admin/reports/overview?${range}`))).body;
  const summary = async () => (await admin(request(app).get("/api/admin/summary"))).body;
  const studentView = async (studentId: Types.ObjectId) => (await admin(request(app).get(`/api/admin/students/${studentId}`))).body;

  it("drops it from cash, summary and the student's paid total, and reopens the charge as owed", async () => {
    const { student } = await setup();
    const chargeId = await charge(student._id);
    const baseline = await overview();
    const baselineSummary = await summary();
    const collectionId = await collect(student._id, chargeId, 8000);

    const paid = await overview();
    expect(paid.cash.collectedAmount).toBe(baseline.cash.collectedAmount + 8000);
    expect(paid.cash.paidCount).toBe(baseline.cash.paidCount + 1);
    expect((await summary()).collectedAmount).toBe(baselineSummary.collectedAmount + 8000);
    expect((await studentView(student._id)).financial.paidAmount).toBe(8000);

    await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "Error de carga" });

    const voided = await overview();
    expect(voided.cash.collectedAmount).toBe(baseline.cash.collectedAmount);
    expect(voided.cash.paidCount).toBe(baseline.cash.paidCount);
    expect(voided.cash.netAmount).toBe(baseline.cash.netAmount);
    // The charge exists again and, past its due date (2026-10-05), it is overdue.
    expect(voided.billing.issued.totalAmount).toBe(baseline.billing.issued.totalAmount);
    expect(voided.billing.issued.overdueAmount).toBe(baseline.billing.issued.overdueAmount);
    expect((await summary()).collectedAmount).toBe(baselineSummary.collectedAmount);
    expect((await studentView(student._id)).financial.paidAmount).toBe(0);

    const excel = await admin(request(app).get(`/api/admin/reports/export.xlsx?${range}`)).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
    expect(excel.status).toBe(200);
  });

  it("also drops the billed amount when the charge was removed with the collection", async () => {
    const { student } = await setup();
    const chargeId = await charge(student._id);
    const collectionId = await collect(student._id, chargeId, 8000);
    const before = await overview();
    await admin(request(app).post(`/api/admin/billing/collections/${collectionId}/void`)).send({ reason: "Cargo equivocado", voidCharges: true });
    const after = await overview();
    expect(after.cash.collectedAmount).toBe(before.cash.collectedAmount - 8000);
    expect(after.billing.issued.totalAmount).toBe(before.billing.issued.totalAmount - 8000);
    expect(after.billing.issued.overdueAmount).toBe(before.billing.issued.overdueAmount);
  });
});
