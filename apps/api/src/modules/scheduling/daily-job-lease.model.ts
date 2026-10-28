import { Schema, Types, model } from "mongoose";

interface DailyJobLease {
  organizationId: Types.ObjectId;
  date: string;
  token: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  leaseUntil: Date;
  attempts: number;
  startedAt: Date;
  finishedAt?: Date;
}

const schema = new Schema<DailyJobLease>({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  date: { type: String, required: true },
  token: { type: String, required: true },
  status: { type: String, enum: ["RUNNING", "COMPLETED", "FAILED"], required: true },
  leaseUntil: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  startedAt: { type: Date, required: true },
  finishedAt: Date
}, { timestamps: true });
schema.index({ organizationId: 1, date: 1 }, { unique: true });

export const DailyJobLeaseModel = model<DailyJobLease>("DailyJobLease", schema);

/** One run per organization and academy day. A crashed run can be retried after the lease. */
export async function acquireDailyJob(organizationId: string, date: string, token: string, now: Date) {
  try {
    const lease = await DailyJobLeaseModel.findOneAndUpdate(
      { organizationId, date, status: { $ne: "COMPLETED" }, $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }] },
      { $set: { token, status: "RUNNING", startedAt: now, leaseUntil: new Date(now.getTime() + 10 * 60 * 1000) },
        $unset: { finishedAt: 1 }, $inc: { attempts: 1 } },
      { upsert: true, new: true }
    );
    return lease;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return null;
    throw error;
  }
}

export async function finishDailyJob(organizationId: string, date: string, token: string, status: "COMPLETED" | "FAILED") {
  await DailyJobLeaseModel.updateOne({ organizationId, date, token, status: "RUNNING" },
    { $set: { status, finishedAt: new Date(), leaseUntil: status === "FAILED" ? new Date(0) : new Date() } });
}
