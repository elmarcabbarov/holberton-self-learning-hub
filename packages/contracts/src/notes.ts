import { z } from "zod";

export const NoteVersion = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/), size: z.number().int().nonnegative(), mtimeMs: z.number().int() });
export type NoteVersion = z.infer<typeof NoteVersion>;

export const NoteSummary = z.object({
  id: z.string().uuid(),
  path: z.string(),
  title: z.string(),
  missing: z.boolean(),
  readOnlyReason: z.enum(["invalid_utf8", "mixed_eol"]).nullable(),
  updatedAt: z.string(),
});
export type NoteSummary = z.infer<typeof NoteSummary>;

export const NoteList = z.object({ notes: z.array(NoteSummary), nextCursor: z.string().nullable() });
export type NoteList = z.infer<typeof NoteList>;

export const NoteDetail = NoteSummary.extend({ content: z.string(), version: NoteVersion, eol: z.enum(["lf", "crlf", "none", "mixed"]), bom: z.boolean() });
export type NoteDetail = z.infer<typeof NoteDetail>;

/** Editor text uses LF; the server restores the file's original line endings and BOM. */
export const CreateNote = z.object({ path: z.string().min(1).max(512), content: z.string().max(2_000_000) });
export type CreateNote = z.infer<typeof CreateNote>;

export const SaveNote = z.object({ content: z.string().max(2_000_000), expectedSha256: z.string().regex(/^[0-9a-f]{64}$/) });
export type SaveNote = z.infer<typeof SaveNote>;

export const NoteConflict = z.object({ error: z.object({ code: z.literal("conflict"), messageKey: z.string(), details: z.object({ current: NoteVersion }) }) });
export type NoteConflict = z.infer<typeof NoteConflict>;

export const VaultStatus = z.object({
  lastReconcile: z.object({ added: z.number(), updated: z.number(), renamed: z.number(), missing: z.number(), error: z.string().nullable() }).nullable(),
  collisions: z.array(z.array(z.string())),
});
export type VaultStatus = z.infer<typeof VaultStatus>;
