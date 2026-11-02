import { z } from "zod";

export const NoteVersion = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/), size: z.number().int().nonnegative(), mtimeMs: z.number().int() });
export type NoteVersion = z.infer<typeof NoteVersion>;

/** `hub` = the Hub's own writable vault; `linked` = an existing vault mounted read-only (D-062). */
export const VaultName = z.enum(["hub", "linked"]);
export type VaultName = z.infer<typeof VaultName>;

export const NoteSummary = z.object({
  id: z.string().uuid(),
  vault: VaultName,
  path: z.string(),
  title: z.string(),
  missing: z.boolean(),
  readOnlyReason: z.enum(["invalid_utf8", "mixed_eol", "linked"]).nullable(),
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

const Reconcile = z.object({ added: z.number(), updated: z.number(), renamed: z.number(), missing: z.number(), error: z.string().nullable() });
export const VaultState = z.enum(["ready", "unavailable", "replaced", "empty_unconfirmed"]);
export type VaultState = z.infer<typeof VaultState>;

export const VaultStatus = z.object({
  lastReconcile: Reconcile.nullable(),
  collisions: z.array(z.array(z.string())),
  /** Null when no linked vault is configured (HUB_LINKED_VAULT). */
  linked: z.object({ state: VaultState, notes: z.number().int(), lastReconcile: Reconcile.nullable(), collisions: z.array(z.array(z.string())) }).nullable(),
});
export type VaultStatus = z.infer<typeof VaultStatus>;

export const SearchHit = z.object({ id: z.string().uuid(), vault: VaultName, path: z.string(), title: z.string(), snippet: z.string() });
export const SearchResults = z.object({ hits: z.array(SearchHit) });
export type SearchResults = z.infer<typeof SearchResults>;

export const Backlink = z.object({ id: z.string().uuid(), vault: VaultName, path: z.string(), title: z.string(), kind: z.enum(["wiki", "embed", "md", "md-embed"]), anchor: z.string().nullable() });
export const Backlinks = z.object({ links: z.array(Backlink) });
export type Backlinks = z.infer<typeof Backlinks>;

export const OutgoingLink = z.object({
  kind: z.enum(["wiki", "embed", "md", "md-embed"]),
  target: z.string(),
  anchor: z.string().nullable(),
  state: z.enum(["resolved", "unresolved", "ambiguous", "self", "file"]),
  targetId: z.string().uuid().nullable(),
});
export const NoteMeta = z.object({ tags: z.array(z.string()), aliases: z.array(z.string()), links: z.array(OutgoingLink) });
export type NoteMeta = z.infer<typeof NoteMeta>;

/** Response of create/save: the version of the bytes THIS request wrote (never a later read). */
export const SavedNote = NoteSummary.extend({ version: NoteVersion });
export type SavedNote = z.infer<typeof SavedNote>;
