import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { UserModel } from "../auth/user.model";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { ProfessorModel } from "../professors/professor.model";

let mongod: MongoMemoryServer;
const app = createApp();
let organizationId: Types.ObjectId;
let branchId: Types.ObjectId;
let token: string;
let professorId: Types.ObjectId;
let userId: Types.ObjectId;
let activeDisciplineId: Types.ObjectId;
let inactiveDisciplineId: Types.ObjectId;
let segmentId: Types.ObjectId;
let levelId: Types.ObjectId;

const auth = () => ({ Authorization: `Bearer ${token}` });

async function catalog(type: "DISCIPLINE" | "SEGMENT" | "LEVEL", name: string, isActive = true) {
  const item = await CatalogItemModel.create({
    organizationId,
    type,
    name,
    normalizedName: name.toLowerCase(),
    isActive
  });
  return item._id;
}

// Each class gets its own weekday so the shared professor has no schedule conflict.
function createClass(disciplineIds: Types.ObjectId[], day: "TUESDAY" | "WEDNESDAY" | "THURSDAY") {
  return DanceClassModel.create({
    organizationId,
    branchId,
    name: "Clase con ritmo inactivo",
    professorIds: [professorId],
    disciplineIds,
    segmentIds: [segmentId],
    levelIds: [levelId],
    capacity: 20,
    schedules: [{ day, startTime: "18:00", endTime: "19:00" }]
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const organization = await OrganizationModel.create({ name: "Test", slug: "inactive-relations-test" });
  const branch = await BranchModel.create({ organizationId: organization._id, name: "La Plata" });
  organizationId = organization._id;
  branchId = branch._id;
  token = jwt.sign(
    { sub: String(new Types.ObjectId()), organizationId: String(organization._id), role: "ADMIN" },
    env.JWT_ACCESS_SECRET
  );

  const user = await UserModel.create({
    organizationId,
    branchIds: [branchId],
    email: "profesor@inactive-relations.test",
    passwordHash: "not-used-in-this-test",
    firstName: "Profe",
    lastName: "Test",
    role: "PROFESSOR",
    isActive: true
  });
  userId = user._id;
  const professor = await ProfessorModel.create({
    organizationId,
    userId,
    displayName: "Profe Test"
  });
  professorId = professor._id;

  activeDisciplineId = await catalog("DISCIPLINE", "Salsa");
  inactiveDisciplineId = await catalog("DISCIPLINE", "Tango", false);
  segmentId = await catalog("SEGMENT", "Adultos");
  levelId = await catalog("LEVEL", "Inicial");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("PATCH /admin/classes/:id with inactive related items", () => {
  it("keeps an inactive discipline that the class already uses", async () => {
    const danceClass = await createClass([inactiveDisciplineId, activeDisciplineId], "TUESDAY");

    const response = await request(app)
      .patch(`/api/admin/classes/${danceClass._id}`)
      .set(auth())
      .send({ disciplineIds: [String(inactiveDisciplineId), String(activeDisciplineId)] });

    expect(response.status).toBe(200);
  });

  it("keeps an inactive professor that the class already uses", async () => {
    const danceClass = await createClass([activeDisciplineId], "WEDNESDAY");
    await ProfessorModel.updateOne({ _id: professorId }, { isActive: false });
    await UserModel.updateOne({ _id: userId }, { isActive: false });

    try {
      const response = await request(app)
        .patch(`/api/admin/classes/${danceClass._id}`)
        .set(auth())
        .send({ professorIds: [String(professorId)] });

      expect(response.status).toBe(200);
    } finally {
      await ProfessorModel.updateOne({ _id: professorId }, { isActive: true });
      await UserModel.updateOne({ _id: userId }, { isActive: true });
    }
  });

  it("rejects an inactive discipline the class does not use yet", async () => {
    const danceClass = await createClass([activeDisciplineId], "THURSDAY");

    const response = await request(app)
      .patch(`/api/admin/classes/${danceClass._id}`)
      .set(auth())
      .send({ disciplineIds: [String(activeDisciplineId), String(inactiveDisciplineId)] });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("INVALID_DISCIPLINES");
  });
});

describe("POST /admin/classes with monthly plans", () => {
  it("creates a monthly class with only the 8-class price", async () => {
    const response = await request(app)
      .post("/api/admin/classes")
      .set(auth())
      .send({
        branchId,
        name: "Clase de ocho",
        professorIds: [professorId],
        disciplineIds: [activeDisciplineId],
        segmentIds: [segmentId],
        levelIds: [levelId],
        capacity: 20,
        billingMode: "MONTHLY",
        monthlyPrice8: 50000,
        schedules: [{ day: "FRIDAY", startTime: "20:00", endTime: "21:00" }]
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ monthlyPrice8: 50000, monthlyPrice: 50000 });
    expect(response.body.monthlyPrice4).toBeUndefined();
  });
});
