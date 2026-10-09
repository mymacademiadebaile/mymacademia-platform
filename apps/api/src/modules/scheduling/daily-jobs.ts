import { academyNow } from "../../common/dates";
import { OrganizationModel } from "../core/organization.model";
import { generateSessions, rollingWindow } from "./session-generator";

/**
 * Daily maintenance, safe to run any number of times (every step is idempotent):
 * Materializes the rolling window of sessions (last week to the next two months). Monthly
 * obligations are calculated when the administrator opens "Por cobrar", so this job never
 * creates financial records in the background.
 */
export async function runDailyJobs(now = new Date()) {
  const today = academyNow(now).date;
  const organizations = await OrganizationModel.find({ isActive: true }).select("_id").lean();
  const results = [];

  for (const organization of organizations) {
    const organizationId = String(organization._id);
    const sessions = await generateSessions(organizationId, rollingWindow(today));
    results.push({ organizationId, sessions });
  }

  return { today, organizations: results };
}
