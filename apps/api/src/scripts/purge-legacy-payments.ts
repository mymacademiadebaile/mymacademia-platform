/**
 * Deletes the legacy Payment collection (test data) once the new billing model is the only one used.
 *
 *   DRY RUN (default, deletes nothing):  pnpm --filter @mym/api payments:purge-legacy
 *   APPLY on a local database:           pnpm --filter @mym/api payments:purge-legacy -- --apply
 *   Also delete the mirrored documents:  ... -- --apply --include-mirrors
 *   APPLY on a remote database:          ... -- --apply --allow-remote   (after a backup!)
 *
 * Without --include-mirrors only Payment and its MigrationIssue rows go. With it, the Charge,
 * Collection, PaymentAllocation and Refund created from legacy payments (legacyPaymentId) go too.
 */
import "dotenv/config";
import { env } from "../config/env";
import { connectDatabase, disconnectDatabase } from "../database/connect";
import { assertSafeTarget } from "../modules/billing/migration";
import { purgeLegacyPayments } from "../modules/billing/purge-legacy";

function describeTarget(uri: string) {
  try {
    const url = new URL(uri);
    return `${url.host}${url.pathname}`;
  } catch {
    return "(unparseable URI)";
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const includeMirrors = process.argv.includes("--include-mirrors");
  const allowRemote = process.argv.includes("--allow-remote");
  if (apply) assertSafeTarget(env.MONGODB_URI, allowRemote);
  console.log(`target: ${describeTarget(env.MONGODB_URI)} (${apply ? "APPLY" : "dry-run"})`);
  await connectDatabase();

  try {
    const report = await purgeLegacyPayments({ apply, includeMirrors });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
