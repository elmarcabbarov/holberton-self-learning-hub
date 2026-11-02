import type { FastifyInstance, FastifyReply } from "fastify";
import { IdParam, SaveReflection, SessionList, SessionOverview, StartSession, StudySession } from "@hub/contracts";
import { z } from "zod";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import * as svc from "./service.ts";

const err = (reply: FastifyReply, status: number, code: string, messageKey: string) => reply.code(status).send({ error: { code, messageKey } });
const notFound = (reply: FastifyReply) => err(reply, 404, "not_found", "errors.notFound");

/** Study sessions and their optional reflection (HSLH-027, D-064). */
export async function registerSessionRoutes(app: FastifyInstance, database: DatabaseHandle): Promise<void> {
  const { db } = database;

  app.get("/api/sessions/overview", async () => SessionOverview.parse(svc.overview(db)));

  app.get("/api/sessions", async (req, reply) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).safeParse(req.query ?? {});
    if (!q.success) return err(reply, 400, "validation_failed", "errors.validation");
    return SessionList.parse({ sessions: svc.recent(db, q.data.limit) });
  });

  app.post("/api/sessions", async (req, reply) => {
    const body = StartSession.safeParse(req.body ?? {});
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.start(db, body.data);
    if (out.kind === "bad_ref") return err(reply, 400, "validation_failed", "sessions.badRef");
    if (out.kind === "open") return reply.code(409).send({ error: { code: "conflict", messageKey: "sessions.alreadyOpen", details: { session: StudySession.parse(out.session) } } });
    return reply.code(201).send(StudySession.parse(out.session));
  });

  app.post("/api/sessions/:id/stop", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const s = p.success ? svc.stop(db, p.data.id) : undefined;
    return s ? StudySession.parse(s) : notFound(reply);
  });

  app.put("/api/sessions/:id/reflection", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = SaveReflection.safeParse(req.body ?? {});
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = svc.reflect(db, p.data.id, body.data);
    if (out.kind === "not_found") return notFound(reply);
    if (out.kind === "open") return err(reply, 409, "conflict", "sessions.stillOpen");
    return StudySession.parse(out.session);
  });
}
