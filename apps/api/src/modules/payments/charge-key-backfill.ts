import { PaymentModel } from "./payment.model";
import {
  ACTIVE_CHARGE_INDEX_NAME,
  LEGACY_RECEIPT_INDEX_NAME,
  activeChargeKeyOf,
  occupiesChargeIdentity
} from "./active-charge-key";

type RawPayment = {
  _id: unknown;
  organizationId: unknown;
  studentId?: unknown;
  classId?: unknown;
  paymentType?: string;
  classDate?: Date | null;
  period?: string | null;
  status?: string;
  activeChargeKey?: string;
};

export interface ChargeKeyPlan {
  scanned: number;
  toSet: Array<{ id: unknown; key: string }>;
  toUnset: unknown[];
  unchanged: number;
  /** Active payments without a class: no class identity exists, so they get no key (not an error). */
  withoutClass: number;
  duplicates: Array<{ organizationId: string; key: string; paymentIds: string[] }>;
  invalid: Array<{ id: string; reason: string }>;
}

/** Pure: decides what each stored payment needs, without touching the database. */
export function planChargeKeyBackfill(payments: RawPayment[]): ChargeKeyPlan {
  const plan: ChargeKeyPlan = {
    scanned: payments.length,
    toSet: [],
    toUnset: [],
    unchanged: 0,
    withoutClass: 0,
    duplicates: [],
    invalid: []
  };
  const owners = new Map<string, { organizationId: string; key: string; paymentIds: string[] }>();

  for (const payment of payments) {
    if (!occupiesChargeIdentity(payment.status)) {
      if (payment.activeChargeKey !== undefined) plan.toUnset.push(payment._id);
      else plan.unchanged += 1;
      continue;
    }

    if (!payment.classId) {
      plan.withoutClass += 1;
      if (payment.activeChargeKey !== undefined) plan.toUnset.push(payment._id);
      continue;
    }

    const paymentType = payment.paymentType === "PER_CLASS" ? "PER_CLASS" : "MONTHLY";
    const key = activeChargeKeyOf({ ...payment, paymentType });

    if (!key) {
      plan.invalid.push({
        id: String(payment._id),
        reason:
          paymentType === "PER_CLASS"
            ? "PER_CLASS payment without a valid classDate"
            : "MONTHLY payment without a valid period (YYYY-MM)"
      });
      continue;
    }

    const ownerKey = `${String(payment.organizationId)}|${key}`;
    const owner = owners.get(ownerKey) ?? {
      organizationId: String(payment.organizationId),
      key,
      paymentIds: []
    };
    owner.paymentIds.push(String(payment._id));
    owners.set(ownerKey, owner);

    if (payment.activeChargeKey === key) plan.unchanged += 1;
    else plan.toSet.push({ id: payment._id, key });
  }

  plan.duplicates = [...owners.values()].filter((owner) => owner.paymentIds.length > 1);
  return plan;
}

export interface BackfillResult {
  plan: ChargeKeyPlan;
  applied: boolean;
  blockedReason?: string;
  indexPresent?: boolean;
  droppedLegacyReceiptIndex?: boolean;
}

/**
 * Loads every payment, plans the backfill and (only with apply) writes it.
 * Never deletes or cancels payments and never decides which duplicate to keep: if duplicates or
 * invalid payments exist, apply aborts before writing anything.
 */
export async function runChargeKeyBackfill(options: { apply: boolean }): Promise<BackfillResult> {
  const payments = (await PaymentModel.collection
    .find(
      {},
      {
        projection: {
          organizationId: 1,
          studentId: 1,
          classId: 1,
          paymentType: 1,
          classDate: 1,
          period: 1,
          status: 1,
          activeChargeKey: 1
        }
      }
    )
    .toArray()) as RawPayment[];

  const plan = planChargeKeyBackfill(payments);

  if (!options.apply) return { plan, applied: false };

  if (plan.duplicates.length > 0 || plan.invalid.length > 0) {
    return {
      plan,
      applied: false,
      blockedReason:
        "Duplicate or invalid active payments found. Resolve them manually and run the dry-run again."
    };
  }

  // The raw driver bypasses Mongoose hooks and timestamps on purpose: only the key changes.
  const operations = [
    ...plan.toSet.map((item) => ({
      updateOne: { filter: { _id: item.id }, update: { $set: { activeChargeKey: item.key } } }
    })),
    ...plan.toUnset.map((id) => ({
      updateOne: { filter: { _id: id }, update: { $unset: { activeChargeKey: "" } } }
    }))
  ];

  if (operations.length > 0) {
    await PaymentModel.collection.bulkWrite(operations as never);
  }

  // Drop the legacy sparse receipt index (it only lets one payment without receipt exist per
  // organization) before creating the partial replacements declared in the schema.
  const existing = await PaymentModel.collection.indexes();
  const legacyReceiptIndex = existing.find(
    (index) => index.name === LEGACY_RECEIPT_INDEX_NAME && !index.partialFilterExpression
  );
  if (legacyReceiptIndex) await PaymentModel.collection.dropIndex(LEGACY_RECEIPT_INDEX_NAME);

  await PaymentModel.createIndexes();
  const indexes = await PaymentModel.collection.indexes();
  const indexPresent = indexes.some((index) => index.name === ACTIVE_CHARGE_INDEX_NAME && index.unique);

  return { plan, applied: true, indexPresent, droppedLegacyReceiptIndex: Boolean(legacyReceiptIndex) };
}
