import { randomUUID } from "node:crypto";
import { and, asc, count, eq, isNotNull, isNull, max } from "drizzle-orm";
import { MAX_TOPIC_POSITION, type CreateSpace, type CreateTopic, type UpdateSpace, type UpdateTopic } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import { spaces, topics } from "../../lib/db/schema.ts";

type SpaceRow = typeof spaces.$inferSelect;
type TopicRow = typeof topics.$inferSelect;

const now = () => new Date().toISOString();

export const getTopic = (db: Db, id: string) => db.select().from(topics).where(eq(topics.id, id)).get();

function topicCount(db: Db, spaceId: string): number {
  return db.select({ n: count() }).from(topics)
    .where(and(eq(topics.spaceId, spaceId), isNull(topics.archivedAt))).get()?.n ?? 0;
}

const toSpace = (db: Db, row: SpaceRow) => ({ ...row, topicCount: topicCount(db, row.id) });

export function listSpaces(db: Db, archived = false) {
  const rows = db.select().from(spaces)
    .where(archived ? isNotNull(spaces.archivedAt) : isNull(spaces.archivedAt))
    .orderBy(asc(spaces.createdAt)).all();
  return rows.map((r) => toSpace(db, r));
}

export function getSpace(db: Db, id: string) {
  const row = db.select().from(spaces).where(eq(spaces.id, id)).get();
  if (!row) return undefined;
  const topicRows = db.select().from(topics)
    .where(and(eq(topics.spaceId, id), isNull(topics.archivedAt)))
    .orderBy(asc(topics.position), asc(topics.createdAt)).all();
  const archivedTopics = db.select().from(topics)
    .where(and(eq(topics.spaceId, id), isNotNull(topics.archivedAt)))
    .orderBy(asc(topics.position), asc(topics.createdAt)).all();
  return { ...toSpace(db, row), topics: topicRows, archivedTopics };
}

export function createSpace(db: Db, input: CreateSpace) {
  const ts = now();
  const row: SpaceRow = { id: randomUUID(), name: input.name, description: input.description, createdAt: ts, updatedAt: ts, archivedAt: null, tutorMode: "explain", noteFolder: null };
  db.insert(spaces).values(row).run();
  return toSpace(db, row);
}

export function updateSpace(db: Db, id: string, input: UpdateSpace) {
  const existing = db.select().from(spaces).where(eq(spaces.id, id)).get();
  if (!existing) return undefined;
  const patch: Partial<SpaceRow> = { updatedAt: now() };
  if (input.tutorMode !== undefined) patch.tutorMode = input.tutorMode;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.archived !== undefined) patch.archivedAt = input.archived ? (existing.archivedAt ?? now()) : null;
  db.update(spaces).set(patch).where(eq(spaces.id, id)).run();
  return toSpace(db, { ...existing, ...patch });
}

export function createTopic(db: Db, spaceId: string, input: CreateTopic): TopicRow | undefined {
  return db.transaction((tx) => {
    const space = tx.select().from(spaces).where(eq(spaces.id, spaceId)).get();
    if (!space || space.archivedAt) return undefined;
    let last = tx.select({ p: max(topics.position) }).from(topics).where(eq(topics.spaceId, spaceId)).get()?.p;
    if (last !== null && last !== undefined && last >= MAX_TOPIC_POSITION) {
      // Compact positions to 0..n-1 (keeping order) before appending.
      const ordered = tx.select({ id: topics.id }).from(topics).where(eq(topics.spaceId, spaceId))
        .orderBy(asc(topics.position), asc(topics.createdAt)).all();
      ordered.forEach((r, i) => tx.update(topics).set({ position: i }).where(eq(topics.id, r.id)).run());
      last = ordered.length - 1;
    }
    const ts = now();
    const row: TopicRow = { id: randomUUID(), spaceId, name: input.name, position: last === null || last === undefined ? 0 : last + 1, createdAt: ts, updatedAt: ts, archivedAt: null };
    tx.insert(topics).values(row).run();
    return row;
  }, { behavior: "immediate" });
}

export function updateTopic(db: Db, id: string, input: UpdateTopic): TopicRow | undefined {
  const existing = db.select().from(topics).where(eq(topics.id, id)).get();
  if (!existing) return undefined;
  const patch: Partial<TopicRow> = { updatedAt: now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.position !== undefined) patch.position = input.position;
  if (input.archived !== undefined) patch.archivedAt = input.archived ? (existing.archivedAt ?? now()) : null;
  db.update(topics).set(patch).where(eq(topics.id, id)).run();
  return { ...existing, ...patch };
}
