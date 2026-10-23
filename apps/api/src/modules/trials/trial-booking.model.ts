import { Schema, Types, model } from "mongoose";

export const TRIAL_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "CONVERTED"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export interface TrialBooking {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  studentId: Types.ObjectId;
  /** Canonical identity; studentId is the compatibility participant key, not proof of a Student profile. */
  contactId?: Types.ObjectId;
  sessionId?: Types.ObjectId;
  kind: "TRIAL" | "COURTESY";
  authorizedByUserId?: Types.ObjectId;
  consumedAt?: Date;
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
    studentId: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact" },
    sessionId: { type: Schema.Types.ObjectId, ref: "ClassSession" },
    kind: { type: String, enum: ["TRIAL", "COURTESY"], default: "TRIAL" },
    authorizedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    consumedAt: Date,
    scheduledFor: { type: Date, required: true, index: true },
    status: { type: String, enum: TRIAL_STATUSES, default: "SCHEDULED", index: true },
    notes: { type: String, trim: true, maxlength: 500 },
    convertedEnrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment" }
  },
  { timestamps: true }
);

trialBookingSchema.index({ organizationId: 1, classId: 1, scheduledFor: 1 });
trialBookingSchema.index({ organizationId: 1, studentId: 1, status: 1 });
trialBookingSchema.index({ organizationId: 1, contactId: 1, classId: 1 }, {
  unique: true, partialFilterExpression: { contactId: { $type: "objectId" }, kind: "TRIAL", status: "SCHEDULED" }
});

export const TrialBookingModel = model<TrialBooking>("TrialBooking", trialBookingSchema);
