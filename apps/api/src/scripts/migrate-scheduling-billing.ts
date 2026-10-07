/**
 * Migration to versioned schedules, persistent sessions and the Charge/Collection model.
 *
 *   DRY RUN (default, writes nothing):  pnpm --filter @mym/api migrate:scheduling-billing
 *   APPLY on a local copy:              pnpm --filter @mym/api migrate:scheduling-billing -- --apply
 *   APPLY on a remote database:         ... -- --apply --allow-remote   (after a backup!)
 *
 * Repeatable and idempotent: a second run creates nothing new. Ambiguous financial history is
 * written to MigrationIssue (visible in Pagos > Revisión) instead of being guessed. The report is
 * printed and saved as JSON next to the current directory.
 *
 * Recommended order:
 *   1. Deploy the code (legacy endpoints keep working and mirror every new write).
 *   2. Restore a production backup locally and run the dry-run, then --apply, and compare the
 *      validation block (legacy paid = mirrored collections; legacy open = mirrored open).
 *   3. Back up production, run the dry-run there, review, then --apply --allow-remote.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { env } from "../config/env";
import { connectDatabase, disconnectDatabase } from "../database/connect";
import { assertSafeTarget, runSchedulingBillingMigration } from "../modules/billing/migration";

async function main() {
  const apply = process.argv.includes("--apply");
  const allowRemote = process.argv.includes("--allow-remote");
  if (apply) assertSafeTarget(env.MONGODB_URI, allowRemote);
  await connectDatabase();

  try {
    const report = await runSchedulingBillingMigration({ apply });
    console.log(JSON.stringify(report, null, 2));
    const file = `migration-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(`report saved to ${file}`);
    const { validation } = report;
    if (apply && (validation.legacyPaidCents !== validation.mirroredCollectionCents || validation.unmirroredPayments > 0)) {
      console.warn("WARNING: legacy and mirrored totals differ. Review MigrationIssue before using the new reports.");
      process.exitCode = 2;
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
