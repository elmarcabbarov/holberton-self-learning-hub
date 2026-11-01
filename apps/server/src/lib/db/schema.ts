import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Instance-level key/value facts (instance id, creation time, schema notes). */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** One-time bootstrap tokens; only the SHA-256 of the token is stored (D-044). */
export const bootstrapTokens = sqliteTable("bootstrap_tokens", {
  hash: text("hash").primaryKey(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

/** Browser sessions; only the SHA-256 of the cookie value is stored (D-045). */
export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  absoluteExpiresAt: text("absolute_expires_at").notNull(),
});

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
});

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
}, (t) => [index("topics_space_position_idx").on(t.spaceId, t.position)]);

/** Index of Markdown notes. Content lives in files (ADR-002); this is derived metadata. */
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
  foldKey: text("fold_key").notNull(),
  title: text("title").notNull(),
  contentSha256: text("content_sha256").notNull(),
  size: integer("size").notNull(),
  mtimeMs: integer("mtime_ms").notNull(),
  eol: text("eol").notNull(),
  bom: integer("bom", { mode: "boolean" }).notNull(),
  readOnlyReason: text("read_only_reason"),
  missingSince: text("missing_since"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("notes_fold_key_idx").on(t.foldKey), index("notes_sha_idx").on(t.contentSha256)]);

/** File-operation journal (D-035, D-050): intent is durable before the filesystem changes. */
export const fileOps = sqliteTable("file_ops", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // create | replace
  noteId: text("note_id").notNull(),
  path: text("path").notNull(),
  tempPath: text("temp_path"),
  beforeSha256: text("before_sha256"),
  afterSha256: text("after_sha256").notNull(),
  state: text("state").notNull(), // intent | done | conflict
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
