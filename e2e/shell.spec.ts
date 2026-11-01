import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes("[public]")) await signIn(page);
});

test("Today page renders the empty state and server status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/v\d+\.\d+\.\d+/);
});

test("interface language switches to Azerbaijani and persists", async ({ page }) => {
  await page.goto("/settings");
  await page.getByText("Azərbaycan", { exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ayarlar");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bu gün");
  await expect(page.locator("html")).toHaveAttribute("lang", "az");
});

test("[public] unknown API paths return 401 or 404 JSON, never the SPA", async ({ request }) => {
  const res = await request.get("/api/does-not-exist");
  expect([401, 404]).toContain(res.status());
  expect(res.headers()["content-type"]).toContain("application/json");
});

test("client routes fall back to the SPA", async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("[public] the bare /api path is JSON too", async ({ request }) => {
  for (const url of ["/api", "/api?x=1"]) {
    const res = await request.get(url);
    expect([401, 404]).toContain(res.status());
    expect(res.headers()["content-type"]).toContain("application/json");
  }
});

test("[public] without a session the app shows sign-in help", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to your Hub");
});

test("[public] a one-time link signs in once and leaves no token in the URL", async ({ page }) => {
  await signIn(page);
  expect(page.url()).not.toContain("#t=");
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("[public] a used link is rejected", async ({ browser }) => {
  const { execFileSync } = await import("node:child_process");
  const link = execFileSync("node", ["apps/server/src/cli.ts", "token"], { env: { ...process.env, HUB_DATA: ".data/e2e", HUB_PORT: "3417" }, encoding: "utf8" }).trim().replace("http://127.0.0.1:3417", "");
  const a = await browser.newPage();
  await a.goto(link); await a.waitForURL("/");
  const b = await browser.newPage();
  await b.goto(link);
  await expect(b.getByRole("alert")).toBeVisible();
  expect(b.url()).not.toContain("#t=");
});
