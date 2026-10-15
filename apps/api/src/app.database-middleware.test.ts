import rateLimit from "express-rate-limit";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { connectDatabase } = vi.hoisted(() => ({ connectDatabase: vi.fn() }));

vi.mock("./database/connect", () => ({ connectDatabase }));

import { createApp } from "./app";

function limiter(limit: number) {
  return rateLimit({
    windowMs: 60_000,
    max: limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "RATE_LIMIT_EXCEEDED" }
  });
}

describe("database request gate", () => {
  it("does not initialize MongoDB for health checks, unknown API paths or unauthorized cron calls", async () => {
    connectDatabase.mockResolvedValue(undefined);
    const app = createApp({ connectDatabaseOnRequest: true, apiRateLimiter: limiter(10) });

    const health = await request(app).get("/api/health");
    const unknown = await request(app).get("/api/not-a-route");
    const unauthorizedCron = await request(app).get("/api/internal/jobs/daily");

    expect(health.status).toBe(200);
    expect(health.headers["x-request-id"]).toBeDefined();
    expect(unknown.status).toBe(404);
    expect(unauthorizedCron.status).toBe(401);
    expect(connectDatabase).not.toHaveBeenCalled();
  });

  it("rejects an over-limit public request before it initializes MongoDB", async () => {
    connectDatabase.mockRejectedValue(new Error("database unavailable"));
    const app = createApp({ connectDatabaseOnRequest: true, apiRateLimiter: limiter(1) });

    const first = await request(app).get("/api/public/catalog");
    expect(first.status).toBe(503);
    expect(connectDatabase).toHaveBeenCalledTimes(1);

    connectDatabase.mockClear();
    const limited = await request(app).get("/api/public/catalog");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(connectDatabase).not.toHaveBeenCalled();
  });

  it("rejects over-limit login attempts before the database gate", async () => {
    connectDatabase.mockRejectedValue(new Error("database unavailable"));
    const app = createApp({
      connectDatabaseOnRequest: true,
      apiRateLimiter: limiter(10),
      authRateLimiter: limiter(1)
    });

    const first = await request(app).post("/api/auth/login").send({ email: "ana@example.com", password: "incorrecta" });
    expect(first.status).toBe(503);
    expect(connectDatabase).toHaveBeenCalledTimes(1);

    connectDatabase.mockClear();
    const limited = await request(app).post("/api/auth/login").send({ email: "ana@example.com", password: "incorrecta" });
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(connectDatabase).not.toHaveBeenCalled();
  });
});
