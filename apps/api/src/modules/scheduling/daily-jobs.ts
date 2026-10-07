import { academyNow, addMonths, periodOf } from "../../common/dates";
import { generateMonthlyCharges } from "../billing/charge-service";
import { OrganizationModel } from "../core/organization.model";
import { generateSessions, rollingWindow } from "./session-generator";

/**
 * Daily maintenance, safe to run any number of times (every step is idempotent):
 * 1. materializes the rolling window of sessions (last week to the next two months);
 * 2. generates the monthly fees of the current month (new enrollments included) and, from the
 *    25th, of the next month so they exist before the month starts.
 * Calendar screens also generate missing sessions on demand, so a missed run never leaves gaps.
 */
export async function runDailyJobs(now = new Date()) {
  const today = academyNow(now).date;
  const organizations = await OrganizationModel.find({ isActive: true }).select("_id").lean();
  const results = [];

  for (const organization of organizations) {
    const organizationId = String(organization._id);
    const sessions = await generateSessions(organizationId, rollingWindow(today));
    const periods = [periodOf(today)];
    if (Number(today.slice(8, 10)) >= 25) periods.push(addMonths(periodOf(today), 1));
    const charges = [];
    for (const period of periods) {
      const result = await generateMonthlyCharges({ organizationId }, period);
      charges.push({ period, created: result.created, existing: result.existing, pendingDecision: result.pendingDecision.length });
    }
    results.push({ organizationId, sessions, charges });
  }

  return { today, organizations: results };
}
