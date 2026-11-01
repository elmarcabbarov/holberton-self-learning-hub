import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });

test("add a card in a space and review it with the keyboard only", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/spaces");
  await page.getByLabel("New space").fill(`Cards ${stamp}`);
  await page.getByRole("button", { name: "Create space" }).click();
  await page.getByRole("link", { name: new RegExp(`Cards ${stamp}`) }).click();
  await page.getByLabel("Topic name").fill("fork");
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByRole("list", { name: "Topics in this space" }).getByText("fork", { exact: true })).toBeVisible();

  const form = page.getByRole("form", { name: "New card" });
  await form.getByLabel("Topic").selectOption({ label: "fork" });
  await form.getByLabel("Front (question)").fill(`fork() uşaqda nə qaytarır? ${stamp}`);
  await form.getByLabel("Back (answer)").fill("0");
  await form.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("list", { name: "Cards in this space" })).toContainText(`${stamp}`);

  await page.getByRole("link", { name: "Start review" }).click(); // reviews only this space
  await expect(page.getByTestId("card-front")).toContainText(`${stamp}`);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("card-back")).toHaveText("0");
  await expect(page.getByRole("group", { name: "How well did you remember?" })).toContainText("days");
  await page.keyboard.press("4");
  await expect(page.getByText("You reviewed 1 card.")).toBeVisible();
});

test("make a card from a note selection", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/notes");
  await page.getByLabel("New note").fill(`e2e/card-src-${stamp}`);
  await page.getByRole("button", { name: "Create note" }).click();
  const editor = page.getByRole("textbox", { name: /^Edit / });
  await editor.click();
  await page.keyboard.type("SIGCHLD");
  await page.keyboard.press("Shift+Home");
  await page.getByRole("button", { name: "Make a card from the selection" }).click();
  const form = page.getByRole("form", { name: "New card" });
  await expect(form.getByLabel("Back (answer)")).toHaveValue("SIGCHLD");
  await form.getByLabel("Front (question)").fill(`Uşaq bitəndə valideynə hansı siqnal gəlir? ${stamp}`);
  await form.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("button", { name: /Make a card/ })).toBeVisible();
});
