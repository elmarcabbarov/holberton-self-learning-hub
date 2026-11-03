import { z } from "zod";

const Id = z.string().uuid();
const Text = z.string().trim().min(1).max(5000);
const Option = z.string().trim().min(1).max(500);
export const MAX_OPTIONS = 8;
export const MAX_QUESTIONS = 100;

export const QuestionType = z.enum(["mcq", "multi", "short_self"]);
export type QuestionType = z.infer<typeof QuestionType>;
export const QuizMode = z.enum(["practice", "exam"]);
export type QuizMode = z.infer<typeof QuizMode>;
/** 1 = guessing … 5 = certain. A calibration signal, never a measurement (D-005). */
export const Confidence = z.number().int().min(1).max(5);

const indices = z.array(z.number().int().min(0).max(MAX_OPTIONS - 1)).max(MAX_OPTIONS);

/** The answer key. mcq: exactly one index; multi: one or more (all-or-nothing); short_self: a reference the learner compares against. */
export const AnswerKey = z.union([
  z.object({ correct: indices.min(1) }),
  z.object({ reference: Text }),
]);
export type AnswerKey = z.infer<typeof AnswerKey>;

/** A question as the author edits it; includes the answer key. */
export const QuestionDraft = z.object({
  type: QuestionType,
  prompt: Text,
  options: z.array(Option).max(MAX_OPTIONS).default([]),
  answer: AnswerKey,
  explanation: z.string().trim().max(5000).default(""),
}).superRefine((q, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message, path: ["answer"] });
  if (q.type === "short_self") {
    if (!("reference" in q.answer)) issue("short_self needs a reference answer");
    if (q.options.length > 0) issue("short_self has no options");
    return;
  }
  if (!("correct" in q.answer)) return issue("choice questions need correct indices");
  if (q.options.length < 2) return issue("at least two options");
  if (new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length) issue("options must differ");
  const c = q.answer.correct;
  if (new Set(c).size !== c.length) issue("duplicate index");
  if (c.some((i) => i >= q.options.length)) issue("index out of range");
  if (q.type === "mcq" && c.length !== 1) issue("mcq has exactly one correct option");
});
export type QuestionDraft = z.input<typeof QuestionDraft>;

export const Question = z.object({
  id: Id, quizId: Id, position: z.number().int().nonnegative(), type: QuestionType, prompt: z.string(),
  options: z.array(z.string()), answer: AnswerKey, explanation: z.string(), createdAt: z.string(), updatedAt: z.string(),
});
export type Question = z.infer<typeof Question>;

export const Quiz = z.object({
  id: Id, topicId: Id.nullable(), topicName: z.string().nullable(), spaceId: Id.nullable(), title: z.string(),
  questionCount: z.number().int().nonnegative(), attemptCount: z.number().int().nonnegative(),
  createdAt: z.string(), updatedAt: z.string(), archivedAt: z.string().nullable(),
});
export type Quiz = z.infer<typeof Quiz>;
export const QuizList = z.object({ quizzes: z.array(Quiz) });
export type QuizList = z.infer<typeof QuizList>;
/** The authoring view: every active question with its answer key. */
export const QuizDetail = Quiz.extend({ questions: z.array(Question) });
export type QuizDetail = z.infer<typeof QuizDetail>;

export const CreateQuiz = z.object({ topicId: Id.nullable().default(null), title: z.string().trim().min(1).max(200) });
export type CreateQuiz = z.input<typeof CreateQuiz>;
export const UpdateQuiz = z.object({
  title: z.string().trim().min(1).max(200).optional(), topicId: Id.nullable().optional(), archived: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, "empty update");
export type UpdateQuiz = z.infer<typeof UpdateQuiz>;

/** A learner's response. Choice questions send indices; short answers send text. */
export const Response = z.union([z.object({ selected: indices.max(MAX_OPTIONS) }), z.object({ text: z.string().max(5000) })]);
export type Response = z.infer<typeof Response>;

export const StartAttempt = z.object({ mode: QuizMode, confidencePre: Confidence.nullable().default(null) });
export type StartAttempt = z.input<typeof StartAttempt>;
export const AnswerRequest = z.object({ response: Response });
export const GradeRequest = z.object({ correct: z.boolean() });

/** What the learner may see of a question during an attempt: never the key (exam leakage, HSLH-009). */
export const AttemptQuestion = z.object({ id: Id, type: QuestionType, prompt: z.string(), options: z.array(z.string()) });

/** Revealed after a practice answer or after an exam is submitted. */
export const Feedback = z.object({ answer: AnswerKey, explanation: z.string(), correct: z.boolean().nullable() });
export type Feedback = z.infer<typeof Feedback>;

export const AttemptItem = AttemptQuestion.extend({
  response: Response.nullable(),
  feedback: Feedback.nullable(),
});
export type AttemptItem = z.infer<typeof AttemptItem>;

export const Score = z.object({
  correct: z.number().int().nonnegative(), total: z.number().int().nonnegative(),
  ungraded: z.number().int().nonnegative(), unanswered: z.number().int().nonnegative(),
});
export type Score = z.infer<typeof Score>;

export const Attempt = z.object({
  id: Id, quizId: Id, quizTitle: z.string(), mode: QuizMode, confidencePre: Confidence.nullable(),
  startedAt: z.string(), finishedAt: z.string().nullable(),
  items: z.array(AttemptItem),
  /** Null while an exam is open, so nothing about correctness leaks before submit. */
  score: Score.nullable(),
});
export type Attempt = z.infer<typeof Attempt>;

export const AttemptSummary = z.object({
  id: Id, mode: QuizMode, confidencePre: Confidence.nullable(), startedAt: z.string(), finishedAt: z.string().nullable(), score: Score.nullable(),
});
export type AttemptSummary = z.infer<typeof AttemptSummary>;
export const AttemptList = z.object({ attempts: z.array(AttemptSummary) });
export type AttemptList = z.infer<typeof AttemptList>;
