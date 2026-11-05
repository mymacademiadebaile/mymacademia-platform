/**
 * Regressions for the findings recorded while producing the admin video tutorial
 * (docs/tutorials/ADMIN_FUNCTIONAL_INVENTORY.md §15).
 */
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { academyNow, periodOf } from "../../common/dates";
import { samePhoneDigits } from "../../common/regex";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { AuditLogModel } from "../audit/audit-log.model";
import { ChargeModel } from "../billing/charge.model";
import { DanceClassModel } from "../classes/class.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { ContactModel } from "../contacts/contact.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { StudentModel } from "../students/student.model";

const app = createApp();
let database: Awaited<ReturnType<typeof startReplicaSet>>;
let organizationId: Types.ObjectId;
let branchId: Types.ObjectId;
let token: string;
let counter = 0;

const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

/** Student + contact sharing the same _id, as created by the admin. */
async function person(fields: { phone?: string; email?: string; marketing?: boolean } = {}) {
  const _id = new Types.ObjectId();
  const n = ++counter;
  await ContactModel.create({
    _id, organizationId, branchId, firstName: `Persona${n}`, lastName: "Test", phone: fields.phone, email: fields.email,
    preferences: { emailReminders: true, marketing: fields.marketing ?? false }
  });
  await StudentModel.create({ _id, contactId: _id, organizationId, branchId, firstName: `Persona${n}`, lastName: "Test",
    phone: fields.phone, email: fields.email });
  return _id;
}

beforeAll(async () => {
  database = await startReplicaSet();
  const organization = await OrganizationModel.create({ name: "Test", slug: "tutorial-findings-test" });
  organizationId = organization._id;
  branchId = (await BranchModel.create({ organizationId, name: "Centro" }))._id;
  token = jwt.sign({ sub: String(new Types.ObjectId()), organizationId: String(organizationId), role: "ADMIN" }, env.JWT_ACCESS_SECRET);
}, 120000);

afterAll(async () => { await database.stop(); });

describe("samePhoneDigits", () => {
  it("matches the same number regardless of spaces, dashes or a plus sign", () => {
    const pattern = new RegExp(samePhoneDigits("2215550122").$regex);
    expect(pattern.test("221 555-0122")).toBe(true);
    expect(pattern.test("+2215550122")).toBe(true);
    expect(pattern.test("2215550123")).toBe(false);
    expect(pattern.test("22155501222")).toBe(false);
  });
});

describe("POST /admin/contacts duplicate phone", () => {
  it("rejects a contact whose phone belongs to a student saved with formatting", async () => {
    const _id = new Types.ObjectId();
    await StudentModel.create({ _id, contactId: _id, organizationId, branchId, firstName: "Camila", lastName: "Formato", phone: "221 555-0177" });

    const response = await auth(request(app).post("/api/admin/contacts")).send({
      branchId: String(branchId), firstName: "Otra", lastName: "Persona", phone: "2215550177", dni: "49999101",
      creationKey: new Types.ObjectId().toHexString()
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("CONTACT_MATCH_REQUIRES_REVIEW");
  });
});

describe("POST /admin/communications/preview marketing preference", () => {
  it("sends mass emails only to people who accepted promotions, unless turned off", async () => {
    await person({ email: `si${counter}@example.com`, marketing: true });
    await person({ email: `no${counter}@example.com`, marketing: false });

    const respected = await auth(request(app).post("/api/admin/communications/preview")).send({ audience: "ALL" });
    const institutional = await auth(request(app).post("/api/admin/communications/preview")).send({ audience: "ALL", marketingOnly: false });

    expect(respected.status).toBe(200);
    expect(institutional.body.recipients).toBe(respected.body.recipients + 1);
    expect(respected.body.sample.every((item: { email: string }) => item.email.startsWith("si"))).toBe(true);
  });
});

describe("GET /admin/audit search", () => {
  it("finds actions by their Spanish label", async () => {
    await AuditLogModel.create([
      { organizationId, actorUserId: new Types.ObjectId(), action: "COLLECTION_VOIDED", entityType: "Collection", entityId: new Types.ObjectId() },
      { organizationId, actorUserId: new Types.ObjectId(), action: "CLASS_CREATED", entityType: "DanceClass", entityId: new Types.ObjectId() }
    ]);

    const response = await auth(request(app).get("/api/admin/audit?q=cobro%20anulado&limit=50"));

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { action: string }) => item.action)).toEqual(["COLLECTION_VOIDED"]);
  });
});

describe("Alta a mitad de mes", () => {
  async function enrollMidMonth(policy: "ASK" | "FULL") {
    await OrganizationModel.updateOne({ _id: organizationId }, { $set: { "billing.midMonthPolicy": policy } });
    const danceClass = await DanceClassModel.create({
      organizationId, branchId, name: `Mensual ${++counter}`, professorIds: [new Types.ObjectId()], capacity: 20,
      billingMode: "MONTHLY", monthlyPrice: 25000, monthlyPrice4: 25000,
      schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]
    });
    const studentId = await person();
    const period = periodOf(academyNow().date);
    return {
      danceClass,
      studentId,
      response: await auth(request(app).post("/api/admin/enrollments")).send({
        classId: String(danceClass._id), studentId: String(studentId), startDate: `${period}-15`
      })
    };
  }

  it("asks for a decision when the academy rule is ASK", async () => {
    const { response } = await enrollMidMonth("ASK");
    expect(response.status).toBe(201);
    expect(response.body.firstMonth?.needsDecision).toBe(true);
  });

  it("applies the academy rule when it is a fixed policy", async () => {
    const { response, danceClass, studentId } = await enrollMidMonth("FULL");
    expect(response.status).toBe(201);
    expect(response.body.firstMonth?.needsDecision).toBe(false);
    const charge = await ChargeModel.findOne({ organizationId, classId: danceClass._id, studentId, kind: "MONTHLY_FEE" }).lean<any>();
    expect(charge?.joinPolicy).toBe("FULL");
    expect(charge?.amountCents).toBe(2500000);
  });
});

describe("GET /admin/calendar status=RESCHEDULED", () => {
  it("shows rescheduled originals only when the user filters by that status", async () => {
    const danceClass = await DanceClassModel.create({
      organizationId, branchId, name: `Reprogramada ${++counter}`, professorIds: [new Types.ObjectId()], capacity: 20,
      billingMode: "PER_CLASS", pricePerClass: 5000, schedules: [{ day: "MONDAY", startTime: "10:00", endTime: "11:00" }]
    });
    const date = academyNow().date;
    await ClassSessionModel.create({
      organizationId, branchId, classId: danceClass._id, sessionDate: date, startTime: "07:00", endTime: "08:00",
      status: "RESCHEDULED", origin: "REGULAR", statusReason: "Cambio de salón"
    });
    const base = `/api/admin/calendar?from=${date}&to=${date}&classId=${danceClass._id}`;

    const all = await auth(request(app).get(base));
    const rescheduled = await auth(request(app).get(`${base}&status=RESCHEDULED`));

    expect(all.status).toBe(200);
    expect(all.body.items.some((item: { status: string }) => item.status === "RESCHEDULED")).toBe(false);
    expect(rescheduled.body.items.map((item: { status: string }) => item.status)).toEqual(["RESCHEDULED"]);
  });
});
