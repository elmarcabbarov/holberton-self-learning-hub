import type { FastifyInstance, FastifyReply } from "fastify";
import { CreateSpace, CreateTopic, IdParam, Space, SpaceDetail, SpaceList, Topic, UpdateSpace, UpdateTopic } from "@hub/contracts";
import type { z } from "zod";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import * as svc from "./service.ts";

function invalid(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: { code: "validation_failed", messageKey: "errors.validation", details: error.issues.map((i) => ({ path: i.path, code: i.code })) } });
}
const notFound = (reply: FastifyReply) => reply.code(404).send({ error: { code: "not_found", messageKey: "errors.notFound" } });

export async function registerSpaceRoutes(app: FastifyInstance, database: DatabaseHandle): Promise<void> {
  const { db } = database;

  app.get("/api/spaces", async (req) => {
    const archived = (req.query as { archived?: string } | undefined)?.archived === "1";
    return SpaceList.parse({ spaces: svc.listSpaces(db, archived) });
  });

  app.post("/api/spaces", async (req, reply) => {
    const body = CreateSpace.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    return reply.code(201).send(Space.parse(svc.createSpace(db, body.data)));
  });

  app.get("/api/spaces/:id", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const space = svc.getSpace(db, params.data.id);
    return space ? SpaceDetail.parse(space) : notFound(reply);
  });

  app.patch("/api/spaces/:id", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = UpdateSpace.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const space = svc.updateSpace(db, params.data.id, body.data);
    return space ? Space.parse(space) : notFound(reply);
  });

  app.post("/api/spaces/:id/topics", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = CreateTopic.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const topic = svc.createTopic(db, params.data.id, body.data);
    return topic ? reply.code(201).send(Topic.parse(topic)) : notFound(reply);
  });

  app.patch("/api/topics/:id", async (req, reply) => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = UpdateTopic.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const topic = svc.updateTopic(db, params.data.id, body.data);
    return topic ? Topic.parse(topic) : notFound(reply);
  });
}
