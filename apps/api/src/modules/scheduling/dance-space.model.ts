import { Schema, Types, model } from "mongoose";

export const DANCE_SPACE_STATUSES = ["ACTIVE", "MAINTENANCE", "INACTIVE"] as const;
export type DanceSpaceStatus = (typeof DANCE_SPACE_STATUSES)[number];

/** A physical room or dance floor of a branch. Optional on schedules and sessions. */
export interface DanceSpace {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  name: string;
  description?: string;
  capacity?: number;
  status: DanceSpaceStatus;
  /** Free text about availability (for example "solo turno noche"). Conflicts are enforced on sessions. */
  availabilityNotes?: string;
  sortOrder: number;
}

const danceSpaceSchema = new Schema<DanceSpace>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500 },
    capacity: { type: Number, min: 1, max: 1000 },
    status: { type: String, enum: DANCE_SPACE_STATUSES, default: "ACTIVE" },
    availabilityNotes: { type: String, trim: true, maxlength: 300 },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

danceSpaceSchema.index({ organizationId: 1, branchId: 1, name: 1 }, { unique: true });

export const DanceSpaceModel = model<DanceSpace>("DanceSpace", danceSpaceSchema);
