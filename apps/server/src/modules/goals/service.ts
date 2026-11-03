import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, isNotNull, isNull, max } from "drizzle-orm";
import { GOAL_LIMITS, type CreateGoal, type Goal, type UpdateGoal, type UpdateTask } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import { goals, goalTasks, notes, noteSpaces, noteTopics, spaces, topics } from "../../lib/db/schema.ts";

type GoalRow = typeof goals.$inferSelect;
const IMMEDIATE = { behavior: "immediate" } as const;
const now = () => new Date().toISOString();

function toApi(db: Db, row: GoalRow): Goal {
  const tasks = db.select().from(goalTasks).where(eq(goalTasks.goalId, row.id)).orderBy(asc(goalTasks.position), asc(goalTasks.createdAt)).all()
    .map((t) => ({ id: t.id, text: t.text, done: t.done, doneAt: t.doneAt }));
  return { ...row, tasks, progress: { done: tasks.filter((t) => t.done).length, total: tasks.length } };
}

export function listGoals(db: Db, spaceId: string, archived: boolean): Goal[] | undefined {
  if (!db.select().from(spaces).where(eq(spaces.id, spaceId)).get()) return undefined;
  return db.select().from(goals)
    .where(and(eq(goals.spaceId, spaceId), archived ? isNotNull(goals.archivedAt) : isNull(goals.archivedAt)))
    .orderBy(asc(goals.createdAt)).all().map((r) => toApi(db, r));
}

export function getGoal(db: Db, id: string): Goal | undefined {
  const row = db.select().from(goals).where(eq(goals.id, id)).get();
  return row ? toApi(db, row) : undefined;
}

export function createGoal(db: Db, spaceId: string, input: CreateGoal) {
  return db.transaction((tx) => {
    const space = tx.select().from(spaces).where(eq(spaces.id, spaceId)).get();
    if (!space) return { kind: "not_found" as const };
    if (space.archivedAt) return { kind: "archived" as const };
    const n = tx.select({ n: count() }).from(goals).where(eq(goals.spaceId, spaceId)).get()?.n ?? 0;
    if (n >= GOAL_LIMITS.goalsPerSpace) return { kind: "too_many" as const };
    const ts = now();
    const row: GoalRow = { id: randomUUID(), spaceId, title: input.title, criteria: input.criteria, createdAt: ts, updatedAt: ts, archivedAt: null };
    tx.insert(goals).values(row).run();
    return { kind: "created" as const, goal: toApi(tx as unknown as Db, row) };
  }, IMMEDIATE);
}

export function updateGoal(db: Db, id: string, input: UpdateGoal): Goal | undefined {
  return db.transaction((tx) => {
    const row = tx.select().from(goals).where(eq(goals.id, id)).get();
    if (!row) return undefined;
    const ts = now();
    tx.update(goals).set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.criteria !== undefined ? { criteria: input.criteria } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? (row.archivedAt ?? ts) : null } : {}),
      updatedAt: ts,
    }).where(eq(goals.id, id)).run();
    return toApi(tx as unknown as Db, tx.select().from(goals).where(eq(goals.id, id)).get()!);
  }, IMMEDIATE);
}

export function addTask(db: Db, goalId: string, text: string) {
  return db.transaction((tx) => {
    const goal = tx.select().from(goals).where(eq(goals.id, goalId)).get();
    if (!goal) return { kind: "not_found" as const };
    if (goal.archivedAt) return { kind: "archived" as const };
    const n = tx.select({ n: count(), top: max(goalTasks.position) }).from(goalTasks).where(eq(goalTasks.goalId, goalId)).get();
    if ((n?.n ?? 0) >= GOAL_LIMITS.tasksPerGoal) return { kind: "too_many" as const };
    tx.insert(goalTasks).values({ id: randomUUID(), goalId, text, position: (n?.top ?? -1) + 1, done: false, doneAt: null, createdAt: now() }).run();
    tx.update(goals).set({ updatedAt: now() }).where(eq(goals.id, goalId)).run();
    return { kind: "ok" as const, goal: toApi(tx as unknown as Db, tx.select().from(goals).where(eq(goals.id, goal.id)).get()!) };
  }, IMMEDIATE);
}

export function updateTask(db: Db, taskId: string, input: UpdateTask) {
  return db.transaction((tx) => {
    const task = tx.select().from(goalTasks).where(eq(goalTasks.id, taskId)).get();
    if (!task) return { kind: "not_found" as const };
    const goal = tx.select().from(goals).where(eq(goals.id, task.goalId)).get()!;
    if (goal.archivedAt) return { kind: "archived" as const };
    tx.update(goalTasks).set({
      ...(input.text !== undefined ? { text: input.text } : {}),
      // doneAt is the first completion: unchecking and checking again keeps it.
      ...(input.done !== undefined ? { done: input.done, doneAt: input.done ? (task.doneAt ?? now()) : task.doneAt } : {}),
    }).where(eq(goalTasks.id, taskId)).run();
    tx.update(goals).set({ updatedAt: now() }).where(eq(goals.id, goal.id)).run();
    return { kind: "ok" as const, goal: toApi(tx as unknown as Db, tx.select().from(goals).where(eq(goals.id, goal.id)).get()!) };
  }, IMMEDIATE);
}

export function deleteTask(db: Db, taskId: string) {
  return db.transaction((tx) => {
    const task = tx.select().from(goalTasks).where(eq(goalTasks.id, taskId)).get();
    if (!task) return { kind: "not_found" as const };
    const goal = tx.select().from(goals).where(eq(goals.id, task.goalId)).get()!;
    if (goal.archivedAt) return { kind: "archived" as const };
    tx.delete(goalTasks).where(eq(goalTasks.id, taskId)).run();
    tx.update(goals).set({ updatedAt: now() }).where(eq(goals.id, goal.id)).run();
    return { kind: "ok" as const, goal: toApi(tx as unknown as Db, tx.select().from(goals).where(eq(goals.id, goal.id)).get()!) };
  }, IMMEDIATE);
}

/** The new order must name exactly the goal's tasks, each once. */
export function reorderTasks(db: Db, goalId: string, taskIds: string[]) {
  return db.transaction((tx) => {
    const goal = tx.select().from(goals).where(eq(goals.id, goalId)).get();
    if (!goal) return { kind: "not_found" as const };
    if (goal.archivedAt) return { kind: "archived" as const };
    const current = tx.select({ id: goalTasks.id }).from(goalTasks).where(eq(goalTasks.goalId, goalId)).all().map((r) => r.id);
    if (new Set(taskIds).size !== taskIds.length || taskIds.length !== current.length || !taskIds.every((id) => current.includes(id))) {
      return { kind: "invalid" as const };
    }
    taskIds.forEach((id, position) => tx.update(goalTasks).set({ position }).where(eq(goalTasks.id, id)).run());
    return { kind: "ok" as const, goal: toApi(tx as unknown as Db, tx.select().from(goals).where(eq(goals.id, goal.id)).get()!) };
  }, IMMEDIATE);
}

/** Every active topic with its space, for the note topic picker. */
export function allTopics(db: Db) {
  return db.select({ id: topics.id, name: topics.name, spaceId: spaces.id, spaceName: spaces.name })
    .from(topics).innerJoin(spaces, eq(spaces.id, topics.spaceId))
    .where(and(isNull(topics.archivedAt), isNull(spaces.archivedAt)))
    .orderBy(asc(spaces.name), asc(topics.position)).all();
}

export function noteTopicRefs(db: Db, noteId: string) {
  return db.select({ id: topics.id, name: topics.name, spaceId: spaces.id, spaceName: spaces.name })
    .from(noteTopics).innerJoin(topics, eq(topics.id, noteTopics.topicId)).innerJoin(spaces, eq(spaces.id, topics.spaceId))
    .where(eq(noteTopics.noteId, noteId)).orderBy(asc(spaces.name), asc(topics.position)).all();
}

/**
 * Replaces the topics of a note (database only; the file is never written, D-002).
 * Unknown topics are refused; links to topics archived since are kept unless removed explicitly.
 */
export function setNoteTopics(db: Db, noteId: string, topicIds: string[]) {
  return db.transaction((tx) => {
    if (!tx.select().from(notes).where(eq(notes.id, noteId)).get()) return { kind: "not_found" as const };
    const ids = [...new Set(topicIds)];
    if (ids.length > 0 && tx.select({ n: count() }).from(topics).where(inArray(topics.id, ids)).get()!.n !== ids.length) return { kind: "bad_topic" as const };
    const existing = new Set(tx.select({ id: noteTopics.topicId }).from(noteTopics).where(eq(noteTopics.noteId, noteId)).all().map((r) => r.id));
    for (const id of existing) if (!ids.includes(id)) tx.delete(noteTopics).where(and(eq(noteTopics.noteId, noteId), eq(noteTopics.topicId, id))).run();
    for (const id of ids) if (!existing.has(id)) tx.insert(noteTopics).values({ noteId, topicId: id, createdAt: now() }).run();
    return { kind: "ok" as const };
  }, IMMEDIATE);
}

/**
 * Notes of the space: linked to it directly (HSLH-028) and/or through any of its topics, each listed once with how
 * it is linked. Missing notes are left out.
 */
export function spaceNotes(db: Db, spaceId: string) {
  type Entry = { id: string; title: string; path: string; vault: "hub" | "linked"; direct: boolean; topicIds: string[] };
  const byNote = new Map<string, Entry>();
  const entry = (r: { id: string; title: string; path: string; vault: string }) => {
    const n = byNote.get(r.id) ?? { id: r.id, title: r.title, path: r.path, vault: r.vault as "hub" | "linked", direct: false, topicIds: [] };
    byNote.set(r.id, n);
    return n;
  };
  const cols = { id: notes.id, title: notes.title, path: notes.path, vault: notes.vault };
  for (const r of db.select(cols).from(noteSpaces).innerJoin(notes, eq(notes.id, noteSpaces.noteId))
    .where(and(eq(noteSpaces.spaceId, spaceId), isNull(notes.missingSince))).all()) entry(r).direct = true;
  for (const r of db.select({ ...cols, topicId: noteTopics.topicId }).from(noteTopics).innerJoin(topics, eq(topics.id, noteTopics.topicId)).innerJoin(notes, eq(notes.id, noteTopics.noteId))
    .where(and(eq(topics.spaceId, spaceId), isNull(notes.missingSince))).all()) entry(r).topicIds.push(r.topicId);
  return [...byNote.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

export function noteSpaceRefs(db: Db, noteId: string) {
  return db.select({ id: spaces.id, name: spaces.name }).from(noteSpaces).innerJoin(spaces, eq(spaces.id, noteSpaces.spaceId))
    .where(eq(noteSpaces.noteId, noteId)).orderBy(asc(spaces.name)).all();
}

/** Replaces the spaces a note is linked to directly (database only, like note topics). */
export function setNoteSpaces(db: Db, noteId: string, spaceIds: string[]) {
  return db.transaction((tx) => {
    if (!tx.select().from(notes).where(eq(notes.id, noteId)).get()) return { kind: "not_found" as const };
    const ids = [...new Set(spaceIds)];
    if (ids.length > 0 && tx.select({ n: count() }).from(spaces).where(inArray(spaces.id, ids)).get()!.n !== ids.length) return { kind: "bad_space" as const };
    const existing = new Set(tx.select({ id: noteSpaces.spaceId }).from(noteSpaces).where(eq(noteSpaces.noteId, noteId)).all().map((r) => r.id));
    for (const id of existing) if (!ids.includes(id)) tx.delete(noteSpaces).where(and(eq(noteSpaces.noteId, noteId), eq(noteSpaces.spaceId, id))).run();
    for (const id of ids) if (!existing.has(id)) tx.insert(noteSpaces).values({ noteId, spaceId: id, createdAt: now() }).run();
    return { kind: "ok" as const };
  }, IMMEDIATE);
}

/** Links a note to a space (and optionally one of its topics); used after creating the note's file. */
export function linkNoteToSpace(db: Db, noteId: string, spaceId: string, topicId?: string) {
  db.transaction((tx) => {
    tx.insert(noteSpaces).values({ noteId, spaceId, createdAt: now() }).onConflictDoNothing().run();
    if (topicId) tx.insert(noteTopics).values({ noteId, topicId, createdAt: now() }).onConflictDoNothing().run();
  }, IMMEDIATE);
}

export const noteExists = (db: Db, id: string) => db.select({ id: notes.id }).from(notes).where(eq(notes.id, id)).get() !== undefined;
export const spaceExists = (db: Db, id: string) => db.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, id)).get() !== undefined;
