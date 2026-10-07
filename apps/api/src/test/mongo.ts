import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * In-memory replica set for tests that need transactions (concurrency, financial atomicity).
 * Collections are created up front because MongoDB cannot create them inside a transaction
 * on older server versions.
 */
export async function startReplicaSet() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(replSet.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.createCollection().catch(() => undefined)));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return {
    async stop() {
      await mongoose.disconnect();
      await replSet.stop();
    }
  };
}
