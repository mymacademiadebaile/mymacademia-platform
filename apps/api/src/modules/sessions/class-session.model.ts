import { Schema, Types, model } from "mongoose";

export const CLASS_SESSION_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;
export type ClassSessionStatus = (typeof CLASS_SESSION_STATUSES)[number];

export interface ClassSession {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: ClassSessionStatus;
  completedAt?: Date;
}

const classSessionSchema = new Schema<ClassSession>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true, index: true },
    sessionDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: { type: String, enum: CLASS_SESSION_STATUSES, default: "SCHEDULED", index: true },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

classSessionSchema.index(
  { organizationId: 1, classId: 1, sessionDate: 1, startTime: 1 },
  { unique: true }
);

export const ClassSessionModel = model<ClassSession>("ClassSession", classSessionSchema);
