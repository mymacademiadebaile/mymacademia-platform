import { timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { env } from "../../config/env";
import { AppError } from "../../common/http/app-error";
import { runDailyJobs } from "../scheduling/daily-jobs";

export const internalRouter = Router();

function authorizedCron(header?: string) {
  if (!env.CRON_SECRET || !header) return false;
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Authenticate the scheduled endpoint before any database middleware runs. */
export const requireCronAuthorization: RequestHandler = (request, _response, next) => {
  if (!authorizedCron(request.headers.authorization)) {
    next(new AppError(401, "No autorizado", "UNAUTHORIZED"));
    return;
  }
  next();
};

/** Daily maintenance triggered by the platform scheduler. Disabled while CRON_SECRET is unset. */
internalRouter.get("/jobs/daily", async (request, response, next) => {
  try {
    const result = await runDailyJobs();
    response.status(result.failedOrganizations.length ? 500 : 200).json(result);
  } catch (error) {
    next(error);
  }
});
