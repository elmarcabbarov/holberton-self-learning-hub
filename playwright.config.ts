import { defineConfig, devices } from "@playwright/test";

const PORT = 3417;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter @hub/web build && node apps/server/src/main.ts",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { HUB_PORT: String(PORT), HUB_WEB_DIST: "apps/web/dist", HUB_DATA: ".data/e2e", LOG_LEVEL: "warn" },
  },
});
