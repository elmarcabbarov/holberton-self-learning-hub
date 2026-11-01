import { randomUUID } from "node:crypto";
import { and, asc, count, eq, gte, isNull, lte } from "drizzle-orm";
import { createEmptyCard, fsrs, FSRSVersion, generatorParameters, Rating as FsrsRating, State, type Card as FsrsCard, type Grade } from "ts-fsrs";
import type { UpdateCard } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import { cardReviews, cards, notes, topics } from "../../lib/db/schema.ts";

type CardRow = typeof cards.$inferSelect;

export const SCHEDULER = `ts-fsrs@5.4.2 (FSRS ${FSRSVersion})`;
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }));
const STATE_NAMES = ["new", "learning", "review", "relearning"] as const;

const iso = (d: Date) => d.toISOString();

function toFsrs(row: CardRow): FsrsCard {
  return {
    due: new Date(row.due), stability: row.stability, difficulty: row.difficulty, elapsed_days: 0,
    scheduled_days: row.scheduledDays, learning_steps: row.learningSteps, reps: row.reps, lapses: row.lapses,
    state: row.state as State, ...(row.lastReview ? { last_review: new Date(row.lastReview) } : {}),
  };
}

function fromFsrs(c: FsrsCard): Pick<CardRow, "due" | "stability" | "difficulty" | "scheduledDays" | "learningSteps" | "reps" | "lapses" | "state" | "lastReview"> {
  return {
    due: iso(c.due), stability: c.stability, difficulty: c.difficulty, scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps, reps: c.reps, lapses: c.lapses, state: c.state, lastReview: c.last_review ? iso(c.last_review) : null,
  };
}

export function toApi(row: CardRow) {
  return {
    id: row.id, topicId: row.topicId, noteId: row.noteId, front: row.front, back: row.back,
    origin: row.origin as "manual" | "ai" | "import", suspended: row.suspended, state: STATE_NAMES[row.state] ?? "new",
    due: row.due, reps: row.reps, lapses: row.lapses, createdAt: row.createdAt, archivedAt: row.archivedAt,
  };
}

export function createCard(db: Db, input: { topicId: string | null; noteId: string | null; front: string; back: string }, now = new Date()) {
  if (input.topicId && !db.select().from(topics).where(eq(topics.id, input.topicId)).get()) return { kind: "bad_topic" as const };
  if (input.noteId && !db.select().from(notes).where(eq(notes.id, input.noteId)).get()) return { kind: "bad_note" as const };
  const row: CardRow = {
    id: randomUUID(), topicId: input.topicId, noteId: input.noteId, blockAnchor: null, front: input.front, back: input.back,
    origin: "manual", suspended: false, ...fromFsrs(createEmptyCard(now)), createdAt: iso(now), updatedAt: iso(now), archivedAt: null,
  };
  db.insert(cards).values(row).run();
  return { kind: "created" as const, card: row };
}

export function getCard(db: Db, id: string) {
  return db.select().from(cards).where(eq(cards.id, id)).get();
}

export function listCards(db: Db, filter: { topicId?: string; noteId?: string; spaceId?: string }) {
  const conds = [isNull(cards.archivedAt)];
  if (filter.topicId) conds.push(eq(cards.topicId, filter.topicId));
  if (filter.noteId) conds.push(eq(cards.noteId, filter.noteId));
  if (filter.spaceId) conds.push(eq(topics.spaceId, filter.spaceId));
  return db.select({ card: cards }).from(cards).leftJoin(topics, eq(topics.id, cards.topicId))
    .where(and(...conds)).orderBy(asc(cards.createdAt)).all().map((r) => r.card);
}

export function updateCard(db: Db, id: string, input: UpdateCard, now = new Date()) {
  const row = getCard(db, id);
  if (!row) return undefined;
  if (input.topicId && !db.select().from(topics).where(eq(topics.id, input.topicId)).get()) return null;
  const patch: Partial<CardRow> = { updatedAt: iso(now) };
  if (input.front !== undefined) patch.front = input.front;
  if (input.back !== undefined) patch.back = input.back;
  if (input.topicId !== undefined) patch.topicId = input.topicId;
  if (input.suspended !== undefined) patch.suspended = input.suspended;
  if (input.archived !== undefined) patch.archivedAt = input.archived ? (row.archivedAt ?? iso(now)) : null;
  db.update(cards).set(patch).where(eq(cards.id, id)).run();
  return { ...row, ...patch };
}

/** Seconds until due for each possible rating, from the current state. */
export function previewIntervals(row: CardRow, now = new Date()) {
  const outcomes = scheduler.repeat(toFsrs(row), now);
  const secs = (g: Grade) => Math.max(0, Math.round((outcomes[g].card.due.getTime() - now.getTime()) / 1000));
  return { again: secs(FsrsRating.Again), hard: secs(FsrsRating.Hard), good: secs(FsrsRating.Good), easy: secs(FsrsRating.Easy) };
}

const active = () => and(isNull(cards.archivedAt), eq(cards.suspended, false));

export function reviewQueue(db: Db, opts: { now?: Date; limit?: number; spaceId?: string } = {}) {
  const now = opts.now ?? new Date();
  let rows = db.select({ card: cards, topicName: topics.name, spaceId: topics.spaceId }).from(cards)
    .leftJoin(topics, eq(topics.id, cards.topicId))
    .where(and(active(), lte(cards.due, iso(now)))).orderBy(asc(cards.due)).all();
  if (opts.spaceId) rows = rows.filter((r) => r.spaceId === opts.spaceId);
  return {
    dueTotal: rows.length,
    items: rows.slice(0, opts.limit ?? 50).map((r) => ({ ...toApi(r.card), topicName: r.topicName ?? null, preview: previewIntervals(r.card, now) })),
  };
}

export function reviewSummary(db: Db, now = new Date()) {
  const due = db.select({ n: count() }).from(cards).where(and(active(), lte(cards.due, iso(now)))).get()?.n ?? 0;
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const reviewedToday = db.select({ n: count() }).from(cardReviews).where(gte(cardReviews.reviewedAt, iso(startOfDay))).get()?.n ?? 0;
  return { due, reviewedToday };
}

export type ReviewOutcome = { kind: "reviewed" | "duplicate"; card: CardRow } | { kind: "not_found" } | { kind: "inactive" };

/** Applies one rating. Card state and the review log commit together; a repeated eventId is a no-op (D-056). */
export function reviewCard(db: Db, cardId: string, rating: 1 | 2 | 3 | 4, eventId: string, now = new Date()): ReviewOutcome {
  return db.transaction((tx) => {
    const seen = tx.select().from(cardReviews).where(eq(cardReviews.eventId, eventId)).get();
    const row = tx.select().from(cards).where(eq(cards.id, cardId)).get();
    if (!row) return { kind: "not_found" };
    if (seen) return { kind: "duplicate", card: row };
    if (row.archivedAt || row.suspended) return { kind: "inactive" };
    const before = toFsrs(row);
    const { card: after } = scheduler.next(before, now, rating as Grade);
    const next = fromFsrs(after);
    tx.update(cards).set({ ...next, updatedAt: iso(now) }).where(eq(cards.id, cardId)).run();
    tx.insert(cardReviews).values({
      eventId, cardId, rating, reviewedAt: iso(now), scheduler: SCHEDULER,
      prevState: JSON.stringify(fromFsrs(before)), nextState: JSON.stringify(next),
    }).run();
    return { kind: "reviewed", card: { ...row, ...next } };
  });
}
