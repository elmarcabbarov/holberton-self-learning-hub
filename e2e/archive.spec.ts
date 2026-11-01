import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test("archive and restore a topic and a space", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const name = `Archive ${stamp}`;
  await page.goto("/spaces");
  await page.getByLabel("New space").fill(name);
  await page.getByRole("button", { name: "Create space" }).click();
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page.getByLabel("Topic name").fill("signals");
  await page.getByRole("button", { name: "Add topic" }).click();
  const topics = page.getByRole("list", { name: "Topics in this space" });
  await expect(topics).toContainText("signals");

  await page.getByRole("button", { name: "Archive signals" }).click();
  await page.getByRole("button", { name: "Confirm archiving signals" }).click();
  await expect(page.getByText("1 archived topic")).toBeVisible();
  await page.getByText("1 archived topic").click();
  await page.getByRole("button", { name: "Restore signals" }).click();
  await expect(topics).toContainText("signals");

  await page.getByRole("button", { name: "Archive space" }).click();
  await page.getByRole("button", { name: "Click again to archive" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Spaces");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  await page.getByRole("button", { name: "Show archived spaces" }).click();
  await page.getByRole("button", { name: `Restore ${name}` }).click();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});
