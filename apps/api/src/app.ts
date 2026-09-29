import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";
import { apiRateLimiter } from "./middleware/rate-limit";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./modules/health/health.routes";
import { adminRouter } from "./modules/admin/admin.routes";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(
    cors({
      origin: env.APP_ORIGIN,
      credentials: true
    })
  );
  app.use(pinoHttp());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api", apiRateLimiter);

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);

  app.use((_request, response) => {
    response.status(404).json({
      error: "NOT_FOUND",
      message: "Route not found"
    });
  });

  app.use(errorHandler);

  return app;
}
