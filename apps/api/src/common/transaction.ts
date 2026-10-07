import mongoose, { type ClientSession } from "mongoose";

/** MongoDB answers code 20 (IllegalOperation) when transactions are not available (standalone server). */
let transactionsUnsupported = false;

function isTransactionUnsupported(error: unknown) {
  const candidate = error as { code?: number; message?: string };
  return (
    candidate?.code === 20 ||
    /Transaction numbers are only allowed|replica set/i.test(String(candidate?.message ?? ""))
  );
}

/**
 * Runs `work` inside a MongoDB transaction. Every query inside must pass the session along.
 * `withTransaction` may call `work` again after a transient error (for example a write conflict
 * with a concurrent request), so `work` must only depend on what it reads inside the transaction.
 *
 * Production (Atlas) and the concurrency tests run on replica sets. A standalone development
 * server has no transactions: the work then runs without one and keeps every other guard
 * (unique indexes, conditional updates), but loses all-or-nothing semantics.
 */
export async function withTransaction<T>(work: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if (transactionsUnsupported) return work(undefined);

  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      transactionsUnsupported = true;
      return work(undefined);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

/** True when the last attempt found that the server supports transactions (used by diagnostics). */
export function transactionsAvailable() {
  return !transactionsUnsupported;
}
