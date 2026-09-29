import { Schema, Types, model } from "mongoose";

export const ATTENDANCE_STATUSES = ["EXPECTED", "PRESENT", "ABSENT"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface ClassAttendance {
  organizationId: Types.ObjectId;
  sessionId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: AttendanceStatus;
  updatedByUserId: Types.ObjectId;
}

const classAttendanceSchema = new Schema<ClassAttendance>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "ClassSession", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    status: { type: String, enum: ATTENDANCE_STATUSES, default: "EXPECTED" },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
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
