import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
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

/** Daily maintenance triggered by the platform scheduler. Disabled while CRON_SECRET is unset. */
internalRouter.get("/jobs/daily", async (request, response, next) => {
  try {
    if (!authorizedCron(request.headers.authorization)) {
      throw new AppError(401, "No autorizado", "UNAUTHORIZED");
    }
    response.json(await runDailyJobs());
  } catch (error) {
    next(error);
  }
});
