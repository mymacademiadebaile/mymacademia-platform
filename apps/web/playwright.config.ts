import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, timeout: 60000,
  outputDir: "../../artifacts/e2e-results", reporter: "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm --filter @mym/api exec tsx src/test/manual-server.ts", cwd: "../..", url: "http://localhost:4000/__test/isolated", reuseExistingServer: !process.env.CI, timeout: 120000 },
    { command: "pnpm build && pnpm start", url: "http://localhost:3000/login", env: { NEXT_PUBLIC_API_URL: "http://localhost:4000/api" }, reuseExistingServer: !process.env.CI, timeout: 120000 }
  ]
});
