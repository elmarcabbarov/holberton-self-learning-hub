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
