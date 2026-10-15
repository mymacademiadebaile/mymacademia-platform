import mongoose, { type ConnectOptions, type Connection } from "mongoose";
import { env } from "../config/env";
import type { Env } from "../config/env.schema";
import { logger } from "../observability/logger";

type MongoConnectionConfig = Pick<
  Env,
  | "MONGODB_URI"
  | "MONGODB_MAX_POOL_SIZE"
  | "MONGODB_MIN_POOL_SIZE"
  | "MONGODB_MAX_CONNECTING"
  | "MONGODB_MAX_IDLE_TIME_MS"
  | "MONGODB_SERVER_SELECTION_TIMEOUT_MS"
  | "MONGODB_CONNECT_TIMEOUT_MS"
  | "MONGODB_WAIT_QUEUE_TIMEOUT_MS"
>;

type MongooseClient = Pick<typeof mongoose, "connect" | "disconnect" | "set"> & {
  connection: Pick<Connection, "readyState">;
};

type DatabaseLogger = Pick<typeof logger, "info" | "error" | "warn">;

export interface DatabaseConnectionCache {
  pendingConnection?: Promise<void>;
}

/**
 * Driver options deliberately cap each warm serverless instance at a small
 * pool. A pool is shared by concurrent invocations in that instance, while
 * minPoolSize: 0 lets idle instances release their sockets.
 */
export function mongoConnectOptions(config: MongoConnectionConfig): ConnectOptions {
  return {
    maxPoolSize: config.MONGODB_MAX_POOL_SIZE,
    minPoolSize: config.MONGODB_MIN_POOL_SIZE,
    maxConnecting: config.MONGODB_MAX_CONNECTING,
    maxIdleTimeMS: config.MONGODB_MAX_IDLE_TIME_MS,
    serverSelectionTimeoutMS: config.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: config.MONGODB_CONNECT_TIMEOUT_MS,
    waitQueueTimeoutMS: config.MONGODB_WAIT_QUEUE_TIMEOUT_MS
  };
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "UnknownError";
}

/**
 * Kept separate from the module singleton to make concurrency and failure
 * behavior regression-testable without opening a real MongoDB connection.
 */
export function createDatabaseConnector(
  client: MongooseClient,
  config: MongoConnectionConfig,
  connectionCache: DatabaseConnectionCache,
  log: DatabaseLogger = logger
) {
  const options = mongoConnectOptions(config);
  const pool = {
    maxPoolSize: options.maxPoolSize,
    minPoolSize: options.minPoolSize,
    maxConnecting: options.maxConnecting,
    maxIdleTimeMS: options.maxIdleTimeMS
  };

  return {
    async connect(): Promise<void> {
      if (client.connection.readyState === 1) return;

      client.set("strictQuery", true);

      if (!connectionCache.pendingConnection) {
        const startedAt = Date.now();
        log.info(
          { databaseState: client.connection.readyState, pool },
          "Initializing MongoDB connection"
        );

        connectionCache.pendingConnection = client
          .connect(config.MONGODB_URI, options)
          .then(() => {
            log.info(
              { durationMs: Date.now() - startedAt, databaseState: client.connection.readyState, pool },
              "MongoDB connection established"
            );
          })
          .catch((error: unknown) => {
            // Do not serialize the driver error: it can contain infrastructure
            // details. The error class and bounded duration are enough to
            // correlate the lifecycle event with platform/Atlas telemetry.
            log.error(
              { durationMs: Date.now() - startedAt, errorName: errorName(error) },
              "MongoDB connection attempt failed"
            );
            throw error;
          })
          .finally(() => {
            // A failure must be retryable on a later request, but there is no
            // retry loop here: every new attempt remains demand-driven.
            connectionCache.pendingConnection = undefined;
          });
      }

      await connectionCache.pendingConnection;
    },

    async disconnect(): Promise<void> {
      await client.disconnect();
    }
  };
}

declare global {
  // Vercel reuses the Node.js global object for warm invocations. Keeping only
  // the in-flight promise here prevents module reloads from creating competing
  // connection attempts; it does not retain another MongoDB client or pool.
  // eslint-disable-next-line no-var
  var __mymDatabaseConnectionCache: DatabaseConnectionCache | undefined;
}

const connectionCache = globalThis.__mymDatabaseConnectionCache ??= {};
const databaseConnector = createDatabaseConnector(mongoose, env, connectionCache);

mongoose.connection.on("disconnected", () => {
  logger.warn({ databaseState: mongoose.connection.readyState }, "MongoDB disconnected");
});

mongoose.connection.on("error", (error: unknown) => {
  logger.error({ errorName: errorName(error) }, "MongoDB connection emitted an error");
});

export async function connectDatabase(): Promise<void> {
  await databaseConnector.connect();
}

/** Standalone scripts close the process-level client after their work; request handlers never call this. */
export async function disconnectDatabase(): Promise<void> {
  await databaseConnector.disconnect();
}
