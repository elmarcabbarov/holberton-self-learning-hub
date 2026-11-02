import { z } from "zod";

/** Limits for importing Markdown into the Hub vault (D-061). */
export const IMPORT_LIMITS = {
  uploadBytes: 100 * 1024 * 1024,
  entries: 20_000,
  fileBytes: 2 * 1024 * 1024,
  totalBytes: 500 * 1024 * 1024,
  previewTtlMs: 60 * 60 * 1000,
  pending: 3,
} as const;

/** Why an entry is not imported. */
export const ImportSkipReason = z.enum([
  "not_markdown", // attachments and other files: out of scope in v1
  "hidden", // dot folders, .obsidian, __MACOSX …
  "invalid_path", // the destination is not a valid vault path
  "too_large", // over 2 MB
  "symlink",
  "special_file",
  "encrypted",
  "unsupported", // compression method the reader does not support
  "collision_in_source", // two entries map to the same path (case/NFC) or a file sits where a folder is
  "exists", // the vault already has a note (or folder) at that path
  "missing_note", // a missing note row owns the path; importing would inherit its cards and history
]);
export type ImportSkipReason = z.infer<typeof ImportSkipReason>;

export const ImportOutcome = z.enum(["created", "exists", "failed"]);
export type ImportOutcome = z.infer<typeof ImportOutcome>;

export const ImportEntry = z.object({
  source: z.string(),
  dest: z.string().nullable(),
  size: z.number().int().nonnegative(),
  action: z.enum(["import", "skip"]),
  reason: ImportSkipReason.nullable(),
  /** Set when the file is not valid UTF-8 or mixes line endings: it is imported read-only (D-053). */
  readOnlyReason: z.enum(["invalid_utf8", "mixed_eol"]).nullable(),
  /** Set during commit. */
  outcome: ImportOutcome.nullable(),
});
export type ImportEntry = z.infer<typeof ImportEntry>;

export const ImportState = z.enum(["preview", "committing", "interrupted", "done", "expired"]);
export type ImportState = z.infer<typeof ImportState>;

export const VaultImport = z.object({
  id: z.string().uuid(),
  source: z.enum(["zip", "folder"]),
  sourceName: z.string(),
  prefix: z.string(),
  state: ImportState,
  createdAt: z.string(),
  expiresAt: z.string(),
  finishedAt: z.string().nullable(),
  counts: z.object({ import: z.number().int(), skip: z.number().int(), created: z.number().int(), exists: z.number().int(), failed: z.number().int() }),
  entries: z.array(ImportEntry),
});
export type VaultImport = z.infer<typeof VaultImport>;

/** Folder path inside the vault the files go under, e.g. `Imported/My vault`. */
export const ImportPrefix = z.string().trim().min(1).max(200);

export const FolderImportRequest = z.object({ folder: z.string().min(1).max(255), prefix: ImportPrefix.optional() });
export type FolderImportRequest = z.infer<typeof FolderImportRequest>;

export const ZipImportQuery = z.object({ name: z.string().max(255).optional(), prefix: ImportPrefix.optional() });

export const ImportSources = z.object({
  /** False when HUB_IMPORT_DIR is not set: only zip uploads are possible. */
  folderImport: z.boolean(),
  folders: z.array(z.string()),
});
export type ImportSources = z.infer<typeof ImportSources>;

export const VaultImportList = z.object({ imports: z.array(VaultImport) });
export type VaultImportList = z.infer<typeof VaultImportList>;
