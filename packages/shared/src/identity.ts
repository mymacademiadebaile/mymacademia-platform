export const OPPORTUNITY_STATUSES = ["OPEN", "FOLLOW_UP", "TRIAL_BOOKED", "CONVERTED", "LOST"] as const;
export type OpportunityStatus = typeof OPPORTUNITY_STATUSES[number];
export const GRATUITY_KINDS = ["TRIAL", "COURTESY"] as const;
export type GratuityKind = typeof GRATUITY_KINDS[number];

export interface ContactSummary {
  dni?: string;
  _id: string;
  branchId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  academic?: boolean;
  isActive: boolean;
  notes?: string;
  source?: { platform: string; campaign?: string; advertisement?: string; externalId?: string };
  preferences?: { emailReminders: boolean; marketing: boolean };
}
export interface TrialBookingView {
  _id: string;
  classId: { _id: string; name: string };
  sessionId?: string;
  kind: GratuityKind;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "CONVERTED";
  scheduledFor: string;
  consumedAt?: string;
  convertedEnrollmentId?: string;
}
export interface ContactDetailResponse {
  contact: ContactSummary;
  student: { _id: string } | null;
  opportunities: Array<{ _id: string; classId: { _id: string; name: string }; status: OpportunityStatus; notes?: string; followUpOn?: string }>;
  trials: TrialBookingView[];
  benefits: Array<{ classId: string; consumedAt?: string; activeBookingId?: string }>;
  enrollments: Array<{ _id: string; classId: { _id: string; name: string }; status: string }>;
}
