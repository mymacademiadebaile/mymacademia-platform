import { Schema, Types, model } from "mongoose";

export interface BillingPeriodRun {
  at: Date;
  userId?: Types.ObjectId;
  created: number;
  existing: number;
  pendingDecision: number;
}

/** A billing month of an organization and the history of its monthly fee generation runs. */
export interface BillingPeriod {
  organizationId: Types.ObjectId;
  period: string;
  dueDate: string;
  status: "OPEN" | "CLOSED";
  runs: BillingPeriodRun[];
}

const runSchema = new Schema<BillingPeriodRun>(
  {
    at: { type: Date, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    created: { type: Number, default: 0 },
    existing: { type: Number, default: 0 },
    pendingDecision: { type: Number, default: 0 }
  },
  { _id: false }
);

const billingPeriodSchema = new Schema<BillingPeriod>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    dueDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN" },
    runs: { type: [runSchema], default: [] }
  },
  { timestamps: true }
);

billingPeriodSchema.index({ organizationId: 1, period: 1 }, { unique: true });

export const BillingPeriodModel = model<BillingPeriod>("BillingPeriod", billingPeriodSchema);
