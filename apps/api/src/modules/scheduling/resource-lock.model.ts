import type { ClientSession } from "mongoose";
import { Schema, Types, model } from "mongoose";

/**
 * Serialization point for checks that read many documents and then write (capacity, space and
 * professor conflicts). Two transactions that bump the same lock conflict, and MongoDB retries
 * the loser, which then sees the winner's writes.
 */
interface ResourceLock {
  organizationId: Types.ObjectId;
  key: string;
  version: number;
}

const resourceLockSchema = new Schema<ResourceLock>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    key: { type: String, required: true },
    version: { type: Number, default: 0 }
  },
  { timestamps: true }
);

resourceLockSchema.index({ organizationId: 1, key: 1 }, { unique: true });

export const ResourceLockModel = model<ResourceLock>("ResourceLock", resourceLockSchema);

/** Makes sure the lock documents exist. Must run outside the transaction (upserts can race). */
export async function ensureLocks(organizationId: string | Types.ObjectId, keys: string[]) {
  await Promise.all(
    keys.map((key) =>
      ResourceLockModel.updateOne(
        { organizationId, key },
        { $setOnInsert: { organizationId, key, version: 0 } },
        { upsert: true }
      ).catch((error: { code?: number }) => {
        if (error?.code !== 11000) throw error;
      })
    )
  );
}

/** Bumps the locks inside the transaction. Call `ensureLocks` first. */
export async function touchLocks(
  organizationId: string | Types.ObjectId,
  keys: string[],
  session: ClientSession | undefined
) {
  for (const key of [...new Set(keys)].sort()) {
    await ResourceLockModel.updateOne({ organizationId, key }, { $inc: { version: 1 } }, { session });
  }
}
