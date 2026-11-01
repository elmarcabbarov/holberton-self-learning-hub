import { expect, test } from "@playwright/test";

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

test("unknown API paths return a JSON 404, not the SPA", async ({ request }) => {
  const res = await request.get("/api/does-not-exist");
  expect(res.status()).toBe(404);
});

test("client routes fall back to the SPA", async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByRole("navigation")).toBeVisible();
});
