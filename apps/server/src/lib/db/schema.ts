import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const noteLinks = sqliteTable("note_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromNoteId: text("from_note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // wiki | embed | md
  target: text("target").notNull(),
  anchor: text("anchor"),
  targetNoteId: text("target_note_id"),
  state: text("state").notNull(), // resolved | unresolved | ambiguous | self
}, (t) => [index("note_links_from_idx").on(t.fromNoteId), index("note_links_target_idx").on(t.targetNoteId)]);

export const noteTags = sqliteTable("note_tags", {
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
}, (t) => [index("note_tags_note_idx").on(t.noteId), index("note_tags_tag_idx").on(t.tag)]);

export const noteAliases = sqliteTable("note_aliases", {
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  aliasKey: text("alias_key").notNull(),
}, (t) => [index("note_aliases_key_idx").on(t.aliasKey)]);

/** Stable integer rowids for the FTS table (D-033). */
export const notesFtsMap = sqliteTable("notes_fts_map", {
  rowid: integer("rowid").primaryKey({ autoIncrement: true }),
  noteId: text("note_id").notNull().unique().references(() => notes.id, { onDelete: "cascade" }),
});

/** Flashcards with FSRS scheduling state (D-055). */
export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
  noteId: text("note_id").references(() => notes.id, { onDelete: "set null" }),
  blockAnchor: text("block_anchor"),
  front: text("front").notNull(),
  back: text("back").notNull(),
  origin: text("origin").notNull(), // manual | ai | import
  suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
  due: text("due").notNull(),
  stability: real("stability").notNull(),
  difficulty: real("difficulty").notNull(),
  scheduledDays: integer("scheduled_days").notNull(),
  learningSteps: integer("learning_steps").notNull(),
  reps: integer("reps").notNull(),
  lapses: integer("lapses").notNull(),
  state: integer("state").notNull(), // ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning
  lastReview: text("last_review"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
}, (t) => [index("cards_due_idx").on(t.due), index("cards_topic_idx").on(t.topicId)]);

/** Append-only review log (D-032, D-056): never rewritten, never cascaded away. */
export const cardReviews = sqliteTable("card_reviews", {
  eventId: text("event_id").primaryKey(),
  cardId: text("card_id").notNull(),
  rating: integer("rating").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
  scheduler: text("scheduler").notNull(),
  prevState: text("prev_state").notNull(), // JSON snapshot of the card's FSRS state before
  nextState: text("next_state").notNull(), // JSON snapshot after
}, (t) => [index("card_reviews_card_idx").on(t.cardId, t.reviewedAt)]);
