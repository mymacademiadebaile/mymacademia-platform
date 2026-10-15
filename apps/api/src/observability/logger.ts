import pino from "pino";

/**
 * Shared structured logger. Callers must pass only allow-listed diagnostic
 * fields; connection strings, credentials, cookies, tokens and request bodies
 * must never be included in a log object.
 */
export const logger = pino({
  base: undefined,
  // HTTP-heavy integration tests do not need to emit production diagnostics;
  // keeping them silent also avoids console I/O altering timing-sensitive tests.
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "res.headers[\"set-cookie\"]"
    ],
    censor: "[redacted]"
  }
});
