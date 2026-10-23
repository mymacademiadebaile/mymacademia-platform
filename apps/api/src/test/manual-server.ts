import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import express from "express";

/** Isolated UI verification only. Always creates its own ephemeral database; SMTP points to localhost. */
async function main() {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, { NODE_ENV: "test", MONGODB_URI: database.getUri(), APP_ORIGIN: "http://localhost:3000",
    JWT_ACCESS_SECRET: "isolated-ui-test-secret-never-used-in-production", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1",
    SMTP_SECURE: "false", SMTP_USER: "local@example.test", SMTP_PASSWORD: "local-only", RATE_LIMIT_MAX: "1000" });
  const { createApp } = await import("../app");
  const { academyNow, weekDayFor } = await import("../common/dates");
  const { OrganizationModel } = await import("../modules/core/organization.model");
  const { BranchModel } = await import("../modules/core/branch.model");
  const { UserModel } = await import("../modules/auth/user.model");
  const { DanceClassModel } = await import("../modules/classes/class.model");
  const { ContactModel } = await import("../modules/contacts/contact.model");
  const { StudentModel } = await import("../modules/students/student.model");
  const { EnrollmentModel } = await import("../modules/enrollments/enrollment.model");
  await mongoose.connect(database.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  const org = await OrganizationModel.create({ name: "M&M Academia · Verificación local", slug: "mym-academia" });
  const branch = await BranchModel.create({ organizationId: org._id, name: "Sede Centro" });
  const admin = await UserModel.create({ organizationId: org._id, branchIds: [branch._id], email: "admin@example.test",
    passwordHash: await bcrypt.hash("LocalDemoOnly-1234", 10), firstName: "Recepción", lastName: "Local", role: "ADMIN" });
  const now = academyNow();
  const startTime = now.time;
  const minute = Math.min(Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + 60, 1439);
  const endTime = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const danceClass = await DanceClassModel.create({ organizationId: org._id, branchId: branch._id, name: "Salsa inicial", professorIds: [],
    schedules: [{ day: weekDayFor(now.date), startTime, endTime }], capacity: 20, billingMode: "PER_CLASS", pricePerClass: 5000, freeTrialEnabled: true });
  const contact = await ContactModel.create({ organizationId: org._id, branchId: branch._id, firstName: "Lucía", lastName: "Pérez", source: { platform: "INSTAGRAM" } });
  const student = await StudentModel.create({ _id: contact._id, contactId: contact._id, organizationId: org._id, branchId: branch._id, firstName: "Lucía", lastName: "Pérez" });
  await EnrollmentModel.create({ organizationId: org._id, branchId: branch._id, classId: danceClass._id, studentId: student._id, billingPreference: "PER_CLASS", periods: [{ startDate: now.date }] });
  const local = express();
  local.get("/__test/isolated", (_request, response) => response.json({ isolated: true }));
  local.use(createApp());
  const server = local.listen(4000, "127.0.0.1", () => console.log("Isolated UI API ready on localhost:4000; admin@example.test / LocalDemoOnly-1234; no remote database or SMTP"));
  const stop = async () => { server.close(); await mongoose.disconnect(); await database.stop(); process.exit(0); };
  process.on("SIGINT", () => void stop()); process.on("SIGTERM", () => void stop());
  void admin;
}
void main().catch(() => { console.error("Could not start isolated UI API"); process.exitCode = 1; });
