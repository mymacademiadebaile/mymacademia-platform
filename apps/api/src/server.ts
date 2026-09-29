import { createApp } from "./app";
import { env } from "./config/env";
import { connectDatabase } from "./database/connect";

async function bootstrap() {
  await connectDatabase();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log("M&M Academia API listening on port " + env.PORT);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
