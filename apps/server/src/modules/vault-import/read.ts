import { constants, createWriteStream } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32 } from "node:zlib";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { IMPORT_LIMITS, type ImportSkipReason } from "@hub/contracts";
import { isIgnoredDir } from "../../lib/fs-safe/paths.ts";
import { sha256 } from "../../lib/fs-safe/vault-fs.ts";
import { decodeNote } from "../../lib/fs-safe/text.ts";

/** Whole-import failure; `reason` becomes the `vaultImport.<reason>` message key. */
export class ImportError extends Error {
  readonly reason: string;
  readonly status: number;
  constructor(reason: string, status = 400) {
    super(reason);
    this.reason = reason;
    this.status = status;
  }
}

/** One file found in the source. Bytes of importable files are copied to `staged` (a generated name). */
export interface RawEntry {
  source: string;
  size: number;
  reason: ImportSkipReason | null;
  staged: string | null;
  sha256: string | null;
  readOnlyReason: "invalid_utf8" | "mixed_eol" | null;
}

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

/** Hidden or tool folders anywhere in the path (`.obsidian`, `.git`, `__MACOSX` …), or a dot file. */
function isHidden(source: string): boolean {
  return source.split("/").some((seg) => isIgnoredDir(seg) || seg === "__MACOSX");
}

/** Skip reason that follows from the path and size alone; null = candidate for import. */
function preCheck(source: string, size: number): ImportSkipReason | null {
  if (isHidden(source)) return "hidden";
  if (!source.toLowerCase().endsWith(".md")) return "not_markdown";
  if (size > IMPORT_LIMITS.fileBytes) return "too_large";
  return null;
}

/** Copies the request body to `dest`, counting bytes itself (a stream parser is not covered by bodyLimit). */
export async function receiveUpload(body: NodeJS.ReadableStream, dest: string): Promise<number> {
  let n = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      n += chunk.length;
      if (n > IMPORT_LIMITS.uploadBytes) cb(new ImportError("upload_too_large", 413));
      else cb(null, chunk);
    },
  });
  await pipeline(body, counter, createWriteStream(dest, { flags: "wx", mode: 0o600 }));
  return n;
}

const openZip = (path: string) => new Promise<ZipFile>((res, rej) =>
  yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true, decodeStrings: true }, (e, z) => (e ? rej(e) : res(z))));

const streamOf = (zip: ZipFile, entry: Entry) => new Promise<NodeJS.ReadableStream>((res, rej) =>
  zip.openReadStream(entry, (e, s) => (e ? rej(e) : res(s))));

/** Reads one entry fully, with its own size cap and a CRC32 check (yauzl does not verify CRC). */
async function readEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  const stream = await streamOf(zip, entry);
  const chunks: Buffer[] = [];
  let n = 0;
  let crc = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    n += chunk.length;
    if (n > IMPORT_LIMITS.fileBytes) throw new ImportError("bad_archive");
    crc = crc32(chunk, crc);
    chunks.push(chunk);
  }
  if ((crc >>> 0) !== (entry.crc32 >>> 0)) throw new ImportError("bad_archive");
  return Buffer.concat(chunks);
}

/**
 * Lists a zip and stages its importable Markdown files into `stageDir` (D-061).
 * Unsafe names (absolute, `..`, backslash) make yauzl fail the whole archive (strictFileNames).
 */
export async function readZip(zipPath: string, stageDir: string): Promise<RawEntry[]> {
  let zip: ZipFile;
  try { zip = await openZip(zipPath); } catch { throw new ImportError("bad_archive"); }
  const out: RawEntry[] = [];
  let count = 0;
  let total = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const next = async (entry: Entry) => {
        if (++count > IMPORT_LIMITS.entries) throw new ImportError("too_many_entries");
        const source = entry.fileName;
        if (source.endsWith("/")) return; // directory entry
        const mode = (entry.externalFileAttributes >>> 16) & S_IFMT;
        const size = entry.uncompressedSize;
        let reason: ImportSkipReason | null =
          mode === S_IFLNK ? "symlink"
          : mode !== 0 && mode !== S_IFREG && mode !== S_IFDIR ? "special_file"
          : entry.isEncrypted() ? "encrypted"
          : preCheck(source, size);
        if (!reason && entry.compressionMethod !== 0 && entry.compressionMethod !== 8) reason = "unsupported";
        if (reason) { out.push({ source, size, reason, staged: null, sha256: null, readOnlyReason: null }); return; }
        total += size;
        if (total > IMPORT_LIMITS.totalBytes) throw new ImportError("too_large_total");
        const bytes = await readEntry(zip, entry);
        out.push(await stage(stageDir, out.length, source, bytes));
      };
      zip.on("entry", (e: Entry) => { next(e).then(() => zip.readEntry(), reject); });
      zip.on("end", resolve);
      zip.on("error", () => reject(new ImportError("bad_archive")));
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return out;
}

async function stage(stageDir: string, n: number, source: string, bytes: Buffer): Promise<RawEntry> {
  const staged = String(n);
  const fh = await open(join(stageDir, staged), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { await fh.writeFile(bytes); await fh.sync(); } finally { await fh.close(); }
  return { source, size: bytes.length, reason: null, staged, sha256: sha256(bytes), readOnlyReason: decodeNote(bytes).readOnlyReason };
}

/** Immediate child folders of the import directory that may be offered (no symlinks, no hidden ones). */
export async function listFolders(importDir: string): Promise<string[]> {
  const out: string[] = [];
  let dir;
  try { dir = await opendir(importDir); } catch { return []; }
  let seen = 0;
  for await (const e of dir) {
    if (++seen > MAX_LISTED * 10) break; // bounded scan of a huge folder
    if (e.isDirectory() && !isIgnoredDir(e.name)) out.push(e.name);
    if (out.length >= MAX_LISTED) break;
  }
  return out.sort();
}

const MAX_LISTED = 200;

/**
 * Walks `importDir/<folder>` without following symlinks and copies Markdown bytes into `stageDir`,
 * so the commit always writes exactly what the preview showed (D-061). The parent-directory race of
 * D-040 remains: a folder swapped for a link between lstat and readdir is a documented residual risk.
 */
export async function readFolder(importDir: string, folder: string, stageDir: string): Promise<RawEntry[]> {
  if (!(await listFolders(importDir)).includes(folder)) throw new ImportError("unknown_folder", 404);
  const root = join(importDir, folder);
  const out: RawEntry[] = [];
  let count = 0;
  let total = 0;
  const walk = async (rel: string): Promise<void> => {
    // Read the directory as a stream so the entry limit holds before a huge listing is in memory.
    const dirents = [];
    for await (const d of await opendir(rel ? join(root, ...rel.split("/")) : root)) {
      if (++count > IMPORT_LIMITS.entries) throw new ImportError("too_many_entries");
      dirents.push(d);
    }
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const d of dirents) {
      const source = rel ? `${rel}/${d.name}` : d.name;
      if (d.isSymbolicLink()) { out.push(skip(source, "symlink")); continue; }
      if (d.isDirectory()) {
        if (isHidden(source)) out.push(skip(`${source}/`, "hidden"));
        else await walk(source);
        continue;
      }
      if (!d.isFile()) { out.push(skip(source, "special_file")); continue; }
      const abs = join(root, ...source.split("/"));
      const st = await lstat(abs);
      const reason = st.isFile() ? preCheck(source, st.size) : "special_file";
      if (reason) { out.push(skip(source, reason, st.size)); continue; }
      const bytes = await readRegular(abs);
      if (!bytes) { out.push(skip(source, "special_file")); continue; }
      if (bytes.length > IMPORT_LIMITS.fileBytes) { out.push(skip(source, "too_large", bytes.length)); continue; }
      total += bytes.length;
      if (total > IMPORT_LIMITS.totalBytes) throw new ImportError("too_large_total");
      out.push(await stage(stageDir, out.length, source, bytes));
    }
  };
  await walk("");
  return out;
}

const skip = (source: string, reason: ImportSkipReason, size = 0): RawEntry => ({ source, size, reason, staged: null, sha256: null, readOnlyReason: null });

/** Reads a regular file through O_NOFOLLOW + fstat; null when it is not a regular file. Reads at most limit+1 bytes. */
async function readRegular(abs: string): Promise<Buffer | null> {
  let fh;
  try { fh = await open(abs, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); } catch { return null; }
  try {
    if (!(await fh.stat()).isFile()) return null;
    const buf = Buffer.alloc(IMPORT_LIMITS.fileBytes + 1);
    let n = 0;
    for (;;) {
      const { bytesRead } = await fh.read(buf, n, buf.length - n, n);
      if (bytesRead === 0) break;
      n += bytesRead;
      if (n === buf.length) break;
    }
    return buf.subarray(0, n);
  } finally {
    await fh.close();
  }
}
