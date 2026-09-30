/**
 * Backfill of Payment.activeChargeKey (P1-07).
 *
 * Existing payments created before the unique index have no key. This script computes it for the
 * active ones (PENDING, PAID, OVERDUE), removes it from CANCELLED ones and reports problems.
 *
 *   DRY RUN (default, writes nothing):  pnpm --filter @mym/api payments:backfill-charge-keys
 *   APPLY:                              pnpm --filter @mym/api payments:backfill-charge-keys -- --apply
 *
 * It never deletes or cancels payments. If two active payments share the same identity
 * (organization + student + class + class day / period) or an active payment has no usable
 * classDate / period, apply aborts before writing; fix them by hand first.
 * It is idempotent: a second run changes nothing.
 *
 * Apply also drops the legacy sparse receipt index (organizationId_1_receiptNumber_1), which only lets
 * ONE payment without receipt exist per organization, and creates the partial indexes of the schema.
 *
 * Safe order for production:
 *   1. Deploy the code (new payments get their key; the unique index only covers documents with a key,
 *      so it does not conflict with existing data).
 *   2. Run the dry-run and read the report.
 *   3. Resolve duplicates / invalid payments manually (cancel the wrong one from the admin).
 *   4. Run with --apply.
 *   5. Check the output: "unique index present: true".
 */
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../database/connect";
import { runChargeKeyBackfill } from "../modules/payments/charge-key-backfill";

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDatabase();

  try {
    const { plan, applied, blockedReason, indexPresent, droppedLegacyReceiptIndex } =
      await runChargeKeyBackfill({ apply });

    console.log(apply ? "MODE: APPLY" : "MODE: DRY RUN (nothing is written)");
    console.log(`payments scanned: ${plan.scanned}`);
    console.log(`keys to set: ${plan.toSet.length}`);
    console.log(`keys to remove (cancelled): ${plan.toUnset.length}`);
    console.log(`already correct: ${plan.unchanged}`);
    console.log(`active payments without class (no key): ${plan.withoutClass}`);
    console.log(`duplicate active charges: ${plan.duplicates.length}`);
    for (const duplicate of plan.duplicates) {
      console.log(`  org ${duplicate.organizationId} ${duplicate.key} -> payments ${duplicate.paymentIds.join(", ")}`);
    }
    console.log(`invalid active payments: ${plan.invalid.length}`);
    for (const invalid of plan.invalid) console.log(`  ${invalid.id}: ${invalid.reason}`);

    if (blockedReason) {
      console.error(`ABORTED: ${blockedReason}`);
      process.exitCode = 1;
    } else if (applied) {
      console.log(`legacy receipt index dropped: ${droppedLegacyReceiptIndex}`);
      console.log(`applied. unique index present: ${indexPresent}`);
    } else if (plan.duplicates.length || plan.invalid.length) {
      console.log("apply would abort until the problems above are resolved.");
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
