import { randomUUID } from "node:crypto";
import { processScheduledDebtReminders } from "../notifications/debt-reminder-service";
import { academyNow, periodOf } from "../../common/dates";
import { OrganizationModel } from "../core/organization.model";
import { generateMonthlyCharges } from "../billing/charge-service";
import { generateSessions, rollingWindow } from "./session-generator";
import { acquireDailyJob, finishDailyJob } from "./daily-job-lease.model";

/**
 * Daily maintenance, safe to run any number of times (every step is idempotent):
 * Materializes the rolling window of sessions and this month's monthly obligations.
 * A first-month fee requiring an administrator's decision stays pending; no policy is invented.
 * Automatic reminders run only when both administrative switches are enabled.
 */
export async function runDailyJobs(now = new Date()) {
  const today = academyNow(now).date;
  const runId = randomUUID();
  const organizations = await OrganizationModel.find({ isActive: true }).select("_id").lean();
  const results = [];
  const failedOrganizations: string[] = [];

  for (const organization of organizations) {
    const organizationId = String(organization._id);
    if (!await acquireDailyJob(organizationId, today, runId, now)) {
      results.push({ organizationId, status: "SKIPPED" as const });
      continue;
    }
    try {
      const sessions = await generateSessions(organizationId, rollingWindow(today));
      const billing = await generateMonthlyCharges({ organizationId }, periodOf(today));
      const reminders = await processScheduledDebtReminders(organizationId, now);
      await finishDailyJob(organizationId, today, runId, "COMPLETED");
      results.push({ organizationId, status: "COMPLETED" as const, sessions, billing, reminders });
      console.info(JSON.stringify({ event: "daily-job-completed", runId, organizationId, today, sessionsCreated: sessions.created, monthlyChargesCreated: billing.created,
        pendingDecisions: billing.pendingDecision.length, remindersSent: reminders.sent, remindersFailed: reminders.failed }));
    } catch (error) {
      await finishDailyJob(organizationId, today, runId, "FAILED");
      failedOrganizations.push(organizationId);
      results.push({ organizationId, status: "FAILED" as const });
      console.error(JSON.stringify({ event: "daily-job-failed", runId, organizationId, today,
        errorType: error instanceof Error ? error.name : "UNKNOWN" }));
    }
  }

  return { runId, today, organizations: results, failedOrganizations };
}
