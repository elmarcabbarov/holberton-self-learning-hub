import { z } from "zod";
import { QuestionDraft } from "./quizzes.ts";
import { AIErrorCode } from "./ai.ts";

const Id = z.string().uuid();
const Version = z.number().int().positive();
export const MAX_DRAFT_NOTE_CHARS = 24_000;
export const DraftKind = z.enum(["cards", "quiz"]);
export const DraftConsent = z.object({ settingsRevision: z.number().int().nonnegative() });
export const CreateDraft = z.object({
  requestId: Id, noteId: Id, topicId: Id.nullable().default(null), kind: DraftKind,
  lang: z.enum(["en", "az"]), consent: DraftConsent.optional(),
});
export type CreateDraft = z.infer<typeof CreateDraft>;
export const RetryDraft = z.object({ consent: DraftConsent.optional() });
const Excerpt = z.string().trim().min(1).max(500);
export const DraftCardPayload = z.object({ front: z.string().trim().min(3).max(500), back: z.string().trim().min(1).max(1500), excerpt: Excerpt });
// safeExtend retains all QuestionDraft refinements for generation, edits, and commit.
export const DraftQuestionPayload = QuestionDraft.safeExtend({ excerpt: Excerpt });
export const DraftPayload = z.union([DraftCardPayload, DraftQuestionPayload]);
export type DraftPayload = z.infer<typeof DraftPayload>;
export const DraftWarning = z.enum(["excerpt_not_found", "duplicate", "source_changed"]);
export const DraftItem = z.object({
  id: Id, draftId: Id, payload: DraftPayload, original: DraftPayload, version: Version,
  status: z.enum(["draft", "rejected", "committed"]), committedRef: Id.nullable(), warnings: z.array(DraftWarning).max(3),
});
export const Draft = z.object({
  id: Id, requestId: Id, noteId: Id, topicId: Id.nullable(), kind: DraftKind, lang: z.enum(["en", "az"]),
  status: z.enum(["generating", "ready", "failed", "interrupted"]),
  errorCode: AIErrorCode.or(z.enum(["exam_mode", "interrupted"])).nullable(), dropped: z.number().int().nonnegative(),
  noteSha256: z.string().length(64), providerId: z.string().max(200), model: z.string().max(500), revision: z.number().int(),
  promptVersion: z.string().max(50), locality: z.enum(["local", "remote"]),
  consent: DraftConsent.nullable(), consentedAt: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(), warnings: z.array(DraftWarning).max(3), items: z.array(DraftItem).max(20),
});
export type Draft = z.infer<typeof Draft>;
export const DraftList = z.object({ drafts: z.array(Draft) });
export const ListDrafts = z.object({ noteId: Id });
export const DraftItemParams = z.object({ id: Id, itemId: Id });
export const UpdateDraftItem = z.object({
  version: Version, payload: DraftPayload.optional(), status: z.enum(["draft", "rejected"]).optional(),
}).refine((v) => v.payload !== undefined || v.status !== undefined, "empty update");
export type UpdateDraftItem = z.infer<typeof UpdateDraftItem>;
export const DraftDestination = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cards") }),
  z.object({ type: z.literal("new_quiz"), title: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("quiz"), quizId: Id }),
]);
export const CommitDraft = z.object({ commitId: Id, items: z.array(z.object({ id: Id, version: Version })).min(1).max(20), destination: DraftDestination });
export type CommitDraft = z.infer<typeof CommitDraft>;
export const DraftCommitResult = z.object({
  commitId: Id, draftId: Id, quizId: Id.nullable(), items: z.array(z.object({ id: Id, committedRef: Id })).min(1).max(20),
});
