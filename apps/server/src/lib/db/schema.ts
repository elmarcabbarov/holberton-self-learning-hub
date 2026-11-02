import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  /** Which vault the file lives in: `hub` (writable) or `linked` (read-only, D-062). Ids stay globally unique. */
  vault: text("vault").notNull().default("hub"),
  path: text("path").notNull(),
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
}, (t) => [
  uniqueIndex("notes_vault_path_unique").on(t.vault, t.path),
  index("notes_fold_key_idx").on(t.foldKey),
  index("notes_sha_idx").on(t.contentSha256),
  index("notes_vault_fold_key_idx").on(t.vault, t.foldKey),
]);

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

/** Manual quizzes (HSLH-009). A topic can be removed; the quiz then becomes "Unassigned". */
export const quizzes = sqliteTable("quizzes", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
}, (t) => [index("quizzes_topic_idx").on(t.topicId)]);

/** Editable question bank. Attempts never read it after they start: they keep a snapshot (D-032). */
export const quizQuestions = sqliteTable("quiz_questions", {
  id: text("id").primaryKey(),
  quizId: text("quiz_id").notNull().references(() => quizzes.id),
  position: integer("position").notNull(),
  type: text("type").notNull(), // mcq | multi | short_self
  prompt: text("prompt").notNull(),
  optionsJson: text("options_json").notNull(), // string[] (empty for short_self)
  answerJson: text("answer_json").notNull(), // { correct: number[] } | { reference: string }
  explanation: text("explanation").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
}, (t) => [index("quiz_questions_quiz_idx").on(t.quizId, t.position)]);

/** One run through a quiz. `questions_json` is the immutable snapshot taken at start (D-032). */
export const quizAttempts = sqliteTable("quiz_attempts", {
  id: text("id").primaryKey(),
  quizId: text("quiz_id").notNull(),
  mode: text("mode").notNull(), // practice | exam
  confidencePre: integer("confidence_pre"), // 1..5, null = skipped (D-005: a signal only)
  questionsJson: text("questions_json").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
}, (t) => [index("quiz_attempts_quiz_idx").on(t.quizId, t.startedAt)]);

/** Answers inside an attempt; `question_id` refers to the snapshot, not the live bank. */
export const quizAnswers = sqliteTable("quiz_answers", {
  attemptId: text("attempt_id").notNull().references(() => quizAttempts.id),
  questionId: text("question_id").notNull(),
  responseJson: text("response_json").notNull(),
  answeredAt: text("answered_at").notNull(),
  correct: integer("correct", { mode: "boolean" }), // null = short answer not graded yet
  gradedAt: text("graded_at"),
}, (t) => [primaryKey({ columns: [t.attemptId, t.questionId] })]);

/**
 * Import of Markdown files into the Hub vault (D-061). `entries_json` is the frozen preview;
 * each entry gains its outcome during commit, so an interrupted commit can be resumed.
 */
export const vaultImports = sqliteTable("vault_imports", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // zip | folder
  sourceName: text("source_name").notNull(),
  prefix: text("prefix").notNull(),
  state: text("state").notNull(), // preview | committing | interrupted | done | expired
  entriesJson: text("entries_json").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  finishedAt: text("finished_at"),
});

/** Goals of a space (HSLH-007, D-063). Progress is "tasks completed", never mastery. */
export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  criteria: text("criteria").notNull().default(""), // what "done" means, in the learner's words
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
}, (t) => [index("goals_space_idx").on(t.spaceId, t.createdAt)]);

export const goalTasks = sqliteTable("goal_tasks", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  position: integer("position").notNull(),
  doneAt: text("done_at"),
  createdAt: text("created_at").notNull(),
}, (t) => [index("goal_tasks_goal_idx").on(t.goalId, t.position)]);

/** Note ↔ topic links live only in the database; note files are never touched (D-002). */
export const noteTopics = sqliteTable("note_topics", {
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  topicId: text("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
}, (t) => [primaryKey({ columns: [t.noteId, t.topicId] }), index("note_topics_topic_idx").on(t.topicId)]);
