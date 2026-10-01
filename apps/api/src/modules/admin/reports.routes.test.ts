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
import { PaymentModel } from "../payments/payment.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";

let mongod: MongoMemoryServer;
const app = createApp();
const ids = {} as Record<string, Types.ObjectId>;
let token: string;

const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const organization = await OrganizationModel.create({ name: "M&M Test", slug: "mym-reports-test" });
  const otherOrganization = await OrganizationModel.create({ name: "Otra", slug: "other-reports-test" });
  const branch = await BranchModel.create({ organizationId: organization._id, name: "Centro" });
  const otherBranch = await BranchModel.create({ organizationId: otherOrganization._id, name: "Ajena" });
  Object.assign(ids, {
    organization: organization._id,
    otherOrganization: otherOrganization._id,
    branch: branch._id,
    otherBranch: otherBranch._id
  });

  token = jwt.sign(
    { sub: String(new Types.ObjectId()), organizationId: String(organization._id), role: "ADMIN" },
    env.JWT_ACCESS_SECRET
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /admin/reports/overview", () => {
  it("separa la facturación de septiembre de la caja cobrada en septiembre", async () => {
    const danceClass = await DanceClassModel.create({
      organizationId: ids.organization,
      branchId: ids.branch,
      name: "Bachata intermedia",
      professorIds: [new Types.ObjectId()],
      disciplineIds: [],
      segmentIds: [],
      levelIds: [],
      capacity: 12,
      billingMode: "BOTH",
      pricePerClass: 8000,
      monthlyPrice: 20000,
      schedules: [{ day: "SATURDAY", startTime: "18:00", endTime: "19:00" }]
    });
    const [firstStudent, secondStudent] = await Promise.all([
      StudentModel.create({ organizationId: ids.organization, branchId: ids.branch, firstName: "Ana", lastName: "Uno" }),
      StudentModel.create({ organizationId: ids.organization, branchId: ids.branch, firstName: "Beto", lastName: "Dos" })
    ]);

    const completedSession = await ClassSessionModel.create({
      organizationId: ids.organization,
      branchId: ids.branch,
      classId: danceClass._id,
      sessionDate: "2026-09-05",
      startTime: "18:00",
      endTime: "19:00",
      status: "COMPLETED"
    });
    await ClassSessionModel.create({
      organizationId: ids.organization,
      branchId: ids.branch,
      classId: danceClass._id,
      sessionDate: "2026-09-12",
      startTime: "18:00",
      endTime: "19:00",
      status: "CANCELLED"
    });
    await ClassAttendanceModel.create([
      {
        organizationId: ids.organization,
        sessionId: completedSession._id,
        studentId: firstStudent._id,
        status: "PRESENT",
        updatedByUserId: new Types.ObjectId()
      },
      {
        organizationId: ids.organization,
        sessionId: completedSession._id,
        studentId: secondStudent._id,
        status: "ABSENT",
        updatedByUserId: new Types.ObjectId()
      }
    ]);

    await PaymentModel.create([
      {
        organizationId: ids.organization,
        branchId: ids.branch,
        studentId: firstStudent._id,
        classId: danceClass._id,
        paymentType: "PER_CLASS",
        classDate: new Date("2026-09-05T12:00:00.000Z"),
        concept: "Clase septiembre",
        period: "2026-09",
        amount: 8000,
        dueDate: new Date("2099-01-01T12:00:00.000Z"),
        status: "PAID",
        paidAt: new Date("2026-10-01T12:00:00.000Z")
      },
      {
        organizationId: ids.organization,
        branchId: ids.branch,
        studentId: firstStudent._id,
        classId: danceClass._id,
        paymentType: "MONTHLY",
        concept: "Mensual septiembre",
        period: "2026-09",
        amount: 20000,
        dueDate: new Date("2099-01-01T12:00:00.000Z"),
        status: "PAID",
        paidAt: new Date("2026-09-10T12:00:00.000Z"),
        paymentMethod: "TRANSFER"
      },
      {
        organizationId: ids.organization,
        branchId: ids.branch,
        studentId: secondStudent._id,
        classId: danceClass._id,
        paymentType: "MONTHLY",
        concept: "Mensual pendiente",
        period: "2026-09",
        amount: 25000,
        dueDate: new Date("2099-01-01T12:00:00.000Z"),
        status: "PENDING"
      },
      {
        organizationId: ids.otherOrganization,
        branchId: ids.otherBranch,
        studentId: firstStudent._id,
        classId: danceClass._id,
        paymentType: "PER_CLASS",
        classDate: new Date("2026-09-05T12:00:00.000Z"),
        concept: "Cobro ajeno",
        period: "2026-09",
        amount: 999999,
        dueDate: new Date("2099-01-01T12:00:00.000Z"),
        status: "PAID",
        paidAt: new Date("2026-09-05T12:00:00.000Z")
      }
    ]);

    const response = await auth(
      request(app).get("/api/admin/reports/overview?from=2026-09-01&to=2026-09-30")
    );

    expect(response.status).toBe(200);
    expect(response.body.range).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      periods: ["2026-09"]
    });
    expect(response.body.billing.issued).toMatchObject({
      totalAmount: 53000,
      count: 3,
      collectedAmount: 28000,
      paidCount: 2,
      pendingAmount: 25000,
      pendingCount: 1,
      overdueAmount: 0
    });
    // The per-class payment belongs to September's invoice, but was received in October.
    expect(response.body.cash).toMatchObject({ collectedAmount: 20000, paidCount: 1 });
    expect(response.body.activity).toMatchObject({
      sessions: 2,
      completedSessions: 1,
      cancelledSessions: 1,
      attendance: { present: 1, absent: 1, recorded: 2 }
    });

    const classRow = response.body.classPerformance.find(
      (item: { id: string }) => item.id === String(danceClass._id)
    );
    expect(classRow).toMatchObject({
      name: "Bachata intermedia",
      sessions: { total: 2, completed: 1, cancelled: 1 },
      attendance: { present: 1, absent: 1 },
      invoiced: { amount: 53000, count: 3 },
      collected: { amount: 20000, count: 1 }
    });

    const exportResponse = await auth(
      request(app).get("/api/admin/reports/export.xlsx?from=2026-09-01&to=2026-09-30")
    );
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(exportResponse.headers["content-disposition"]).toContain("reporte-2026-09-01_a_2026-09-30.xlsx");
  });
});
