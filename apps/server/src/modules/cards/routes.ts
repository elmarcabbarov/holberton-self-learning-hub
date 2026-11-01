import type { FastifyInstance, FastifyReply } from "fastify";
import { Card, CardList, CreateCard, IdParam, ReviewQueue, ReviewRequest, ReviewSummary, UpdateCard } from "@hub/contracts";
import { z } from "zod";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import * as svc from "./service.ts";

const err = (reply: FastifyReply, status: number, code: string, messageKey: string) => reply.code(status).send({ error: { code, messageKey } });
const Filter = z.object({ topicId: z.string().uuid().optional(), noteId: z.string().uuid().optional(), spaceId: z.string().uuid().optional() });

export async function registerCardRoutes(app: FastifyInstance, database: DatabaseHandle): Promise<void> {
  const { db } = database;

  app.get("/api/cards", async (req, reply) => {
    const f = Filter.safeParse(req.query ?? {});
    if (!f.success) return err(reply, 400, "validation_failed", "errors.validation");
    return CardList.parse({ cards: svc.listCards(db, { ...(f.data.topicId ? { topicId: f.data.topicId } : {}), ...(f.data.noteId ? { noteId: f.data.noteId } : {}), ...(f.data.spaceId ? { spaceId: f.data.spaceId } : {}) }).map(svc.toApi) });
  });

  app.post("/api/cards", async (req, reply) => {
    const body = CreateCard.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.createCard(db, body.data);
    if (out.kind !== "created") return err(reply, 400, "validation_failed", out.kind === "bad_topic" ? "cards.badTopic" : "cards.badNote");
    return reply.code(201).send(Card.parse(svc.toApi(out.card)));
  });

  app.patch("/api/cards/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return err(reply, 404, "not_found", "errors.notFound");
    const body = UpdateCard.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const row = svc.updateCard(db, p.data.id, body.data);
    if (row === undefined) return err(reply, 404, "not_found", "errors.notFound");
    if (row === null) return err(reply, 400, "validation_failed", "cards.badTopic");
    return Card.parse(svc.toApi(row));
  });

  app.post("/api/cards/:id/review", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return err(reply, 404, "not_found", "errors.notFound");
    const body = ReviewRequest.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.reviewCard(db, p.data.id, body.data.rating, body.data.eventId);
    if (out.kind === "not_found") return err(reply, 404, "not_found", "errors.notFound");
    if (out.kind === "inactive") return err(reply, 409, "conflict", "cards.inactive");
    return Card.parse(svc.toApi(out.card));
  });

  app.get("/api/review/queue", async (req, reply) => {
    const f = Filter.safeParse(req.query ?? {});
    if (!f.success) return err(reply, 400, "validation_failed", "errors.validation");
    return ReviewQueue.parse(svc.reviewQueue(db, f.data.spaceId ? { spaceId: f.data.spaceId } : {}));
  });

  app.get("/api/review/summary", async () => ReviewSummary.parse(svc.reviewSummary(db)));
}
