import type { PaymentType } from "@mym/shared";
import { academyDateOf } from "../../common/dates";
import type { BillingChange, EnrollmentPeriod } from "./enrollment.model";

interface EnrollmentLike {
  status?: string;
  enrolledAt?: Date;
  endedAt?: Date;
  createdAt?: Date;
  periods?: EnrollmentPeriod[];
  billingPreference?: PaymentType;
  billingChanges?: BillingChange[];
  scheduleKeys?: string[];
  seriesIds?: unknown[];
}

/**
 * Validity periods of an enrollment. Documents created before periods existed fall back to
 * enrolledAt/endedAt (read as Argentina calendar days).
 */
export function enrollmentPeriods(enrollment: EnrollmentLike): EnrollmentPeriod[] {
  if (enrollment.periods?.length) return enrollment.periods;
  const startDate = academyDateOf(enrollment.enrolledAt ?? enrollment.createdAt ?? new Date(0));
  if (enrollment.status === "ACTIVE") return [{ startDate }];
  const endDate = enrollment.endedAt ? academyDateOf(enrollment.endedAt) : startDate;
  return [{ startDate, endDate: endDate < startDate ? startDate : endDate }];
}

/** True when the student belonged to the group on that calendar day. */
export function isEnrollmentValidOn(enrollment: EnrollmentLike, date: string) {
  return enrollmentPeriods(enrollment).some(
    (period) => period.startDate <= date && (!period.endDate || date <= period.endDate)
  );
}

/** True when any validity period overlaps [from, to]. */
export function isEnrollmentValidDuring(enrollment: EnrollmentLike, from: string, to: string) {
  return enrollmentPeriods(enrollment).some(
    (period) => period.startDate <= to && (!period.endDate || period.endDate >= from)
  );
}

/** The open period, if the enrollment is currently running. */
export function openPeriod(enrollment: EnrollmentLike) {
  return enrollmentPeriods(enrollment).find((period) => !period.endDate);
}

/** Billing mode in force on a calendar day (history first, then the current preference). */
export function billingModeOn(enrollment: EnrollmentLike, date: string): PaymentType | undefined {
  const changes = [...(enrollment.billingChanges ?? [])]
    .filter((change) => change.effectiveDate <= date)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return changes.at(-1)?.mode ?? enrollment.billingPreference;
}

/** Whether the enrollment's habitual schedule includes a session. */
export function enrollmentMatchesSeries(
  enrollment: EnrollmentLike,
  session: { seriesId?: unknown; legacySlotKey?: string }
) {
  // Extra sessions (no series) are for the whole group.
  if (!session.seriesId) return true;
  if (enrollment.seriesIds?.length) {
    return enrollment.seriesIds.some((id) => String(id) === String(session.seriesId));
  }
  if (enrollment.scheduleKeys?.length && session.legacySlotKey) {
    return enrollment.scheduleKeys.includes(session.legacySlotKey);
  }
  // Legacy enrollments without a selection keep the original "every slot" behaviour.
  return true;
}
