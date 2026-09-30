import { describe, expect, it } from "vitest";
import {
  DEV_APP_ORIGIN,
  DEV_JWT_ACCESS_SECRET,
  DEV_MONGODB_URI,
  parseEnv
} from "./env.schema";

const validProduction = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "a-strong-production-secret-with-more-than-32-chars",
  MONGODB_URI: "mongodb+srv://user:pass@cluster.example.net/mymacademia",
  APP_ORIGIN: "https://app.example.com"
};

describe("parseEnv", () => {
  it("uses local fallbacks in development", () => {
    const env = parseEnv({ NODE_ENV: "development" });

    expect(env.JWT_ACCESS_SECRET).toBe(DEV_JWT_ACCESS_SECRET);
    expect(env.MONGODB_URI).toBe(DEV_MONGODB_URI);
    expect(env.APP_ORIGIN).toBe(DEV_APP_ORIGIN);
  });

  it("defaults to development when NODE_ENV is missing", () => {
    expect(parseEnv({}).NODE_ENV).toBe("development");
  });

  it("accepts valid production values", () => {
    const env = parseEnv(validProduction);

    expect(env.NODE_ENV).toBe("production");
    expect(env.JWT_ACCESS_SECRET).toBe(validProduction.JWT_ACCESS_SECRET);
    expect(env.MONGODB_URI).toBe(validProduction.MONGODB_URI);
    expect(env.APP_ORIGIN).toBe(validProduction.APP_ORIGIN);
  });

  it.each([
    ["JWT_ACCESS_SECRET missing", { JWT_ACCESS_SECRET: undefined }, "JWT_ACCESS_SECRET is required in production"],
    ["JWT_ACCESS_SECRET blank", { JWT_ACCESS_SECRET: "   " }, "JWT_ACCESS_SECRET is required in production"],
    [
      "JWT_ACCESS_SECRET is the development default",
      { JWT_ACCESS_SECRET: DEV_JWT_ACCESS_SECRET },
      "JWT_ACCESS_SECRET must not be a development or placeholder value"
    ],
    ["JWT_ACCESS_SECRET too short", { JWT_ACCESS_SECRET: "short-secret" }, "JWT_ACCESS_SECRET"],
    ["MONGODB_URI missing", { MONGODB_URI: undefined }, "MONGODB_URI is required in production"],
    [
      "MONGODB_URI is the local fallback",
      { MONGODB_URI: DEV_MONGODB_URI },
      "MONGODB_URI must not be the local development database"
    ],
    ["APP_ORIGIN missing", { APP_ORIGIN: undefined }, "APP_ORIGIN is required in production"],
    [
      "APP_ORIGIN is the local fallback",
      { APP_ORIGIN: DEV_APP_ORIGIN },
      "APP_ORIGIN must not be the local development origin"
    ],
    [
      "APP_ORIGIN is the local fallback with trailing slash",
      { APP_ORIGIN: `${DEV_APP_ORIGIN}/` },
      "APP_ORIGIN must not be the local development origin"
    ]
  ])("rejects production when %s", (_name, override, message) => {
    expect(() => parseEnv({ ...validProduction, ...override })).toThrow(message);
  });

  it("never includes the received JWT secret in the error", () => {
    const secret = "short-but-sensitive-value";

    try {
      parseEnv({ ...validProduction, JWT_ACCESS_SECRET: secret });
      expect.unreachable("parseEnv should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }

    try {
      parseEnv({ ...validProduction, JWT_ACCESS_SECRET: DEV_JWT_ACCESS_SECRET });
      expect.unreachable("parseEnv should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(DEV_JWT_ACCESS_SECRET);
    }
  });
});
