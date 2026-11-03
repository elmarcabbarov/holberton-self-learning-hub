import { z } from "zod";
import { AIErrorCode } from "./ai.ts";
import { TutorMode } from "./spaces.ts";

const Id = z.string().uuid();
export const TutorKind = z.enum(["chat", "hint", "explain", "approach"]);
export const TutorFramework = z.object({
  read: z.string().max(2000).optional(),
  error: z.string().max(2000).optional(),
  rephrase: z.string().max(2000).optional(),
  skipped: z.boolean(),
});
export const CreateTutorThread = z.object({ spaceId: Id, topicId: Id.optional(), framework: TutorFramework });
export type CreateTutorThread = z.infer<typeof CreateTutorThread>;
export const ListTutorThreads = z.object({ spaceId: Id, topicId: Id.optional(), archived: z.literal("1").optional() });
export const ArchiveTutorThread = z.object({ archived: z.boolean() });
export const TutorThread = z.object({
  id: Id, spaceId: Id, topicId: Id.nullable(), framework: TutorFramework,
  hintLevel: z.number().int().min(0).max(4), approachStep: z.number().int().min(0).max(5),
  createdAt: z.string(), updatedAt: z.string(), archivedAt: z.string().nullable(),
});
export type TutorThread = z.infer<typeof TutorThread>;
export const TutorThreadList = z.object({ threads: z.array(TutorThread) });
export const SendTutorMessage = z.object({
  requestId: Id, kind: TutorKind, content: z.string().min(1).max(8000), lang: z.enum(["en", "az"]),
});
export type SendTutorMessage = z.infer<typeof SendTutorMessage>;
export const TutorFailureCode = AIErrorCode.or(z.enum(["exam_mode", "interrupted"]));
export const TutorMessage = z.object({
  id: Id, threadId: Id, role: z.enum(["user", "assistant"]), requestId: Id.nullable(), replyTo: Id.nullable(),
  kind: TutorKind, lang: z.enum(["en", "az"]), content: z.string(),
  status: z.enum(["streaming", "complete", "error", "interrupted", "cancelled"]), errorCode: TutorFailureCode.nullable(),
  mode: TutorMode.nullable(), hintLevel: z.number().int().min(1).max(4).nullable(), approachStep: z.number().int().min(1).max(5).nullable(),
  providerId: z.string().nullable(), model: z.string().nullable(), revision: z.number().int().nullable(), promptVersion: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});
export type TutorMessage = z.infer<typeof TutorMessage>;
export const TutorThreadDetail = TutorThread.extend({ messages: z.array(TutorMessage) });
export const TutorEvent = z.discriminatedUnion("event", [
  z.object({ event: z.literal("start"), data: z.object({ messageId: Id, hintLevel: z.number().int().min(1).max(4).optional(), approachStep: z.number().int().min(1).max(5).optional(), mode: TutorMode }) }),
  z.object({ event: z.literal("delta"), data: z.object({ text: z.string() }) }),
  z.object({ event: z.literal("done"), data: z.object({ messageId: Id }) }),
  z.object({ event: z.literal("error"), data: z.object({ code: TutorFailureCode }) }),
]);
export type TutorEvent = z.infer<typeof TutorEvent>;
/** Early exit is allowed: this is voluntary self-control, separate from quiz attempts. */
export const ExamMode = z.object({ until: z.iso.datetime({ offset: true }).nullable() });
/** POST body: the learner's own text stays out of URLs and request logs. */
export const PeerDraftRequest = z.object({ tried: z.string().trim().min(1).max(4000), lang: z.enum(["en", "az"]).default("en") });
export const PeerDraft = z.object({ text: z.string() });
