import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { TutorFramework, TutorMessage, type CreateTutorThread, type SendTutorMessage, type TutorThread } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import { tutorMessages, tutorThreads } from "../../lib/db/schema.ts";
import { getSpace } from "../spaces/service.ts";
import type { TutorSession } from "./ai.ts";
import { PROMPT_VERSION } from "./prompts.ts";

type ThreadRow = typeof tutorThreads.$inferSelect;
const now = () => new Date().toISOString();
const IMMEDIATE = { behavior: "immediate" } as const;
export class TutorError extends Error {
  readonly code: string;
  readonly status: number;
  readonly messageKey: string;
  constructor(code: string, status = 409, messageKey = "tutor.conflict") {
    super(code); this.code = code; this.status = status; this.messageKey = messageKey;
  }
}
const notFound = () => new TutorError("not_found", 404, "errors.notFound");
const toThread = ({ frameworkJson, ...row }: ThreadRow): TutorThread => ({ ...row, framework: TutorFramework.parse(JSON.parse(frameworkJson)) });
const threadRow = (db: Db, id: string) => db.select().from(tutorThreads).where(eq(tutorThreads.id, id)).get();
export const messages = (db: Db, id: string) => db.select().from(tutorMessages).where(eq(tutorMessages.threadId, id)).orderBy(asc(tutorMessages.seq)).all().map((r) => TutorMessage.parse(r));

export function createThread(db: Db, input: CreateTutorThread) {
  const space = getSpace(db, input.spaceId);
  if (!space) throw notFound();
  if (space.archivedAt) throw new TutorError("archived");
  if (input.topicId && !space.topics.some((t) => t.id === input.topicId)) throw new TutorError("validation_failed", 400, "errors.validation");
  const ts = now();
  const row: ThreadRow = { id: randomUUID(), spaceId: input.spaceId, topicId: input.topicId ?? null, frameworkJson: JSON.stringify(input.framework), hintLevel: 0, approachStep: 0, createdAt: ts, updatedAt: ts, archivedAt: null };
  db.insert(tutorThreads).values(row).run();
  return toThread(row);
}
export function listThreads(db: Db, spaceId: string, topicId: string | undefined, archived: boolean) {
  if (!getSpace(db, spaceId)) throw notFound();
  return db.select().from(tutorThreads).where(and(eq(tutorThreads.spaceId, spaceId), topicId ? eq(tutorThreads.topicId, topicId) : undefined,
    archived ? isNotNull(tutorThreads.archivedAt) : isNull(tutorThreads.archivedAt))).orderBy(desc(tutorThreads.updatedAt)).all().map(toThread);
}
export function getThread(db: Db, id: string) {
  const row = threadRow(db, id);
  if (!row) throw notFound();
  return { ...toThread(row), messages: messages(db, id) };
}
export function archiveThread(db: Db, id: string, archived: boolean) {
  const row = threadRow(db, id);
  if (!row) throw notFound();
  if (db.select().from(tutorMessages).where(and(eq(tutorMessages.threadId, id), eq(tutorMessages.status, "streaming"))).get()) throw new TutorError("busy", 409, "tutor.busy");
  const patch = { archivedAt: archived ? (row.archivedAt ?? now()) : null, updatedAt: now() };
  db.update(tutorThreads).set(patch).where(eq(tutorThreads.id, id)).run();
  return toThread({ ...row, ...patch });
}

/** Check before awaiting a session; checked again in the claiming transaction. */
export function previous(db: Db, id: string, input: SendTutorMessage): TutorMessage | undefined {
  const thread = threadRow(db, id);
  if (!thread) throw notFound();
  const user = db.select().from(tutorMessages).where(and(eq(tutorMessages.threadId, id), eq(tutorMessages.requestId, input.requestId), eq(tutorMessages.role, "user"))).get();
  let assistant: TutorMessage | undefined;
  if (user) {
    if (user.payloadJson !== JSON.stringify(input)) throw new TutorError("payload_conflict");
    const row = db.select().from(tutorMessages).where(eq(tutorMessages.replyTo, user.id)).get();
    if (!row) throw new Error("Tutor request has no assistant placeholder");
    assistant = TutorMessage.parse(row);
    if (assistant.status === "complete") return assistant;
  }
  if (thread.archivedAt || getSpace(db, thread.spaceId)?.archivedAt) throw new TutorError("archived");
  if (db.select().from(tutorMessages).where(and(eq(tutorMessages.threadId, id), eq(tutorMessages.status, "streaming"))).get()) throw new TutorError("busy", 409, "tutor.busy");
  return assistant;
}

/** User, placeholder, and ladder state commit together, before the first provider call (D-066). */
export function begin(db: Db, id: string, input: SendTutorMessage, session: TutorSession) {
  return db.transaction((tx) => {
    const d = tx as unknown as Db;
    const old = previous(d, id, input);
    if (old?.status === "complete") return { replay: true as const, assistant: old };
    const thread = threadRow(d, id)!;
    const mode = getSpace(d, thread.spaceId)?.tutorMode ?? "project";
    const ts = now();
    let hintLevel = old?.hintLevel ?? null;
    let approachStep = old?.approachStep ?? null;
    if (!old) {
      // The ladder moves up only once the current rung has a completed answer (from any request, including a
      // retry). Until then a new request stays on the current rung, so failed attempts never skip a level.
      const rungDone = (column: typeof tutorMessages.hintLevel, rung: number) => rung > 0 && tx.select({ id: tutorMessages.id }).from(tutorMessages)
        .where(and(eq(tutorMessages.threadId, id), eq(tutorMessages.role, "assistant"), eq(tutorMessages.kind, input.kind), eq(column, rung), eq(tutorMessages.status, "complete"))).get() !== undefined;
      if (input.kind === "hint") hintLevel = Math.max(1, Math.min(4, thread.hintLevel + (thread.hintLevel === 0 || rungDone(tutorMessages.hintLevel, thread.hintLevel) ? 1 : 0)));
      if (input.kind === "approach") approachStep = Math.max(1, Math.min(5, thread.approachStep + (thread.approachStep === 0 || rungDone(tutorMessages.approachStep, thread.approachStep) ? 1 : 0)));
    }
    const provenance = { mode, providerId: session.providerId, model: session.model, revision: session.revision, promptVersion: PROMPT_VERSION };
    let assistantId: string;
    if (old) {
      assistantId = old.id;
      tx.update(tutorMessages).set({ ...provenance, status: "streaming", content: "", errorCode: null, updatedAt: ts }).where(eq(tutorMessages.id, old.id)).run();
    } else {
      const userId = randomUUID(); assistantId = randomUUID();
      tx.insert(tutorMessages).values({ id: userId, threadId: id, role: "user", requestId: input.requestId, payloadJson: JSON.stringify(input), kind: input.kind, lang: input.lang, content: input.content, status: "complete", createdAt: ts, updatedAt: ts }).run();
      tx.insert(tutorMessages).values({ id: assistantId, threadId: id, replyTo: userId, role: "assistant", kind: input.kind, lang: input.lang, status: "streaming", hintLevel, approachStep, ...provenance, createdAt: ts, updatedAt: ts }).run();
    }
    tx.update(tutorThreads).set({ hintLevel: Math.max(thread.hintLevel, hintLevel ?? 0), approachStep: Math.max(thread.approachStep, approachStep ?? 0), updatedAt: ts }).where(eq(tutorThreads.id, id)).run();
    return { replay: false as const, assistant: TutorMessage.parse(tx.select().from(tutorMessages).where(eq(tutorMessages.id, assistantId)).get()!) };
  }, IMMEDIATE);
}

/** Conditional transition makes completion, cancellation and error mutually exclusive. */
export function finalize(db: Db, id: string, status: "complete" | "error" | "cancelled", content: string, errorCode: string | null) {
  return db.update(tutorMessages).set({ status, content, errorCode, updatedAt: now() }).where(and(eq(tutorMessages.id, id), eq(tutorMessages.status, "streaming"))).run().changes === 1;
}
export function recover(db: Db) {
  db.update(tutorMessages).set({ status: "interrupted", errorCode: "interrupted", updatedAt: now() }).where(eq(tutorMessages.status, "streaming")).run();
}

export function peerDraft(db: Db, id: string, tried: string, lang: "en" | "az") {
  const thread = getThread(db, id);
  const hints = thread.messages.filter((m) => m.role === "assistant" && m.kind === "hint" && m.status === "complete");
  if (hints.length < 3) throw new TutorError("hints_required", 409, "tutor.hintsRequired");
  const f = thread.framework;
  const labels = lang === "az"
    ? ["Problemi anlamaqda köməyə ehtiyacım var", "Problem", "Cəhd etdiklərim", "Framework üzrə addımlarım", "Oxuduqlarım", "Xəta", "Öz sözlərimlə", "Framework yoxlaması ötürülüb", "Alınan məsləhətlər"]
    : ["Could you help me understand this problem?", "Problem", "What I tried", "How I followed The Framework", "Reading", "Error", "In my words", "Framework check skipped", "Suggestions received"];
  return { text: `${labels[0]}\n\n${labels[1]}:\n${thread.messages.find((m) => m.role === "user")?.content ?? ""}\n\n${labels[2]}:\n${tried}\n\n${labels[3]}:\n${labels[4]}: ${f.read ?? ""}\n${labels[5]}: ${f.error ?? ""}\n${labels[6]}: ${f.rephrase ?? ""}\n${f.skipped ? labels[7] + "\n" : ""}\n${labels[8]}:\n${hints.map((h) => `- ${h.content}`).join("\n")}` };
}
