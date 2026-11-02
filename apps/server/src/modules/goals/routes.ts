import type { FastifyInstance, FastifyReply } from "fastify";
import { CreateGoal, CreateTask, Goal, GoalList, IdParam, ReorderTasks, SetNoteTopics, SpaceNoteList, TopicRefList, UpdateGoal, UpdateTask } from "@hub/contracts";
import { z } from "zod";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import * as svc from "./service.ts";

const err = (reply: FastifyReply, status: number, code: string, messageKey: string) => reply.code(status).send({ error: { code, messageKey } });
const notFound = (reply: FastifyReply) => err(reply, 404, "not_found", "errors.notFound");
const Archived = z.object({ archived: z.literal("1").optional() });

type Outcome = { kind: "ok"; goal: Goal } | { kind: "not_found" } | { kind: "archived" } | { kind: "too_many" } | { kind: "invalid" };
function send(reply: FastifyReply, out: Outcome) {
  if (out.kind === "not_found") return notFound(reply);
  if (out.kind === "archived") return err(reply, 409, "conflict", "goals.archived");
  if (out.kind === "too_many") return err(reply, 409, "conflict", "goals.tooManyTasks");
  if (out.kind === "invalid") return err(reply, 400, "validation_failed", "errors.validation");
  return Goal.parse(out.goal);
}

/** Goals with checklist tasks, and note ↔ topic links (HSLH-007, D-063). */
export async function registerGoalRoutes(app: FastifyInstance, database: DatabaseHandle): Promise<void> {
  const { db } = database;

  app.get("/api/spaces/:id/goals", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const q = Archived.safeParse(req.query ?? {});
    if (!q.success) return err(reply, 400, "validation_failed", "errors.validation");
    const list = p.success ? svc.listGoals(db, p.data.id, q.data.archived === "1") : undefined;
    return list ? GoalList.parse({ goals: list }) : notFound(reply);
  });

  app.post("/api/spaces/:id/goals", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = CreateGoal.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.createGoal(db, p.data.id, body.data);
    if (out.kind === "not_found") return notFound(reply);
    if (out.kind === "archived") return err(reply, 409, "conflict", "goals.spaceArchived");
    if (out.kind === "too_many") return err(reply, 409, "conflict", "goals.tooManyGoals");
    return reply.code(201).send(Goal.parse(out.goal));
  });

  app.patch("/api/goals/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = UpdateGoal.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const goal = svc.updateGoal(db, p.data.id, body.data);
    return goal ? Goal.parse(goal) : notFound(reply);
  });

  app.post("/api/goals/:id/tasks", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = CreateTask.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.addTask(db, p.data.id, body.data.text);
    return out.kind === "ok" ? reply.code(201).send(Goal.parse(out.goal)) : send(reply, out);
  });

  app.put("/api/goals/:id/tasks/order", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = ReorderTasks.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    return send(reply, svc.reorderTasks(db, p.data.id, body.data.taskIds));
  });

  app.patch("/api/tasks/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = UpdateTask.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    return send(reply, svc.updateTask(db, p.data.id, body.data));
  });

  app.delete("/api/tasks/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    return send(reply, svc.deleteTask(db, p.data.id));
  });

  app.get("/api/topics", async () => TopicRefList.parse({ topics: svc.allTopics(db) }));

  app.get("/api/notes/:id/topics", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success || !svc.noteExists(db, p.data.id)) return notFound(reply);
    return TopicRefList.parse({ topics: svc.noteTopicRefs(db, p.data.id) });
  });

  app.put("/api/notes/:id/topics", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = SetNoteTopics.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.setNoteTopics(db, p.data.id, body.data.topicIds);
    if (out.kind === "not_found") return notFound(reply);
    if (out.kind === "bad_topic") return err(reply, 400, "validation_failed", "goals.badTopic");
    return TopicRefList.parse({ topics: svc.noteTopicRefs(db, p.data.id) });
  });

  app.get("/api/spaces/:id/notes", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success || !svc.spaceExists(db, p.data.id)) return notFound(reply);
    return SpaceNoteList.parse({ notes: svc.spaceNotes(db, p.data.id) });
  });
}
