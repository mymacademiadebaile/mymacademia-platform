import type { PaymentType } from "@mym/shared";
import { classDateKey } from "../../common/dates";

/** Name of the unique partial index that enforces one active charge per logical identity. */
export const ACTIVE_CHARGE_INDEX_NAME = "uniq_organization_active_charge";

/**
 * Receipt numbers are unique per organization only among payments that have one. The previous
 * index (sparse + unique over {organizationId, receiptNumber}) indexed every payment without a
 * receipt as receiptNumber = null, so an organization could hold a single payment without receipt.
 */
export const RECEIPT_INDEX_NAME = "uniq_organization_receipt_number";
export const LEGACY_RECEIPT_INDEX_NAME = "organizationId_1_receiptNumber_1";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Persisted statuses that occupy the identity of a charge (PENDING, PAID, OVERDUE).
 * CANCELLED releases it.
 */
export function occupiesChargeIdentity(status?: string) {
  return status !== "CANCELLED";
}

/**
 * Canonical identity of an active charge, used only as a database uniqueness guard
 * (the organization is part of the unique index, not of the key):
 *   PER_CLASS -> PER_CLASS:<student>:<class>:<YYYY-MM-DD>
 *   MONTHLY   -> MONTHLY:<student>:<class>:<YYYY-MM>
 * The free-text concept is never part of it. Returns undefined when the identity cannot be built.
 */
export function buildActiveChargeKey(input: {
  paymentType: PaymentType;
  studentId?: unknown;
  classId?: unknown;
  classDay?: string;
  period?: string;
}): string | undefined {
  if (!input.studentId || !input.classId) return undefined;
  const base = `${input.paymentType}:${String(input.studentId)}:${String(input.classId)}`;

  if (input.paymentType === "PER_CLASS") {
    return input.classDay && DAY_PATTERN.test(input.classDay) ? `${base}:${input.classDay}` : undefined;
  }

  return input.period && PERIOD_PATTERN.test(input.period) ? `${base}:${input.period}` : undefined;
}

/** Key of a stored payment: the logical class day is the UTC day of classDate (same rule as duplicates). */
export function activeChargeKeyOf(payment: {
  paymentType: PaymentType;
  studentId?: unknown;
  classId?: unknown;
  classDate?: Date | null;
  period?: string | null;
  status?: string;
}): string | undefined {
  if (!occupiesChargeIdentity(payment.status)) return undefined;

  const classDate = payment.classDate;
  const classDay =
    classDate instanceof Date && !Number.isNaN(classDate.getTime()) ? classDateKey(classDate) : undefined;

  return buildActiveChargeKey({
    paymentType: payment.paymentType,
    studentId: payment.studentId,
    classId: payment.classId,
    classDay,
    period: payment.period ?? undefined
  });
}
