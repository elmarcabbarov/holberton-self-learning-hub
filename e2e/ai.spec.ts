import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });
// AI settings and exam mode are global to the shared e2e server: this file runs serially and owns them.
// With --repeat-each, run it with --workers=1, or parallel copies of this file overwrite each other's settings.
test.describe.configure({ mode: "serial" });
test.afterEach(async ({ page }) => { await resetAI(page); });

const headers = { origin: "http://127.0.0.1:3417" };
async function setAI(page: Page, mode: "disabled" | "mock") {
  const current = await (await page.request.get("/api/ai/status")).json();
  const saved = await page.request.put("/api/ai/settings", { headers, data: { mode, model: mode === "mock" ? "tutor-test" : "", baseUrl: "", revision: current.revision, key: { op: "clear" } } });
  expect(saved.ok()).toBeTruthy();
}
async function resetAI(page: Page) {
  await page.request.put("/api/exam-mode", { headers, data: { until: null } });
  await setAI(page, "disabled");
}

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

test("Framework tutor: AI off, skip, conversation, hint ladder, peer bridge, mode and exam controls", async ({ page }) => {
  await resetAI(page);
  const space = await (await page.request.post("/api/spaces", { headers, data: { name: `Tutor ${Date.now()}` } })).json();
  const topic = await (await page.request.post(`/api/spaces/${space.id}/topics`, { headers, data: { name: "Processes" } })).json();
  await page.goto(`/spaces/${space.id}`);
  const topicRow = page.getByRole("list", { name: "Topics in this space" }).getByRole("listitem").filter({ hasText: "Processes" });
  await topicRow.getByRole("link", { name: "Ask the tutor" }).click();
  await expect(page).toHaveURL(new RegExp(`topicId=${topic.id}`));
  await expect(page.getByText("AI is off. Turn it on in Settings to use the tutor.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings → AI" })).toHaveAttribute("href", "/settings#ai-title");
  await expect(page.getByRole("form", { name: "Message the tutor" })).toHaveCount(0);

  await setAI(page, "mock");
  await page.reload();
  await expect(page.getByLabel("Topic (optional)")).toHaveValue(topic.id);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/tutor/threads") && r.request().method() === "POST");
  await page.getByRole("button", { name: "I already did this — skip" }).click();
  const thread = await (await created).json();
  expect(thread.framework).toEqual({ skipped: true });
  expect(thread.topicId).toBe(topic.id);
  const composer = page.getByRole("form", { name: "Message the tutor" });
  await composer.getByLabel("Your question or reply").fill("How does waitpid work?");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  const conversation = page.getByRole("region", { name: "Conversation", exact: true });
  await expect(conversation.getByRole("article").filter({ hasText: "Tutor" }).last()).toContainText("mock:");
  await expect(composer.getByRole("button", { name: "Send", exact: true })).toBeDisabled(); // composer was cleared
  for (let level = 1; level <= 3; level++) {
    await composer.getByRole("button", { name: "Next hint", exact: true }).click();
    await expect(conversation.getByText(`Hint ${level} of 4`, { exact: false })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Next hint", exact: true })).toBeEnabled();
  }
  await conversation.getByRole("button", { name: "Ask a peer", exact: true }).click();
  await conversation.getByLabel("What I tried", { exact: true }).fill("I read man 2 waitpid and traced the child PID.");
  await conversation.getByRole("button", { name: "Create peer draft" }).click();
  await expect(conversation.getByLabel("Draft for a peer")).toHaveValue(/I read man 2 waitpid and traced the child PID\./);
  await conversation.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(conversation.getByRole("status")).toContainText(/Copied\.|Text selected\./);
  const detail = await (await page.request.get(`/api/tutor/threads/${thread.id}`)).json();
  expect(detail.messages.filter((m: { role: string }) => m.role === "user").every((m: { lang: string }) => m.lang === "en")).toBe(true);

  await page.goto(`/spaces/${space.id}`);
  await page.getByLabel("Tutor mode", { exact: true }).selectOption("project");
  await expect(page.getByText("Hints and questions to help you work through the task; no task solutions.")).toBeVisible();
  await page.goto(`/spaces/${space.id}/tutor`);
  await page.getByRole("button", { name: /Processes/ }).click();
  await page.getByRole("button", { name: "Explain fully", exact: true }).click();
  await expect(conversation.getByText("Explanation · Project", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explain fully", exact: true })).toBeEnabled();

  await page.goto("/settings");
  const exam = page.getByRole("region", { name: "Exam mode", exact: true });
  await exam.getByRole("button", { name: "Start for 1 h" }).click();
  await expect(page.getByText(/Exam mode until .* — AI is off/)).toBeVisible();
  await expect(exam.getByRole("button", { name: "End now" })).toBeFocused(); // focus follows the replaced control
  await expect(page.getByRole("button", { name: "Test the model" })).toBeDisabled();
  await page.goto(`/spaces/${space.id}/tutor`);
  await page.getByRole("button", { name: /Processes/ }).click();
  await expect(page.getByText("AI is paused during exam mode. You can end exam mode early.")).toBeVisible();
  await expect(composer).toHaveCount(0);
  await page.goto("/settings");
  await exam.getByRole("button", { name: "End now" }).click();
  await expect(page.getByText(/Exam mode until .* — AI is off/)).toHaveCount(0);
  await expect(exam.getByRole("button", { name: "Start for 1 h" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Test the model" })).toBeEnabled();
  await page.goto(`/spaces/${space.id}/tutor`);
  await page.getByRole("button", { name: /Processes/ }).click();
  await expect(composer).toBeVisible();

  await conversation.getByRole("button", { name: "Archive thread" }).click();
  await expect(composer).toHaveCount(0);
  await page.getByLabel("Show archived threads").check();
  await expect(page.getByRole("button", { name: /Processes/ })).toBeVisible();
  await conversation.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(composer).toBeVisible();
});

test("failed hint retries the same request and payload, including the original language", async ({ page }) => {
  await resetAI(page);
  await setAI(page, "mock");
  const space = await (await page.request.post("/api/spaces", { headers, data: { name: `Retry tutor ${Date.now()}` } })).json();
  await page.goto(`/spaces/${space.id}/tutor`);
  await page.getByRole("button", { name: "I already did this — skip" }).click();
  const payloads: unknown[] = [];
  await page.route("**/api/tutor/threads/*/messages", async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) await route.fulfill({ status: 200, contentType: "text/event-stream", body: 'event: error\ndata: {"code":"timeout"}\n\n' });
    else await route.continue();
  });
  await page.getByLabel("Your question or reply").fill("Help me understand fork.");
  await page.getByRole("button", { name: "Next hint", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The response timed out.");
  await page.getByLabel("Your question or reply").fill("A different draft must not replace the retry payload.");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Hint 1 of 4", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next hint", exact: true })).toBeEnabled();
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(payloads[1]).toMatchObject({ lang: "en", kind: "hint", content: "Help me understand fork." });
});

test("a streamed answer survives a failed refresh, and a stored answer replaces a dropped stream", async ({ page }) => {
  await resetAI(page);
  await setAI(page, "mock");
  const space = await (await page.request.post("/api/spaces", { headers, data: { name: `Reconcile tutor ${Date.now()}` } })).json();
  await page.goto(`/spaces/${space.id}/tutor`);
  await page.getByRole("button", { name: "I already did this — skip" }).click();
  const conversation = page.getByRole("region", { name: "Conversation", exact: true });

  await expect(page.getByLabel("Your question or reply")).toBeVisible(); // the thread is loaded before refreshes fail
  // 1. The answer streams, then refreshing the thread fails: the answer stays and the failure is shown.
  await page.route(/\/api\/tutor\/threads\/[^/]+$/, (route) => (route.request().method() === "GET" ? route.fulfill({ status: 500, body: "{}" }) : route.continue()));
  await page.getByLabel("Your question or reply").fill("First question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(conversation.getByText(/^mock:/).first()).toBeVisible();
  await expect(conversation.getByRole("alert")).toContainText("Could not load");
  await expect(page.getByRole("button", { name: "Next hint", exact: true })).toBeEnabled();
  await page.unrouteAll({ behavior: "wait" });

  // 2. The server stores the answer but the stream ends before `done`: once the thread reloads, the stored
  // answer is shown and no interruption alert remains.
  await page.route("**/api/tutor/threads/*/messages", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).split("\n\n").filter((f) => !f.startsWith("event: done")).join("\n\n");
    await route.fulfill({ response: res, body });
  });
  await page.getByLabel("Your question or reply").fill("Second question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(conversation.getByText("Second question")).toBeVisible();
  await expect(conversation.getByRole("alert")).toHaveCount(0);
  await expect(conversation.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("retrying a stored failure keeps the new answer even if the refresh fails", async ({ page }) => {
  await resetAI(page);
  const current = await (await page.request.get("/api/ai/status")).json();
  // Nothing listens on the discard port: the server stores this answer as an `unreachable` error.
  await page.request.put("/api/ai/settings", { headers, data: { mode: "openai_compatible", baseUrl: "http://127.0.0.1:9/v1", model: "m", revision: current.revision, key: { op: "keep" } } });
  const space = await (await page.request.post("/api/spaces", { headers, data: { name: `Retry stored ${Date.now()}` } })).json();
  await page.goto(`/spaces/${space.id}/tutor`);
  await page.getByRole("button", { name: "I already did this — skip" }).click();
  await page.getByLabel("Your question or reply").fill("Why is my child a zombie?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const conversation = page.getByRole("region", { name: "Conversation", exact: true });
  await expect(conversation.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.reload(); // the failure now comes from the server, not from local state
  await page.getByRole("button", { name: /General question/ }).click();
  await expect(conversation.getByRole("button", { name: "Try again" })).toBeVisible();

  await setAI(page, "mock");
  await page.route(/\/api\/tutor\/threads\/[^/]+$/, (route) => (route.request().method() === "GET" ? route.fulfill({ status: 500, body: "{}" }) : route.continue()));
  await conversation.getByRole("button", { name: "Try again" }).click();
  await expect(conversation.getByText(/^mock:/).first()).toBeVisible();
  await expect(conversation.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("exam mode follows the server on focus and expiry; incomplete and remote AI settings are explained", async ({ page }) => {
  await resetAI(page);
  const space = await (await page.request.post("/api/spaces", { headers, data: { name: `Exam tutor ${Date.now()}` } })).json();
  let current = await (await page.request.get("/api/ai/status")).json();
  await page.request.put("/api/ai/settings", { headers, data: { mode: "anthropic", model: "claude-test", revision: current.revision, key: { op: "clear" } } });
  await page.goto(`/spaces/${space.id}/tutor`);
  await expect(page.getByText("AI is not ready. Finish setting up your provider and model to use the tutor.")).toBeVisible();
  current = await (await page.request.get("/api/ai/status")).json();
  await page.request.put("/api/ai/settings", { headers, data: { mode: "anthropic", model: "claude-test", revision: current.revision, key: { op: "replace", value: "sk-test-never-sent" } } });
  await page.reload();
  await page.getByRole("button", { name: "I already did this — skip" }).click();
  await expect(page.getByRole("note")).toContainText("Your messages, the topic and your Framework answers are sent to Anthropic (Claude) / claude-test. No notes are sent.");
  await expect(page.getByRole("note")).toHaveCount(1);
  // Changing global state through the API simulates another tab. No provider request is sent.
  await page.request.put("/api/exam-mode", { headers, data: { until: new Date(Date.now() + 60_000).toISOString() } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("form", { name: "Message the tutor" })).toHaveCount(0);
  await expect(page.getByText(/Exam mode until .* — AI is off/)).toBeVisible();
  await page.request.put("/api/exam-mode", { headers, data: { until: new Date(Date.now() + 2000).toISOString() } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("form", { name: "Message the tutor" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/Exam mode until .* — AI is off/)).toHaveCount(0);
});

test("the tutor sends Azerbaijani as the language of the UI", async ({ page }) => {
  await resetAI(page);
  await setAI(page, "mock");
  const space = await (await page.request.post("/api/spaces", { headers, data: { name: `AZ tutor ${Date.now()}` } })).json();
  await page.goto("/settings");
  await page.getByText("Azərbaycan", { exact: true }).click();
  await page.goto(`/spaces/${space.id}/tutor`);
  await page.getByRole("button", { name: "Bunları artıq etmişəm — ötür" }).click();
  const sent = page.waitForRequest((r) => r.url().endsWith("/messages") && r.method() === "POST");
  await page.getByLabel("Sualın və ya cavabın").fill("fork necə işləyir?");
  await page.getByRole("button", { name: "Göndər", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({ lang: "az", content: "fork necə işləyir?" });
  await expect(page.getByRole("article").filter({ hasText: "Köməkçi" })).toContainText("mock:");
});
