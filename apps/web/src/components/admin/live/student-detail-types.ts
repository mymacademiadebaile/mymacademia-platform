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
