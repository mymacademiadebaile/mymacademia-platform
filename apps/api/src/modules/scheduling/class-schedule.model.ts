import { WEEK_DAYS, type WeekDay } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

/**
 * One version of a recurring weekly slot of a group. Versions of the same slot share `seriesId`
 * and never overlap in time: changing "this session and the following ones" closes the current
 * version the day before and opens a new one. Sessions and enrollments reference the series, so
 * they survive time, space or professor changes.
 */
export interface ClassSchedule {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  seriesId: Types.ObjectId;
  day: WeekDay;
  startTime: string;
  endTime: string;
  /** First calendar day (YYYY-MM-DD) this version applies to. */
  validFrom: string;
  /** Last calendar day this version applies to; absent while open-ended. */
  validTo?: string;
  spaceId?: Types.ObjectId;
  /** Professors of this slot. Empty means the group's professors. */
  professorIds: Types.ObjectId[];
  /** Weekly slot key this series was bootstrapped from (legacy DanceClass.schedules). */
  legacyKey?: string;
  createdByUserId?: Types.ObjectId;
  endedReason?: string;
}

const classScheduleSchema = new Schema<ClassSchedule>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true, index: true },
    seriesId: { type: Schema.Types.ObjectId, required: true, index: true },
    day: { type: String, enum: WEEK_DAYS, required: true },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    validFrom: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    validTo: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    spaceId: { type: Schema.Types.ObjectId, ref: "DanceSpace", index: true },
    professorIds: [{ type: Schema.Types.ObjectId, ref: "Professor" }],
    legacyKey: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    endedReason: { type: String, trim: true, maxlength: 300 }
  },
  { timestamps: true }
);

classScheduleSchema.index({ organizationId: 1, seriesId: 1, validFrom: 1 }, { unique: true });
classScheduleSchema.index({ organizationId: 1, classId: 1, validFrom: 1 });
// Bootstrapping a legacy weekly slot is idempotent even when two requests do it at once.
classScheduleSchema.index(
  { organizationId: 1, classId: 1, legacyKey: 1 },
  { unique: true, partialFilterExpression: { legacyKey: { $type: "string" } } }
);

export const ClassScheduleModel = model<ClassSchedule>("ClassSchedule", classScheduleSchema);
