import { sql } from "drizzle-orm";
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
  tutorMode: text("tutor_mode", { enum: ["project", "explain"] }),
  /** Vault folder for notes created from this space (HSLH-028); fixed once set, so renaming the space moves nothing. */
  noteFolder: text("note_folder"),
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
  draftItemId: text("draft_item_id"), // AI provenance; core does not depend on the drafts module.
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
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  /** First time the task was checked; kept when it is unchecked and checked again (D-063). */
  doneAt: text("done_at"),
  createdAt: text("created_at").notNull(),
}, (t) => [index("goal_tasks_goal_idx").on(t.goalId, t.position)]);

/** Note ↔ topic links live only in the database; note files are never touched (D-002). */
export const noteTopics = sqliteTable("note_topics", {
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  topicId: text("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
}, (t) => [primaryKey({ columns: [t.noteId, t.topicId] }), index("note_topics_topic_idx").on(t.topicId)]);

/** Notes linked to a space directly, independent of topics (HSLH-028). Database only; files never change (D-002). */
export const noteSpaces = sqliteTable("note_spaces", {
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
}, (t) => [primaryKey({ columns: [t.noteId, t.spaceId] }), index("note_spaces_space_idx").on(t.spaceId)]);

/** Optional study sessions with a skippable three-field reflection (HSLH-027, D-064). */
export const studySessions = sqliteTable("study_sessions", {
  id: text("id").primaryKey(),
  objective: text("objective").notNull().default(""),
  spaceId: text("space_id").references(() => spaces.id, { onDelete: "set null" }),
  taskId: text("task_id").references(() => goalTasks.id, { onDelete: "set null" }),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  learned: text("learned"),
  stuck: text("stuck"),
  next: text("next"),
  reflectedAt: text("reflected_at"),
}, (t) => [index("study_sessions_started_idx").on(t.startedAt)]);

/** AI settings (HSLH-014, D-065): one row, no secrets (the key lives in data/secrets.json, ADR-008). */
export const aiSettings = sqliteTable("ai_settings", {
  id: integer("id").primaryKey(), // always 1
  mode: text("mode").notNull().default("disabled"), // disabled | openai_compatible | anthropic | mock
  baseUrl: text("base_url").notNull().default(""),
  model: text("model").notNull().default(""),
  maxOutputTokens: integer("max_output_tokens").notNull().default(1024),
  revision: integer("revision").notNull().default(0),
  /** Endpoint the stored key belongs to (`mode|baseUrl`); a different endpoint never receives it. */
  keyBinding: text("key_binding"),
  probesJson: text("probes_json"),
  probedRevision: integer("probed_revision"),
  probedAt: text("probed_at"),
});

/** Voluntary app-wide AI pause, independent of provider settings (D-066). */
export const examMode = sqliteTable("exam_mode", {
  id: integer("id").primaryKey(), // always 1
  until: text("exam_until"),
});

export const tutorThreads = sqliteTable("tutor_threads", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "restrict" }),
  topicId: text("topic_id").references(() => topics.id, { onDelete: "restrict" }),
  frameworkJson: text("framework_json").notNull(),
  hintLevel: integer("hint_level").notNull().default(0),
  approachStep: integer("approach_step").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
}, (t) => [index("tutor_threads_space_topic_idx").on(t.spaceId, t.topicId)]);

export const tutorMessages = sqliteTable("tutor_messages", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  id: text("id").notNull().unique(),
  threadId: text("thread_id").notNull().references(() => tutorThreads.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  requestId: text("request_id"), // only user rows; assistant links through reply_to
  replyTo: text("reply_to").unique(),
  payloadJson: text("payload_json"), // canonical validated request, for idempotency
  kind: text("kind", { enum: ["chat", "hint", "explain", "approach"] }).notNull(),
  lang: text("lang", { enum: ["en", "az"] }).notNull(),
  content: text("content").notNull().default(""),
  status: text("status", { enum: ["streaming", "complete", "error", "interrupted", "cancelled"] }).notNull(),
  errorCode: text("error_code"),
  mode: text("mode", { enum: ["project", "explain"] }),
  hintLevel: integer("hint_level"),
  approachStep: integer("approach_step"),
  providerId: text("provider_id"),
  model: text("model"),
  revision: integer("revision"),
  promptVersion: text("prompt_version"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  uniqueIndex("tutor_messages_request_unique").on(t.threadId, t.requestId).where(sql`${t.role} = 'user'`),
  uniqueIndex("tutor_messages_streaming_unique").on(t.threadId).where(sql`${t.role} = 'assistant' AND ${t.status} = 'streaming'`),
  index("tutor_messages_thread_seq_idx").on(t.threadId, t.seq),
]);

/** Frozen note → reviewable drafts. No provider call happens before the identity is durable (D-067). */
export const aiDrafts = sqliteTable("ai_drafts", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  requestJson: text("request_json").notNull(),
  noteId: text("note_id").notNull().references(() => notes.id),
  topicId: text("topic_id").references(() => topics.id),
  kind: text("kind", { enum: ["cards", "quiz"] }).notNull(),
  lang: text("lang", { enum: ["en", "az"] }).notNull(),
  noteText: text("note_text").notNull(),
  noteSha256: text("note_sha256").notNull(),
  status: text("status", { enum: ["generating", "ready", "failed", "interrupted"] }).notNull(),
  errorCode: text("error_code"),
  dropped: integer("dropped").notNull().default(0),
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  revision: integer("revision").notNull(),
  promptVersion: text("prompt_version").notNull(),
  locality: text("locality", { enum: ["local", "remote"] }).notNull(),
  consentJson: text("consent_json"), // revision only; no note content in consent metadata
  consentedAt: text("consented_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("ai_drafts_note_idx").on(t.noteId, t.createdAt)]);

export const aiDraftItems = sqliteTable("ai_draft_items", {
  id: text("id").primaryKey(),
  draftId: text("draft_id").notNull().references(() => aiDrafts.id),
  position: integer("position").notNull(),
  payloadJson: text("payload_json").notNull(),
  originalJson: text("original_json").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status", { enum: ["draft", "rejected", "committed"] }).notNull().default("draft"),
  committedRef: text("committed_ref"),
  warningsJson: text("warnings_json").notNull().default("[]"),
}, (t) => [index("ai_draft_items_draft_idx").on(t.draftId, t.position)]);

export const aiDraftCommits = sqliteTable("ai_draft_commits", {
  commitId: text("commit_id").primaryKey(),
  draftId: text("draft_id").notNull().references(() => aiDrafts.id),
  selectionJson: text("selection_json").notNull(), // canonical selection + versions + destination
  resultJson: text("result_json").notNull(),
  createdAt: text("created_at").notNull(),
});
