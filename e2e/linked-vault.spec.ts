import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });

test("linked vault notes are listed, searchable and read-only", async ({ page }) => {
  await page.goto("/notes");
  const row = page.getByRole("link", { name: /Signals/ });
  await expect(row).toContainText("Linked");
  await row.click();
  await expect(page.getByRole("note")).toHaveText("This note is in your linked vault, which the Hub only reads. Edit it in Obsidian; the Hub picks up the change.");
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Linked vault" });
  await expect(panel.getByRole("status")).toHaveText("Up to date. 2 notes indexed.");
});
