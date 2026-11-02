import { z } from "zod";

const Id = z.string().uuid();
const Reflection = z.string().trim().max(2000);

export const StudySession = z.object({
  id: Id,
  objective: z.string(),
  spaceId: Id.nullable(),
  spaceName: z.string().nullable(),
  taskId: Id.nullable(),
  taskText: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  /** Each field may stay empty: the reflection is optional (D-064). */
  learned: z.string().nullable(),
  stuck: z.string().nullable(),
  next: z.string().nullable(),
  reflectedAt: z.string().nullable(),
});
export type StudySession = z.infer<typeof StudySession>;

export const SessionList = z.object({ sessions: z.array(StudySession) });
export type SessionList = z.infer<typeof SessionList>;
/** The open session, if any, and the most recent finished one (for "last time you planned to…"). */
export const SessionOverview = z.object({ current: StudySession.nullable(), last: StudySession.nullable() });
export type SessionOverview = z.infer<typeof SessionOverview>;

export const StartSession = z.object({ objective: z.string().trim().max(300).default(""), spaceId: Id.nullable().default(null), taskId: Id.nullable().default(null) });
export type StartSession = z.infer<typeof StartSession>;
export const SaveReflection = z.object({ learned: Reflection.default(""), stuck: Reflection.default(""), next: Reflection.default("") });
export type SaveReflection = z.infer<typeof SaveReflection>;
