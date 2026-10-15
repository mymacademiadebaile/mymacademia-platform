import app from "./app";
import { env } from "./config/env";
import { connectDatabase } from "./database/connect";
import { logger } from "./observability/logger";

async function bootstrap() {
  await connectDatabase();

  app.listen(env.PORT, () => {
    console.log("M&M Academia API listening on port " + env.PORT);
  });
}

bootstrap().catch((error) => {
  logger.fatal(
    { errorName: error instanceof Error && error.name ? error.name : "UnknownError" },
    "Failed to start API"
  );
  process.exit(1);
});
