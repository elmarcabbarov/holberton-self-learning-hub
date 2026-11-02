import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, isNotNull, isNull, max } from "drizzle-orm";
import { AnswerKey, MAX_QUESTIONS, type QuestionType, type QuizMode, type Response, type UpdateQuiz } from "@hub/contracts";
import { z } from "zod";
import type { Db } from "../../lib/db/index.ts";
import { quizAnswers, quizAttempts, quizQuestions, quizzes, topics } from "../../lib/db/schema.ts";

type QuizRow = typeof quizzes.$inferSelect;
type QuestionRow = typeof quizQuestions.$inferSelect;
type AttemptRow = typeof quizAttempts.$inferSelect;
type AnswerRow = typeof quizAnswers.$inferSelect;

/** A frozen copy of one question, stored inside the attempt (D-032). */
const Snapshot = z.array(z.object({
  id: z.string(), type: z.enum(["mcq", "multi", "short_self"]), prompt: z.string(), options: z.array(z.string()),
  answer: AnswerKey, explanation: z.string(),
}));
type SnapshotQuestion = z.infer<typeof Snapshot>[number];

export interface QuestionInput { type: QuestionType; prompt: string; options: string[]; answer: AnswerKey; explanation: string }

const iso = (d: Date) => d.toISOString();
/** Read-then-write transactions take the write lock up front: a deferred one fails with SQLITE_BUSY when another process (the token CLI) wrote meanwhile. */
const IMMEDIATE = { behavior: "immediate" } as const;
const topicExists = (db: Db, id: string) => !!db.select({ id: topics.id }).from(topics).where(eq(topics.id, id)).get();

// ---------- authoring ----------

export function questionToApi(row: QuestionRow) {
  return {
    id: row.id, quizId: row.quizId, position: row.position, type: row.type as QuestionType, prompt: row.prompt,
    options: JSON.parse(row.optionsJson) as string[], answer: AnswerKey.parse(JSON.parse(row.answerJson)),
    explanation: row.explanation, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

const activeQuestions = (db: Db, quizId: string) => db.select().from(quizQuestions)
  .where(and(eq(quizQuestions.quizId, quizId), isNull(quizQuestions.archivedAt))).orderBy(asc(quizQuestions.position)).all();

function quizToApi(db: Db, row: QuizRow) {
  const topic = row.topicId ? db.select({ name: topics.name, spaceId: topics.spaceId }).from(topics).where(eq(topics.id, row.topicId)).get() : undefined;
  const questionCount = db.select({ n: count() }).from(quizQuestions).where(and(eq(quizQuestions.quizId, row.id), isNull(quizQuestions.archivedAt))).get()?.n ?? 0;
  const attemptCount = db.select({ n: count() }).from(quizAttempts).where(eq(quizAttempts.quizId, row.id)).get()?.n ?? 0;
  return {
    id: row.id, topicId: row.topicId, topicName: topic?.name ?? null, spaceId: topic?.spaceId ?? null, title: row.title, questionCount, attemptCount,
    createdAt: row.createdAt, updatedAt: row.updatedAt, archivedAt: row.archivedAt,
  };
}

export const getQuizRow = (db: Db, id: string) => db.select().from(quizzes).where(eq(quizzes.id, id)).get();

export function getQuiz(db: Db, id: string) {
  const row = getQuizRow(db, id);
  return row ? quizToApi(db, row) : undefined;
}

export function getQuizDetail(db: Db, id: string) {
  const row = getQuizRow(db, id);
  return row ? { ...quizToApi(db, row), questions: activeQuestions(db, id).map(questionToApi) } : undefined;
}

export function createQuiz(db: Db, input: { topicId: string | null; title: string }, now = new Date()) {
  if (input.topicId && !topicExists(db, input.topicId)) return { kind: "bad_topic" as const };
  const row: QuizRow = { id: randomUUID(), topicId: input.topicId, title: input.title, createdAt: iso(now), updatedAt: iso(now), archivedAt: null };
  db.insert(quizzes).values(row).run();
  return { kind: "created" as const, quiz: quizToApi(db, row) };
}

export function listQuizzes(db: Db, filter: { topicId?: string; spaceId?: string; archived?: boolean }) {
  const conds = [filter.archived ? isNotNull(quizzes.archivedAt) : isNull(quizzes.archivedAt)];
  if (filter.topicId) conds.push(eq(quizzes.topicId, filter.topicId));
  if (filter.spaceId) conds.push(eq(topics.spaceId, filter.spaceId));
  return db.select({ quiz: quizzes }).from(quizzes).leftJoin(topics, eq(topics.id, quizzes.topicId))
    .where(and(...conds)).orderBy(asc(quizzes.createdAt)).all().map((r) => quizToApi(db, r.quiz));
}

export function updateQuiz(db: Db, id: string, input: UpdateQuiz, now = new Date()) {
  const row = getQuizRow(db, id);
  if (!row) return { kind: "not_found" as const };
  if (input.topicId && !topicExists(db, input.topicId)) return { kind: "bad_topic" as const };
  const patch: Partial<QuizRow> = { updatedAt: iso(now) };
  if (input.title !== undefined) patch.title = input.title;
  if (input.topicId !== undefined) patch.topicId = input.topicId;
  if (input.archived !== undefined) patch.archivedAt = input.archived ? (row.archivedAt ?? iso(now)) : null;
  db.update(quizzes).set(patch).where(eq(quizzes.id, id)).run();
  return { kind: "updated" as const, quiz: quizToApi(db, { ...row, ...patch }) };
}

export function addQuestion(db: Db, quizId: string, q: QuestionInput, now = new Date()) {
  return db.transaction((tx) => {
    const quiz = tx.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) return { kind: "not_found" as const };
    if (quiz.archivedAt) return { kind: "archived" as const };
    const n = tx.select({ n: count() }).from(quizQuestions).where(and(eq(quizQuestions.quizId, quizId), isNull(quizQuestions.archivedAt))).get()?.n ?? 0;
    if (n >= MAX_QUESTIONS) return { kind: "too_many" as const };
    const last = tx.select({ p: max(quizQuestions.position) }).from(quizQuestions).where(eq(quizQuestions.quizId, quizId)).get()?.p;
    const row: QuestionRow = {
      id: randomUUID(), quizId, position: (last ?? -1) + 1, type: q.type, prompt: q.prompt,
      optionsJson: JSON.stringify(q.options), answerJson: JSON.stringify(q.answer), explanation: q.explanation,
      createdAt: iso(now), updatedAt: iso(now), archivedAt: null,
    };
    tx.insert(quizQuestions).values(row).run();
    tx.update(quizzes).set({ updatedAt: iso(now) }).where(eq(quizzes.id, quizId)).run();
    return { kind: "created" as const, question: row };
  }, IMMEDIATE);
}

/** Replaces a question. Attempts already started keep their snapshot, so history is unaffected. */
export function updateQuestion(db: Db, id: string, q: QuestionInput, now = new Date()) {
  const row = db.select().from(quizQuestions).where(eq(quizQuestions.id, id)).get();
  if (!row || row.archivedAt) return undefined;
  const patch = { type: q.type, prompt: q.prompt, optionsJson: JSON.stringify(q.options), answerJson: JSON.stringify(q.answer), explanation: q.explanation, updatedAt: iso(now) };
  db.update(quizQuestions).set(patch).where(eq(quizQuestions.id, id)).run();
  return { ...row, ...patch };
}

export function archiveQuestion(db: Db, id: string, now = new Date()) {
  const row = db.select().from(quizQuestions).where(eq(quizQuestions.id, id)).get();
  if (!row) return false;
  if (!row.archivedAt) db.update(quizQuestions).set({ archivedAt: iso(now), updatedAt: iso(now) }).where(eq(quizQuestions.id, id)).run();
  return true;
}

// ---------- attempts ----------

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Auto-grades choice questions. Short answers are graded by the learner later (null until then). */
function autoGrade(q: SnapshotQuestion, r: Response): boolean | null {
  if (q.type === "short_self" || !("selected" in r) || !("correct" in q.answer)) return null;
  return sameSet(r.selected, q.answer.correct);
}

/** Checks a response against the question shape. Messages are generic so they reveal nothing about the key. */
const isEmptyResponse = (r: Response) => ("selected" in r ? r.selected.length === 0 : r.text.trim() === "");

function validResponse(q: SnapshotQuestion, r: Response): boolean {
  if (q.type === "short_self") return "text" in r && r.text.trim().length > 0;
  if (!("selected" in r)) return false;
  const s = r.selected;
  if (new Set(s).size !== s.length || s.some((i) => i >= q.options.length)) return false;
  return q.type === "mcq" ? s.length === 1 : s.length >= 1;
}

export function startAttempt(db: Db, quizId: string, input: { mode: QuizMode; confidencePre: number | null }, now = new Date()) {
  return db.transaction((tx) => {
    const quiz = tx.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) return { kind: "not_found" as const };
    if (quiz.archivedAt) return { kind: "archived" as const };
    const qs = tx.select().from(quizQuestions).where(and(eq(quizQuestions.quizId, quizId), isNull(quizQuestions.archivedAt)))
      .orderBy(asc(quizQuestions.position)).all();
    if (qs.length === 0) return { kind: "empty" as const };
    const snapshot: SnapshotQuestion[] = qs.map((q) => ({
      id: q.id, type: q.type as QuestionType, prompt: q.prompt, options: JSON.parse(q.optionsJson) as string[],
      answer: AnswerKey.parse(JSON.parse(q.answerJson)), explanation: q.explanation,
    }));
    const row: AttemptRow = {
      id: randomUUID(), quizId, mode: input.mode, confidencePre: input.confidencePre,
      questionsJson: JSON.stringify(snapshot), startedAt: iso(now), finishedAt: null,
    };
    tx.insert(quizAttempts).values(row).run();
    return { kind: "started" as const, attempt: row };
  }, IMMEDIATE);
}

export const getAttemptRow = (db: Db, id: string) => db.select().from(quizAttempts).where(eq(quizAttempts.id, id)).get();

export type AnswerOutcome =
  | { kind: "saved"; attempt: AttemptRow }
  | { kind: "not_found" } | { kind: "finished" } | { kind: "locked" } | { kind: "invalid" };

/**
 * Records a response. Practice: the first response is final (feedback was shown), a repeat of the same response is a no-op.
 * Exam: the response can change until submit. Grading happens now but stays hidden until the view allows it.
 */
export function answerQuestion(db: Db, attemptId: string, questionId: string, r: Response, now = new Date()): AnswerOutcome {
  return db.transaction((tx) => {
    const attempt = tx.select().from(quizAttempts).where(eq(quizAttempts.id, attemptId)).get();
    if (!attempt) return { kind: "not_found" };
    const q = Snapshot.parse(JSON.parse(attempt.questionsJson)).find((x) => x.id === questionId);
    if (!q) return { kind: "not_found" };
    if (attempt.finishedAt) return { kind: "finished" };
    const where = and(eq(quizAnswers.attemptId, attemptId), eq(quizAnswers.questionId, questionId));
    // Exam: an empty response clears the saved one (all boxes unticked, text erased).
    if (attempt.mode === "exam" && isEmptyResponse(r) && ("text" in r) === (q.type === "short_self")) {
      tx.delete(quizAnswers).where(where).run();
      return { kind: "saved", attempt };
    }
    if (!validResponse(q, r)) return { kind: "invalid" };
    const existing = tx.select().from(quizAnswers).where(where).get();
    const responseJson = JSON.stringify(r);
    if (existing && attempt.mode === "practice") {
      return existing.responseJson === responseJson ? { kind: "saved", attempt } : { kind: "locked" };
    }
    const values = { responseJson, answeredAt: iso(now), correct: autoGrade(q, r), gradedAt: null };
    if (existing) tx.update(quizAnswers).set(values).where(where).run();
    else tx.insert(quizAnswers).values({ attemptId, questionId, ...values }).run();
    return { kind: "saved", attempt };
  }, IMMEDIATE);
}

/** Ends the attempt. Idempotent: a finished attempt keeps its first finish time. */
export function submitAttempt(db: Db, attemptId: string, now = new Date()) {
  const row = getAttemptRow(db, attemptId);
  if (!row) return undefined;
  if (row.finishedAt) return row;
  db.update(quizAttempts).set({ finishedAt: iso(now) }).where(and(eq(quizAttempts.id, attemptId), isNull(quizAttempts.finishedAt))).run();
  return getAttemptRow(db, attemptId);
}

/** The learner's verdict on a short answer, once the reference is visible (practice: after answering; exam: after submit). */
export function gradeShortAnswer(db: Db, attemptId: string, questionId: string, correct: boolean, now = new Date()) {
  return db.transaction((tx) => {
    const attempt = tx.select().from(quizAttempts).where(eq(quizAttempts.id, attemptId)).get();
    if (!attempt) return { kind: "not_found" as const };
    const q = Snapshot.parse(JSON.parse(attempt.questionsJson)).find((x) => x.id === questionId);
    if (!q) return { kind: "not_found" as const };
    if (q.type !== "short_self") return { kind: "not_gradable" as const };
    if (attempt.mode === "exam" && !attempt.finishedAt) return { kind: "not_revealed" as const };
    const where = and(eq(quizAnswers.attemptId, attemptId), eq(quizAnswers.questionId, questionId));
    if (!tx.select().from(quizAnswers).where(where).get()) return { kind: "not_gradable" as const };
    // Assignment, not a toggle: repeating the same verdict is a no-op and a later one corrects it.
    tx.update(quizAnswers).set({ correct, gradedAt: iso(now) }).where(where).run();
    return { kind: "graded" as const, attempt };
  }, IMMEDIATE);
}

function scoreOf(snapshot: SnapshotQuestion[], answers: Map<string, AnswerRow>) {
  let correct = 0, ungraded = 0, unanswered = 0;
  for (const q of snapshot) {
    const a = answers.get(q.id);
    if (!a) unanswered++;
    else if (a.correct === null) ungraded++;
    else if (a.correct) correct++;
  }
  return { correct, total: snapshot.length, ungraded, unanswered };
}

const answersOf = (db: Db, attemptId: string) =>
  new Map(db.select().from(quizAnswers).where(eq(quizAnswers.attemptId, attemptId)).all().map((a) => [a.questionId, a]));

/** Exam answers stay hidden until submit; practice reveals each one after it is answered (HSLH-009). */
export function attemptToApi(db: Db, row: AttemptRow) {
  const snapshot = Snapshot.parse(JSON.parse(row.questionsJson));
  const answers = answersOf(db, row.id);
  const examOpen = row.mode === "exam" && !row.finishedAt;
  const quizTitle = getQuizRow(db, row.quizId)?.title ?? "";
  return {
    id: row.id, quizId: row.quizId, quizTitle, mode: row.mode as QuizMode, confidencePre: row.confidencePre,
    startedAt: row.startedAt, finishedAt: row.finishedAt,
    items: snapshot.map((q) => {
      const a = answers.get(q.id);
      const reveal = !examOpen && (!!a || !!row.finishedAt);
      return {
        id: q.id, type: q.type, prompt: q.prompt, options: q.options,
        response: a ? (JSON.parse(a.responseJson) as Response) : null,
        feedback: reveal ? { answer: q.answer, explanation: q.explanation, correct: a ? a.correct : false } : null,
      };
    }),
    score: examOpen ? null : scoreOf(snapshot, answers),
  };
}

export function listAttempts(db: Db, quizId: string) {
  return db.select().from(quizAttempts).where(eq(quizAttempts.quizId, quizId)).orderBy(desc(quizAttempts.startedAt)).all().map((row) => {
    const examOpen = row.mode === "exam" && !row.finishedAt;
    return {
      id: row.id, mode: row.mode as QuizMode, confidencePre: row.confidencePre, startedAt: row.startedAt, finishedAt: row.finishedAt,
      score: examOpen ? null : scoreOf(Snapshot.parse(JSON.parse(row.questionsJson)), answersOf(db, row.id)),
    };
  });
}
