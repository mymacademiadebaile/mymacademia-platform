import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { ClassScheduleModel } from "../scheduling/class-schedule.model";
import { academyNow, addDays } from "../../common/dates";

let mongod: MongoMemoryServer;
const app = createApp();
let organizationId: Types.ObjectId;
let branchId: Types.ObjectId;
let token: string;
let counter = 0;

async function createClass() {
  return DanceClassModel.create({
    organizationId,
    branchId,
    name: `Clase eliminable ${++counter}`,
    professorIds: [new Types.ObjectId()],
    capacity: 20,
    schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }]
  });
}

const deleteClass = (classId: Types.ObjectId) =>
  request(app)
    .delete(`/api/admin/classes/${classId}`)
    .set("Authorization", `Bearer ${token}`);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const organization = await OrganizationModel.create({ name: "Test", slug: "class-delete-test" });
  const branch = await BranchModel.create({ organizationId: organization._id, name: "La Plata" });
  organizationId = organization._id;
  branchId = branch._id;
  token = jwt.sign(
    { sub: String(new Types.ObjectId()), organizationId: String(organization._id), role: "ADMIN" },
    env.JWT_ACCESS_SECRET
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("DELETE /admin/classes/:id", () => {
  it("removes a class without associated records and leaves an audit event", async () => {
    const danceClass = await createClass();

    const response = await deleteClass(danceClass._id);

    expect(response.status).toBe(204);
    expect(await DanceClassModel.findById(danceClass._id)).toBeNull();
    expect(await AuditLogModel.findOne({ entityId: danceClass._id, action: "CLASS_DELETED" })).toMatchObject({
      organizationId,
      metadata: expect.objectContaining({ name: danceClass.name })
    });
  });

  it("removes a new class together with its automatically generated future sessions", async () => {
    const danceClass = await createClass();
    const sessionDate = addDays(academyNow().date, 7);
    await ClassScheduleModel.create({
      organizationId,
      branchId,
      classId: danceClass._id,
      seriesId: new Types.ObjectId(),
      day: "TUESDAY",
      startTime: "18:00",
      endTime: "19:00",
      validFrom: academyNow().date
    });
    await ClassSessionModel.create({
      organizationId,
      branchId,
      classId: danceClass._id,
      sessionDate,
      startTime: "18:00",
      endTime: "19:00"
    });

    const response = await deleteClass(danceClass._id);

    expect(response.status).toBe(204);
    expect(await DanceClassModel.findById(danceClass._id)).toBeNull();
    expect(await ClassScheduleModel.countDocuments({ classId: danceClass._id })).toBe(0);
    expect(await ClassSessionModel.countDocuments({ classId: danceClass._id })).toBe(0);
  });

  it("protects a class that already has enrollment history", async () => {
    const danceClass = await createClass();
    const student = await StudentModel.create({
      organizationId,
      branchId,
      firstName: "Alumno",
      lastName: "Con historial"
    });
    await EnrollmentModel.create({ organizationId, branchId, classId: danceClass._id, studentId: student._id });

    const response = await deleteClass(danceClass._id);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("CLASS_HAS_HISTORY");
    expect(response.body.message).toContain("1 inscripción");
    expect(await DanceClassModel.findById(danceClass._id)).not.toBeNull();
  });
});
