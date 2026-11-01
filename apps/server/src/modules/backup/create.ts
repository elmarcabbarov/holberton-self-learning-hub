import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import { getMeta } from "../../lib/db/index.ts";
import type { Vault } from "../vault/service.ts";
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BackupManifest } from "./manifest.ts";

async function hashFile(path: string): Promise<{ sha256: string; size: number }> {
  const h = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) { h.update(chunk as Buffer); size += (chunk as Buffer).length; }
  return { sha256: h.digest("hex"), size };
}

/** Regular files under the vault (no symlinks, no Hub temp files, no hidden dirs). */
async function vaultFiles(root: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try { entries = await readdir(join(root, rel), { withFileTypes: true }); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT" && rel === "") return out;
    throw e;
  }
  for (const e of entries) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink() || e.name.startsWith(".hub-tmp-")) continue;
    if (e.isDirectory()) { if (!e.name.startsWith(".")) out.push(...(await vaultFiles(root, p))); }
    else if (e.isFile()) out.push(p);
  }
  return out.sort();
}

const stampOf = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export interface BackupResult { name: string; path: string; manifest: BackupManifest }

/**
 * Creates a consistent backup zip in <dataDir>/backups (D-057).
 * Runs inside the vault queue, so note writes wait until the snapshot is complete.
 */
export function createBackup(opts: { database: DatabaseHandle; vault: Vault; dataDir: string; appVersion: string; now?: Date }): Promise<BackupResult> {
  const { database, vault, dataDir, appVersion } = opts;
  return vault.exclusive(async () => {
    const now = opts.now ?? new Date();
    const dir = join(dataDir, "backups");
    await mkdir(dir, { recursive: true });
    const tmpDb = join(dir, `.tmp-${randomUUID()}.db`);
    const tmpZip = join(dir, `.tmp-${randomUUID()}.zip`);
    try {
      await database.sqlite.backup(tmpDb);
      // Strip sign-in material and the operation journal from the copy.
      const copy = new Database(tmpDb);
      let counts: BackupManifest["counts"]; let migrations: number;
      try {
        copy.exec("DELETE FROM sessions; DELETE FROM bootstrap_tokens; DELETE FROM file_ops;");
        copy.pragma("journal_mode = DELETE");
        const n = (table: string) => (copy.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
        counts = { notes: n("notes"), spaces: n("spaces"), topics: n("topics"), cards: n("cards"), reviews: n("card_reviews") };
        migrations = n("__drizzle_migrations");
        copy.exec("VACUUM");
      } finally { copy.close(); }

      const zip = new yazl.ZipFile();
      const db = await hashFile(tmpDb);
      zip.addFile(tmpDb, "hub.db");
      const files: BackupManifest["files"] = [];
      for (const rel of await vaultFiles(vault.root)) {
        const abs = join(vault.root, ...rel.split("/"));
        const fh = await open(abs, constants.O_RDONLY | constants.O_NOFOLLOW); // refuse a file swapped for a link
        await fh.close();
        const info = await hashFile(abs);
        files.push({ path: rel, ...info });
        zip.addFile(abs, `vault/${rel}`);
      }
      const manifest = BackupManifest.parse({
        format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, appVersion, createdAt: now.toISOString(),
        instanceId: getMeta(database.db, "instance_id") ?? "unknown", migrations, counts, db, files,
      });
      zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), "manifest.json");
      zip.end();
      await pipeline(zip.outputStream, createWriteStream(tmpZip, { flags: "wx" }));

      let name = `hub-backup-${stampOf(now)}.zip`;
      for (let i = 1; await stat(join(dir, name)).then(() => true, () => false); i++) name = `hub-backup-${stampOf(now)}-${i}.zip`;
      await rename(tmpZip, join(dir, name));
      return { name, path: join(dir, name), manifest };
    } finally {
      await rm(tmpDb, { force: true });
      await rm(tmpZip, { force: true });
    }
  });
}

export async function listBackups(dataDir: string) {
  const dir = join(dataDir, "backups");
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: { name: string; size: number; createdAt: string }[] = [];
  for (const name of names.filter((n) => /^hub-backup-.*\.zip$/.test(n)).sort().reverse()) {
    const s = await stat(join(dir, name));
    out.push({ name, size: s.size, createdAt: s.mtime.toISOString() });
  }
  return out;
}
