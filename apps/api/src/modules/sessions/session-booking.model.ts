import { Schema, Types, model } from "mongoose";

export const SESSION_BOOKING_STATUSES = ["BOOKED", "CANCELLED"] as const;
export type SessionBookingStatus = (typeof SESSION_BOOKING_STATUSES)[number];

/**
 * A date-specific exception to an enrollment's recurring schedule. Regular bookings are
 * derived from Enrollment.scheduleKeys; this collection records only cancellations and moves.
 */
export interface SessionBooking {
  organizationId: Types.ObjectId;
  classId: Types.ObjectId;
  sessionId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: SessionBookingStatus;
  sourceSessionId?: Types.ObjectId;
  changedByUserId: Types.ObjectId;
  changedAt: Date;
}

const sessionBookingSchema = new Schema<SessionBooking>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "ClassSession", required: true, index: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    status: { type: String, enum: SESSION_BOOKING_STATUSES, required: true },
    sourceSessionId: { type: Schema.Types.ObjectId, ref: "ClassSession" },
    changedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    changedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// One override per enrolled student and session. Updating it is idempotent and preserves timestamps.
sessionBookingSchema.index({ organizationId: 1, sessionId: 1, enrollmentId: 1 }, { unique: true });

export const SessionBookingModel = model<SessionBooking>("SessionBooking", sessionBookingSchema);
