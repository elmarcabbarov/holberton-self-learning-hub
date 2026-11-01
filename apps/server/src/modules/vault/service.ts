import { randomUUID } from "node:crypto";
import { mkdir, readdir, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../../lib/db/index.ts";
import { fileOps, notes } from "../../lib/db/schema.ts";
import { foldKey, isIgnoredDir, PathError, validateNotePath } from "../../lib/fs-safe/paths.ts";
import { MAX_NOTE_BYTES, publishNew, publishReplace, readStable, resolveInVault, sha256, writeTemp, type FileVersion } from "../../lib/fs-safe/vault-fs.ts";
import { decodeNote, encodeNote, type Eol } from "../../lib/fs-safe/text.ts";
import { SerialQueue } from "./queue.ts";
import { indexNote, resolveLinks, unindexNote } from "./indexer.ts";
import { notesFtsMap } from "../../lib/db/schema.ts";

type Sqlite = Parameters<typeof indexNote>[1];

type NoteRow = typeof notes.$inferSelect;

export type SaveOutcome =
  | { kind: "saved"; note: NoteRow; version: FileVersion }
  | { kind: "conflict"; current: FileVersion }
  | { kind: "read_only"; reason: string }
  | { kind: "not_found" };

export type CreateOutcome =
  | { kind: "created"; note: NoteRow; version: FileVersion }
  | { kind: "exists" }
  | { kind: "collision"; with: string }
  | { kind: "invalid"; reason: string };

export interface ReconcileReport { added: number; updated: number; renamed: number; missing: number; error: string | null }

const iso = () => new Date().toISOString();
const titleFromPath = (p: string) => basename(p).replace(/\.md$/i, "");

export class Vault {
  readonly root: string;
  private readonly db: Db;
  private readonly queue = new SerialQueue();
  lastReconcile: ReconcileReport | null = null;

  private readonly sqlite: Sqlite | null;

  /** `sqlite` enables the derived index (links, tags, FTS); without it only file metadata is kept. */
  constructor(db: Db, root: string, sqlite: Sqlite | null = null) {
    this.db = db;
    this.root = root;
    this.sqlite = sqlite;
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await this.queue.run(() => this.recover());
    await this.reconcile();
    await this.queue.run(() => this.ensureIndexed());
  }

  private index(noteId: string, path: string, bytes: Buffer): void {
    if (this.sqlite) indexNote(this.db, this.sqlite, noteId, path, decodeNote(bytes).text);
  }

  private resolve(): void {
    if (this.sqlite) resolveLinks(this.db);
  }

  /** Indexes present notes that have no index yet (e.g. after upgrading from a version without one). */
  private async ensureIndexed(): Promise<void> {
    if (!this.sqlite) return;
    const indexed = new Set(this.db.select({ id: notesFtsMap.noteId }).from(notesFtsMap).all().map((r) => r.id));
    let changed = false;
    for (const n of this.list()) {
      if (n.missingSince || indexed.has(n.id)) continue;
      try {
        const file = await readStable(await resolveInVault(this.root, n.path));
        this.index(n.id, n.path, file.bytes);
        changed = true;
      } catch { /* unreadable: reconcile reports it */ }
    }
    if (changed) this.resolve();
  }

  idle(): Promise<void> { return this.queue.idle(); }

  /** Runs `task` with vault writes paused (used for consistent backups). */
  exclusive<T>(task: () => Promise<T>): Promise<T> { return this.queue.run(task); }

  list(): NoteRow[] {
    return this.db.select().from(notes).orderBy(notes.path).all();
  }

  get(id: string): NoteRow | undefined {
    return this.db.select().from(notes).where(eq(notes.id, id)).get();
  }

  /** Current file content as editor text plus version; null when the file is gone. */
  async read(id: string) {
    const note = this.get(id);
    if (!note || note.missingSince) return null;
    const abs = await resolveInVault(this.root, note.path);
    const file = await readStable(abs);
    const decoded = decodeNote(file.bytes);
    return { note, text: decoded.text, version: versionOf(file), decoded };
  }

  create(path: string, text: string): Promise<CreateOutcome> {
    return this.queue.run(async () => {
      let rel: string;
      try { rel = validateNotePath(path); } catch (e) { return { kind: "invalid", reason: (e as PathError).reason ?? "invalid" }; }
      const key = foldKey(rel);
      const clash = this.db.select().from(notes).where(and(eq(notes.foldKey, key), isNull(notes.missingSince))).get();
      if (clash) return clash.path === rel ? { kind: "exists" } : { kind: "collision", with: clash.path };

      const bytes = encodeNote(text, "lf", false);
      if (bytes.length > MAX_NOTE_BYTES) return { kind: "invalid", reason: "too_large" };
      const abs = await resolveInVault(this.root, rel);
      // A missing note at the same path keeps its id (and its cards/links) when recreated.
      const prior = this.db.select().from(notes).where(eq(notes.path, rel)).get();
      const noteId = prior?.id ?? randomUUID();
      const opId = randomUUID();
      const after = sha256(bytes);
      this.db.insert(fileOps).values({ id: opId, kind: "create", noteId, path: rel, afterSha256: after, state: "intent", createdAt: iso(), updatedAt: iso() }).run();
      const temp = await writeTemp(abs, bytes);
      this.db.update(fileOps).set({ tempPath: temp, updatedAt: iso() }).where(eq(fileOps.id, opId)).run();
      try {
        await publishNew(temp, abs);
      } catch (err) {
        this.db.update(fileOps).set({ state: "done", updatedAt: iso() }).where(eq(fileOps.id, opId)).run();
        if ((err as NodeJS.ErrnoException).code === "EEXIST") return { kind: "exists" };
        throw err;
      }
      const file = await readStable(abs);
      const row = this.rowFromFile(noteId, rel, file.bytes, file);
      this.db.transaction((tx) => {
        if (prior) tx.update(notes).set({ ...row, createdAt: prior.createdAt }).where(eq(notes.id, noteId)).run();
        else tx.insert(notes).values(row).run();
        tx.update(fileOps).set({ state: "done", updatedAt: iso() }).where(eq(fileOps.id, opId)).run();
        this.index(noteId, rel, file.bytes); // same transaction: metadata and index never diverge
      });
      this.resolve();
      return { kind: "created", note: this.get(noteId) ?? row, version: { sha256: after, size: bytes.length, mtimeMs: Math.round(file.mtimeMs) } };
    });
  }

  save(id: string, text: string, expectedSha256: string): Promise<SaveOutcome> {
    return this.queue.run(async () => {
      const note = this.get(id);
      if (!note || note.missingSince) return { kind: "not_found" };
      const abs = await resolveInVault(this.root, note.path);
      const current = await readStable(abs);
      if (current.sha256 !== expectedSha256) return { kind: "conflict", current: versionOf(current) };
      // Encoding and write restrictions come from the bytes on disk now, never from the index (D-053).
      const decodedNow = decodeNote(current.bytes);
      if (decodedNow.readOnlyReason) return { kind: "read_only", reason: decodedNow.readOnlyReason };

      const eol: Eol = decodedNow.eol === "crlf" ? "crlf" : "lf";
      const bytes = encodeNote(text, eol, decodedNow.bom);
      if (bytes.length > MAX_NOTE_BYTES) return { kind: "read_only", reason: "too_large" };
      const after = sha256(bytes);
      if (after === current.sha256) return { kind: "saved", note, version: versionOf(current) };

      const opId = randomUUID();
      this.db.insert(fileOps).values({ id: opId, kind: "replace", noteId: id, path: note.path, beforeSha256: current.sha256, afterSha256: after, state: "intent", createdAt: iso(), updatedAt: iso() }).run();
      const temp = await writeTemp(abs, bytes);
      this.db.update(fileOps).set({ tempPath: temp, updatedAt: iso() }).where(eq(fileOps.id, opId)).run();

      // Re-validate right before replacing; a residual race with external writers remains (D-040).
      const recheck = await readStable(abs);
      if (recheck.sha256 !== current.sha256) {
        await unlink(temp).catch(() => undefined);
        this.db.update(fileOps).set({ state: "done", updatedAt: iso() }).where(eq(fileOps.id, opId)).run();
        return { kind: "conflict", current: versionOf(recheck) };
      }
      await publishReplace(temp, abs);
      const file = await readStable(abs);
      const row = this.rowFromFile(id, note.path, file.bytes, file, note.createdAt);
      this.db.transaction((tx) => {
        tx.update(notes).set(row).where(eq(notes.id, id)).run();
        tx.update(fileOps).set({ state: "done", updatedAt: iso() }).where(eq(fileOps.id, opId)).run();
        this.index(id, note.path, file.bytes);
      });
      this.resolve();
      // Version of the bytes we wrote; if an external writer raced us, the next save conflicts (D-040).
      return { kind: "saved", note: this.get(id) ?? row, version: { sha256: after, size: bytes.length, mtimeMs: Math.round(file.mtimeMs) } };
    });
  }

  /** Rescans the vault and updates the index; serialized with mutations. */
  reconcile(): Promise<ReconcileReport> {
    return this.queue.run(async () => {
      const report: ReconcileReport = { added: 0, updated: 0, renamed: 0, missing: 0, error: null };
      let files: Map<string, { bytes: Buffer; version: FileVersion }>;
      let unreadable: Set<string>;
      try {
        ({ files, unreadable } = await this.scan());
      } catch (err) {
        // Never mark notes missing after a failed enumeration (D-052).
        report.error = (err as Error).message;
        this.lastReconcile = report;
        return report;
      }
      const rows = this.list();
      const byPath = new Map(rows.map((r) => [r.path, r]));
      const newPaths: string[] = [];
      for (const [path, f] of files) {
        const row = byPath.get(path);
        if (!row) { newPaths.push(path); continue; }
        if (row.contentSha256 !== f.version.sha256 || row.size !== f.version.size || row.mtimeMs !== Math.round(f.version.mtimeMs) || row.missingSince) {
          this.db.transaction(() => {
            this.db.update(notes).set(this.rowFromFile(row.id, path, f.bytes, f.version, row.createdAt)).where(eq(notes.id, row.id)).run();
            this.index(row.id, path, f.bytes);
          });
          report.updated++;
        }
      }
      // Unreadable files exist on disk: never treat them as gone or as rename candidates.
      const absent = rows.filter((r) => !files.has(r.path) && !unreadable.has(r.path));
      const gone = absent.filter((r) => !r.missingSince);
      // Rename: exactly one absent row (newly gone OR already missing) and exactly one new file share a hash.
      const renamedNew = new Set<string>();
      const renamedRows = new Set<string>();
      for (const row of absent) {
        const sameHashNew = newPaths.filter((p) => files.get(p)!.version.sha256 === row.contentSha256);
        const sameHashAbsent = absent.filter((g) => g.contentSha256 === row.contentSha256);
        if (sameHashNew.length === 1 && sameHashAbsent.length === 1 && !renamedNew.has(sameHashNew[0]!)) {
          const path = sameHashNew[0]!;
          const f = files.get(path)!;
          this.db.transaction(() => {
            this.db.update(notes).set(this.rowFromFile(row.id, path, f.bytes, f.version, row.createdAt)).where(eq(notes.id, row.id)).run();
            this.index(row.id, path, f.bytes);
          });
          renamedNew.add(path);
          renamedRows.add(row.id);
          report.renamed++;
        }
      }
      for (const row of gone) {
        if (renamedRows.has(row.id)) continue;
        this.db.update(notes).set({ missingSince: iso(), updatedAt: iso() }).where(eq(notes.id, row.id)).run();
        if (this.sqlite) unindexNote(this.db, this.sqlite, row.id);
        report.missing++;
      }
      for (const path of newPaths) {
        if (renamedNew.has(path)) continue;
        const f = files.get(path)!;
        const id = randomUUID();
        this.db.transaction(() => {
          this.db.insert(notes).values(this.rowFromFile(id, path, f.bytes, f.version)).run();
          this.index(id, path, f.bytes);
        });
        report.added++;
      }
      if (report.added + report.updated + report.renamed + report.missing > 0) this.resolve();
      this.lastReconcile = report;
      return report;
    });
  }

  /** Paths whose fold key is shared by more than one present note (portability warning, D-052). */
  collisions(): string[][] {
    const groups = new Map<string, string[]>();
    for (const r of this.list()) if (!r.missingSince) groups.set(r.foldKey, [...(groups.get(r.foldKey) ?? []), r.path]);
    return [...groups.values()].filter((g) => g.length > 1);
  }

  private async scan(): Promise<{ files: Map<string, { bytes: Buffer; version: FileVersion }>; unreadable: Set<string> }> {
    const out = new Map<string, { bytes: Buffer; version: FileVersion }>();
    const unreadable = new Set<string>();
    const walk = async (relDir: string) => {
      const entries = await readdir(join(this.root, relDir), { withFileTypes: true });
      for (const e of entries) {
        const rel = relDir ? `${relDir}/${e.name}` : e.name;
        if (e.isSymbolicLink()) continue; // never follow links out of the vault
        if (e.isDirectory()) { if (!isIgnoredDir(e.name)) await walk(rel); continue; }
        if (!e.isFile() || e.name.startsWith(".") || !e.name.toLowerCase().endsWith(".md")) continue;
        try {
          const file = await readStable(join(this.root, rel));
          out.set(rel, { bytes: file.bytes, version: versionOf(file) });
        } catch (err) {
          if (err instanceof PathError) { unreadable.add(rel); continue; } // too large / unstable: present but not indexed
          throw err;
        }
      }
    };
    await walk("");
    return { files: out, unreadable };
  }

  /** Completes or rolls back journaled operations after a crash (D-050). Never deletes user content. */
  private async recover(): Promise<void> {
    const pending = this.db.select().from(fileOps).where(eq(fileOps.state, "intent")).all();
    for (const op of pending) {
      if (op.tempPath) await unlink(op.tempPath).catch(() => undefined);
      let state = "done";
      try {
        const abs = await resolveInVault(this.root, op.path);
        const file = await readStable(abs).catch(() => null);
        if (file && file.sha256 !== op.afterSha256 && file.sha256 !== op.beforeSha256) state = "conflict";
      } catch { state = "conflict"; }
      this.db.update(fileOps).set({ state, updatedAt: iso() }).where(eq(fileOps.id, op.id)).run();
    }
    // Reconcile (run right after) brings note metadata in line with whatever is on disk.
  }

  pendingConflicts() {
    return this.db.select().from(fileOps).where(and(eq(fileOps.state, "conflict"), isNotNull(fileOps.path))).all();
  }

  private rowFromFile(id: string, path: string, bytes: Buffer, v: FileVersion, createdAt?: string): NoteRow {
    const decoded = decodeNote(bytes);
    const ts = iso();
    return {
      id, path, foldKey: foldKey(path), title: titleFromPath(path), contentSha256: v.sha256, size: v.size,
      mtimeMs: Math.round(v.mtimeMs), eol: decoded.eol, bom: decoded.bom, readOnlyReason: decoded.readOnlyReason,
      missingSince: null, createdAt: createdAt ?? ts, updatedAt: ts,
    };
  }
}

const versionOf = (f: FileVersion): FileVersion => ({ sha256: f.sha256, size: f.size, mtimeMs: Math.round(f.mtimeMs) });
