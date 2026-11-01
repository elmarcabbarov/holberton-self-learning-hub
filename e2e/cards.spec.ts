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

test("a retried rating after a lost response is applied only once", async ({ page }) => {
  const stamp = Date.now();
  const o = { origin: "http://127.0.0.1:3417" };
  const space = await (await page.request.post("/api/spaces", { data: { name: `Retry ${stamp}` }, headers: o })).json();
  const topic = await (await page.request.post(`/api/spaces/${space.id}/topics`, { data: { name: "t" }, headers: o })).json();
  const card = await (await page.request.post("/api/cards", { data: { topicId: topic.id, front: `Q ${stamp}`, back: "A" }, headers: o })).json();

  await page.goto(`/review?space=${space.id}`);
  let first = true;
  await page.route("**/api/cards/*/review", async (route) => {
    if (first) { first = false; await route.fetch(); await route.abort(); } // server commits, client sees a failure
    else await route.continue();
  });
  await expect(page.getByTestId("card-front")).toContainText(`Q ${stamp}`);
  await page.keyboard.press("Space");
  await page.keyboard.press("3");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.keyboard.press("3"); // retry
  await expect(page.getByText("You reviewed 1 card.")).toBeVisible();

  const cards = await (await page.request.get(`/api/cards?topicId=${topic.id}`)).json();
  expect(cards.cards.find((c: { id: string }) => c.id === card.id).reps).toBe(1);
});
