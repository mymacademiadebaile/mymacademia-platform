import { afterAll, beforeAll, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { academyNow, periodOf, weekDayFor } from "../../common/dates";
import { OrganizationModel } from "../core/organization.model";
import { BranchModel } from "../core/branch.model";
import { DanceClassModel } from "../classes/class.model";
import { StudentModel } from "../students/student.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ChargeModel } from "../billing/charge.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { BillingPeriodModel } from "../billing/billing-period.model";
import { acquireDailyJob, finishDailyJob } from "./daily-job-lease.model";
import { runDailyJobs } from "./daily-jobs";

let database: Awaited<ReturnType<typeof startReplicaSet>>;
beforeAll(async () => { database = await startReplicaSet(); }, 120000);
afterAll(async () => { await database.stop(); });

it("runs daily maintenance once per organization, creates monthly fees and sessions without duplicates", async () => {
  const now = new Date(), today = academyNow(now).date, period = periodOf(today);
  const organization = await OrganizationModel.create({ name: "QA diario", slug: "qa-diario" });
  const branch = await BranchModel.create({ organizationId: organization._id, name: "Sede QA" });
  const danceClass = await DanceClassModel.create({ organizationId: organization._id, branchId: branch._id,
    name: "Clase QA", professorIds: [], schedules: [{ day: weekDayFor(today), startTime: "18:00", endTime: "19:00" }],
    capacity: 12, billingMode: "MONTHLY", monthlyPrice: 30000 });
  const student = await StudentModel.create({ organizationId: organization._id, branchId: branch._id, firstName: "Alumna", lastName: "Ficticia" });
  await EnrollmentModel.create({ organizationId: organization._id, branchId: branch._id, classId: danceClass._id,
    studentId: student._id, billingPreference: "MONTHLY", periods: [{ startDate: `${period}-01` }] });
  if (!today.endsWith("-01")) {
    const newcomer = await StudentModel.create({ organizationId: organization._id, branchId: branch._id, firstName: "Ingreso", lastName: "Parcial" });
    await EnrollmentModel.create({ organizationId: organization._id, branchId: branch._id, classId: danceClass._id,
      studentId: newcomer._id, billingPreference: "MONTHLY", periods: [{ startDate: today }] });
  }

  const runs = await Promise.all([runDailyJobs(now), runDailyJobs(now)]);
  expect(runs.map((run) => run.organizations[0].status).sort()).toEqual(["COMPLETED", "SKIPPED"]);
  const completed = runs.find((run) => run.organizations[0].status === "COMPLETED")!;
  expect(completed.organizations[0].billing?.pendingDecision).toHaveLength(today.endsWith("-01") ? 0 : 1);
  expect(runs.flatMap((run) => run.failedOrganizations)).toEqual([]);
  expect(await ChargeModel.countDocuments({ organizationId: organization._id, kind: "MONTHLY_FEE", period })).toBe(1);
  const sessions = await ClassSessionModel.countDocuments({ organizationId: organization._id });
  expect(sessions).toBeGreaterThan(0);
  expect((await runDailyJobs(now)).organizations[0].status).toBe("SKIPPED");
  expect(await ClassSessionModel.countDocuments({ organizationId: organization._id })).toBe(sessions);
  expect(await BillingPeriodModel.countDocuments({ organizationId: organization._id, period })).toBe(1);
  const after = await runDailyJobs(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));
  expect(after.failedOrganizations).toEqual([]);
  expect(await ChargeModel.countDocuments({ organizationId: organization._id, kind: "MONTHLY_FEE", period })).toBe(1);
});

it("releases a failed lease for a safe retry and never reacquires a completed day", async () => {
  const organization = await OrganizationModel.create({ name: "QA reintento", slug: "qa-reintento" });
  const id = String(organization._id), now = new Date(), date = academyNow(now).date;
  expect(await acquireDailyJob(id, date, "first", now)).toBeTruthy();
  expect(await acquireDailyJob(id, date, "other", now)).toBeNull();
  await finishDailyJob(id, date, "first", "FAILED");
  expect(await acquireDailyJob(id, date, "retry", now)).toBeTruthy();
  await finishDailyJob(id, date, "retry", "COMPLETED");
  expect(await acquireDailyJob(id, date, "too-late", now)).toBeNull();
});

it("rejects an unauthenticated cron request and accepts the configured bearer secret", async () => {
  const original = env.CRON_SECRET;
  env.CRON_SECRET = "qa-cron-secret-isolated-only";
  try {
    const app = createApp();
    expect((await request(app).get("/api/internal/jobs/daily")).status).toBe(401);
    expect((await request(app).get("/api/internal/jobs/daily").set("Authorization", "Bearer wrong-secret")).status).toBe(401);
    const accepted = await request(app).get("/api/internal/jobs/daily").set("Authorization", `Bearer ${env.CRON_SECRET}`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.failedOrganizations).toEqual([]);
  } finally {
    env.CRON_SECRET = original;
  }
});
