import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });

test("Settings downloads an Anki file with the card in its space::topic deck", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/spaces");
  await page.getByLabel("New space").fill(`Anki ${stamp}`);
  await page.getByRole("button", { name: "Create space" }).click();
  await page.getByRole("link", { name: new RegExp(`Anki ${stamp}`) }).click();
  await page.getByLabel("Topic name").fill("signals");
  await page.getByRole("button", { name: "Add topic" }).click();
  const form = page.getByRole("form", { name: "New card" });
  await form.getByLabel("Topic").selectOption({ label: "signals" });
  await form.getByLabel("Front (question)").fill(`SIGKILL tutula bilərmi? ${stamp}`);
  await form.getByLabel("Back (answer)").fill("Xeyr");
  await form.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("list", { name: "Cards in this space" })).toContainText(`${stamp}`);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export to Anki" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^hub-cards-anki-\d{8}\.txt$/);
  const text = readFileSync((await download.path())!, "utf8");
  expect(text.startsWith("#separator:Tab\n")).toBe(true);
  expect(text).toContain(`SIGKILL tutula bilərmi? ${stamp}\tXeyr\tHolberton Hub::Anki ${stamp}::signals\tholberton-hub\n`);

  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Download for Anki" })).toHaveAttribute("href", "/api/cards/export/anki");
});
