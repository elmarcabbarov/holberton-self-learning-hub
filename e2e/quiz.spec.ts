import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });

/** Space → topic → quiz with one mcq and one short answer; returns on the quiz page. */
async function makeQuiz(page: Page, stamp: number) {
  await page.goto("/spaces");
  await page.getByLabel("New space").fill(`Quiz ${stamp}`);
  await page.getByRole("button", { name: "Create space" }).click();
  await page.getByRole("link", { name: new RegExp(`Quiz ${stamp}`) }).click();
  await page.getByLabel("Topic name").fill("Processes");
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByRole("list", { name: "Topics in this space" }).getByText("Processes", { exact: true })).toBeVisible();

  const create = page.getByRole("form", { name: "New quiz" });
  await create.getByLabel("Quiz title").fill(`Processes check ${stamp}`);
  await create.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Processes check ${stamp}` })).toBeVisible();

  const form = page.getByRole("form", { name: "New question" });
  await form.getByLabel("Question").fill("fork() returns what in the child?");
  await form.getByLabel("Option 1", { exact: true }).fill("0");
  await form.getByLabel("Option 2", { exact: true }).fill("The child PID");
  await form.getByLabel("Option 1 is correct").check();
  await form.getByLabel("Explanation (optional)").fill("The parent gets the PID; the child gets 0.");
  await form.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("list", { name: "Questions" })).toContainText("fork() returns what");

  await form.getByLabel("Type").selectOption("short_self");
  await form.getByLabel("Question").fill("What does $? hold?");
  await form.getByLabel("Reference answer").fill("The exit status of the last command");
  await form.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("heading", { name: "2 questions" })).toBeVisible();
}

test("exam: confidence first, no answers before submit, then result and self-grading", async ({ page }) => {
  const stamp = Date.now();
  await makeQuiz(page, stamp);
  await page.getByLabel("Exam").check();
  await page.getByLabel("Fairly sure").check();
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByText("0 of 2 answered")).toBeVisible();
  await page.getByLabel("The child PID").check(); // wrong on purpose
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByLabel("Your answer").fill("exit code"); // not blurred: saved on submit
  await expect(page.getByText("The parent gets the PID")).toHaveCount(0);
  await expect(page.getByText("The exit status of the last command")).toHaveCount(0);

  await page.getByRole("button", { name: "Submit exam" }).click();
  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(page.getByText("0 of 2 correct · 1 not graded")).toBeVisible();
  await expect(page.getByText(/Before you started you said: Fairly sure \(4 of 5\)/)).toBeVisible();
  await expect(page.getByText("The parent gets the PID; the child gets 0.")).toBeVisible();
  await expect(page.getByText("Not quite")).toBeVisible();

  await page.getByRole("button", { name: "I got it" }).click();
  await expect(page.getByText("1 of 2 correct", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Back to the quiz" }).first().click();
  await expect(page.getByRole("list", { name: "Past attempts" })).toContainText("1 of 2 correct");
  await expect(page.getByRole("list", { name: "Past attempts" })).toContainText("Before: Fairly sure");
});

test("practice: feedback after each question, answer locks", async ({ page }) => {
  const stamp = Date.now();
  await makeQuiz(page, stamp);
  await page.getByRole("button", { name: "Start" }).click(); // practice, confidence skipped
  await page.getByLabel("0", { exact: true }).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await expect(page.getByLabel("The child PID")).toBeDisabled();

  await page.getByLabel("Your answer").fill("the status");
  await page.getByRole("button", { name: "Show the reference answer" }).click();
  await expect(page.getByText("The exit status of the last command")).toBeVisible();
  await page.getByRole("button", { name: "I missed it" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("1 of 2 correct", { exact: true })).toBeVisible();
  await expect(page.getByText("You skipped the confidence question for this attempt.")).toBeVisible();
});
