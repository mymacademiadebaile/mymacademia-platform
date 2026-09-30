import type { BillingMode, PaymentType } from "@mym/shared";
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
