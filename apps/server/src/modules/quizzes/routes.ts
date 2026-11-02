import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AnswerRequest, Attempt, AttemptList, CreateQuiz, GradeRequest, IdParam, Question, QuestionDraft, Quiz, QuizDetail, QuizList, StartAttempt, UpdateQuiz,
} from "@hub/contracts";
import { z } from "zod";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import * as svc from "./service.ts";

const err = (reply: FastifyReply, status: number, code: string, messageKey: string) => reply.code(status).send({ error: { code, messageKey } });
const notFound = (reply: FastifyReply) => err(reply, 404, "not_found", "errors.notFound");
const Filter = z.object({ topicId: z.string().uuid().optional(), spaceId: z.string().uuid().optional() });
const AnswerParams = z.object({ id: z.string().uuid(), questionId: z.string().uuid() });

export async function registerQuizRoutes(app: FastifyInstance, database: DatabaseHandle): Promise<void> {
  const { db } = database;

  app.get("/api/quizzes", async (req, reply) => {
    const f = Filter.safeParse(req.query ?? {});
    if (!f.success) return err(reply, 400, "validation_failed", "errors.validation");
    return QuizList.parse({ quizzes: svc.listQuizzes(db, { ...(f.data.topicId ? { topicId: f.data.topicId } : {}), ...(f.data.spaceId ? { spaceId: f.data.spaceId } : {}) }) });
  });

  app.post("/api/quizzes", async (req, reply) => {
    const body = CreateQuiz.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.createQuiz(db, body.data);
    if (out.kind === "bad_topic") return err(reply, 400, "validation_failed", "quizzes.badTopic");
    return reply.code(201).send(Quiz.parse(out.quiz));
  });

  app.get("/api/quizzes/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const quiz = p.success ? svc.getQuizDetail(db, p.data.id) : undefined;
    return quiz ? QuizDetail.parse(quiz) : notFound(reply);
  });

  app.patch("/api/quizzes/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = UpdateQuiz.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.updateQuiz(db, p.data.id, body.data);
    if (out.kind === "not_found") return notFound(reply);
    if (out.kind === "bad_topic") return err(reply, 400, "validation_failed", "quizzes.badTopic");
    return Quiz.parse(out.quiz);
  });

  app.post("/api/quizzes/:id/questions", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = QuestionDraft.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.addQuestion(db, p.data.id, body.data);
    if (out.kind === "not_found") return notFound(reply);
    if (out.kind === "archived") return err(reply, 409, "conflict", "quizzes.archived");
    if (out.kind === "too_many") return err(reply, 409, "conflict", "quizzes.tooManyQuestions");
    return reply.code(201).send(Question.parse(svc.questionToApi(out.question)));
  });

  app.put("/api/questions/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = QuestionDraft.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const row = svc.updateQuestion(db, p.data.id, body.data);
    return row ? Question.parse(svc.questionToApi(row)) : notFound(reply);
  });

  app.delete("/api/questions/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success || !svc.archiveQuestion(db, p.data.id)) return notFound(reply);
    return reply.code(204).send();
  });

  app.post("/api/quizzes/:id/attempts", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = StartAttempt.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.startAttempt(db, p.data.id, body.data);
    if (out.kind === "not_found") return notFound(reply);
    if (out.kind === "archived") return err(reply, 409, "conflict", "quizzes.archived");
    if (out.kind === "empty") return err(reply, 409, "conflict", "quizzes.noQuestions");
    return reply.code(201).send(Attempt.parse(svc.attemptToApi(db, out.attempt)));
  });

  app.get("/api/quizzes/:id/attempts", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success || !svc.getQuizRow(db, p.data.id)) return notFound(reply);
    return AttemptList.parse({ attempts: svc.listAttempts(db, p.data.id) });
  });

  app.get("/api/attempts/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const row = p.success ? svc.getAttemptRow(db, p.data.id) : undefined;
    return row ? Attempt.parse(svc.attemptToApi(db, row)) : notFound(reply);
  });

  app.put("/api/attempts/:id/answers/:questionId", async (req, reply) => {
    const p = AnswerParams.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = AnswerRequest.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.answerQuestion(db, p.data.id, p.data.questionId, body.data.response);
    if (out.kind === "not_found") return notFound(reply);
    if (out.kind === "invalid") return err(reply, 400, "validation_failed", "errors.validation");
    if (out.kind === "finished") return err(reply, 409, "conflict", "quizzes.finished");
    if (out.kind === "locked") return err(reply, 409, "conflict", "quizzes.locked");
    return Attempt.parse(svc.attemptToApi(db, out.attempt));
  });

  app.post("/api/attempts/:id/submit", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const row = p.success ? svc.submitAttempt(db, p.data.id) : undefined;
    return row ? Attempt.parse(svc.attemptToApi(db, row)) : notFound(reply);
  });

  app.post("/api/attempts/:id/answers/:questionId/grade", async (req, reply) => {
    const p = AnswerParams.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = GradeRequest.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.gradeShortAnswer(db, p.data.id, p.data.questionId, body.data.correct);
    if (out.kind === "not_found") return notFound(reply);
    if (out.kind === "not_gradable") return err(reply, 409, "conflict", "quizzes.notGradable");
    if (out.kind === "not_revealed") return err(reply, 409, "conflict", "quizzes.notRevealed");
    return Attempt.parse(svc.attemptToApi(db, out.attempt));
  });
}
