import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { USER_ROLES, type UserRole } from "@mym/shared";
import { env } from "../config/env";
import { AppError } from "../common/http/app-error";

interface AccessTokenPayload extends jwt.JwtPayload {
  sub: string;
  organizationId: string;
  role: UserRole;
}

export const requireAuth: RequestHandler = (request, _response, next) => {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError(401, "Authentication required", "AUTH_REQUIRED"));
    return;
  }

  const token = authorization.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;

    if (
      !payload.sub ||
      !payload.organizationId ||
      !USER_ROLES.includes(payload.role)
    ) {
      throw new Error("Invalid token payload");
    }

    request.auth = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role
    };

    next();
  } catch {
    next(new AppError(401, "Invalid or expired token", "INVALID_TOKEN"));
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new AppError(401, "Authentication required", "AUTH_REQUIRED"));
      return;
    }

    if (!roles.includes(request.auth.role)) {
      next(new AppError(403, "Insufficient permissions", "FORBIDDEN"));
      return;
    }

    next();
  };
}
