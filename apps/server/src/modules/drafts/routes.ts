import type { FastifyInstance, FastifyReply } from "fastify";
import { CommitDraft, CreateDraft, DraftItem, DraftItemParams, DraftList, IdParam, ListDrafts, MAX_DRAFT_NOTE_CHARS, RetryDraft, UpdateDraftItem } from "@hub/contracts";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import type { Vault } from "../vault/service.ts";
import type { ExamService } from "../exam-mode/service.ts";
import type { DraftAI, DraftSession } from "./ai.ts";
import { generate } from "./generate.ts";
import * as svc from "./service.ts";

const invalid = () => new svc.DraftError("validation_failed", 400, "errors.validation");
const idOf = (params: unknown) => {
  const p = IdParam.safeParse(params);
  if (!p.success) throw svc.notFound();
  return p.data.id;
};
async function respond(reply: FastifyReply, run: () => unknown | Promise<unknown>) {
  try { return await run(); } catch (e) {
    if (!(e instanceof svc.DraftError)) throw e;
    return reply.code(e.status).send({ error: { code: e.code, messageKey: e.messageKey } });
  }
}

export async function registerDraftRoutes(app: FastifyInstance, database: DatabaseHandle, ai: DraftAI, exam: ExamService, vaults: Vault[]): Promise<void> {
  const { db } = database;
  svc.recover(db);
  let closing = false;
  const running = new Set<Promise<void>>();
  const controllers = new Set<AbortController>();
  app.addHook("preClose", async () => {
    closing = true;
    for (const c of controllers) c.abort("cancelled");
  });
  app.addHook("onClose", async () => { await Promise.allSettled(running); });
  const assertAvailable = () => {
    if (closing) throw new svc.DraftError("shutting_down", 503, "drafts.shuttingDown");
    if (exam.active()) throw new svc.DraftError("exam_mode", 423, "tutor.examMode");
  };
  const owner = (id: string) => vaults.find((v) => v.get(id));
  const readNote = async (id: string) => {
    const v = owner(id);
    if (!v) throw svc.notFound();
    if (v.state !== "ready") throw new svc.DraftError("vault_unavailable", 503, "notes.vaultUnavailable");
    let note;
    try { note = await v.read(id); } catch { throw svc.notFound(); }
    if (!note) throw svc.notFound();
    if (v.state !== "ready") throw new svc.DraftError("vault_unavailable", 503, "notes.vaultUnavailable");
    return note;
  };
  const get = async (id: string) => {
    const draft = svc.row(db, id);
    let changed = true;
    try { changed = (await readNote(draft.noteId)).version.sha256 !== draft.noteSha256; } catch { /* Missing/unavailable source is also no longer the frozen source. */ }
    svc.refreshWarnings(db, id);
    return svc.detail(db, id, changed);
  };
  const run = async (reply: FastifyReply, session: DraftSession, draft: ReturnType<typeof svc.row>) => {
    const controller = new AbortController();
    const disconnect = () => { if (!reply.raw.writableFinished) controller.abort("cancelled"); };
    reply.raw.once("close", disconnect);
    controllers.add(controller);
    if (reply.raw.destroyed) controller.abort("cancelled");
    const completion = generate(db, exam, session, draft, controller);
    running.add(completion);
    try { await completion; } finally {
      running.delete(completion);
      controllers.delete(controller);
      reply.raw.off("close", disconnect);
    }
    return svc.detail(db, draft.id);
  };

  app.post("/api/drafts", async (req, reply) => respond(reply, async () => {
    const b = CreateDraft.safeParse(req.body);
    if (!b.success) throw invalid();
    assertAvailable();
    const old = svc.previous(db, b.data);
    if (old) return svc.detail(db, old.id);
    const session = await ai.session();
    assertAvailable();
    if (!session) throw new svc.DraftError("not_ready", 409, "ai.notReadyError");
    svc.consent(session, b.data.consent);
    const note = await readNote(b.data.noteId);
    if (note.text.length > MAX_DRAFT_NOTE_CHARS) throw new svc.DraftError("note_too_large", 413, "drafts.noteTooLarge");
    assertAvailable();
    const claim = svc.begin(db, b.data, note, session);
    if (claim.replay) return svc.detail(db, claim.draft.id);
    return run(reply, session, claim.draft);
  }));
  app.get("/api/drafts/:id", async (req, reply) => respond(reply, () => get(idOf(req.params))));
  app.get("/api/drafts", async (req, reply) => respond(reply, async () => {
    const q = ListDrafts.safeParse(req.query);
    if (!q.success) throw invalid();
    return DraftList.parse({ drafts: await Promise.all(svc.list(db, q.data.noteId).map((d) => get(d.id))) });
  }));
  app.patch("/api/drafts/:id/items/:itemId", async (req, reply) => respond(reply, () => {
    const p = DraftItemParams.safeParse(req.params);
    if (!p.success) throw svc.notFound();
    const b = UpdateDraftItem.safeParse(req.body);
    if (!b.success) throw invalid();
    return DraftItem.parse(svc.edit(db, p.data.id, p.data.itemId, b.data));
  }));
  app.post("/api/drafts/:id/commit", async (req, reply) => respond(reply, () => {
    const id = idOf(req.params);
    const b = CommitDraft.safeParse(req.body);
    if (!b.success) throw invalid();
    return svc.commit(db, id, b.data);
  }));
  app.post("/api/drafts/:id/retry", async (req, reply) => respond(reply, async () => {
    const id = idOf(req.params);
    const b = RetryDraft.safeParse(req.body ?? {});
    if (!b.success) throw invalid();
    assertAvailable();
    const old = svc.row(db, id);
    if (old.status !== "failed" && old.status !== "interrupted") throw new svc.DraftError("not_retryable");
    const session = await ai.session();
    assertAvailable();
    if (!session) throw new svc.DraftError("not_ready", 409, "ai.notReadyError");
    // Retry uses the same frozen source; require its owning vault to remain available.
    await readNote(old.noteId);
    assertAvailable();
    return run(reply, session, svc.retry(db, id, session, b.data.consent));
  }));
}
