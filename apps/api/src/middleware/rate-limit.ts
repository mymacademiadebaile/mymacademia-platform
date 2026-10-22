import rateLimit from "express-rate-limit";
import { env } from "../config/env";

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // CORS handles preflight before this middleware, but retain this guard for
  // deployments that opt into preflight continuation.
  skip: (request) => request.method === "OPTIONS",
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Recibimos demasiadas solicitudes. Probá nuevamente en unos minutos."
  }
});

// Stricter limit for credential endpoints (login, password reset). In-memory, per IP.
export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (request) => request.method === "OPTIONS",
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Superaste la cantidad de intentos permitidos. Probá nuevamente más tarde."
  }
});
