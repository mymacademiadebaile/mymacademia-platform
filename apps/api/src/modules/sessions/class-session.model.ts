import { SESSION_ORIGINS, SESSION_STATUSES, type SessionOrigin, type SessionStatus } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

export const CLASS_SESSION_STATUSES = SESSION_STATUSES;
export type ClassSessionStatus = SessionStatus;

/** Statuses in which a session takes place (or took place) and occupies its time slot. */
export const SLOT_HOLDING_STATUSES: ClassSessionStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED"];

export interface SessionStatusChange {
  from: ClassSessionStatus | null;
  to: ClassSessionStatus;
  reason?: string;
  userId?: Types.ObjectId;
  at: Date;
}

/**
 * One concrete meeting of a group. Its `_id` is its identity: time, space or professor changes
 * keep it, so attendance, bookings and charges never lose their reference.
 *
 * Regular sessions are generated from a ClassSchedule series and identified by
 * `occurrenceKey = <seriesId>:<occurrenceDate>`, where `occurrenceDate` is the day the rule
 * produced (it does not change if the session is edited by hand).
 */
export interface ClassSession {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: ClassSessionStatus;
  completedAt?: Date;
  origin: SessionOrigin;
  seriesId?: Types.ObjectId;
  scheduleId?: Types.ObjectId;
  occurrenceDate?: string;
  /** Unique identity of a generated occurrence. Absent on extra and rescheduled sessions. */
  occurrenceKey?: string;
  /** `classId:date:startTime` while the session holds its slot; unique per organization. */
  slotKey?: string;
  spaceId?: Types.ObjectId;
  /** Professors teaching this session (substitutes included). Empty means the group's professors. */
  professorIds: Types.ObjectId[];
  substitute: boolean;
  /** Edited by hand ("only this session"): later schedule changes do not overwrite it. */
  manualOverride: boolean;
  statusReason?: string;
  statusHistory: SessionStatusChange[];
  rescheduledFromSessionId?: Types.ObjectId;
  rescheduledToSessionId?: Types.ObjectId;
  /** Once set, the roster is the persisted participant rows and no longer derived from enrollments. */
  rosterFrozenAt?: Date;
  notes?: string;
  /** Bumped inside transactions that check this session's capacity. */
  lockVersion: number;
}

const statusChangeSchema = new Schema<SessionStatusChange>(
  {
    from: { type: String, enum: [...CLASS_SESSION_STATUSES, null] },
    to: { type: String, enum: CLASS_SESSION_STATUSES, required: true },
    reason: { type: String, trim: true, maxlength: 500 },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, required: true }
  },
  { _id: false }
);

const classSessionSchema = new Schema<ClassSession>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true, index: true },
    sessionDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: { type: String, enum: CLASS_SESSION_STATUSES, default: "SCHEDULED", index: true },
    completedAt: { type: Date },
    origin: { type: String, enum: SESSION_ORIGINS, default: "REGULAR" },
    seriesId: { type: Schema.Types.ObjectId, index: true },
    scheduleId: { type: Schema.Types.ObjectId, ref: "ClassSchedule" },
    occurrenceDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    occurrenceKey: { type: String },
    slotKey: { type: String },
    spaceId: { type: Schema.Types.ObjectId, ref: "DanceSpace", index: true },
    professorIds: [{ type: Schema.Types.ObjectId, ref: "Professor" }],
    substitute: { type: Boolean, default: false },
    manualOverride: { type: Boolean, default: false },
    statusReason: { type: String, trim: true, maxlength: 500 },
    statusHistory: { type: [statusChangeSchema], default: [] },
    rescheduledFromSessionId: { type: Schema.Types.ObjectId, ref: "ClassSession" },
    rescheduledToSessionId: { type: Schema.Types.ObjectId, ref: "ClassSession" },
    rosterFrozenAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 1000 },
    lockVersion: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// A generated occurrence exists once, whatever happens to it later.
classSessionSchema.index(
  { organizationId: 1, occurrenceKey: 1 },
  { unique: true, partialFilterExpression: { occurrenceKey: { $type: "string" } } }
);
// Two active sessions of the same group never share a start time. Suspended, rescheduled and
// cancelled sessions release the slot (the key is removed).
classSessionSchema.index(
  { organizationId: 1, slotKey: 1 },
  { unique: true, partialFilterExpression: { slotKey: { $type: "string" } } }
);
classSessionSchema.index({ organizationId: 1, sessionDate: 1, startTime: 1 });

export const ClassSessionModel = model<ClassSession>("ClassSession", classSessionSchema);

export function slotKeyOf(session: { classId: unknown; sessionDate: string; startTime: string }) {
  return `${String(session.classId)}:${session.sessionDate}:${session.startTime}`;
}

export function holdsSlot(status: string) {
  return (SLOT_HOLDING_STATUSES as string[]).includes(status);
}
