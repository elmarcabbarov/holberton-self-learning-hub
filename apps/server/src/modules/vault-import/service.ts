import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, readFile, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { IMPORT_LIMITS, type ImportEntry, type ImportOutcome, type VaultImport } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import { vaultImports } from "../../lib/db/schema.ts";
import { PathError } from "../../lib/fs-safe/paths.ts";
import { sha256 } from "../../lib/fs-safe/vault-fs.ts";
import type { Vault } from "../vault/service.ts";
import { defaultPrefix, planEntries, validatePrefix, type StoredEntry } from "./plan.ts";
import { ImportError, listFolders, readFolder, readZip, receiveUpload, type RawEntry } from "./read.ts";

type Row = typeof vaultImports.$inferSelect;
const OPEN_STATES = ["preview", "interrupted"];
const SAVE_EVERY = 50;
const iso = (ms = Date.now()) => new Date(ms).toISOString();

export type CommitOutcome =
  | { kind: "ok"; import: VaultImport }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "conflict" };

/**
 * Copy-import of Markdown files into the Hub vault (D-061): a zip upload or a folder under HUB_IMPORT_DIR
 * becomes a frozen preview with staged bytes; commit writes exactly those bytes, never overwriting.
 */
export class VaultImporter {
  private readonly db: Db;
  private readonly vault: Vault;
  private readonly stagingRoot: string;
  readonly importDir: string | null;
  /** Previews being staged right now; counted with the open ones so concurrent requests cannot pass the limit. */
  private staging = 0;

  constructor(db: Db, vault: Vault, dataDir: string, importDir: string | null) {
    this.db = db;
    this.vault = vault;
    this.stagingRoot = join(dataDir, "imports");
    this.importDir = importDir;
  }

  /** Startup: a commit cut off by a crash becomes resumable; stale previews and leftover staging are removed. */
  async init(): Promise<void> {
    await mkdir(this.stagingRoot, { recursive: true, mode: 0o700 });
    this.db.update(vaultImports).set({ state: "interrupted" }).where(eq(vaultImports.state, "committing")).run();
    this.expireOld();
    const keep = new Set(this.db.select({ id: vaultImports.id }).from(vaultImports).where(inArray(vaultImports.state, OPEN_STATES)).all().map((r) => r.id));
    for (const name of await readdir(this.stagingRoot)) if (!keep.has(name)) await rm(join(this.stagingRoot, name), { recursive: true, force: true });
  }

  async sources(): Promise<{ folderImport: boolean; folders: string[] }> {
    if (!this.importDir) return { folderImport: false, folders: [] };
    return { folderImport: true, folders: await listFolders(this.importDir) };
  }

  previewZip(body: NodeJS.ReadableStream, name: string | undefined, prefix: string | undefined): Promise<VaultImport> {
    const sourceName = (name ?? "import.zip").slice(0, 255);
    return this.preview("zip", sourceName, prefix, async (dir) => {
      const upload = join(dir, "upload.zip");
      try {
        await receiveUpload(body, upload);
        return await readZip(upload, dir);
      } finally {
        await unlink(upload).catch(() => undefined);
      }
    });
  }

  previewFolder(folder: string, prefix: string | undefined): Promise<VaultImport> {
    const importDir = this.importDir;
    if (!importDir) return Promise.reject(new ImportError("unknown_folder", 404));
    return this.preview("folder", folder, prefix, (dir) => readFolder(importDir, folder, dir));
  }

  private async preview(source: "zip" | "folder", sourceName: string, rawPrefix: string | undefined, read: (dir: string) => Promise<RawEntry[]>): Promise<VaultImport> {
    let prefix: string;
    try { prefix = rawPrefix === undefined ? defaultPrefix(sourceName) : validatePrefix(rawPrefix); } catch (e) {
      if (e instanceof PathError) throw new ImportError("bad_prefix");
      throw e;
    }
    this.expireOld();
    const open = this.db.select({ id: vaultImports.id }).from(vaultImports).where(inArray(vaultImports.state, [...OPEN_STATES, "committing"])).all();
    if (open.length + this.staging >= IMPORT_LIMITS.pending) throw new ImportError("too_many_pending", 409);
    this.staging++; // reserved before the first await

    const id = randomUUID();
    const dir = join(this.stagingRoot, id);
    try {
      await mkdir(dir, { mode: 0o700 });
      const raw = await read(dir);
      await syncDir(dir); // staged bytes are durable before a row points at them
      const entries = planEntries(raw, prefix, this.vault.list());
      for (const e of entries) if (e.action === "import") e.noteId = randomUUID();
      const now = Date.now();
      const row: Row = {
        id, source, sourceName, prefix, state: "preview", entriesJson: JSON.stringify(entries),
        createdAt: iso(now), expiresAt: iso(now + IMPORT_LIMITS.previewTtlMs), finishedAt: null,
      };
      this.db.insert(vaultImports).values(row).run();
      return toApi(row);
    } catch (e) {
      await rm(dir, { recursive: true, force: true });
      throw e;
    } finally {
      this.staging--;
    }
  }

  /** Imports that still need a decision: open previews and interrupted commits. */
  listOpen(): VaultImport[] {
    this.expireOld();
    return this.db.select().from(vaultImports).where(inArray(vaultImports.state, [...OPEN_STATES, "committing"])).all().map(toApi);
  }

  get(id: string): VaultImport | undefined {
    this.expireOld();
    const row = this.row(id);
    return row ? toApi(row) : undefined;
  }

  /** Discards an open preview, or the rest of an interrupted commit (notes already imported stay), and the staged bytes. */
  async cancel(id: string): Promise<boolean> {
    const done = this.db.update(vaultImports).set({ state: "expired", finishedAt: iso() })
      .where(and(eq(vaultImports.id, id), inArray(vaultImports.state, OPEN_STATES))).run().changes > 0;
    if (done) await rm(join(this.stagingRoot, id), { recursive: true, force: true });
    return done;
  }

  /**
   * Claims the import atomically, then imports each entry through the vault queue. Outcomes are stored as
   * they happen, so an interrupted commit can be resumed; existence is re-checked by the vault for every file.
   */
  async commit(id: string): Promise<CommitOutcome> {
    this.expireOld();
    const claimed = this.db.transaction((tx) => {
      const row = tx.select().from(vaultImports).where(eq(vaultImports.id, id)).get();
      if (!row) return "not_found" as const;
      if (row.state === "expired") return "expired" as const;
      if (!OPEN_STATES.includes(row.state)) return "conflict" as const;
      tx.update(vaultImports).set({ state: "committing" }).where(eq(vaultImports.id, id)).run();
      return "ok" as const;
    }, { behavior: "immediate" });
    if (claimed !== "ok") return { kind: claimed };

    const row = this.row(id)!;
    const entries = JSON.parse(row.entriesJson) as StoredEntry[];
    const save = () => this.db.update(vaultImports).set({ entriesJson: JSON.stringify(entries) }).where(eq(vaultImports.id, id)).run();
    let sinceSave = 0;
    try {
      for (const e of entries) {
        if (e.action !== "import" || e.outcome) continue;
        e.outcome = await this.importOne(id, e);
        if (++sinceSave >= SAVE_EVERY) { save(); sinceSave = 0; }
      }
      await this.vault.resolveLinks();
    } catch (err) {
      save();
      this.db.update(vaultImports).set({ state: "interrupted" }).where(eq(vaultImports.id, id)).run();
      throw err;
    }
    this.db.update(vaultImports).set({ entriesJson: JSON.stringify(entries), state: "done", finishedAt: iso() }).where(eq(vaultImports.id, id)).run();
    await rm(join(this.stagingRoot, id), { recursive: true, force: true });
    return { kind: "ok", import: toApi(this.row(id)!) };
  }

  private async importOne(id: string, e: StoredEntry): Promise<ImportOutcome> {
    let bytes: Buffer;
    try {
      bytes = await readFile(join(this.stagingRoot, id, e.staged!));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return "failed"; // staged copy is gone for good
      throw err; // transient I/O: the commit stops and stays resumable
    }
    if (sha256(bytes) !== e.sha256) return "failed"; // staging changed after the preview
    try {
      const out = await this.vault.importFile(e.dest!, bytes, { resolve: false, ...(e.noteId ? { noteId: e.noteId } : {}) });
      if (out.kind === "created") return "created";
      if (out.kind === "invalid") return "failed";
      // Resumed commit: the note there carries the id this entry reserved, so we wrote it before the interruption.
      return e.noteId && this.vault.get(e.noteId)?.path === e.dest ? "created" : "exists";
    } catch (err) {
      // This entry cannot be written (a file sits where a folder is needed, path escapes): record and go on.
      // Anything else (disk full, I/O) stops the commit; it stays resumable.
      if (err instanceof PathError || ["ENOTDIR", "EISDIR", "ENAMETOOLONG"].includes((err as NodeJS.ErrnoException).code ?? "")) return "failed";
      throw err;
    }
  }

  private row(id: string): Row | undefined {
    return this.db.select().from(vaultImports).where(eq(vaultImports.id, id)).get();
  }

  /** Previews past their hour expire and lose their staged bytes. Interrupted commits never expire. */
  private expireOld(): void {
    const now = iso();
    const old = this.db.select({ id: vaultImports.id, expiresAt: vaultImports.expiresAt }).from(vaultImports).where(eq(vaultImports.state, "preview")).all()
      .filter((r) => r.expiresAt <= now);
    for (const r of old) {
      this.db.update(vaultImports).set({ state: "expired", finishedAt: now }).where(and(eq(vaultImports.id, r.id), eq(vaultImports.state, "preview"))).run();
      void rm(join(this.stagingRoot, r.id), { recursive: true, force: true });
    }
  }
}

async function syncDir(dir: string): Promise<void> {
  const fh = await open(dir, constants.O_RDONLY);
  try { await fh.sync(); } finally { await fh.close(); }
}

function toApi(row: Row): VaultImport {
  const entries = (JSON.parse(row.entriesJson) as StoredEntry[]).map((e): ImportEntry => ({
    source: e.source, dest: e.dest, size: e.size, action: e.action, reason: e.reason, readOnlyReason: e.readOnlyReason, outcome: e.outcome,
  }));
  const count = (f: (e: (typeof entries)[number]) => boolean) => entries.filter(f).length;
  return {
    id: row.id, source: row.source as VaultImport["source"], sourceName: row.sourceName, prefix: row.prefix,
    state: row.state as VaultImport["state"], createdAt: row.createdAt, expiresAt: row.expiresAt, finishedAt: row.finishedAt,
    counts: {
      import: count((e) => e.action === "import"), skip: count((e) => e.action === "skip"),
      created: count((e) => e.outcome === "created"), exists: count((e) => e.outcome === "exists"), failed: count((e) => e.outcome === "failed"),
    },
    entries,
  };
}
