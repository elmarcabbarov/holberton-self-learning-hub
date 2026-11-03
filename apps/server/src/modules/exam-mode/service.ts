import { eq } from "drizzle-orm";
import type { Db } from "../../lib/db/index.ts";
import { examMode } from "../../lib/db/schema.ts";

/** Shared by all AI features through compose; state survives provider changes and restarts. */
export class ExamService {
  private readonly db: Db;
  private readonly running = new Set<AbortController>();
  constructor(db: Db) { this.db = db; }

  state(): { until: string | null } {
    const until = this.db.select().from(examMode).where(eq(examMode.id, 1)).get()?.until ?? null;
    return { until: until && Date.parse(until) > Date.now() ? until : null };
  }
  active(): boolean { return this.state().until !== null; }

  set(until: string | null): { until: string | null } {
    this.db.insert(examMode).values({ id: 1, until }).onConflictDoUpdate({ target: examMode.id, set: { until } }).run();
    if (this.active()) this.abortAll("exam_mode");
    return this.state();
  }

  /** Register before the first provider await; activation aborts even a call waiting for its first delta. */
  track(controller: AbortController): () => void {
    this.running.add(controller);
    if (this.active()) controller.abort("exam_mode");
    return () => this.running.delete(controller);
  }
  abortAll(reason: string): void { for (const c of this.running) c.abort(reason); }
}
