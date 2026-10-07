import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { StudentModel } from "../students/student.model";

let mongod: MongoMemoryServer;
const app = createApp();
const ids = {} as Record<string, Types.ObjectId>;
let token: string;

const preview = (body: object) =>
  request(app)
    .post("/api/admin/communications/preview")
    .set("Authorization", `Bearer ${token}`)
    .send(body);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const [organization, otherOrganization] = await Promise.all([
    OrganizationModel.create({ name: "Academia Test", slug: "academia-test" }),
    OrganizationModel.create({ name: "Academia Ajena", slug: "academia-ajena" })
  ]);
  const [branch, otherBranch] = await Promise.all([
    BranchModel.create({ organizationId: organization._id, name: "Centro" }),
    BranchModel.create({ organizationId: otherOrganization._id, name: "Ajena" })
  ]);

  const [selectedStudent, , inactiveStudent, foreignStudent] = await Promise.all([
    StudentModel.create({
      organizationId: organization._id,
      branchId: branch._id,
      firstName: "Lucía",
      lastName: "Gómez",
      email: "lucia@example.com"
    }),
    StudentModel.create({
      organizationId: organization._id,
      branchId: branch._id,
      firstName: "Martín",
      lastName: "Pérez",
      email: "martin@example.com"
    }),
    StudentModel.create({
      organizationId: organization._id,
      branchId: branch._id,
      firstName: "Inés",
      lastName: "Inactiva",
      email: "ines@example.com",
      isActive: false
    }),
    StudentModel.create({
      organizationId: otherOrganization._id,
      branchId: otherBranch._id,
      firstName: "Ana",
      lastName: "Ajena",
      email: "ana@example.com"
    })
  ]);

  Object.assign(ids, {
    selectedStudent: selectedStudent._id,
    inactiveStudent: inactiveStudent._id,
    foreignStudent: foreignStudent._id
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

describe("POST /admin/communications/preview: individual recipient", () => {
  it("returns only the selected active student with an email", async () => {
    const response = await preview({
      audience: "STUDENT",
      studentId: String(ids.selectedStudent)
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      recipients: 1,
      sample: [{ id: String(ids.selectedStudent), name: "Lucía Gómez", email: "lucia@example.com" }]
    });
  });

  it("requires a student selection", async () => {
    const response = await preview({ audience: "STUDENT" });

    expect(response.status).toBe(400);
  });

  it("does not expose inactive or foreign students", async () => {
    const [inactive, foreign] = await Promise.all([
      preview({ audience: "STUDENT", studentId: String(ids.inactiveStudent) }),
      preview({ audience: "STUDENT", studentId: String(ids.foreignStudent) })
    ]);

    expect(inactive.body).toMatchObject({ recipients: 0, sample: [] });
    expect(foreign.body).toMatchObject({ recipients: 0, sample: [] });
  });
});
