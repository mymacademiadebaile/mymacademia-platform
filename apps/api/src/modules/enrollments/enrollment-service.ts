import type { PaymentType } from "@mym/shared";
import { Types } from "mongoose";
import { academyDateOf, academyNow, addDays } from "../../common/dates";
import type { Enrollment } from "./enrollment.model";
import { enrollmentPeriods, openPeriod } from "./enrollment-validity";

type EnrollmentDocument = Enrollment & {
  _id: Types.ObjectId;
  createdAt?: Date;
  set?: (path: string, value: unknown) => void;
  markModified?: (path: string) => void;
};

/** Writes the legacy periods (derived from enrolledAt/endedAt) so history becomes explicit. */
function materializePeriods(enrollment: EnrollmentDocument) {
  if (!enrollment.periods?.length) {
    enrollment.periods = enrollmentPeriods(enrollment).map((period) => ({ ...period }));
  }
}

/**
 * Closes the running period with `lastDay` as the last day the student belonged to the group.
 * Attendance, charges and payments before that day are untouched.
 */
export function closeEnrollment(enrollment: EnrollmentDocument, lastDay = academyNow().date, reason?: string) {
  materializePeriods(enrollment);
  const current = openPeriod(enrollment);
  if (current) {
    current.endDate = lastDay < current.startDate ? current.startDate : lastDay;
    if (reason) current.endReason = reason;
  }
  enrollment.status = "INACTIVE";
  enrollment.endedAt = new Date();
  enrollment.markModified?.("periods");
}

/** Opens a new period from `startDate`. Previous periods stay as history. */
export function reopenEnrollment(enrollment: EnrollmentDocument, startDate = academyNow().date) {
  materializePeriods(enrollment);
  const last = enrollment.periods.at(-1);
  if (last && !last.endDate) {
    // Defensive: an inactive enrollment with an open period is closed the day before.
    last.endDate = addDays(startDate, -1) < last.startDate ? last.startDate : addDays(startDate, -1);
  }
  if (last?.endDate && last.endDate >= startDate) {
    // Re-enrolling inside the last period simply extends it.
    last.endDate = undefined;
  } else {
    enrollment.periods.push({ startDate });
  }
  enrollment.status = "ACTIVE";
  enrollment.enrolledAt = new Date();
  enrollment.endedAt = undefined;
  enrollment.markModified?.("periods");
}

/** Records a billing mode change effective from a calendar day. History is never rewritten. */
export function recordBillingChange(
  enrollment: EnrollmentDocument,
  mode: PaymentType | undefined,
  effectiveDate = academyNow().date,
  userId?: string
) {
  if (!mode) {
    enrollment.billingPreference = undefined;
    return;
  }
  if (!enrollment.billingChanges?.length && enrollment.billingPreference && enrollment.billingPreference !== mode) {
    // Keep the mode that applied before the first recorded change.
    const start = enrollmentPeriods(enrollment)[0]?.startDate ?? academyDateOf(enrollment.createdAt ?? new Date());
    enrollment.billingChanges = [{ effectiveDate: start, mode: enrollment.billingPreference }];
  }
  const changes = (enrollment.billingChanges ?? []).filter((change) => change.effectiveDate < effectiveDate);
  changes.push({
    effectiveDate,
    mode,
    changedByUserId: userId ? new Types.ObjectId(userId) : undefined,
    changedAt: new Date()
  });
  enrollment.billingChanges = changes;
  enrollment.billingPreference = mode;
  enrollment.markModified?.("billingChanges");
}

/** Fields of a brand new enrollment. */
export function newEnrollmentFields(input: {
  startDate?: string;
  billingPreference?: PaymentType;
  userId?: string;
}) {
  const startDate = input.startDate ?? academyNow().date;
  return {
    status: "ACTIVE" as const,
    enrolledAt: new Date(),
    periods: [{ startDate }],
    billingPreference: input.billingPreference,
    billingChanges: input.billingPreference
      ? [{
          effectiveDate: startDate,
          mode: input.billingPreference,
          changedByUserId: input.userId ? new Types.ObjectId(input.userId) : undefined,
          changedAt: new Date()
        }]
      : []
  };
}
