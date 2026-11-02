import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });

test("a goal with checklist tasks counts tasks completed; a note links to a topic", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/spaces");
  await page.getByLabel("New space").fill(`Goals ${stamp}`);
  await page.getByRole("button", { name: "Create space" }).click();
  await page.getByRole("link", { name: new RegExp(`Goals ${stamp}`) }).click();
  await page.getByLabel("Topic name").fill("Pipes");
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByRole("list", { name: "Topics in this space" }).getByText("Pipes", { exact: true })).toBeVisible();

  const form = page.getByRole("form", { name: "New goal" });
  await form.getByLabel("Goal").fill("Finish the shell project");
  await form.getByLabel("Done when (optional)").fill("All checker tasks pass");
  await form.getByRole("button", { name: "Add goal" }).click();
  const goal = page.getByRole("listitem", { name: "Finish the shell project" });
  await expect(goal).toContainText("Done when: All checker tasks pass");
  for (const step of ["Read man pipe", "Write task 0"]) {
    await goal.getByLabel("New task for Finish the shell project").fill(step);
    await goal.getByRole("button", { name: "Add", exact: true }).click();
    await expect(goal.getByRole("checkbox", { name: step })).toBeVisible();
  }
  await expect(goal).toContainText("0 of 2 tasks completed");
  await goal.getByRole("checkbox", { name: "Read man pipe" }).check();
  await expect(goal).toContainText("1 of 2 tasks completed");
  await goal.getByRole("button", { name: "Move Write task 0 up" }).click();
  await expect(goal.getByRole("list", { name: "Tasks of Finish the shell project" }).getByRole("listitem").first()).toContainText("Write task 0");

  // Link a note to the topic from the note's sidebar; the space lists it.
  const res = await page.request.post("/api/notes", { data: { path: `e2e/goal-note-${stamp}.md`, content: "# Pipe notes\n" }, headers: { origin: "http://127.0.0.1:3417" } });
  const noteId = (await res.json()).id as string;
  await page.goto(`/notes/${noteId}`);
  await page.getByLabel("Link to a topic…").selectOption({ label: `Goals ${stamp} / Pipes` });
  await expect(page.getByRole("list", { name: "Topics of this note" })).toContainText(`Goals ${stamp} / Pipes`);
  await page.getByRole("list", { name: "Topics of this note" }).getByRole("link").click();
  await expect(page.getByRole("list", { name: "Notes linked to this space" })).toContainText("Pipe notes");
});
