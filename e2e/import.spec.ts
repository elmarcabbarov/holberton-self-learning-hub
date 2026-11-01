import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

const page_ = (stamp: number) => `Toggle navigation
100%
Pipes ${stamp}
 Novice
 By: Some Author
 Weight: 1
For this project, we expect you to look at these concepts:
Shell
Resources
Read or watch:
Intro to pipes
Learning Objectives
At the end of this project, you are expected to be able to explain to anyone, without the help of Google:
Pipes
What a pipe connects
How to send output of one program to another
Quoting
What single and double quotes change
Requirements
General
All scripts end with a new line
Tasks
0. First filter
Task 0 of 2`;

test("import a project: objectives become cards, a project note is created, cards are reviewable", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  await page.goto("/spaces");
  await page.getByRole("link", { name: "Import a Holberton project" }).click();
  await page.getByLabel("Project page text").fill(page_(stamp));
  await page.getByRole("button", { name: "Read page" }).click();
  await expect(page.getByLabel("Space name")).toHaveValue(`Pipes ${stamp}`);
  await page.getByRole("checkbox", { name: "What single and double quotes change" }).uncheck();
  await page.getByRole("button", { name: "Import with 2 cards" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 2 cards in 1 topics." })).toBeVisible();

  await page.getByRole("link", { name: "Open the project note" }).click();
  await expect(page.getByRole("textbox", { name: /^Edit / })).toContainText("- [ ] 2. Task 2");

  await page.goto("/spaces");
  await page.getByRole("link", { name: new RegExp(`Pipes ${stamp}`) }).click();
  await expect(page.getByRole("list", { name: "Topics in this space" })).toContainText("Pipes");
  await expect(page.getByRole("list", { name: "Cards in this space" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("link", { name: "Start review" }).click();
  await expect(page.getByTestId("card-front")).toContainText("Explain without Google:");
});

test("unrelated text shows a clear message instead of an empty import", async ({ page }) => {
  await signIn(page);
  await page.goto("/import");
  await page.getByLabel("Project page text").fill("just some random text");
  await page.getByRole("button", { name: "Read page" }).click();
  await expect(page.getByRole("alert")).toContainText("No learning objectives found");
});
