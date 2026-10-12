import ExcelJS from "exceljs";
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
import { StudentModel } from "../students/student.model";

let mongod: MongoMemoryServer;
const app = createApp();
let token: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const organization = await OrganizationModel.create({ name: "Test", slug: "payments-export-test" });
  const branch = await BranchModel.create({ organizationId: organization._id, name: "La Plata" });
  const student = await StudentModel.create({
    organizationId: organization._id,
    branchId: branch._id,
    firstName: "Alumna",
    lastName: "Export"
  });
  const danceClass = await DanceClassModel.create({
    organizationId: organization._id,
    branchId: branch._id,
    name: "Clase export",
    professorIds: [new Types.ObjectId()],
    capacity: 20,
    schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]
  });
  await PaymentModel.create({
    organizationId: organization._id,
    branchId: branch._id,
    studentId: student._id,
    classId: danceClass._id,
    paymentType: "PER_CLASS",
    classDate: new Date("2026-09-29T12:00:00.000Z"),
    concept: "Clase suelta",
    period: "2026-09",
    amount: 8000,
    dueDate: new Date("2026-09-29T12:00:00.000Z"),
    status: "PAID",
    paymentMethod: "CASH",
    // 23:00 on 29 Sep in Argentina is already 30 Sep in UTC.
    paidAt: new Date("2026-09-30T02:00:00.000Z")
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

describe("GET /admin/payments/export.xlsx", () => {
  it("writes calendar dates in the academy timezone instead of raw timestamps", async () => {
    const response = await request(app)
      .get("/api/admin/payments/export.xlsx")
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const sheet = workbook.getWorksheet("Pagos")!;
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    const row = (sheet.getRow(2).values as unknown[]).slice(1);
    const cell = (name: string) => row[header.indexOf(name)];

    expect(cell("Fecha de clase")).toBe("2026-09-29");
    expect(cell("Vencimiento")).toBe("2026-09-29");
    expect(cell("Fecha pago")).toBe("2026-09-29");
  });
});
