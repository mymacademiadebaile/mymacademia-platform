import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { UserModel } from "../auth/user.model";
import { DanceClassModel } from "../classes/class.model";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import { ProfessorModel } from "../professors/professor.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";

const FUTURE_DATE = "2099-03-10";
const PAST_DATE = "2020-03-10";

let mongod: MongoMemoryServer;
const app = createApp();

const ids = {} as Record<string, Types.ObjectId>;
const tokens = {} as Record<string, string>;

function tokenFor(userId: Types.ObjectId, organizationId: Types.ObjectId) {
  return jwt.sign(
    { sub: String(userId), organizationId: String(organizationId), role: "PROFESSOR" },
    env.JWT_ACCESS_SECRET
  );
}

const get = (path: string, who = "juan") =>
  request(app).get(`/api/professor${path}`).set("Authorization", `Bearer ${tokens[who]}`);
const patch = (path: string, body: object, who = "juan") =>
  request(app)
    .patch(`/api/professor${path}`)
    .set("Authorization", `Bearer ${tokens[who]}`)
    .send(body);

async function createProfessor(organizationId: Types.ObjectId, branchId: Types.ObjectId, name: string) {
  const user = await UserModel.create({
    organizationId,
    branchIds: [branchId],
    email: `${name}@example.com`,
    passwordHash: "x",
    firstName: name,
    lastName: "Profe",
    role: "PROFESSOR"
  });
  const professor = await ProfessorModel.create({
    organizationId,
    userId: user._id,
    displayName: `${name} Profe`
  });
  return { user, professor };
}

async function createClass(
  organizationId: Types.ObjectId,
  branchId: Types.ObjectId,
  professorId: Types.ObjectId,
  name: string,
  billingMode: "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE"
) {
  return DanceClassModel.create({
    organizationId,
    branchId,
    name,
    professorIds: [professorId],
    capacity: 20,
    billingMode,
    pricePerClass: 8000,
    monthlyPrice: 25000,
    schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]
  });
}

async function createStudent(organizationId: Types.ObjectId, branchId: Types.ObjectId, firstName: string) {
  return StudentModel.create({
    organizationId,
    branchId,
    firstName,
    lastName: "Alumno",
    email: `${firstName.toLowerCase()}@example.com`,
    notes: "dato interno"
  });
}

function enroll(
  organizationId: Types.ObjectId,
  branchId: Types.ObjectId,
  classId: Types.ObjectId,
  studentId: Types.ObjectId,
  billingPreference?: "PER_CLASS" | "MONTHLY"
) {
  return EnrollmentModel.create({ organizationId, branchId, classId, studentId, billingPreference });
}

function session(
  organizationId: Types.ObjectId,
  branchId: Types.ObjectId,
  classId: Types.ObjectId,
  sessionDate: string
) {
  return ClassSessionModel.create({
    organizationId,
    branchId,
    classId,
    sessionDate,
    startTime: "18:00",
    endTime: "19:00"
  });
}

function payment(
  organizationId: Types.ObjectId,
  branchId: Types.ObjectId,
  studentId: Types.ObjectId,
  classId: Types.ObjectId,
  type: "PER_CLASS" | "MONTHLY",
  date: string,
  status: "PAID" | "PENDING"
) {
  const classDate = new Date(date + "T12:00:00.000Z");
  return PaymentModel.create({
    organizationId,
    branchId,
    studentId,
    classId,
    paymentType: type,
    classDate: type === "PER_CLASS" ? classDate : undefined,
    concept: type === "PER_CLASS" ? `Clase ${date}` : `Mensual ${date.slice(0, 7)}`,
    period: date.slice(0, 7),
    amount: type === "PER_CLASS" ? 8000 : 25000,
    dueDate: classDate,
    status
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const org = await OrganizationModel.create({ name: "Test", slug: "test" });
  const branch = await BranchModel.create({ organizationId: org._id, name: "La Plata" });
  const otherOrg = await OrganizationModel.create({ name: "Other", slug: "other" });
  const otherBranch = await BranchModel.create({ organizationId: otherOrg._id, name: "Otra sede" });

  const juan = await createProfessor(org._id, branch._id, "juan");
  const maria = await createProfessor(org._id, branch._id, "maria");
  const outsider = await createProfessor(otherOrg._id, otherBranch._id, "outsider");
  tokens.juan = tokenFor(juan.user._id, org._id);
  tokens.maria = tokenFor(maria.user._id, org._id);
  tokens.outsider = tokenFor(outsider.user._id, otherOrg._id);

  const perClass = await createClass(org._id, branch._id, juan.professor._id, "Bachata Dance", "PER_CLASS");
  const monthly = await createClass(org._id, branch._id, juan.professor._id, "Salsa Mensual", "MONTHLY");
  const both = await createClass(org._id, branch._id, juan.professor._id, "Zouk Mixto", "BOTH");
  const free = await createClass(org._id, branch._id, juan.professor._id, "Taller Libre", "FREE");
  const mariaClass = await createClass(org._id, branch._id, maria.professor._id, "Estilo Femenino", "PER_CLASS");
  Object.assign(ids, {
    org: org._id, branch: branch._id,
    perClass: perClass._id, monthly: monthly._id, both: both._id, free: free._id, mariaClass: mariaClass._id
  });

  const jorge = await createStudent(org._id, branch._id, "Jorge");
  const ana = await createStudent(org._id, branch._id, "Ana");
  const luis = await createStudent(org._id, branch._id, "Luis");
  const sofia = await createStudent(org._id, branch._id, "Sofia");
  const pedro = await createStudent(org._id, branch._id, "Pedro");
  Object.assign(ids, { jorge: jorge._id, ana: ana._id, luis: luis._id, sofia: sofia._id, pedro: pedro._id });

  await enroll(org._id, branch._id, perClass._id, jorge._id);
  await enroll(org._id, branch._id, perClass._id, ana._id);
  await enroll(org._id, branch._id, monthly._id, jorge._id);
  await enroll(org._id, branch._id, monthly._id, ana._id);
  await enroll(org._id, branch._id, both._id, luis._id, "MONTHLY");
  await enroll(org._id, branch._id, both._id, sofia._id, "PER_CLASS");
  await enroll(org._id, branch._id, free._id, luis._id);
  await enroll(org._id, branch._id, mariaClass._id, pedro._id);

  const sPerClass = await session(org._id, branch._id, perClass._id, FUTURE_DATE);
  const sMonthly = await session(org._id, branch._id, monthly._id, FUTURE_DATE);
  const sBoth = await session(org._id, branch._id, both._id, FUTURE_DATE);
  const sFree = await session(org._id, branch._id, free._id, FUTURE_DATE);
  const sPast = await session(org._id, branch._id, perClass._id, PAST_DATE);
  const sMaria = await session(org._id, branch._id, mariaClass._id, FUTURE_DATE);
  Object.assign(ids, {
    sPerClass: sPerClass._id, sMonthly: sMonthly._id, sBoth: sBoth._id,
    sFree: sFree._id, sPast: sPast._id, sMaria: sMaria._id
  });

  // PER_CLASS: Jorge paid this date, Ana has nothing for this date but paid another one.
  await payment(org._id, branch._id, jorge._id, perClass._id, "PER_CLASS", FUTURE_DATE, "PAID");
  await payment(org._id, branch._id, ana._id, perClass._id, "PER_CLASS", "2099-03-03", "PAID");
  await payment(org._id, branch._id, ana._id, perClass._id, "PER_CLASS", PAST_DATE, "PENDING");
  // MONTHLY: Jorge paid the month, Ana has a pending one.
  await payment(org._id, branch._id, jorge._id, monthly._id, "MONTHLY", FUTURE_DATE, "PAID");
  await payment(org._id, branch._id, ana._id, monthly._id, "MONTHLY", FUTURE_DATE, "PENDING");
  // BOTH: Luis (MONTHLY pref) paid the month; Sofia (PER_CLASS pref) also paid the month, which still covers the session.
  await payment(org._id, branch._id, luis._id, both._id, "MONTHLY", FUTURE_DATE, "PAID");
  await payment(org._id, branch._id, sofia._id, both._id, "MONTHLY", FUTURE_DATE, "PAID");
  // Another professor's payment for a student that also studies with Juan.
  await payment(org._id, branch._id, pedro._id, mariaClass._id, "PER_CLASS", FUTURE_DATE, "PAID");
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const rosterOf = (body: any) =>
  Object.fromEntries(body.roster.map((item: any) => [item.student.firstName, item]));

describe("professor portal: ownership", () => {
  it("rejects unauthenticated access", async () => {
    const response = await request(app).get("/api/professor/classes");
    expect(response.status).toBe(401);
  });

  it("lists only the professor's own classes", async () => {
    const response = await get("/classes");
    expect(response.status).toBe(200);
    const names = response.body.items.map((item: any) => item.name).sort();
    expect(names).toEqual(["Bachata Dance", "Salsa Mensual", "Taller Libre", "Zouk Mixto"]);
  });

  it("does not open a class assigned to another professor", async () => {
    const own = await get(`/classes/${ids.perClass}`);
    expect(own.status).toBe(200);
    expect(own.body.class.enrolledCount).toBe(2);

    const foreign = await get(`/classes/${ids.mariaClass}`);
    expect(foreign.status).toBe(404);
  });

  it("does not open a session of another professor's class", async () => {
    expect((await get(`/sessions/${ids.sPerClass}`)).status).toBe(200);
    expect((await get(`/sessions/${ids.sMaria}`)).status).toBe(404);
    expect((await get(`/sessions/${ids.sPerClass}`, "outsider")).status).toBe(404);
  });

  it("lists only the professor's own students", async () => {
    const response = await get("/students");
    expect(response.status).toBe(200);
    const names = response.body.items.map((item: any) => item.firstName).sort();
    expect(names).toEqual(["Ana", "Jorge", "Luis", "Sofia"]);
    expect(names).not.toContain("Pedro");
    expect(JSON.stringify(response.body)).not.toContain("dato interno");
  });

  it("does not open a student that belongs to another professor", async () => {
    expect((await get(`/students/${ids.jorge}`)).status).toBe(200);
    expect((await get(`/students/${ids.pedro}`)).status).toBe(404);
    expect((await get(`/students/${ids.jorge}`, "maria")).status).toBe(404);
  });

  it("only shows payments of the professor's classes in a student sheet", async () => {
    await payment(ids.org, ids.branch, ids.jorge, ids.mariaClass, "PER_CLASS", "2099-03-17", "PAID");
    const response = await get(`/students/${ids.jorge}`);
    const classNames = new Set(response.body.payments.map((item: any) => item.className));
    expect(classNames.has("Estilo Femenino")).toBe(false);
    expect(classNames.has("Bachata Dance")).toBe(true);
  });
});

describe("professor portal: payment status per billing mode", () => {
  it("PER_CLASS looks at the payment of that exact date", async () => {
    const response = await get(`/sessions/${ids.sPerClass}`);
    const roster = rosterOf(response.body);
    expect(roster.Jorge.billingType).toBe("PER_CLASS");
    expect(roster.Jorge.payment).toMatchObject({ status: "PAID", amount: 8000 });
    expect(roster.Ana.payment).toMatchObject({ status: "PENDING", amount: 8000 });
    expect(response.body.summary).toMatchObject({ students: 2, paid: 1, pending: 1 });
  });

  it("PER_CLASS marks past unpaid dates as overdue", async () => {
    const response = await get(`/sessions/${ids.sPast}`);
    expect(rosterOf(response.body).Ana.payment.status).toBe("OVERDUE");
  });

  it("MONTHLY looks at the month of the session", async () => {
    const response = await get(`/sessions/${ids.sMonthly}`);
    const roster = rosterOf(response.body);
    expect(roster.Jorge.billingType).toBe("MONTHLY");
    expect(roster.Jorge.payment).toMatchObject({ status: "PAID", amount: 25000 });
    expect(roster.Ana.payment).toMatchObject({ status: "PENDING" });
    expect(roster.Ana.payment.reference).toEqual({ kind: "MONTH", value: "2099-03" });
  });

  it("BOTH follows the enrollment billingPreference", async () => {
    const response = await get(`/sessions/${ids.sBoth}`);
    const roster = rosterOf(response.body);
    expect(roster.Luis.billingType).toBe("MONTHLY");
    expect(roster.Luis.payment.status).toBe("PAID");
    expect(roster.Sofia.billingType).toBe("PER_CLASS");
    // Current preference is PER_CLASS, but the MONTHLY payment of the month covers the session.
    expect(roster.Sofia.payment.status).toBe("PAID");
    expect(roster.Sofia.payment.reference).toEqual({ kind: "MONTH", value: "2099-03" });
  });

  it("FREE classes never owe", async () => {
    const response = await get(`/sessions/${ids.sFree}`);
    const roster = rosterOf(response.body);
    expect(roster.Luis.payment.status).toBe("FREE");
    expect(response.body.summary).toMatchObject({ free: 1, pending: 0 });
  });
});

describe("professor portal: attendance", () => {
  it("lets the professor mark attendance in their own session", async () => {
    const present = await patch(`/sessions/${ids.sPerClass}/attendance/${ids.jorge}`, {
      status: "PRESENT"
    });
    expect(present.status).toBe(200);
    expect(present.body.status).toBe("PRESENT");

    await patch(`/sessions/${ids.sPerClass}/attendance/${ids.ana}`, { status: "ABSENT" });

    const detail = await get(`/sessions/${ids.sPerClass}`);
    const roster = rosterOf(detail.body);
    expect(roster.Jorge.attendanceStatus).toBe("PRESENT");
    expect(roster.Ana.attendanceStatus).toBe("ABSENT");
    expect(detail.body.summary).toMatchObject({ present: 1, absent: 1 });
  });

  it("does not let a professor change attendance in another professor's session", async () => {
    const response = await patch(`/sessions/${ids.sMaria}/attendance/${ids.pedro}`, {
      status: "PRESENT"
    });
    expect(response.status).toBe(404);
    expect(await ClassAttendanceModel.countDocuments({ sessionId: ids.sMaria })).toBe(0);
  });

  it("rejects students that are not part of the session", async () => {
    const response = await patch(`/sessions/${ids.sPerClass}/attendance/${ids.pedro}`, {
      status: "PRESENT"
    });
    expect(response.status).toBe(422);
  });
});

describe("professor portal: dashboard and calendar", () => {
  it("builds the dashboard from scoped data and derives specialties from taught classes", async () => {
    const discipline = await CatalogItemModel.create({
      organizationId: ids.org,
      type: "DISCIPLINE",
      name: "Bachata",
      normalizedName: "bachata"
    });
    await DanceClassModel.updateOne({ _id: ids.perClass }, { disciplineIds: [discipline._id] });
    // Classes created "now" have no sessions earlier this week. Backdate them so the weekly count
    // does not depend on the weekday the suite runs on.
    await DanceClassModel.collection.updateMany(
      { organizationId: ids.org },
      { $set: { createdAt: new Date("2020-01-01T12:00:00.000Z") } }
    );

    const response = await get("/dashboard");
    expect(response.status).toBe(200);
    expect(response.body.stats.activeClasses).toBe(4);
    expect(response.body.stats.activeStudents).toBe(4);
    expect(response.body.professor.specialties).toEqual([{ id: String(discipline._id), name: "Bachata" }]);
    expect(response.body.stats.classesThisWeek).toBeGreaterThan(0);
  });

  it("returns only the professor's sessions in the calendar and validates the range", async () => {
    const response = await get("/calendar?from=2099-03-08&to=2099-03-14");
    expect(response.status).toBe(200);
    const classNames = new Set(response.body.items.map((item: any) => item.class.name));
    expect(classNames.has("Estilo Femenino")).toBe(false);
    expect(classNames.has("Bachata Dance")).toBe(true);

    expect((await get("/calendar?from=2099-01-01&to=2099-12-31")).status).toBe(422);
  });
});
