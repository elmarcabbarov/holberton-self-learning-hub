import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });

// One open session per Hub: this test owns the session flow, so it runs alone in its file.
test("start a study session on Today, stop it, reflect, and see the plan next time", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("heading", { name: "Study session" }).locator("..");
  // A session left open by an earlier run (repeat-each) is finished first.
  if (await card.getByRole("button", { name: "Stop session" }).isVisible()) await card.getByRole("button", { name: "Stop session" }).click();
  if (await card.getByRole("button", { name: "Skip" }).isVisible()) await card.getByRole("button", { name: "Skip" }).click();

  await card.getByLabel("What do you want to do? (optional)").fill("Understand fork");
  await card.getByRole("button", { name: "Start session" }).click();
  await expect(card.getByText("Understand fork")).toBeVisible();
  await expect(card.getByRole("status")).toContainText("0 minutes");
  await card.getByRole("button", { name: "Stop session" }).click();

  const form = card.getByRole("form", { name: "Reflection" });
  await form.getByLabel("What I learned").fill("fork copies the process");
  await form.getByLabel("What I'll do next").fill("Read about execve");
  await form.getByRole("button", { name: "Save reflection" }).click();
  await expect(card).toContainText("Last time you planned: Read about execve");
});
