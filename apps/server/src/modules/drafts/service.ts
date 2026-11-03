import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { Draft, DraftCardPayload, DraftQuestionPayload, DraftCommitResult, type CreateDraft, type CommitDraft, type DraftPayload, type UpdateDraftItem } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import { aiDraftCommits, aiDraftItems, aiDrafts } from "../../lib/db/schema.ts";
import { createCard, listCards } from "../cards/service.ts";
import { addQuestion, createQuiz, getQuiz } from "../quizzes/service.ts";
import { getSpace, getTopic } from "../spaces/service.ts";
import type { DraftSession } from "./ai.ts";
import { PROMPT_VERSION } from "./prompts.ts";

export class DraftError extends Error {
  readonly code: string;
  readonly status: number;
  readonly messageKey: string;
  constructor(code: string, status = 409, messageKey = "drafts.conflict") {
    super(code); this.code = code; this.status = status; this.messageKey = messageKey;
  }
}
const now = () => new Date().toISOString();
const IMMEDIATE = { behavior: "immediate" } as const;
// Whitespace and case only: wait_pid, waitpid(), and waitpid must stay distinct.
const normalize = (s: string) => s.replace(/\s+/gu, " ").trim().toLowerCase();
export const notFound = () => new DraftError("not_found", 404, "errors.notFound");
export function row(db: Db, id: string) {
  const r = db.select().from(aiDrafts).where(eq(aiDrafts.id, id)).get();
  if (!r) throw notFound();
  return r;
}
export const items = (db: Db, id: string) => db.select().from(aiDraftItems).where(eq(aiDraftItems.draftId, id)).orderBy(asc(aiDraftItems.position)).all();
export const list = (db: Db, noteId: string) => db.select({ id: aiDrafts.id }).from(aiDrafts).where(eq(aiDrafts.noteId, noteId)).orderBy(desc(aiDrafts.createdAt)).all();

export function assertTopic(db: Db, topicId: string | null) {
  if (!topicId) return;
  const topic = getTopic(db, topicId);
  if (!topic) throw new DraftError("bad_topic", 400, "errors.validation");
  if (topic.archivedAt || getSpace(db, topic.spaceId)?.archivedAt) throw new DraftError("archived");
}
export function consent(session: DraftSession, value: { settingsRevision: number } | undefined) {
  if (session.locality === "remote" && value?.settingsRevision !== session.revision) throw new DraftError("consent_required", 409, "drafts.consentRequired");
}
const provenance = (session: DraftSession, value: { settingsRevision: number } | undefined) => ({
  providerId: session.providerId, model: session.model, revision: session.revision, promptVersion: PROMPT_VERSION,
  locality: session.locality, consentJson: value ? JSON.stringify(value) : null, consentedAt: value ? now() : null,
});

/** Called both before async reads and again under the write lock. Failed requests replay until explicit retry. */
export function previous(db: Db, input: CreateDraft) {
  const old = db.select().from(aiDrafts).where(eq(aiDrafts.requestId, input.requestId)).get();
  if (!old) return undefined;
  if (old.requestJson !== JSON.stringify(input)) throw new DraftError("payload_conflict");
  if (old.status === "generating") throw new DraftError("busy");
  return old;
}
export function begin(db: Db, input: CreateDraft, source: { text: string; version: { sha256: string } }, session: DraftSession) {
  return db.transaction((tx) => {
    const d = tx as unknown as Db;
    const old = previous(d, input);
    if (old) return { replay: true, draft: old };
    assertTopic(d, input.topicId);
    consent(session, input.consent);
    const ts = now();
    const draft = { id: randomUUID(), ...input, requestJson: JSON.stringify(input), noteText: source.text, noteSha256: source.version.sha256,
      status: "generating" as const, errorCode: null, dropped: 0, ...provenance(session, input.consent), createdAt: ts, updatedAt: ts };
    tx.insert(aiDrafts).values(draft).run();
    return { replay: false, draft: row(d, draft.id) };
  }, IMMEDIATE);
}
export function retry(db: Db, id: string, session: DraftSession, value: { settingsRevision: number } | undefined) {
  return db.transaction((tx) => {
    const d = tx as unknown as Db;
    const old = row(d, id);
    if (old.status !== "failed" && old.status !== "interrupted") throw new DraftError("not_retryable");
    assertTopic(d, old.topicId);
    consent(session, value);
    tx.update(aiDrafts).set({ status: "generating", errorCode: null, dropped: 0, ...provenance(session, value), updatedAt: now() }).where(eq(aiDrafts.id, id)).run();
    return row(d, id);
  }, IMMEDIATE);
}

export const payloadSchema = (kind: "cards" | "quiz") => kind === "cards" ? DraftCardPayload : DraftQuestionPayload;

/** Recompute the whole batch, since an edit/rejection can also change a sibling's duplicate warning. */
export function refreshWarnings(db: Db, id: string) {
  const draft = row(db, id);
  const all = items(db, id);
  const existing = listCards(db, draft.topicId ? { topicId: draft.topicId } : {}).filter((c) => c.topicId === draft.topicId);
  const source = normalize(draft.noteText);
  for (const item of all) {
    const p = payloadSchema(draft.kind).parse(JSON.parse(item.payloadJson));
    const front = normalize("front" in p ? p.front : p.prompt);
    const warnings: ("excerpt_not_found" | "duplicate")[] = [];
    if (!source.includes(normalize(p.excerpt))) warnings.push("excerpt_not_found");
    const duplicate = all.some((other) => {
      if (other.id === item.id || other.status === "rejected") return false;
      const q = payloadSchema(draft.kind).parse(JSON.parse(other.payloadJson));
      return normalize("front" in q ? q.front : q.prompt) === front;
    }) || (draft.kind === "cards" && existing.some((c) => c.draftItemId !== item.id && normalize(c.front) === front));
    if (duplicate) warnings.push("duplicate");
    db.update(aiDraftItems).set({ warningsJson: JSON.stringify(warnings) }).where(eq(aiDraftItems.id, item.id)).run();
  }
}

export function finish(db: Db, id: string, payloads: DraftPayload[], dropped: number, errorCode: string | null) {
  db.transaction((tx) => {
    const d = tx as unknown as Db;
    if (row(d, id).status !== "generating") return;
    // Items and ready state become visible together. Failures never expose partial items.
    if (!errorCode && payloads.length > 0) {
      payloads.forEach((p, position) => tx.insert(aiDraftItems).values({ id: randomUUID(), draftId: id, position, payloadJson: JSON.stringify(p), originalJson: JSON.stringify(p) }).run());
      refreshWarnings(d, id);
    }
    tx.update(aiDrafts).set({ status: errorCode || payloads.length === 0 ? "failed" : "ready", errorCode: errorCode ?? (payloads.length === 0 ? "schema_invalid" : null), dropped, updatedAt: now() }).where(eq(aiDrafts.id, id)).run();
  }, IMMEDIATE);
}
export function recover(db: Db) {
  db.update(aiDrafts).set({ status: "interrupted", errorCode: "interrupted", updatedAt: now() }).where(eq(aiDrafts.status, "generating")).run();
}
export function detail(db: Db, id: string, sourceChanged = false) {
  const r = row(db, id);
  const warnings = sourceChanged ? ["source_changed"] : [];
  return Draft.parse({ ...r, consent: r.consentJson ? JSON.parse(r.consentJson) : null, warnings,
    items: items(db, id).map((i) => ({ ...i, payload: JSON.parse(i.payloadJson), original: JSON.parse(i.originalJson), warnings: [...JSON.parse(i.warningsJson), ...warnings] })),
  });
}
export function edit(db: Db, id: string, itemId: string, input: UpdateDraftItem) {
  return db.transaction((tx) => {
    const d = tx as unknown as Db;
    const draft = row(d, id);
    const item = items(d, id).find((i) => i.id === itemId);
    if (!item) throw notFound();
    if (draft.status !== "ready" || item.status === "committed" || item.version !== input.version) throw new DraftError("version_conflict");
    const parsed = payloadSchema(draft.kind).safeParse(input.payload ?? JSON.parse(item.payloadJson));
    if (!parsed.success) throw new DraftError("validation_failed", 400, "errors.validation");
    tx.update(aiDraftItems).set({ payloadJson: JSON.stringify(parsed.data), status: input.status ?? item.status, version: item.version + 1 }).where(eq(aiDraftItems.id, itemId)).run();
    tx.update(aiDrafts).set({ updatedAt: now() }).where(eq(aiDrafts.id, id)).run();
    refreshWarnings(d, id);
    return detail(d, id).items.find((i) => i.id === itemId)!;
  }, IMMEDIATE);
}

export function commit(db: Db, id: string, input: CommitDraft) {
  return db.transaction((tx) => {
    const d = tx as unknown as Db;
    const draft = row(d, id);
    if (new Set(input.items.map((i) => i.id)).size !== input.items.length) throw new DraftError("duplicate_items", 400, "errors.validation");
    const selectionJson = JSON.stringify({ items: [...input.items].sort((a, b) => a.id.localeCompare(b.id)), destination: input.destination });
    const prior = tx.select().from(aiDraftCommits).where(eq(aiDraftCommits.commitId, input.commitId)).get();
    if (prior) {
      if (prior.draftId !== id || prior.selectionJson !== selectionJson) throw new DraftError("payload_conflict");
      return DraftCommitResult.parse(JSON.parse(prior.resultJson));
    }
    if (draft.status !== "ready") throw new DraftError("not_ready");
    assertTopic(d, draft.topicId);
    const all = items(d, id);
    const selected = input.items.map((ref) => {
      const item = all.find((i) => i.id === ref.id);
      if (!item) throw notFound();
      if (item.status !== "draft" || item.version !== ref.version) throw new DraftError("version_conflict");
      return { item, payload: payloadSchema(draft.kind).parse(JSON.parse(item.payloadJson)) };
    });
    const dest = input.destination;
    if ((draft.kind === "cards") !== (dest.type === "cards")) throw new DraftError("bad_destination", 400, "errors.validation");
    let quizId: string | null = null;
    if (dest.type === "new_quiz") {
      const created = createQuiz(d, { topicId: draft.topicId, title: dest.title });
      if (created.kind !== "created") throw new DraftError(created.kind);
      quizId = created.quiz.id;
    } else if (dest.type === "quiz") {
      const quiz = getQuiz(d, dest.quizId);
      if (!quiz) throw notFound();
      if (quiz.archivedAt || quiz.topicId !== draft.topicId) throw new DraftError("bad_destination");
      quizId = quiz.id;
    }
    const committed = selected.map(({ item, payload }) => {
      let committedRef: string;
      // All service writes use the transaction handle. Every non-success throws through the outer tx.
      if ("front" in payload) {
        const created = createCard(d, { topicId: draft.topicId, noteId: draft.noteId, front: payload.front, back: payload.back, aiOrigin: { draftItemId: item.id } });
        if (created.kind !== "created") throw new DraftError(created.kind);
        committedRef = created.card.id;
      } else {
        const created = addQuestion(d, quizId!, payload);
        if (created.kind !== "created") throw new DraftError(created.kind);
        committedRef = created.question.id;
      }
      tx.update(aiDraftItems).set({ status: "committed", committedRef, version: item.version + 1 }).where(and(eq(aiDraftItems.id, item.id), eq(aiDraftItems.draftId, id))).run();
      return { id: item.id, committedRef };
    });
    const result = DraftCommitResult.parse({ commitId: input.commitId, draftId: id, quizId, items: committed });
    tx.insert(aiDraftCommits).values({ commitId: input.commitId, draftId: id, selectionJson, resultJson: JSON.stringify(result), createdAt: now() }).run();
    tx.update(aiDrafts).set({ updatedAt: now() }).where(eq(aiDrafts.id, id)).run();
    return result;
  }, IMMEDIATE);
}
