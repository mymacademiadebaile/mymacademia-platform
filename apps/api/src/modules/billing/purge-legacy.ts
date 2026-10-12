import type { Types } from "mongoose";
import { PaymentModel } from "../payments/payment.model";
import { ChargeModel } from "./charge.model";
import { CollectionModel } from "./collection.model";
import { MigrationIssueModel } from "./migration-issue.model";
import { PaymentAllocationModel } from "./payment-allocation.model";
import { RefundModel } from "./refund.model";

export interface PurgeLegacyOptions {
  /** Delete for real. Default false: only count what would be deleted. */
  apply?: boolean;
  /** Also delete the Charge/Collection/PaymentAllocation/Refund mirrored from legacy payments. */
  includeMirrors?: boolean;
}

export interface PurgeLegacyReport {
  mode: "DRY_RUN" | "APPLY";
  includeMirrors: boolean;
  /** Documents found (dry-run) or deleted (apply), per collection. */
  counts: {
    payments: number;
    migrationIssues: number;
    charges: number;
    collections: number;
    paymentAllocations: number;
    refunds: number;
  };
}

/**
 * Removes the legacy Payment documents (and the MigrationIssue rows about them). Native
 * Charge/Collection data is never touched; with `includeMirrors` only the documents mirrored from
 * a legacy payment (`legacyPaymentId` set, plus the allocations that join them) are removed.
 * The caller is responsible for pointing at the right database.
 */
export async function purgeLegacyPayments(options: PurgeLegacyOptions = {}): Promise<PurgeLegacyReport> {
  const apply = options.apply === true;
  const includeMirrors = options.includeMirrors === true;
  const mirrored = { legacyPaymentId: { $type: "objectId" } };
  const issueFilter = { entityType: "Payment" };

  let chargeIds: Types.ObjectId[] = [];
  let collectionIds: Types.ObjectId[] = [];
  let allocationFilter: Record<string, unknown> | null = null;
  if (includeMirrors) {
    [chargeIds, collectionIds] = (await Promise.all([
      ChargeModel.distinct("_id", mirrored),
      CollectionModel.distinct("_id", mirrored)
    ])) as [Types.ObjectId[], Types.ObjectId[]];
    // Allocations have no legacy link of their own: they belong to a mirror when either side is one.
    allocationFilter = { $or: [{ collectionId: { $in: collectionIds } }, { chargeId: { $in: chargeIds } }] };
  }

  const counts: PurgeLegacyReport["counts"] = {
    payments: await PaymentModel.countDocuments({}),
    migrationIssues: await MigrationIssueModel.countDocuments(issueFilter),
    charges: includeMirrors ? chargeIds.length : 0,
    collections: includeMirrors ? collectionIds.length : 0,
    paymentAllocations: allocationFilter ? await PaymentAllocationModel.countDocuments(allocationFilter) : 0,
    refunds: includeMirrors ? await RefundModel.countDocuments(mirrored) : 0
  };

  if (apply) {
    if (includeMirrors && allocationFilter) {
      // Children first so a failure half way never leaves allocations pointing at nothing.
      await RefundModel.deleteMany(mirrored);
      await PaymentAllocationModel.deleteMany(allocationFilter);
      await CollectionModel.deleteMany(mirrored);
      await ChargeModel.deleteMany(mirrored);
    }
    await MigrationIssueModel.deleteMany(issueFilter);
    await PaymentModel.deleteMany({});
  }

  return { mode: apply ? "APPLY" : "DRY_RUN", includeMirrors, counts };
}
