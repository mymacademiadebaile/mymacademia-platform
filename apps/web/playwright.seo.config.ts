import { defineConfig } from "@playwright/test";

// Uses the production build and a read-only HTTP fixture. No database or secrets.
// Run `pnpm build` first, then `pnpm --filter @mym/web exec playwright test -c playwright.seo.config.ts`.
export default defineConfig({
  testDir: "./seo-e2e",
  workers: 1,
  timeout: 60000,
  outputDir: "../../artifacts/seo-e2e-results",
  reporter: "list",
  use: { baseURL: "http://localhost:3100", javaScriptEnabled: false, actionTimeout: 5000 },
  webServer: [
    { command: "node seo-e2e/public-api.mjs", url: "http://127.0.0.1:4100/api/public/catalog", reuseExistingServer: false },
    {
      command: "pnpm start --port 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: false,
      env: {
        API_INTERNAL_URL: "http://127.0.0.1:4100",
        PUBLIC_DATA_SOURCE: "api",
        NEXT_PUBLIC_SITE_URL: "https://mymacademia-platform.vercel.app"
      }
    }
  ]
});
