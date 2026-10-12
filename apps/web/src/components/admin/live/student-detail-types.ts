import type { ChargeView } from "../billing/billing-types";
import type { BillingPreference, DanceClass, Payment, Student } from "./live-types";

export type Enrollment = {
  _id: string;
  status: "ACTIVE" | "INACTIVE";
  enrolledAt: string;
  endedAt?: string;
  billingPreference?: BillingPreference;
  scheduleKeys?: string[];
  classId: DanceClass;
};

export type StudentDetail = {
  student: Student;
  enrollments: Enrollment[];
  payments: Payment[];
  financial: {
    paidAmount: number;
    paidCount: number;
    pendingAmount: number;
    pendingCount: number;
    overdueAmount: number;
    overdueCount: number;
  };
};

/** A charge of the student account, with the collection that last paid it (for its receipt). */
export type AccountCharge = ChargeView & { lastCollection?: { id: string; receiptNumber: string | null } | null };
