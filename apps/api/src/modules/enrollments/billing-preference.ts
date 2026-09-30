import { PAYMENT_TYPES, type BillingMode, type PaymentType } from "@mym/shared";
import type { Types } from "mongoose";
import { AppError } from "../../common/http/app-error";

const DEFAULT_BILLING_PREFERENCE: PaymentType = "PER_CLASS";

function invalidBillingPreference() {
  return new AppError(
    422,
    "La modalidad de cobro seleccionada no es válida para esta clase.",
    "INVALID_BILLING_PREFERENCE"
  );
}

/**
 * Single rule for Enrollment.billingPreference given the class billingMode.
 * - PER_CLASS / MONTHLY: always that mode; an explicit incompatible request is rejected.
 * - FREE: no preference (the field is absent, never inherited from a previous enrollment).
 * - BOTH: requested, else the previous preference if still valid, else PER_CLASS.
 */
export function resolveBillingPreference(
  billingMode: BillingMode,
  requested?: PaymentType,
  previous?: PaymentType | null
): PaymentType | undefined {
  if (billingMode === "FREE") return undefined;

  if (billingMode === "PER_CLASS" || billingMode === "MONTHLY") {
    if (requested && requested !== billingMode) throw invalidBillingPreference();
    return billingMode;
  }

  return requested ?? previous ?? DEFAULT_BILLING_PREFERENCE;
}

/**
 * Update for (re)activating an existing enrollment. `$unset` removes the fields for real:
 * `$set: { field: undefined }` is dropped by Mongoose and would leave stale values behind.
 */
export function enrollmentActivationUpdate(input: {
  branchId: Types.ObjectId;
  billingPreference?: PaymentType;
}) {
  const $set: Record<string, unknown> = {
    branchId: input.branchId,
    status: "ACTIVE",
    enrolledAt: new Date()
  };
  const $unset: Record<string, 1> = { endedAt: 1 };

  if (input.billingPreference) {
    $set.billingPreference = input.billingPreference;
  } else {
    $unset.billingPreference = 1;
  }

  return { $set, $unset };
}

/**
 * How to bring the ACTIVE enrollments of a class in line with its (new) billingMode.
 * Built on resolveBillingPreference so the rule lives in one place:
 * - PER_CLASS / MONTHLY: every enrollment that differs gets that mode.
 * - FREE: the preference is removed for real with $unset.
 * - BOTH: valid preferences are kept; missing or legacy values become the BOTH default.
 * Callers must add organizationId, classId and status: "ACTIVE" to the filter.
 */
export function enrollmentReconciliation(billingMode: BillingMode) {
  const preference = resolveBillingPreference(billingMode);

  if (!preference) {
    return {
      filter: { billingPreference: { $exists: true } },
      update: { $unset: { billingPreference: 1 } }
    } as const;
  }

  return {
    // Only rows that actually need a change, so untouched enrollments keep their updatedAt.
    filter:
      billingMode === "BOTH"
        ? { billingPreference: { $nin: [...PAYMENT_TYPES] } }
        : { billingPreference: { $ne: preference } },
    update: { $set: { billingPreference: preference } }
  } as const;
}
