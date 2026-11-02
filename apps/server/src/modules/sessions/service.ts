import { randomUUID } from "node:crypto";
import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { SaveReflection, StartSession, StudySession } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import { goals, goalTasks, spaces, studySessions } from "../../lib/db/schema.ts";

type Row = typeof studySessions.$inferSelect;
const IMMEDIATE = { behavior: "immediate" } as const;
const now = () => new Date().toISOString();
const orNull = (s: string) => (s.trim() === "" ? null : s);

function toApi(db: Db, r: Row): StudySession {
  const space = r.spaceId ? db.select({ name: spaces.name }).from(spaces).where(eq(spaces.id, r.spaceId)).get() : undefined;
  const task = r.taskId ? db.select({ text: goalTasks.text }).from(goalTasks).where(eq(goalTasks.id, r.taskId)).get() : undefined;
  return { ...r, spaceName: space?.name ?? null, taskText: task?.text ?? null };
}

export function overview(db: Db) {
  const current = db.select().from(studySessions).where(isNull(studySessions.endedAt)).orderBy(desc(studySessions.startedAt)).get();
  const last = db.select().from(studySessions).where(isNotNull(studySessions.endedAt)).orderBy(desc(studySessions.endedAt)).get();
  return { current: current ? toApi(db, current) : null, last: last ? toApi(db, last) : null };
}

export function recent(db: Db, limit: number) {
  return db.select().from(studySessions).orderBy(desc(studySessions.startedAt)).limit(limit).all().map((r) => toApi(db, r));
}

/**
 * Starts a session; only one can be open. A task link implies its goal's space.
 * Returns `open` with the running session instead of starting a second one.
 */
export function start(db: Db, input: StartSession) {
  return db.transaction((tx) => {
    const open = tx.select().from(studySessions).where(isNull(studySessions.endedAt)).get();
    if (open) return { kind: "open" as const, session: toApi(tx as unknown as Db, open) };
    let spaceId = input.spaceId;
    if (input.taskId) {
      const task = tx.select({ spaceId: goals.spaceId }).from(goalTasks).innerJoin(goals, eq(goals.id, goalTasks.goalId)).where(eq(goalTasks.id, input.taskId)).get();
      if (!task) return { kind: "bad_ref" as const };
      if (spaceId && spaceId !== task.spaceId) return { kind: "bad_ref" as const };
      spaceId = task.spaceId;
    }
    if (spaceId && !tx.select().from(spaces).where(eq(spaces.id, spaceId)).get()) return { kind: "bad_ref" as const };
    const row: Row = { id: randomUUID(), objective: input.objective, spaceId, taskId: input.taskId, startedAt: now(), endedAt: null, learned: null, stuck: null, next: null, reflectedAt: null };
    tx.insert(studySessions).values(row).run();
    return { kind: "started" as const, session: toApi(tx as unknown as Db, row) };
  }, IMMEDIATE);
}

/** Stops the session; stopping a stopped session is a no-op that returns it unchanged. */
export function stop(db: Db, id: string): StudySession | undefined {
  return db.transaction((tx) => {
    const r = tx.select().from(studySessions).where(eq(studySessions.id, id)).get();
    if (!r) return undefined;
    if (!r.endedAt) tx.update(studySessions).set({ endedAt: now() }).where(eq(studySessions.id, id)).run();
    return toApi(tx as unknown as Db, tx.select().from(studySessions).where(eq(studySessions.id, id)).get()!);
  }, IMMEDIATE);
}

/** Saves (or replaces) the reflection of a finished session. Empty fields are stored as skipped. */
export function reflect(db: Db, id: string, input: SaveReflection) {
  return db.transaction((tx) => {
    const r = tx.select().from(studySessions).where(eq(studySessions.id, id)).get();
    if (!r) return { kind: "not_found" as const };
    if (!r.endedAt) return { kind: "open" as const };
    tx.update(studySessions).set({ learned: orNull(input.learned), stuck: orNull(input.stuck), next: orNull(input.next), reflectedAt: now() }).where(eq(studySessions.id, id)).run();
    return { kind: "ok" as const, session: toApi(tx as unknown as Db, tx.select().from(studySessions).where(eq(studySessions.id, id)).get()!) };
  }, IMMEDIATE);
}
