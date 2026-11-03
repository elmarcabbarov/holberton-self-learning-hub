import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });

// AI settings are one row for the whole Hub: this file owns them.
test("AI is off by default; an OpenAI-compatible server can be set and tested; the key is never shown", async ({ page }) => {
  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "AI" });
  const form = panel.getByRole("form", { name: "AI settings" });
  await form.getByLabel("Provider").selectOption("openai_compatible");
  await form.getByLabel("Server address").fill("http://127.0.0.1:9/v1"); // nothing listens on the discard port
  await form.getByLabel("Model name").fill("llama3.2");
  await form.getByLabel("API key (if the server needs one)").fill("sk-e2e-secret-wxyz");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(panel).toContainText("Ready: llama3.2.");
  await expect(form.getByLabel("API key (if the server needs one)")).toHaveValue("");
  await expect(form.getByLabel("API key (if the server needs one)")).toHaveAttribute("placeholder", "Key saved (…wxyz). Type a new one to replace it.");
  await expect(page.locator("body")).not.toContainText("sk-e2e-secret");

  await panel.getByRole("button", { name: "Test the model" }).click();
  await expect(panel.getByRole("list", { name: "Test results" })).toContainText("Text failed: could not reach the server");

  await form.getByLabel("Provider").selectOption("disabled");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByRole("button", { name: "Test the model" })).toHaveCount(0);
});
