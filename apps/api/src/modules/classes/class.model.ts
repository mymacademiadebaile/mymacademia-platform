import { CLASS_STATUSES, WEEK_DAYS, type ClassStatus, type WeekDay } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

interface ClassSchedule {
  day: WeekDay;
  startTime: string;
  endTime: string;
}

export interface DanceClass {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  name: string;
  professorIds: Types.ObjectId[];
  disciplineIds: Types.ObjectId[];
  segmentIds: Types.ObjectId[];
  levelIds: Types.ObjectId[];
  capacity: number;
  monthlyPrice: number;
  freeTrialEnabled: boolean;
  schedules: ClassSchedule[];
  status: ClassStatus;
}

const scheduleSchema = new Schema<ClassSchedule>(
  {
    day: { type: String, enum: WEEK_DAYS, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true }
  },
  { _id: false }
);

const danceClassSchema = new Schema<DanceClass>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    name: { type: String, required: true, trim: true },
    professorIds: [{ type: Schema.Types.ObjectId, ref: "Professor", required: true }],
    disciplineIds: [{ type: Schema.Types.ObjectId, ref: "CatalogItem", required: true }],
    segmentIds: [{ type: Schema.Types.ObjectId, ref: "CatalogItem", required: true }],
    levelIds: [{ type: Schema.Types.ObjectId, ref: "CatalogItem", required: true }],
    capacity: { type: Number, required: true, min: 1 },
    monthlyPrice: { type: Number, default: 0, min: 0 },
    freeTrialEnabled: { type: Boolean, default: false },
    schedules: { type: [scheduleSchema], default: [] },
    status: { type: String, enum: CLASS_STATUSES, default: "ACTIVE" }
  },
  { timestamps: true }
);

export const DanceClassModel = model<DanceClass>("DanceClass", danceClassSchema);
