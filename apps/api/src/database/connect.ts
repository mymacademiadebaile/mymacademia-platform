import mongoose from "mongoose";
import { env } from "../config/env";

let pendingConnection: Promise<void> | undefined;

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  mongoose.set("strictQuery", true);

  // Vercel may handle several requests in the same warm function instance.
  // Share the in-flight connection so those requests do not each open a new
  // MongoDB connection.
  pendingConnection ??= mongoose
    .connect(env.MONGODB_URI)
    .then(() => undefined)
    .finally(() => {
      pendingConnection = undefined;
    });

  await pendingConnection;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
