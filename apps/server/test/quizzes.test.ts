import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Attempt, AttemptList, Question, Quiz, QuizDetail, QuizList, Space, Topic } from "@hub/contracts";
import { signedInApp, type TestApp } from "./helpers.ts";

const MCQ = { type: "mcq", prompt: "fork() returns what in the child?", options: ["0", "the child PID", "-1"], answer: { correct: [0] }, explanation: "The child sees 0." };
const MULTI = { type: "multi", prompt: "Which are system calls?", options: ["read", "printf", "execve"], answer: { correct: [0, 2] }, explanation: "printf is a library function." };
const SHORT = { type: "short_self", prompt: "What does $? hold?", answer: { reference: "The exit status of the last command" }, explanation: "" };

describe("quizzes API", () => {
  let t: TestApp;
  beforeEach(async () => { t = await signedInApp(); });
  afterEach(async () => { await t.close(); });

  async function setup() {
    const space = Space.parse((await t.req({ method: "POST", url: "/api/spaces", payload: { name: "Shell" } })).json());
    const topic = Topic.parse((await t.req({ method: "POST", url: `/api/spaces/${space.id}/topics`, payload: { name: "Processes" } })).json());
    const quiz = Quiz.parse((await t.req({ method: "POST", url: "/api/quizzes", payload: { topicId: topic.id, title: "Processes check" } })).json());
    const qs = [];
    for (const q of [MCQ, MULTI, SHORT]) {
      const res = await t.req({ method: "POST", url: `/api/quizzes/${quiz.id}/questions`, payload: q });
      expect(res.statusCode).toBe(201);
      qs.push(Question.parse(res.json()));
    }
    return { space, topic, quiz, qs: qs as [Question, Question, Question] };
  }
  const start = async (quizId: string, mode: "practice" | "exam", confidencePre: number | null = 3) =>
    Attempt.parse((await t.req({ method: "POST", url: `/api/quizzes/${quizId}/attempts`, payload: { mode, confidencePre } })).json());
  const answer = (a: string, q: string, response: unknown) => t.req({ method: "PUT", url: `/api/attempts/${a}/answers/${q}`, payload: { response } });

  it("authors a quiz per topic and lists it by space with counts", async () => {
    const { space, topic, quiz } = await setup();
    const list = QuizList.parse((await t.req({ method: "GET", url: `/api/quizzes?spaceId=${space.id}` })).json());
    expect(list.quizzes).toEqual([expect.objectContaining({ id: quiz.id, topicName: topic.name, questionCount: 3, attemptCount: 0 })]);
    const detail = QuizDetail.parse((await t.req({ method: "GET", url: `/api/quizzes/${quiz.id}` })).json());
    expect(detail.questions.map((q) => q.type)).toEqual(["mcq", "multi", "short_self"]);
  });

  it("rejects malformed questions", async () => {
    const { quiz } = await setup();
    const bad = [
      { ...MCQ, answer: { correct: [0, 1] } },
      { ...MCQ, answer: { correct: [5] } },
      { ...MCQ, options: ["only one"] },
      { ...MCQ, options: ["a", "A"] },
      { ...MULTI, answer: { correct: [] } },
      { ...SHORT, answer: { correct: [0] } },
      { ...MCQ, answer: { reference: "x" } },
    ];
    for (const payload of bad) {
      expect((await t.req({ method: "POST", url: `/api/quizzes/${quiz.id}/questions`, payload })).statusCode).toBe(400);
    }
  });

  it("exam mode returns no answers, explanations or correctness before submit", async () => {
    const { quiz, qs } = await setup();
    const a = await start(quiz.id, "exam", 4);
    const leaks = (body: string) => ["the exit status", "The child sees 0", "printf is a library", "\"correct\"", "reference"].filter((s) => body.includes(s));
    expect(leaks(JSON.stringify(a))).toEqual([]);
    expect(a.score).toBeNull();

    const r1 = await answer(a.id, qs[0].id, { selected: [1] }); // wrong
    expect(r1.statusCode).toBe(200);
    expect(leaks(r1.body)).toEqual([]);
    expect(Attempt.parse(r1.json()).items[0]!.feedback).toBeNull();
    // Exam answers can change until submit.
    expect((await answer(a.id, qs[0].id, { selected: [0] })).statusCode).toBe(200);
    await answer(a.id, qs[2].id, { text: "exit code" });
    const fetched = await t.req({ method: "GET", url: `/api/attempts/${a.id}` });
    expect(leaks(fetched.body)).toEqual([]);
    const history = await t.req({ method: "GET", url: `/api/quizzes/${quiz.id}/attempts` });
    expect(AttemptList.parse(history.json()).attempts[0]!.score).toBeNull();
    // An empty response clears a saved exam answer.
    await answer(a.id, qs[1].id, { selected: [0] });
    expect(Attempt.parse((await answer(a.id, qs[1].id, { selected: [] })).json()).items[1]!.response).toBeNull();
    // Grading a short answer is refused while the reference is hidden.
    expect((await t.req({ method: "POST", url: `/api/attempts/${a.id}/answers/${qs[2].id}/grade`, payload: { correct: true } })).statusCode).toBe(409);

    const done = Attempt.parse((await t.req({ method: "POST", url: `/api/attempts/${a.id}/submit`, payload: {} })).json());
    expect(done.finishedAt).not.toBeNull();
    expect(done.items.map((i) => i.feedback?.correct)).toEqual([true, false, null]); // multi unanswered → false, short → ungraded
    expect(done.score).toEqual({ correct: 1, total: 3, ungraded: 1, unanswered: 1 });
    expect(done.confidencePre).toBe(4);

    const graded = Attempt.parse((await t.req({ method: "POST", url: `/api/attempts/${a.id}/answers/${qs[2].id}/grade`, payload: { correct: true } })).json());
    expect(graded.score).toEqual({ correct: 2, total: 3, ungraded: 0, unanswered: 1 });
    // Finished attempts take no more answers; submit is idempotent.
    expect((await answer(a.id, qs[1].id, { selected: [0, 2] })).statusCode).toBe(409);
    const again = Attempt.parse((await t.req({ method: "POST", url: `/api/attempts/${a.id}/submit`, payload: {} })).json());
    expect(again.finishedAt).toBe(done.finishedAt);
  });

  it("practice mode reveals feedback per answered question and locks that answer", async () => {
    const { quiz, qs } = await setup();
    const a = await start(quiz.id, "practice", null);
    expect(a.items.every((i) => i.feedback === null)).toBe(true);
    const r = Attempt.parse((await answer(a.id, qs[1].id, { selected: [2, 0] })).json());
    expect(r.items[1]!.feedback).toEqual({ answer: { correct: [0, 2] }, explanation: MULTI.explanation, correct: true });
    expect(r.items[0]!.feedback).toBeNull();
    // Same response again is a no-op (retry); a different one is refused.
    expect((await answer(a.id, qs[1].id, { selected: [2, 0] })).statusCode).toBe(200);
    expect((await answer(a.id, qs[1].id, { selected: [0] })).statusCode).toBe(409);
    const s = Attempt.parse((await answer(a.id, qs[2].id, { text: "status" })).json());
    expect(s.items[2]!.feedback?.answer).toEqual(SHORT.answer);
    expect(s.items[2]!.feedback?.correct).toBeNull();
    const g = Attempt.parse((await t.req({ method: "POST", url: `/api/attempts/${a.id}/answers/${qs[2].id}/grade`, payload: { correct: false } })).json());
    expect(g.score).toEqual({ correct: 1, total: 3, ungraded: 0, unanswered: 1 });
  });

  it("validates responses against the question type without revealing the key", async () => {
    const { quiz, qs } = await setup();
    const a = await start(quiz.id, "exam");
    for (const [q, response] of [[qs[0], { selected: [0, 1] }], [qs[0], { selected: [9] }], [qs[0], { text: "0" }], [qs[2], { selected: [0] }], [qs[1], { text: "x" }]] as const) {
      const res = await answer(a.id, q.id, response);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.messageKey).toBe("errors.validation");
    }
    expect((await answer(a.id, randomUUID(), { selected: [0] })).statusCode).toBe(404);
    // Practice has nothing to clear: an empty response is invalid there.
    const p = await start(quiz.id, "practice");
    expect((await answer(p.id, qs[1].id, { selected: [] })).statusCode).toBe(400);
    expect((await answer(p.id, qs[2].id, { text: "  " })).statusCode).toBe(400);
  });

  it("attempts keep an immutable snapshot when questions change later (D-032)", async () => {
    const { quiz, qs } = await setup();
    const a = await start(quiz.id, "practice");
    expect((await t.req({ method: "PUT", url: `/api/questions/${qs[0].id}`, payload: { ...MCQ, prompt: "Edited", answer: { correct: [1] } } })).statusCode).toBe(200);
    expect((await t.req({ method: "DELETE", url: `/api/questions/${qs[1].id}`, payload: {} })).statusCode).toBe(204);
    const r = Attempt.parse((await answer(a.id, qs[0].id, { selected: [0] })).json());
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({ prompt: MCQ.prompt, feedback: { correct: true } });
    // A new attempt sees the edited bank.
    const b = await start(quiz.id, "practice");
    expect(b.items.map((i) => i.prompt)).toEqual(["Edited", SHORT.prompt]);
  });

  it("keeps attempt history newest first, with confidence beside the score", async () => {
    const { quiz, qs } = await setup();
    const a = await start(quiz.id, "practice", 5);
    await answer(a.id, qs[0].id, { selected: [0] });
    await t.req({ method: "POST", url: `/api/attempts/${a.id}/submit`, payload: {} });
    const b = await start(quiz.id, "exam", 2);
    const list = AttemptList.parse((await t.req({ method: "GET", url: `/api/quizzes/${quiz.id}/attempts` })).json()).attempts;
    expect(list.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(list[1]).toMatchObject({ mode: "practice", confidencePre: 5, score: { correct: 1, total: 3, ungraded: 0, unanswered: 2 } });
    expect(Quiz.parse((await t.req({ method: "GET", url: `/api/quizzes/${quiz.id}` })).json()).attemptCount).toBe(2);
  });

  it("refuses attempts on empty or archived quizzes and keeps history after archiving", async () => {
    const empty = Quiz.parse((await t.req({ method: "POST", url: "/api/quizzes", payload: { title: "Empty" } })).json());
    expect((await t.req({ method: "POST", url: `/api/quizzes/${empty.id}/attempts`, payload: { mode: "practice" } })).json().error.messageKey).toBe("quizzes.noQuestions");
    const { quiz, space } = await setup();
    const a = await start(quiz.id, "practice");
    expect((await t.req({ method: "PATCH", url: `/api/quizzes/${quiz.id}`, payload: { archived: true } })).statusCode).toBe(200);
    expect((await t.req({ method: "POST", url: `/api/quizzes/${quiz.id}/attempts`, payload: { mode: "exam" } })).statusCode).toBe(409);
    expect(QuizList.parse((await t.req({ method: "GET", url: `/api/quizzes?spaceId=${space.id}` })).json()).quizzes).toEqual([]);
    expect((await t.req({ method: "GET", url: `/api/attempts/${a.id}` })).statusCode).toBe(200);
  });

  it("validates quiz input", async () => {
    expect((await t.req({ method: "POST", url: "/api/quizzes", payload: { title: "" } })).statusCode).toBe(400);
    expect((await t.req({ method: "POST", url: "/api/quizzes", payload: { title: "x", topicId: randomUUID() } })).json().error.messageKey).toBe("quizzes.badTopic");
    const q = Quiz.parse((await t.req({ method: "POST", url: "/api/quizzes", payload: { title: "x" } })).json());
    await t.req({ method: "POST", url: `/api/quizzes/${q.id}/questions`, payload: MCQ });
    expect((await t.req({ method: "POST", url: `/api/quizzes/${q.id}/attempts`, payload: { mode: "exam", confidencePre: 6 } })).statusCode).toBe(400);
    expect((await t.req({ method: "GET", url: `/api/attempts/${randomUUID()}` })).statusCode).toBe(404);
  });
});
