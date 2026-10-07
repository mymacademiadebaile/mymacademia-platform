import { Schema, Types, model } from "mongoose";

export const ATTENDANCE_STATUSES = ["EXPECTED", "PRESENT", "ABSENT"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * Why a student is part of a session:
 * - ENROLLMENT: regular member of the group (enrollment valid on that day);
 * - TRIAL: free trial class;
 * - AUTHORIZED: added by the administration for this session only (drop-in, guest);
 * - MAKEUP: attends to recover a class missed elsewhere.
 */
export const PARTICIPANT_TYPES = ["ENROLLMENT", "TRIAL", "AUTHORIZED", "MAKEUP"] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

/**
 * Participant of a session and its attendance. Once a session's roster is frozen these rows ARE
 * the roster: later enrollment changes never add or remove people from that session.
 */
export interface ClassAttendance {
  organizationId: Types.ObjectId;
  sessionId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: AttendanceStatus;
  /** Absent on rows written by the system when the roster is frozen. */
  updatedByUserId?: Types.ObjectId;
  participantType: ParticipantType;
  enrollmentId?: Types.ObjectId;
  trialId?: Types.ObjectId;
  /** When this participant was added on purpose (AUTHORIZED / MAKEUP). */
  addedByUserId?: Types.ObjectId;
  /** Session the student would have attended (MAKEUP) or came from (reschedule copy). */
  sourceSessionId?: Types.ObjectId;
  /** Removed from a future session after being added on purpose. Kept for history. */
  removedAt?: Date;
  recordedAt?: Date;
  note?: string;
}

const classAttendanceSchema = new Schema<ClassAttendance>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "ClassSession", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    status: { type: String, enum: ATTENDANCE_STATUSES, default: "EXPECTED" },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    participantType: { type: String, enum: PARTICIPANT_TYPES, default: "ENROLLMENT" },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment" },
    trialId: { type: Schema.Types.ObjectId, ref: "TrialBooking" },
    addedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    sourceSessionId: { type: Schema.Types.ObjectId, ref: "ClassSession" },
    removedAt: { type: Date },
    recordedAt: { type: Date },
    note: { type: String, trim: true, maxlength: 300 }
  },
  { timestamps: true }
);

classAttendanceSchema.index(
  { organizationId: 1, sessionId: 1, studentId: 1 },
  { unique: true }
);

export const ClassAttendanceModel = model<ClassAttendance>(
  "ClassAttendance",
  classAttendanceSchema
);
