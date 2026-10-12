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
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";

let mongod: MongoMemoryServer;
const app = createApp();
let token: string;
let studentId: Types.ObjectId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const organization = await OrganizationModel.create({ name: "Test", slug: "student-detail-billing-test" });
  const branch = await BranchModel.create({ organizationId: organization._id, name: "La Plata" });
  const student = await StudentModel.create({
    organizationId: organization._id,
    branchId: branch._id,
    firstName: "Alumna",
    lastName: "Detalle"
  });
  const danceClass = await DanceClassModel.create({
    organizationId: organization._id,
    branchId: branch._id,
    name: "Clase por clase",
    professorIds: [new Types.ObjectId()],
    capacity: 20,
    billingMode: "PER_CLASS",
    pricePerClass: 8000,
    schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]
  });
  await EnrollmentModel.create({
    organizationId: organization._id,
    branchId: branch._id,
    classId: danceClass._id,
    studentId: student._id,
    enrolledAt: new Date(),
    billingPreference: "PER_CLASS"
  });
  studentId = student._id;
  token = jwt.sign(
    { sub: String(new Types.ObjectId()), organizationId: String(organization._id), role: "ADMIN" },
    env.JWT_ACCESS_SECRET
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /admin/students/:id", () => {
  it("returns the billing mode and prices of each enrolled class", async () => {
    const response = await request(app)
      .get(`/api/admin/students/${studentId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.enrollments[0].classId).toMatchObject({
      billingMode: "PER_CLASS",
      pricePerClass: 8000
    });
  });
});
