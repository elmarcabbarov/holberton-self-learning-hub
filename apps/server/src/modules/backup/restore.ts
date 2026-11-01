import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, readFileSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { BackupManifest } from "./manifest.ts";

const MAX_ENTRIES = 100_000;
const MAX_TOTAL_BYTES = 5 * 1024 ** 3;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

export class RestoreError extends Error {
  readonly reason: string;
  constructor(reason: string, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.reason = reason;
  }
}

const openZip = (path: string) => new Promise<ZipFile>((res, rej) =>
  yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true }, (e, z) => (e ? rej(e) : res(z))));

const streamOf = (zip: ZipFile, entry: Entry) => new Promise<NodeJS.ReadableStream>((res, rej) =>
  zip.openReadStream(entry, (e, s) => (e ? rej(e) : res(s))));

/** Iterates entries; yauzl already rejects absolute paths, '..' and backslashes (strictFileNames). */
async function forEachEntry(zip: ZipFile, fn: (e: Entry) => Promise<void>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    zip.on("entry", (e: Entry) => { fn(e).then(() => zip.readEntry(), reject); });
    zip.on("end", resolve);
    zip.on("error", reject);
    zip.readEntry();
  });
}

function isSymlink(e: Entry): boolean {
  const mode = (e.externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

/** Reads and validates manifest.json without extracting anything (preview). */
export async function inspectBackup(zipPath: string): Promise<BackupManifest> {
  const zip = await openZip(zipPath);
  try {
    let manifest: BackupManifest | null = null;
    let count = 0;
    await forEachEntry(zip, async (e) => {
      if (++count > MAX_ENTRIES) throw new RestoreError("too_many_entries");
      if (e.fileName !== "manifest.json") return;
      if (e.uncompressedSize > MAX_MANIFEST_BYTES) throw new RestoreError("manifest_too_large");
      const chunks: Buffer[] = [];
      for await (const c of await streamOf(zip, e)) chunks.push(c as Buffer);
      const parsed = BackupManifest.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (!parsed.success) throw new RestoreError("bad_manifest");
      manifest = parsed.data;
    });
    if (!manifest) throw new RestoreError("no_manifest");
    return manifest;
  } finally { zip.close(); }
}

/** Present while a restore is publishing files; the server refuses to start until restore finishes. */
export const RESTORE_MARKER = ".restore-pending";

export async function restorePending(dataDir: string): Promise<boolean> {
  return stat(join(dataDir, RESTORE_MARKER)).then(() => true, () => false);
}

/** Undo a half-published restore. The target was empty before, so removing what it published is safe. */
async function rollbackPartialRestore(dataDir: string): Promise<void> {
  await rm(join(dataDir, "data", "hub.db"), { force: true });
  await rm(join(dataDir, "data", "hub.db-wal"), { force: true });
  await rm(join(dataDir, "data", "hub.db-shm"), { force: true });
  await rm(join(dataDir, "vault"), { recursive: true, force: true });
  await rm(join(dataDir, RESTORE_MARKER), { force: true });
}

async function isEmptyTarget(dataDir: string): Promise<boolean> {
  const db = await stat(join(dataDir, "data", "hub.db")).then(() => true, () => false);
  const vaultEntries = await readdir(join(dataDir, "vault")).catch(() => [] as string[]);
  return !db && vaultEntries.length === 0;
}

function appMigrationCount(): number {
  const journal = JSON.parse(readFileSync(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: unknown[] };
  return journal.entries.length;
}

/**
 * Restores a backup into an EMPTY data directory (D-058). Everything is extracted to a staging
 * directory and verified (manifest, every hash, no extra or missing files, schema not newer)
 * before anything is moved into place.
 */
export async function restoreBackup(zipPath: string, dataDir: string, hooks: { afterVaultPublished?: () => void } = {}): Promise<BackupManifest> {
  if (await restorePending(dataDir)) await rollbackPartialRestore(dataDir);
  if (!(await isEmptyTarget(dataDir))) throw new RestoreError("target_not_empty", dataDir);
  const manifest = await inspectBackup(zipPath);
  if (manifest.migrations > appMigrationCount()) throw new RestoreError("backup_newer_than_app");

  const staging = join(dataDir, `.restore-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  try {
    const expected = new Map(manifest.files.map((f) => [`vault/${f.path}`, f]));
    const seen = new Set<string>();
    let total = 0; let dbOk = false;
    const zip = await openZip(zipPath);
    try {
      await forEachEntry(zip, async (e) => {
        if (e.fileName.endsWith("/")) return; // directory entry
        if (isSymlink(e)) throw new RestoreError("symlink_entry", e.fileName);
        total += e.uncompressedSize;
        if (total > MAX_TOTAL_BYTES) throw new RestoreError("too_large");
        if (e.fileName === "manifest.json") return;
        const want = e.fileName === "hub.db" ? manifest.db : expected.get(e.fileName);
        if (!want) throw new RestoreError("unexpected_entry", e.fileName);
        if (seen.has(e.fileName)) throw new RestoreError("duplicate_entry", e.fileName);
        seen.add(e.fileName);
        const out = join(staging, ...e.fileName.split("/"));
        await mkdir(dirname(out), { recursive: true });
        const hash = createHash("sha256");
        const tap = new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); cb(null, chunk); } });
        await pipeline(await streamOf(zip, e), tap, createWriteStream(out, { flags: "wx" }));
        if (hash.digest("hex") !== want.sha256) throw new RestoreError("hash_mismatch", e.fileName);
        if (e.fileName === "hub.db") dbOk = true;
      });
    } finally { zip.close(); }
    if (!dbOk) throw new RestoreError("missing_db");
    for (const name of expected.keys()) if (!seen.has(name)) throw new RestoreError("missing_file", name);

    const check = new Database(join(staging, "hub.db"), { readonly: true });
    try {
      if (check.pragma("integrity_check", { simple: true }) !== "ok") throw new RestoreError("db_corrupt");
    } finally { check.close(); }

    // Verified: publish. Marker first, vault next, database LAST (the commit point).
    // An interruption leaves the marker: the server refuses to start and the next restore rolls back first.
    await mkdir(join(dataDir, "data"), { recursive: true });
    await writeFile(join(dataDir, RESTORE_MARKER), JSON.stringify({ zip: zipPath, startedAt: new Date().toISOString() }), { flag: "w" });
    await rm(join(dataDir, "vault"), { recursive: true, force: true }); // empty by precondition
    await rename(join(staging, "vault"), join(dataDir, "vault")).catch(async (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") await mkdir(join(dataDir, "vault"), { recursive: true }); // backup without vault files
      else throw err;
    });
    hooks.afterVaultPublished?.();
    await rename(join(staging, "hub.db"), join(dataDir, "data", "hub.db"));
    await rm(join(dataDir, RESTORE_MARKER), { force: true });
    return manifest;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
