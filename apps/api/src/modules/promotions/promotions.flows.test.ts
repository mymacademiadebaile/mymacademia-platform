import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { academyNow, periodBounds } from "../../common/dates";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { ChargeModel } from "../billing/charge.model";
import { generateMonthlyCharges } from "../billing/charge-service";
import { CollectionModel } from "../billing/collection.model";
import { registerCollection } from "../billing/collection-service";
import { FinancialAdjustmentModel } from "../billing/financial-adjustment.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { PromotionModel } from "./promotion.model";
import { quotePromotion } from "./promotion-service";

const app = createApp();
let database: { stop: () => Promise<void> };
let organizationId: Types.ObjectId;
let branchId: Types.ObjectId;
let adminId: Types.ObjectId;
let token: string;
let counter = 0;
const auth = (call: request.Test) => call.set("Authorization", `Bearer ${token}`);
const today = () => academyNow().date;
const nextMonth = () => {
  const date = new Date(`${today().slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
};

async function danceClass(billingMode: "MONTHLY" | "PER_CLASS") {
  return DanceClassModel.create({
    organizationId, branchId, name: `Promoción ${++counter}`,
    professorIds: [new Types.ObjectId()], capacity: 20, billingMode,
    pricePerClass: 8000, monthlyPrice: 30000,
    schedules: [{ day: "MONDAY", startTime: "18:00", endTime: "19:00" }]
  });
}

async function student() {
  return StudentModel.create({ organizationId, branchId, firstName: `Alumno ${++counter}`, lastName: "Test" });
}

beforeAll(async () => {
  database = await startReplicaSet();
  const org = await OrganizationModel.create({ name: "Promociones Test", slug: "promociones-test" });
  const branch = await BranchModel.create({ organizationId: org._id, name: "La Plata" });
  organizationId = org._id;
  branchId = branch._id;
  adminId = new Types.ObjectId();
  token = jwt.sign({ sub: String(adminId), organizationId: String(organizationId), role: "ADMIN" }, env.JWT_ACCESS_SECRET);
});

afterAll(async () => { await database?.stop(); });

describe("promotions and new pairs", () => {
  it("grants the 2x1 before the first monthly fee and keeps it after the payer leaves", async () => {
    const group = await danceClass("MONTHLY");
    const [payer, beneficiary] = await Promise.all([student(), student()]);
    const promotion = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "2x1 para nuevos", kind: "TWO_FOR_ONE", appliesTo: "MONTHLY_FEE",
      registrationFrom: today(), registrationTo: today(),
      benefitFrom: periodBounds(today().slice(0, 7)).from, benefitTo: periodBounds(nextMonth()).to
    });
    expect(promotion.status).toBe(201);

    const preview = await auth(request(app).post(`/api/admin/promotions/${promotion.body._id}/pair-preview`)).send({
      payerStudentId: String(payer._id), beneficiaryStudentId: String(beneficiary._id),
      startDate: today(), billingPreference: "MONTHLY", joinPolicy: "FULL"
    });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ kind: "MONTHLY_FEE", period: today().slice(0, 7), payer: 30_000, beneficiary: 0, discount: 30_000 });

    const enrolled = await auth(request(app).post(`/api/admin/promotions/${promotion.body._id}/enroll-pair`)).send({
      payerStudentId: String(payer._id), beneficiaryStudentId: String(beneficiary._id),
      startDate: today(), billingPreference: "MONTHLY", joinPolicy: "FULL"
    });
    expect(enrolled.status).toBe(201);
    const first = await ChargeModel.find({ organizationId, classId: group._id, period: today().slice(0, 7) });
    expect(first).toHaveLength(2);
    const free = first.find((item) => item.studentId.equals(beneficiary._id))!;
    expect(free.amountCents).toBe(3_000_000);
    expect(free.adjustmentsCents).toBe(-3_000_000);
    expect(free.balanceCents).toBe(0);
    expect(free.status).toBe("PAID");
    expect(free.paidCents).toBe(0);
    expect(preview.body.beneficiary).toBe(free.balanceCents / 100);
    expect(await FinancialAdjustmentModel.countDocuments({ chargeId: free._id, promotionId: promotion.body._id })).toBe(1);
    expect(await CollectionModel.countDocuments({ studentId: beneficiary._id })).toBe(0);

    await EnrollmentModel.updateOne({ _id: enrolled.body.enrollmentIds[0] }, {
      $set: { status: "INACTIVE", "periods.0.endDate": today() }
    });
    const closed = await auth(request(app).post(`/api/admin/promotions/${promotion.body._id}/deactivate`));
    expect(closed.status).toBe(200);
    await generateMonthlyCharges({ organizationId: String(organizationId), userId: String(adminId) }, nextMonth());
    await generateMonthlyCharges({ organizationId: String(organizationId), userId: String(adminId) }, nextMonth());
    const next = await ChargeModel.find({ organizationId, classId: group._id, period: nextMonth() });
    expect(next).toHaveLength(1);
    expect(next[0].studentId.equals(beneficiary._id)).toBe(true);
    expect(next[0].promotionDiscountCents).toBe(3_000_000);
    expect(next[0].status).toBe("PAID");
  });

  it("covers one per-class charge without inventing a collection or a receipt", async () => {
    const group = await danceClass("PER_CLASS");
    const [payer, beneficiary] = await Promise.all([student(), student()]);
    const promotion = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "2x1 una clase", kind: "TWO_FOR_ONE", appliesTo: "CLASS_FEE",
      registrationFrom: today(), registrationTo: today(), benefitFrom: today(), benefitTo: today()
    });
    expect(promotion.status).toBe(201);
    const enrolled = await auth(request(app).post(`/api/admin/promotions/${promotion.body._id}/enroll-pair`)).send({
      payerStudentId: String(payer._id), beneficiaryStudentId: String(beneficiary._id),
      startDate: today(), billingPreference: "PER_CLASS"
    });
    expect(enrolled.status).toBe(201);
    const free = await auth(request(app).post(`/api/admin/billing/classes/${group._id}/collect`)).send({
      studentId: String(beneficiary._id), paymentType: "PER_CLASS", serviceDate: today(),
      method: "CASH", idempotencyKey: "free-class-promotional-test"
    });
    expect(free.status).toBe(201);
    expect(free.body.collection).toBeNull();
    expect(free.body.charge.owed).toBe(0);
    expect(free.body.charge.promotionName).toBe("2x1 una clase");
    const again = await auth(request(app).post(`/api/admin/billing/classes/${group._id}/collect`)).send({
      studentId: String(beneficiary._id), paymentType: "PER_CLASS", serviceDate: today(),
      method: "CASH", idempotencyKey: "free-class-promotional-test"
    });
    expect(again.status).toBe(200);
    expect(await ChargeModel.countDocuments({ studentId: beneficiary._id, classId: group._id })).toBe(1);
    expect(await CollectionModel.countDocuments({ studentId: beneficiary._id })).toBe(0);
  });

  it("shows the ordinary first fee when the 2x1 starts next month, then discounts only its covered week", async () => {
    const group = await danceClass("MONTHLY");
    const [payer, beneficiary] = await Promise.all([student(), student()]);
    const benefitFrom = periodBounds(nextMonth()).from;
    const lastWeekDate = new Date(`${benefitFrom}T12:00:00Z`);
    lastWeekDate.setUTCDate(lastWeekDate.getUTCDate() + 6);
    const benefitTo = lastWeekDate.toISOString().slice(0, 10);
    const promotion = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "2x1 una semana próxima", kind: "TWO_FOR_ONE", appliesTo: "MONTHLY_FEE",
      registrationFrom: today(), registrationTo: today(), benefitFrom, benefitTo
    });
    expect(promotion.status).toBe(201);
    const payload = {
      payerStudentId: String(payer._id), beneficiaryStudentId: String(beneficiary._id),
      startDate: today(), billingPreference: "MONTHLY", joinPolicy: "FULL"
    };
    const preview = await auth(request(app).post(`/api/admin/promotions/${promotion.body._id}/pair-preview`)).send(payload);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ period: today().slice(0, 7), payer: 30_000, beneficiary: 30_000, discount: 0 });
    const enrolled = await auth(request(app).post(`/api/admin/promotions/${promotion.body._id}/enroll-pair`)).send(payload);
    expect(enrolled.status).toBe(201);
    const first = await ChargeModel.findOne({ organizationId, studentId: beneficiary._id, classId: group._id, period: today().slice(0, 7) });
    expect(first?.balanceCents).toBe(3_000_000);

    await generateMonthlyCharges({ organizationId: String(organizationId), userId: String(adminId) }, nextMonth());
    const later = await ChargeModel.findOne({ organizationId, studentId: beneficiary._id, classId: group._id, period: nextMonth() });
    const days = periodBounds(nextMonth());
    let mondays = 0;
    for (let day = 1; day <= Number(days.to.slice(8)); day++) {
      if (new Date(`${nextMonth()}-${String(day).padStart(2, "0")}T12:00:00Z`).getUTCDay() === 1) mondays++;
    }
    expect(later?.promotionDiscountCents).toBe(Math.round(3_000_000 / mondays));
    expect(later?.balanceCents).toBe(3_000_000 - Math.round(3_000_000 / mondays));
  });

  it("rejects a 2x1 for someone previously enrolled in that class", async () => {
    const group = await danceClass("MONTHLY");
    const [payer, beneficiary] = await Promise.all([student(), student()]);
    await EnrollmentModel.create({
      organizationId, branchId, classId: group._id, studentId: payer._id, status: "INACTIVE",
      periods: [{ startDate: today(), endDate: today() }], billingPreference: "MONTHLY",
      billingChanges: [{ effectiveDate: today(), mode: "MONTHLY" }]
    });
    const promotion = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "2x1 para nuevos", kind: "TWO_FOR_ONE", appliesTo: "MONTHLY_FEE",
      registrationFrom: today(), registrationTo: today(), benefitFrom: today(), benefitTo: periodBounds(today().slice(0, 7)).to
    });
    expect(promotion.status).toBe(201);
    const enrolled = await auth(request(app).post(`/api/admin/promotions/${promotion.body._id}/enroll-pair`)).send({
      payerStudentId: String(payer._id), beneficiaryStudentId: String(beneficiary._id),
      startDate: today(), billingPreference: "MONTHLY", joinPolicy: "FULL"
    });
    expect(enrolled.status).toBe(409);
    expect(await EnrollmentModel.countDocuments({ organizationId, classId: group._id, studentId: beneficiary._id })).toBe(0);
  });

  it("shows the beneficiary as bonified when opening the promoted class session", async () => {
    const group = await danceClass("PER_CLASS");
    const [payer, beneficiary] = await Promise.all([student(), student()]);
    const sessionDate = new Date(`${today()}T12:00:00Z`);
    sessionDate.setUTCDate(sessionDate.getUTCDate() + (8 - sessionDate.getUTCDay()) % 7);
    const classDate = sessionDate.toISOString().slice(0, 10);
    const promotion = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "2x1 clase del día", kind: "TWO_FOR_ONE", appliesTo: "CLASS_FEE",
      registrationFrom: today(), registrationTo: today(), benefitFrom: classDate, benefitTo: classDate
    });
    expect(promotion.status).toBe(201);
    const enrolled = await auth(request(app).post(`/api/admin/promotions/${promotion.body._id}/enroll-pair`)).send({
      payerStudentId: String(payer._id), beneficiaryStudentId: String(beneficiary._id),
      startDate: today(), billingPreference: "PER_CLASS"
    });
    expect(enrolled.status).toBe(201);
    const day = await auth(request(app).get(`/api/admin/sessions?date=${classDate}`));
    expect(day.status).toBe(200);
    const session = day.body.items.find((item: any) => item.class.id === String(group._id));
    expect(session).toBeDefined();
    const detail = await auth(request(app).get(`/api/admin/sessions/${session.id}`));
    expect(detail.status).toBe(200);
    const free = detail.body.participants.find((item: any) => item.studentId === String(beneficiary._id));
    expect(free.payment.status).toBe("PAID");
    expect(free.payment.bonified).toBe(true);
    expect(free.payment.paidAmount).toBe(0);
    expect(await CollectionModel.countDocuments({ studentId: beneficiary._id })).toBe(0);
  });

  it("limits a one-session 2x1 to its selected class time", async () => {
    const group = await danceClass("PER_CLASS");
    await DanceClassModel.updateOne({ _id: group._id }, { $set: { schedules: [
      { day: "MONDAY", startTime: "18:00", endTime: "19:00" },
      { day: "MONDAY", startTime: "20:00", endTime: "21:00" }
    ] } });
    const monday = new Date(`${today()}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() + (8 - monday.getUTCDay()) % 7);
    const classDate = monday.toISOString().slice(0, 10);
    const day = await auth(request(app).get(`/api/admin/sessions?date=${classDate}`));
    const sessions = day.body.items.filter((item: any) => item.class.id === String(group._id));
    expect(sessions).toHaveLength(2);
    const [payer, beneficiary] = await Promise.all([student(), student()]);
    const promotion = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "2x1 en un horario", kind: "TWO_FOR_ONE", appliesTo: "CLASS_FEE",
      registrationFrom: today(), registrationTo: today(), benefitFrom: classDate, benefitTo: classDate,
      sessionId: sessions[0].id
    });
    expect(promotion.status).toBe(201);
    const enrolled = await auth(request(app).post(`/api/admin/promotions/${promotion.body._id}/enroll-pair`)).send({
      payerStudentId: String(payer._id), beneficiaryStudentId: String(beneficiary._id),
      startDate: today(), billingPreference: "PER_CLASS"
    });
    expect(enrolled.status).toBe(201);
    const first = await auth(request(app).get(`/api/admin/sessions/${sessions[0].id}`));
    const second = await auth(request(app).get(`/api/admin/sessions/${sessions[1].id}`));
    expect(first.body.participants.find((item: any) => item.studentId === String(beneficiary._id)).payment.bonified).toBe(true);
    expect(second.body.participants.find((item: any) => item.studentId === String(beneficiary._id)).payment.bonified).toBeFalsy();
  });

  it("shows a fully discounted general campaign as bonified in the class session", async () => {
    const group = await danceClass("PER_CLASS");
    const participant = await student();
    await EnrollmentModel.create({
      organizationId, branchId, classId: group._id, studentId: participant._id, status: "ACTIVE",
      periods: [{ startDate: today() }], billingPreference: "PER_CLASS",
      billingChanges: [{ effectiveDate: today(), mode: "PER_CLASS" }]
    });
    const monday = new Date(`${today()}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() + (8 - monday.getUTCDay()) % 7);
    const classDate = monday.toISOString().slice(0, 10);
    const promotion = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "Clase gratis", kind: "PERCENT", appliesTo: "CLASS_FEE",
      percent: 100, benefitFrom: classDate, benefitTo: classDate
    });
    expect(promotion.status).toBe(201);
    const day = await auth(request(app).get(`/api/admin/sessions?date=${classDate}`));
    const session = day.body.items.find((item: any) => item.class.id === String(group._id));
    const detail = await auth(request(app).get(`/api/admin/sessions/${session.id}`));
    expect(detail.status).toBe(200);
    const bonified = detail.body.participants.find((item: any) => item.studentId === String(participant._id));
    expect(bonified.payment.bonified).toBe(true);
    expect(bonified.payment.paidAmount).toBe(0);
    expect(await CollectionModel.countDocuments({ studentId: participant._id })).toBe(0);
  });

  it.each([
    ["PERCENT", 25, undefined, 2_000],
    ["AMOUNT_OFF", undefined, 3000, 3_000],
    ["FINAL_PRICE", undefined, 6000, 2_000]
  ] as const)("quotes %s without changing the money received", async (kind, percent, value, expectedPesos) => {
    const group = await danceClass("PER_CLASS");
    const participant = await student();
    await PromotionModel.create({
      organizationId, classId: group._id, name: `Promo ${kind}`,
      kind, appliesTo: "CLASS_FEE", percentBasisPoints: percent === undefined ? undefined : percent * 100,
      valueCents: value === undefined ? undefined : value * 100,
      benefitFrom: today(), benefitTo: today(), status: "ACTIVE"
    });
    const quote = await quotePromotion({
      organizationId: String(organizationId), classId: group._id, studentId: participant._id,
      kind: "CLASS_FEE", period: today().slice(0, 7), serviceDate: today(), amountCents: 800_000
    });
    expect(quote?.discountCents).toBe(expectedPesos * 100);
    expect(await CollectionModel.countDocuments({ studentId: participant._id })).toBe(0);
  });

  it("applies a new percentage campaign to an already issued unpaid monthly fee", async () => {
    const group = await danceClass("MONTHLY");
    const participant = await student();
    await EnrollmentModel.create({
      organizationId, branchId, classId: group._id, studentId: participant._id, status: "ACTIVE",
      periods: [{ startDate: periodBounds(today().slice(0, 7)).from }],
      billingPreference: "MONTHLY", billingChanges: [{ effectiveDate: periodBounds(today().slice(0, 7)).from, mode: "MONTHLY" }]
    });
    await generateMonthlyCharges({ organizationId: String(organizationId), userId: String(adminId) }, today().slice(0, 7));
    const before = await ChargeModel.findOne({ organizationId, classId: group._id, studentId: participant._id });
    expect(before?.balanceCents).toBe(3_000_000);

    const created = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "Veinte por ciento", kind: "PERCENT", appliesTo: "MONTHLY_FEE",
      percent: 20, benefitFrom: periodBounds(today().slice(0, 7)).from, benefitTo: periodBounds(today().slice(0, 7)).to
    });
    expect(created.status).toBe(201);
    expect(created.body.appliedExisting).toBe(1);
    const after = await ChargeModel.findById(before!._id);
    expect(after?.promotionDiscountCents).toBe(600_000);
    expect(after?.balanceCents).toBe(2_400_000);
    expect(await FinancialAdjustmentModel.countDocuments({ chargeId: before!._id, promotionId: created.body._id })).toBe(1);
  });

  it("applies a fixed discount to a manually created class charge with one recorded adjustment", async () => {
    const group = await danceClass("PER_CLASS");
    const participant = await student();
    const promotion = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "Descuento de clase", kind: "AMOUNT_OFF", appliesTo: "CLASS_FEE",
      value: 2_000, benefitFrom: today(), benefitTo: today()
    });
    expect(promotion.status).toBe(201);
    const created = await auth(request(app).post("/api/admin/billing/charges")).send({
      studentId: String(participant._id), classId: String(group._id), kind: "CLASS_FEE",
      period: today().slice(0, 7), serviceDate: today(), concept: "Clase de prueba",
      amount: 8_000, dueDate: today()
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ owed: 6_000, promotionName: "Descuento de clase", promotionDiscount: 2_000 });
    expect(await FinancialAdjustmentModel.countDocuments({ chargeId: created.body.id, promotionId: promotion.body._id })).toBe(1);
    expect(await CollectionModel.countDocuments({ studentId: participant._id })).toBe(0);
  });

  it("does not silently change a paid charge when a new campaign is created", async () => {
    const group = await danceClass("MONTHLY");
    const participant = await student();
    await EnrollmentModel.create({
      organizationId, branchId, classId: group._id, studentId: participant._id, status: "ACTIVE",
      periods: [{ startDate: periodBounds(today().slice(0, 7)).from }],
      billingPreference: "MONTHLY", billingChanges: [{ effectiveDate: periodBounds(today().slice(0, 7)).from, mode: "MONTHLY" }]
    });
    await generateMonthlyCharges({ organizationId: String(organizationId), userId: String(adminId) }, today().slice(0, 7));
    const charge = await ChargeModel.findOne({ organizationId, classId: group._id, studentId: participant._id });
    await registerCollection({ organizationId: String(organizationId), userId: String(adminId) }, {
      studentId: String(participant._id), amountCents: 3_000_000, method: "CASH",
      allocations: [{ chargeId: String(charge!._id), amountCents: 3_000_000 }]
    });
    const created = await auth(request(app).post("/api/admin/promotions")).send({
      classId: String(group._id), name: "Descuento posterior", kind: "PERCENT", appliesTo: "MONTHLY_FEE",
      percent: 20, benefitFrom: periodBounds(today().slice(0, 7)).from, benefitTo: periodBounds(today().slice(0, 7)).to
    });
    expect(created.status).toBe(409);
    expect(await PromotionModel.countDocuments({ organizationId, classId: group._id })).toBe(0);
    expect((await ChargeModel.findById(charge!._id))?.paidCents).toBe(3_000_000);
  });
});
