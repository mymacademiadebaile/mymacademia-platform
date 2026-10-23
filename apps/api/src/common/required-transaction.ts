import mongoose, { type ClientSession } from "mongoose";
import { AppError } from "./http/app-error";

/** Critical identity/attendance writes must never silently lose atomicity on standalone MongoDB. */
export async function withRequiredTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } catch (error) {
    if ((error as { code?: number }).code === 20) {
      throw new AppError(503, "Esta operación necesita una base con transacciones habilitadas", "TRANSACTIONS_REQUIRED");
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
