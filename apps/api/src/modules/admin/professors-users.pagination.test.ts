import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { UserModel } from "../auth/user.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { ProfessorModel } from "../professors/professor.model";

const RECORD_COUNT = 12;
const app = createApp();
let mongod: MongoMemoryServer;
let professorToken: string;
let superAdminToken: string;

const professorNames = Array.from(
  { length: RECORD_COUNT },
  (_, index) => `Profesora ${String(index + 1).padStart(2, "0")}`
);
const userLastNames = Array.from(
  { length: RECORD_COUNT },
  (_, index) => `Usuario ${String(index + 1).padStart(2, "0")}`
);

function accessToken(organizationId: Types.ObjectId, role: "ADMIN" | "SUPER_ADMIN") {
  return jwt.sign(
    { sub: String(new Types.ObjectId()), organizationId: String(organizationId), role },
    env.JWT_ACCESS_SECRET
  );
}

function expectPage(
  response: request.Response,
  page: number,
  limit: number,
  itemCount: number
) {
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    total: RECORD_COUNT,
    page,
    limit
  });
  expect(response.body.items).toHaveLength(itemCount);
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([
    OrganizationModel.init(),
    BranchModel.init(),
    UserModel.init(),
    ProfessorModel.init()
  ]);

  const [professorOrganization, userOrganization, foreignOrganization] = await OrganizationModel.create([
    { name: "Profesores", slug: "pagination-professors" },
    { name: "Usuarios", slug: "pagination-users" },
    { name: "Externa", slug: "pagination-foreign" }
  ]);
  const [professorBranch, userBranch] = await BranchModel.create([
    { organizationId: professorOrganization._id, name: "Sede profesores" },
    { organizationId: userOrganization._id, name: "Sede usuarios" }
  ]);

  const professorUsers = await Promise.all(
    professorNames.map((displayName, index) =>
      UserModel.create({
        organizationId: professorOrganization._id,
        branchIds: [professorBranch._id],
        email: `profesor-${index + 1}@pagination.test`,
        passwordHash: "not-used-in-this-test",
        firstName: "Profesora",
        lastName: String(index + 1).padStart(2, "0"),
        role: "PROFESSOR",
        isActive: true
      })
    )
  );
  await Promise.all(
    professorUsers.map((user, index) =>
      ProfessorModel.create({
        organizationId: professorOrganization._id,
        userId: user._id,
        disciplineIds: [],
        displayName: professorNames[index],
        isActive: true
      })
    )
  );

  await Promise.all(
    userLastNames.map((lastName, index) =>
      UserModel.create({
        organizationId: userOrganization._id,
        branchIds: [userBranch._id],
        email: `usuario-${index + 1}@pagination.test`,
        passwordHash: "not-used-in-this-test",
        firstName: "Nombre",
        lastName,
        role: "ADMIN",
        isActive: true
      })
    )
  );

  // These records must not inflate either tenant's total.
  const foreignUser = await UserModel.create({
    organizationId: foreignOrganization._id,
    branchIds: [],
    email: "externo@pagination.test",
    passwordHash: "not-used-in-this-test",
    firstName: "Usuario",
    lastName: "Externo",
    role: "PROFESSOR",
    isActive: true
  });
  await ProfessorModel.create({
    organizationId: foreignOrganization._id,
    userId: foreignUser._id,
    disciplineIds: [],
    displayName: "Profesor Externo",
    isActive: true
  });

  professorToken = accessToken(professorOrganization._id, "ADMIN");
  superAdminToken = accessToken(userOrganization._id, "SUPER_ADMIN");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /admin/professors pagination", () => {
  it("defaults to ten results, reports the total, and keeps page boundaries stable", async () => {
    const firstPage = await request(app)
      .get("/api/admin/professors")
      .set("Authorization", `Bearer ${professorToken}`);
    const secondPage = await request(app)
      .get("/api/admin/professors?page=2&limit=10")
      .set("Authorization", `Bearer ${professorToken}`);
    const repeatedFirstPage = await request(app)
      .get("/api/admin/professors?page=1&limit=10")
      .set("Authorization", `Bearer ${professorToken}`);

    expectPage(firstPage, 1, 10, 10);
    expectPage(secondPage, 2, 10, 2);
    expectPage(repeatedFirstPage, 1, 10, 10);

    const firstNames = firstPage.body.items.map((item: { displayName: string }) => item.displayName);
    const secondNames = secondPage.body.items.map((item: { displayName: string }) => item.displayName);
    const repeatedNames = repeatedFirstPage.body.items.map((item: { displayName: string }) => item.displayName);

    expect(firstNames).toEqual(professorNames.slice(0, 10));
    expect(secondNames).toEqual(professorNames.slice(10));
    expect(repeatedNames).toEqual(firstNames);
    expect(new Set([...firstNames, ...secondNames])).toHaveLength(RECORD_COUNT);
  });

  it.each([50, 100])("honors limit=%i", async (limit) => {
    const response = await request(app)
      .get(`/api/admin/professors?page=1&limit=${limit}`)
      .set("Authorization", `Bearer ${professorToken}`);

    expectPage(response, 1, limit, RECORD_COUNT);
    expect(response.body.items.map((item: { displayName: string }) => item.displayName)).toEqual(professorNames);
  });
});

describe("GET /admin/users pagination", () => {
  it("defaults to ten results, reports the total, and keeps page boundaries stable", async () => {
    const firstPage = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${superAdminToken}`);
    const secondPage = await request(app)
      .get("/api/admin/users?page=2&limit=10")
      .set("Authorization", `Bearer ${superAdminToken}`);
    const repeatedFirstPage = await request(app)
      .get("/api/admin/users?page=1&limit=10")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expectPage(firstPage, 1, 10, 10);
    expectPage(secondPage, 2, 10, 2);
    expectPage(repeatedFirstPage, 1, 10, 10);

    const firstLastNames = firstPage.body.items.map((item: { lastName: string }) => item.lastName);
    const secondLastNames = secondPage.body.items.map((item: { lastName: string }) => item.lastName);
    const repeatedLastNames = repeatedFirstPage.body.items.map((item: { lastName: string }) => item.lastName);

    expect(firstLastNames).toEqual(userLastNames.slice(0, 10));
    expect(secondLastNames).toEqual(userLastNames.slice(10));
    expect(repeatedLastNames).toEqual(firstLastNames);
    expect(new Set([...firstLastNames, ...secondLastNames])).toHaveLength(RECORD_COUNT);
  });

  it.each([50, 100])("honors limit=%i", async (limit) => {
    const response = await request(app)
      .get(`/api/admin/users?page=1&limit=${limit}`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expectPage(response, 1, limit, RECORD_COUNT);
    expect(response.body.items.map((item: { lastName: string }) => item.lastName)).toEqual(userLastNames);
  });
});
