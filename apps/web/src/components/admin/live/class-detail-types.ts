import type { BillingPreference, Student } from "./live-types";

export type ScheduleDraft = { day: string; startTime: string; endTime: string };

export type Enrollment = {
  _id: string;
  studentId: Student;
  enrolledAt: string;
  endedAt?: string;
  status?: "ACTIVE" | "INACTIVE";
  periods?: Array<{ startDate: string; endDate?: string; endReason?: string }>;
  seriesIds?: string[];
  billingPreference?: BillingPreference;
  monthlyPlan?: 4 | 8;
};

export type TrialBooking = {
  _id: string;
  studentId: Student;
  scheduledFor: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "CONVERTED";
  notes?: string;
};

export type TrialResponse = { items: TrialBooking[] };
export type EnrollmentResponse = {
  items: Enrollment[];
  history?: Enrollment[];
  capacity: number;
  occupied: number;
  available: number;
};
