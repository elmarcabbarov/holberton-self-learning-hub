import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";

/** Gets a one-time link from the CLI (same data dir and port as the test server) and signs in. */
export async function signIn(page: Page): Promise<void> {
  const link = execFileSync("node", ["apps/server/src/cli.ts", "token"], {
    env: { ...process.env, HUB_DATA: ".data/e2e", HUB_PORT: "3417" },
    encoding: "utf8",
  }).trim();
  await page.goto(link.replace("http://127.0.0.1:3417", ""));
  await page.waitForURL("/");
}
