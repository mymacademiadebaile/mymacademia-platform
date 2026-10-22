import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Request, type RequestHandler, type Response } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { AppError } from "./common/http/app-error";
import { errorHandler } from "./middleware/error-handler";
import { apiRateLimiter, authRateLimiter } from "./middleware/rate-limit";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./modules/health/health.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { publicRouter } from "./modules/public/public.routes";
import { professorPortalRouter } from "./modules/professor-portal/professor.routes";
import { connectDatabase } from "./database/connect";
import { internalRouter, requireCronAuthorization } from "./modules/internal/internal.routes";
import { logger } from "./observability/logger";
import { randomUUID } from "node:crypto";

interface CreateAppOptions {
  connectDatabaseOnRequest?: boolean;
  /** Test seam for asserting middleware order with an isolated rate-limit store. */
  apiRateLimiter?: RequestHandler;
  authRateLimiter?: RequestHandler;
}

function routeForLog(request: Request): string {
  if (request.route?.path && request.route.path !== "/") {
    return `${request.baseUrl}${request.route.path}`;
  }
  return request.baseUrl || request.path;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.use(helmet());
  app.use(
    cors({
      origin: env.APP_ORIGIN,
      credentials: true
    })
  );
  app.use(
    pinoHttp<Request, Response>({
      logger,
      genReqId: (_request, response) => {
        const requestId = randomUUID();
        response.setHeader("x-request-id", requestId);
        return requestId;
      },
      // Keep access logs useful without recording client IPs, headers, query
      // strings or bodies. Those fields can be sensitive and are needlessly
      // high-cardinality for the connection-incident diagnostics.
      wrapSerializers: false,
      serializers: {
        req: (request: unknown) => {
          const source = request as Request;
          return { id: source.id, method: source.method };
        },
        res: (response: unknown) => ({ statusCode: (response as Response).statusCode })
      },
      customAttributeKeys: { reqId: "requestId" },
      customSuccessObject: (request, response, value) => ({
        requestId: request.id,
        route: routeForLog(request),
        statusCode: response.statusCode,
        durationMs: value.responseTime
      }),
      customErrorObject: (request, response, error, value) => ({
        requestId: request.id,
        errorName: error.name,
        route: routeForLog(request),
        statusCode: response.statusCode,
        durationMs: value.responseTime
      })
    })
  );

  // Rate-limit before parsing bodies or initializing MongoDB. Credential
  // endpoints receive their stricter quota first, so rejected login/reset
  // traffic never opens a connection in this warm instance.
  const credentialLimiter = options.authRateLimiter ?? authRateLimiter;
  app.use("/api/auth/login", credentialLimiter);
  app.use("/api/auth/forgot-password", credentialLimiter);
  app.use("/api/auth/reset-password", credentialLimiter);
  app.use("/api", options.apiRateLimiter ?? apiRateLimiter);

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api/health", healthRouter);

  const databaseRequestMiddleware: RequestHandler = (_request, _response, next) => {
    if (!options.connectDatabaseOnRequest) {
      next();
      return;
    }

    void connectDatabase().then(
      () => next(),
      () => next(new AppError(503, "La base de datos no está disponible temporalmente", "DATABASE_UNAVAILABLE"))
    );
  };

  // Only known database-backed routes cross this gate. Health checks, rejected
  // requests and unknown /api paths return without needlessly initializing a
  // database connection.
  app.use("/api/auth", databaseRequestMiddleware, authRouter);
  app.use("/api/admin", databaseRequestMiddleware, adminRouter);
  app.use("/api/professor", databaseRequestMiddleware, professorPortalRouter);
  app.use("/api/public", databaseRequestMiddleware, publicRouter);
  app.use("/api/internal", requireCronAuthorization, databaseRequestMiddleware, internalRouter);

  app.use((_request, response) => {
    response.status(404).json({
      error: "NOT_FOUND",
      message: "La ruta solicitada no existe"
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
