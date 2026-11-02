import { defineConfig, devices } from "@playwright/test";

const PORT = 3417;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Fresh data dir per run: e2e results never depend on leftovers from earlier runs.
    command: "rm -rf .data/e2e && pnpm --filter @hub/web build && node apps/server/src/main.ts",
    url: `http://127.0.0.1:${PORT}/api/health`,
    // Never reuse: a stale server with an old build makes e2e results lie.
    reuseExistingServer: false,
    // A small read-only linked vault (D-062) checked into the repo.
    env: { HUB_PORT: String(PORT), HUB_WEB_DIST: "apps/web/dist", HUB_DATA: ".data/e2e", HUB_LINKED_VAULT: "e2e/fixtures/linked-vault", LOG_LEVEL: "warn" },
  },
});
