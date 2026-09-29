import { Schema, Types, model } from "mongoose";

export const TRIAL_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "CONVERTED"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export interface TrialBooking {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  studentId: Types.ObjectId;
  scheduledFor: Date;
  status: TrialStatus;
  notes?: string;
  convertedEnrollmentId?: Types.ObjectId;
}

const trialBookingSchema = new Schema<TrialBooking>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    scheduledFor: { type: Date, required: true, index: true },
    status: { type: String, enum: TRIAL_STATUSES, default: "SCHEDULED", index: true },
    notes: { type: String, trim: true, maxlength: 500 },
    convertedEnrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment" }
  },
  { timestamps: true }
);

trialBookingSchema.index({ organizationId: 1, classId: 1, scheduledFor: 1 });
trialBookingSchema.index({ organizationId: 1, studentId: 1, status: 1 });

export const TrialBookingModel = model<TrialBooking>("TrialBooking", trialBookingSchema);
