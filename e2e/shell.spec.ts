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

test("create a space, add topics, rename and archive one", async ({ page }) => {
  const name = `Simple Shell ${Date.now()}`;
  await page.goto("/spaces");
  await page.getByLabel("New space").fill(name);
  await page.getByRole("button", { name: "Create space" }).click();
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  for (const topic of ["fork", "execve", "waitpid"]) {
    await page.getByLabel("Topic name").fill(topic);
    await page.getByRole("button", { name: "Add topic" }).click();
    await expect(page.getByRole("list", { name: "Topics in this space" }).getByText(topic, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Rename execve" }).click();
  await page.getByRole("textbox", { name: "Topic name" }).last().fill("execve(2)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("list", { name: "Topics in this space" }).getByText("execve(2)", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Archive fork" }).click();
  await expect(page.getByRole("list", { name: "Topics in this space" }).getByText("fork", { exact: true })).toBeVisible(); // first click only arms
  await page.getByRole("button", { name: "Confirm archiving fork" }).click();
  await expect(page.getByRole("list", { name: "Topics in this space" }).getByText("fork", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("list", { name: "Topics in this space" }).getByText("execve(2)", { exact: true })).toBeVisible();
  await page.goto("/spaces");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText("2 topics");
});

test("a failed save shows an accessible error", async ({ page }) => {
  await page.goto("/spaces");
  const name = `Errors ${Date.now()}`;
  await page.getByLabel("New space").fill(name);
  await page.getByRole("button", { name: "Create space" }).click();
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page.route("**/api/spaces/*/topics", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"code":"internal","messageKey":"errors.internal"}}' }));
  await page.getByLabel("Topic name").fill("fork");
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByRole("alert")).toHaveText("Could not save. Try again.");
});

test("the app runs without Content Security Policy violations", async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => console.log(`CSPV ${e.violatedDirective} ${e.blockedURI}`));
  });
  page.on("console", (m) => { if (m.text().startsWith("CSPV")) violations.push(m.text()); });
  await page.goto("/");
  await page.goto("/notes");
  await page.goto("/review");
  expect(violations).toEqual([]);
});
