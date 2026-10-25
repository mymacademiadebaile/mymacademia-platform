import { defineConfig } from "@playwright/test";
process.env.E2E_API_URL = "http://127.0.0.1:4100";
export default defineConfig({
  testDir: "./e2e", testMatch: ["identity.spec.ts", "check-in.spec.ts", "kiosk-access.spec.ts", "reception-management.spec.ts"],
  fullyParallel: false, workers: 1, timeout: 60000, outputDir: "../../artifacts/reception-e2e-results", reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm --filter @mym/api exec tsx src/test/manual-server.ts", cwd: "../..", url: "http://127.0.0.1:4100/__test/isolated", timeout: 120000,
      env: { LOCAL_UI_API_PORT: "4100", LOCAL_UI_APP_ORIGIN: "http://127.0.0.1:3100" } },
    { command: "pnpm exec next build && pnpm exec next start --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100/login", timeout: 120000,
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:4100/api", MYM_E2E_DIST_DIR: ".next-reception", MYM_E2E_TSCONFIG: "tsconfig.reception.json" } }
  ]
});
