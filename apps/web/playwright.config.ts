import { defineConfig } from "@playwright/test";
const api = `http://127.0.0.1:${process.env.MYM_E2E_API_PORT ?? "4100"}`;
const web = `http://127.0.0.1:${process.env.MYM_E2E_WEB_PORT ?? "3100"}`;
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, timeout: 60000,
  outputDir: "../../artifacts/e2e-results", reporter: "list",
  use: { baseURL: web, trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm --filter @mym/api exec tsx src/test/manual-server.ts", cwd: "../..", url: `${api}/__test/isolated`, reuseExistingServer: false, timeout: 120000,
      env: { LOCAL_UI_API_PORT: String(process.env.MYM_E2E_API_PORT ?? "4100"), LOCAL_UI_APP_ORIGIN: web, MYM_QA_RUN_ID: process.env.MYM_QA_RUN_ID ?? "qa-manual" } },
    { command: `pnpm exec next build && pnpm exec next start --hostname 127.0.0.1 --port ${process.env.MYM_E2E_WEB_PORT ?? "3100"}`, url: `${web}/login`, reuseExistingServer: false, timeout: 120000,
      env: { NEXT_PUBLIC_API_URL: `${api}/api`, MYM_E2E_DIST_DIR: ".next-reception", MYM_E2E_TSCONFIG: "tsconfig.reception.json" } }
  ]
});
