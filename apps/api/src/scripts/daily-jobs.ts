/**
 * Daily maintenance: rolling window of sessions and monthly fees (idempotent).
 *   pnpm --filter @mym/api jobs:daily
 * In production the same work runs through GET /api/internal/jobs/daily (Vercel Cron) when
 * CRON_SECRET is configured.
 */
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../database/connect";
import { runDailyJobs } from "../modules/scheduling/daily-jobs";

async function main() {
  await connectDatabase();
  try {
    console.log(JSON.stringify(await runDailyJobs(), null, 2));
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
