import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env.schema";
import { createDatabaseConnector, mongoConnectOptions } from "./connect";

const config = parseEnv({ NODE_ENV: "test", MONGODB_URI: "mongodb://127.0.0.1:27017/mymacademia-test" });

function createClient() {
  const connection = { readyState: 0 };
  return {
    connection,
    set: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn()
  };
}

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("database connector", () => {
  it("applies bounded Atlas/serverless pool and timeout options", () => {
    expect(mongoConnectOptions(config)).toEqual({
      maxPoolSize: 5,
      minPoolSize: 0,
      maxConnecting: 2,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      waitQueueTimeoutMS: 5_000
    });
  });

  it("reuses a successfully initialized connection", async () => {
    const client = createClient();
    const logger = createLogger();
    client.connect.mockImplementation(async () => {
      client.connection.readyState = 1;
    });
    const connector = createDatabaseConnector(client as never, config, {}, logger as never);

    await connector.connect();
    await connector.connect();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledWith(config.MONGODB_URI, mongoConnectOptions(config));
  });

  it("shares one pending connection attempt across concurrent requests", async () => {
    const client = createClient();
    const logger = createLogger();
    let resolveConnection!: () => void;
    client.connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConnection = () => {
            client.connection.readyState = 1;
            resolve();
          };
        })
    );
    const connector = createDatabaseConnector(client as never, config, {}, logger as never);

    const first = connector.connect();
    const second = connector.connect();
    expect(client.connect).toHaveBeenCalledTimes(1);

    resolveConnection();
    await Promise.all([first, second]);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("clears a failed attempt so a later request can recover without a retry loop", async () => {
    const client = createClient();
    const logger = createLogger();
    client.connect
      .mockRejectedValueOnce(new Error("transient network failure"))
      .mockImplementationOnce(async () => {
        client.connection.readyState = 1;
      });
    const connector = createDatabaseConnector(client as never, config, {}, logger as never);

    await expect(connector.connect()).rejects.toThrow("transient network failure");
    await connector.connect();

    expect(client.connect).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ errorName: "Error" }),
      "MongoDB connection attempt failed"
    );
  });
});
