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
import { publicRouter } from "./modules/public/public.routes";
import { professorPortalRouter } from "./modules/professor-portal/professor.routes";
import { connectDatabase } from "./database/connect";
import { internalRouter } from "./modules/internal/internal.routes";

export function createApp(options: { connectDatabaseOnRequest?: boolean } = {}) {
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

  if (options.connectDatabaseOnRequest) {
    app.use((_request, _response, next) => {
      void connectDatabase().then(() => next(), next);
    });
  }

  app.use("/api", apiRateLimiter);

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/professor", professorPortalRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/internal", internalRouter);

  app.use((_request, response) => {
    response.status(404).json({
      error: "NOT_FOUND",
      message: "Route not found"
    });
  });

  app.use(errorHandler);

  return app;
}

// Vercel recognizes `src/app.ts` as an Express entry point. The database
// connection is lazy so importing this module locally does not connect until a
// request is received.
const vercelApp = createApp({ connectDatabaseOnRequest: true });

export default vercelApp;
