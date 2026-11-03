import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test("Today shows due cards, recent notes and spaces from real data", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const o = { origin: "http://127.0.0.1:3417" };
  const space = await (await page.request.post("/api/spaces", { data: { name: `Today ${stamp}` }, headers: o })).json();
  await page.request.post("/api/cards", { data: { front: `Q ${stamp}`, back: "A" }, headers: o });
  await page.request.post("/api/notes", { data: { path: `e2e/today-${stamp}.md`, content: `# Today note ${stamp}\n` }, headers: o });

  await page.goto("/");
  await expect(page.getByTestId("due-count")).toHaveText(/\d+ cards? due/);
  await expect(page.getByRole("link", { name: `Today note ${stamp}` })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(space.name) })).toBeVisible();
  await page.getByRole("link", { name: "Start review" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Review");
});

test("Today shows an error instead of empty states when data cannot be loaded", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/review/summary", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"code":"internal","messageKey":"errors.internal"}}' }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toHaveText("Could not load this page.");
  await expect(page.getByText("Nothing due")).toHaveCount(0);
});

/** WCAG relative-luminance contrast of two computed `rgb(...)` colours. */
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

test("the black Review card keeps readable text and a visible focus ring in the light theme (Codex review)", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => localStorage.setItem("hub.theme", "light"));
  const o = { origin: "http://127.0.0.1:3417" };
  const stamp = Date.now();
  for (const n of [1, 2]) await page.request.post("/api/cards", { data: { front: `Contrast ${n} ${stamp}`, back: "A" }, headers: o });
  const queue = await (await page.request.get("/api/review/queue")).json();
  const reviewed = await page.request.post(`/api/cards/${queue.items[0].id}/review`, { data: { rating: 3, eventId: crypto.randomUUID() }, headers: o });
  expect(reviewed.ok()).toBe(true);

  await page.goto("/");
  await expect(page.getByText(/reviewed today/i)).toBeVisible();
  const card = page.locator(".hub-feature");
  const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  for (const el of await card.locator("p, h2").all()) {
    expect(contrast(await el.evaluate((e) => getComputedStyle(e).color), bg)).toBeGreaterThanOrEqual(4.5);
  }
  const link = card.getByRole("link", { name: "Start review" });
  await page.keyboard.press("Tab");
  await link.focus();
  await page.waitForTimeout(300); // let colour transitions finish before measuring
  expect(contrast(await link.evaluate((e) => getComputedStyle(e).outlineColor), bg)).toBeGreaterThanOrEqual(3);
});

test("below md the sidebar shows only the seahorse, not the full logo (Codex review)", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await signIn(page);
  await expect(page.locator("nav .hub-logo")).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("nav .hub-logo")).toBeVisible();
});
