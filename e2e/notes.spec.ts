import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });

const editor = (page: import("@playwright/test").Page) => page.getByRole("textbox", { name: /^Edit / });

test("write a note, save with Ctrl+S, and see links, backlinks and search", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/notes");
  await page.getByLabel("New note").fill(`e2e/target-${stamp}`);
  await page.getByRole("button", { name: "Create note" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`target-${stamp}`);
  await editor(page).click();
  await page.keyboard.type("# Hədəf qeyd\nfork yeni proses yaradır");
  await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/notes");
  await page.getByLabel("New note").fill(`e2e/source-${stamp}`);
  await page.getByRole("button", { name: "Create note" }).click();
  await editor(page).click();
  await page.keyboard.type(`Bax [[target-${stamp}]] #linux`);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("#linux")).toBeVisible();
  await page.getByRole("complementary").getByRole("link", { name: `target-${stamp}` }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hədəf qeyd");
  await expect(page.getByRole("complementary").getByRole("link", { name: `source-${stamp}` })).toBeVisible();

  await page.reload();
  await expect(editor(page)).toContainText("fork yeni proses yaradır");

  await page.goto("/notes");
  await page.getByPlaceholder("Search your notes…").fill("yaradir");
  await expect(page.getByRole("list", { name: "Search results" }).getByRole("link").filter({ hasText: `e2e/target-${stamp}.md` })).toBeVisible();
});

test("a change on disk turns a save into a conflict; keep mine as a copy", async ({ page }) => {
  const stamp = Date.now();
  const rel = `e2e/conflict-${stamp}.md`;
  await page.goto("/notes");
  await page.getByLabel("New note").fill(rel);
  await page.getByRole("button", { name: "Create note" }).click();
  await editor(page).click();
  await page.keyboard.type("mine");
  writeFileSync(join(".data/e2e/vault", rel), "edited in Obsidian\n");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("alert")).toContainText("changed outside the Hub");
  await page.getByRole("button", { name: "Keep mine as a copy" }).click();
  await expect(editor(page)).toContainText("edited in Obsidian");
  await page.goto("/notes");
  await expect(page.getByRole("link").filter({ hasText: new RegExp(`conflict-${stamp} \\(conflict `) })).toHaveCount(1);
});

test("unsaved changes block in-app navigation until confirmed", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/notes");
  await page.getByLabel("New note").fill(`e2e/guard-${stamp}`);
  await page.getByRole("button", { name: "Create note" }).click();
  await editor(page).click();
  await page.keyboard.type("draft text");
  page.once("dialog", (d) => void d.dismiss());
  await page.getByRole("link", { name: "Notes" }).first().click();
  await expect(editor(page)).toContainText("draft text"); // still here
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("link", { name: "Notes" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Notes");
});

test("switching between notes with identical content never carries a draft over", async ({ page }) => {
  const stamp = Date.now();
  const ids: string[] = [];
  for (const name of ["twin-a", "twin-b"]) {
    const res = await page.request.post("/api/notes", { data: { path: `e2e/${name}-${stamp}.md`, content: "same\n" }, headers: { origin: "http://127.0.0.1:3417" } });
    ids.push((await res.json()).id);
  }
  await page.goto(`/notes/${ids[0]}`);
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("only in A");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.goto(`/notes/${ids[1]}`);
  await expect(editor(page)).toHaveText("same");
  await expect(editor(page)).not.toContainText("only in A");
});
