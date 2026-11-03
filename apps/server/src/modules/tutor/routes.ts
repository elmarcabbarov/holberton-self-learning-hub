import type { FastifyInstance, FastifyReply } from "fastify";
import { ArchiveTutorThread, CreateTutorThread, IdParam, ListTutorThreads, PeerDraft, PeerDraftRequest, SendTutorMessage, TutorThread, TutorThreadDetail, TutorThreadList } from "@hub/contracts";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import type { ExamService } from "../exam-mode/service.ts";
import type { TutorAI } from "./ai.ts";
import { assemblePrompt } from "./prompts.ts";
import * as svc from "./service.ts";
import { generate, replay } from "./stream.ts";

const invalid = () => new svc.TutorError("validation_failed", 400, "errors.validation");
const idOf = (params: unknown) => {
  const p = IdParam.safeParse(params);
  if (!p.success) throw new svc.TutorError("not_found", 404, "errors.notFound");
  return p.data.id;
};
async function respond(reply: FastifyReply, run: () => unknown | Promise<unknown>) {
  try { return await run(); } catch (e) {
    if (!(e instanceof svc.TutorError)) throw e;
    return reply.code(e.status).send({ error: { code: e.code, messageKey: e.messageKey } });
  }
}

export async function registerTutorRoutes(app: FastifyInstance, database: DatabaseHandle, ai: TutorAI, exam: ExamService): Promise<void> {
  const { db } = database;
  svc.recover(db);
  const running = new Set<Promise<void>>();
  // preClose runs before Fastify waits for open connections: an SSE stream must be cancelled first, or a
  // stalled consumer would hold shutdown. onClose (reverse order, before the database closes) waits for the
  // finalizers.
  app.addHook("preClose", async () => { exam.abortAll("cancelled"); });
  app.addHook("onClose", async () => { await Promise.allSettled(running); });

  app.post("/api/tutor/threads", async (req, reply) => respond(reply, () => {
    const b = CreateTutorThread.safeParse(req.body);
    if (!b.success) throw invalid();
    return reply.code(201).send(TutorThread.parse(svc.createThread(db, b.data)));
  }));
  app.get("/api/tutor/threads", async (req, reply) => respond(reply, () => {
    const q = ListTutorThreads.safeParse(req.query);
    if (!q.success) throw invalid();
    return TutorThreadList.parse({ threads: svc.listThreads(db, q.data.spaceId, q.data.topicId, q.data.archived === "1") });
  }));
  app.get("/api/tutor/threads/:id", async (req, reply) => respond(reply, () => TutorThreadDetail.parse(svc.getThread(db, idOf(req.params)))));
  app.patch("/api/tutor/threads/:id", async (req, reply) => respond(reply, () => {
    const b = ArchiveTutorThread.safeParse(req.body);
    if (!b.success) throw invalid();
    return TutorThread.parse(svc.archiveThread(db, idOf(req.params), b.data.archived));
  }));
  app.post("/api/tutor/threads/:id/peer-draft", async (req, reply) => respond(reply, () => {
    const q = PeerDraftRequest.safeParse(req.body);
    if (!q.success) throw invalid();
    return PeerDraft.parse(svc.peerDraft(db, idOf(req.params), q.data.tried, q.data.lang));
  }));
  app.post("/api/tutor/threads/:id/messages", async (req, reply) => respond(reply, async () => {
    const id = idOf(req.params);
    const b = SendTutorMessage.safeParse(req.body);
    if (!b.success) throw invalid();
    const assertExamOff = () => { if (exam.active()) throw new svc.TutorError("exam_mode", 423, "tutor.examMode"); };
    assertExamOff();
    const old = svc.previous(db, id, b.data);
    if (old?.status === "complete") return replay(reply, old);
    const session = await ai.session();
    if (reply.raw.destroyed) return reply;
    assertExamOff(); // settings/secret reads can yield while exam mode is activated
    if (!session) throw new svc.TutorError("not_ready", 409, "ai.notReadyError");
    const claim = svc.begin(db, id, b.data, session);
    if (claim.replay) return replay(reply, claim.assistant);
    const thread = svc.getThread(db, id);
    const prompt = assemblePrompt(thread, thread.messages, claim.assistant);
    const stream = generate(reply, db, exam, session, claim.assistant, prompt);
    running.add(stream.completion);
    void stream.completion.finally(() => running.delete(stream.completion));
    return stream.reply;
  }));
}
