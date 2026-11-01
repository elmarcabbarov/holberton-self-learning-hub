import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test("create and download a backup from Settings", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Create backup" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Backup created" })).toBeVisible();
  const row = page.getByRole("list", { name: "Backups" }).getByRole("listitem").first();
  await expect(row).toContainText(/hub-backup-\d{8}T\d{6}Z/);
  const download = page.waitForEvent("download");
  await row.getByRole("link", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/^hub-backup-.*\.zip$/);
});
