import { Schema, Types, model } from "mongoose";

/** A day without regular classes. Sessions generated on it start SUSPENDED. */
export interface Holiday {
  organizationId: Types.ObjectId;
  /** Absent: applies to every branch of the organization. */
  branchId?: Types.ObjectId;
  date: string;
  name: string;
  createdByUserId: Types.ObjectId;
}

const holidaySchema = new Schema<Holiday>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch" },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

holidaySchema.index({ organizationId: 1, date: 1, branchId: 1 }, { unique: true });

export const HolidayModel = model<Holiday>("Holiday", holidaySchema);
