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

const INVALID_BRANCH_MESSAGE = "La sede seleccionada no es válida o no está activa";

const post = (body: object) =>
  request(app).post("/api/admin/students").set("Authorization", `Bearer ${token}`).send(body);
const patch = (id: Types.ObjectId, body: object) =>
  request(app).patch(`/api/admin/students/${id}`).set("Authorization", `Bearer ${token}`).send(body);
const get = (query = "") =>
  request(app).get(`/api/admin/students${query}`).set("Authorization", `Bearer ${token}`);

const newStudent = (branchId: Types.ObjectId, extra: object = {}) => ({
  branchId: String(branchId),
  firstName: "Lucia",
  lastName: "Gomez",
  ...extra
});

function expectInvalidBranch(response: request.Response) {
  expect(response.status).toBe(422);
  expect(response.body.error).toBe("INVALID_BRANCH");
  expect(response.body.message).toBe(INVALID_BRANCH_MESSAGE);
}

async function createStudent(branchId: Types.ObjectId, firstName: string) {
  return StudentModel.create({
    organizationId: ids.org,
    branchId,
    firstName,
    lastName: "Alumno"
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const org = await OrganizationModel.create({ name: "Test", slug: "test" });
  const otherOrg = await OrganizationModel.create({ name: "Other", slug: "other" });
  const branch = await BranchModel.create({ organizationId: org._id, name: "La Plata" });
  const otherBranchSameOrg = await BranchModel.create({ organizationId: org._id, name: "Berisso" });
  const inactiveBranch = await BranchModel.create({
    organizationId: org._id,
    name: "Cerrada",
    isActive: false
  });
  const foreignBranch = await BranchModel.create({ organizationId: otherOrg._id, name: "Ajena" });

  Object.assign(ids, {
    org: org._id,
    otherOrg: otherOrg._id,
    branch: branch._id,
    otherBranchSameOrg: otherBranchSameOrg._id,
    inactiveBranch: inactiveBranch._id,
    foreignBranch: foreignBranch._id
  });

  token = jwt.sign(
    { sub: String(new Types.ObjectId()), organizationId: String(org._id), role: "ADMIN" },
    env.JWT_ACCESS_SECRET
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /admin/students: pagination", () => {
  it("defaults to ten results and keeps pages stable for each requested size", async () => {
    const names = Array.from(
      { length: 12 },
      (_, index) => `Página ${String(index + 1).padStart(2, "0")}`
    );

    await Promise.all(
      names.map((firstName) => StudentModel.create({
        organizationId: ids.org,
        branchId: ids.branch,
        firstName,
        lastName: "Paginación"
      }))
    );

    const [firstPage, secondPage, fiftyPerPage, hundredPerPage] = await Promise.all([
      get("?q=P%C3%A1gina"),
      get("?q=P%C3%A1gina&page=2&limit=10"),
      get("?q=P%C3%A1gina&page=1&limit=50"),
      get("?q=P%C3%A1gina&page=1&limit=100")
    ]);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toMatchObject({ total: 12, page: 1, limit: 10 });
    expect(firstPage.body.items).toHaveLength(10);
    expect(secondPage.body).toMatchObject({ total: 12, page: 2, limit: 10 });
    expect(secondPage.body.items).toHaveLength(2);
    expect(fiftyPerPage.body).toMatchObject({ total: 12, page: 1, limit: 50 });
    expect(fiftyPerPage.body.items).toHaveLength(12);
    expect(hundredPerPage.body).toMatchObject({ total: 12, page: 1, limit: 100 });
    expect(hundredPerPage.body.items).toHaveLength(12);

    const firstNames = firstPage.body.items.map((item: { firstName: string }) => item.firstName);
    const secondNames = secondPage.body.items.map((item: { firstName: string }) => item.firstName);
    expect(firstNames).toEqual(names.slice(0, 10));
    expect(secondNames).toEqual(names.slice(10));
    expect(new Set([...firstNames, ...secondNames])).toHaveLength(12);
  });
});

describe("POST /admin/students: branch validation", () => {
  it("creates a student with an active branch of the same organization", async () => {
    const response = await post(newStudent(ids.branch));

    expect(response.status).toBe(201);
    expect(response.body.branchId).toBe(String(ids.branch));
    expect(response.body.organizationId).toBe(String(ids.org));
  });

  it("rejects a branch id that does not exist", async () => {
    expectInvalidBranch(await post(newStudent(new Types.ObjectId())));
  });

  it("rejects a branch of another organization", async () => {
    const response = await post(newStudent(ids.foreignBranch));

    expectInvalidBranch(response);
    expect(await StudentModel.countDocuments({ branchId: ids.foreignBranch })).toBe(0);
  });

  it("rejects an inactive branch of the same organization", async () => {
    expectInvalidBranch(await post(newStudent(ids.inactiveBranch)));
  });

  it("answers the same way for a foreign branch and a missing branch", async () => {
    const foreign = await post(newStudent(ids.foreignBranch));
    const missing = await post(newStudent(new Types.ObjectId()));

    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });

  it("ignores an organizationId sent in the body", async () => {
    const response = await post(
      newStudent(ids.branch, { organizationId: String(ids.otherOrg), firstName: "Mara" })
    );

    expect(response.status).toBe(201);
    expect(response.body.organizationId).toBe(String(ids.org));
    expect(await StudentModel.countDocuments({ organizationId: ids.otherOrg })).toBe(0);
  });
});

describe("PATCH /admin/students/:id: branch validation", () => {
  it("moves the student to another active branch of the same organization", async () => {
    const student = await createStudent(ids.branch, "Move");
    const response = await patch(student._id, { branchId: String(ids.otherBranchSameOrg) });

    expect(response.status).toBe(200);
    expect(response.body.branchId).toBe(String(ids.otherBranchSameOrg));
  });

  it("rejects a branch of another organization and keeps the current branch", async () => {
    const student = await createStudent(ids.branch, "Foreign");
    const response = await patch(student._id, { branchId: String(ids.foreignBranch) });

    expectInvalidBranch(response);
    const stored = await StudentModel.findById(student._id);
    expect(String(stored?.branchId)).toBe(String(ids.branch));
  });

  it("rejects a branch id that does not exist", async () => {
    const student = await createStudent(ids.branch, "Missing");

    expectInvalidBranch(await patch(student._id, { branchId: String(new Types.ObjectId()) }));
    expect(String((await StudentModel.findById(student._id))?.branchId)).toBe(String(ids.branch));
  });

  it("rejects an inactive branch as a new assignment", async () => {
    const student = await createStudent(ids.branch, "Inactive");

    expectInvalidBranch(await patch(student._id, { branchId: String(ids.inactiveBranch) }));
    expect(String((await StudentModel.findById(student._id))?.branchId)).toBe(String(ids.branch));
  });

  it("keeps editing other fields when the current branch was deactivated later", async () => {
    const branch = await BranchModel.create({ organizationId: ids.org, name: "Se cierra luego" });
    const student = await createStudent(branch._id, "Historic");
    await BranchModel.updateOne({ _id: branch._id }, { isActive: false });

    const withoutBranch = await patch(student._id, {
      firstName: "Historica",
      phone: "221555",
      email: "historica@example.com"
    });
    const withSameBranch = await patch(student._id, {
      branchId: String(branch._id),
      lastName: "Nueva"
    });

    expect(withoutBranch.status).toBe(200);
    expect(withoutBranch.body.firstName).toBe("Historica");
    expect(withSameBranch.status).toBe(200);
    expect(withSameBranch.body.branchId).toBe(String(branch._id));
    expect(withSameBranch.body.lastName).toBe("Nueva");
  });

  it("ignores an organizationId sent in the body", async () => {
    const student = await createStudent(ids.branch, "Scope");
    const response = await patch(student._id, {
      organizationId: String(ids.otherOrg),
      firstName: "Scoped"
    });

    expect(response.status).toBe(200);
    const stored = await StudentModel.findById(student._id);
    expect(String(stored?.organizationId)).toBe(String(ids.org));
    expect(stored?.firstName).toBe("Scoped");
  });
});
