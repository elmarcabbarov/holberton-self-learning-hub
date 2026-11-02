import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, rename, unlink, type FileHandle } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join, relative, sep } from "node:path";
import { PathError } from "./paths.ts";

export const MAX_NOTE_BYTES = 2 * 1024 * 1024;

export interface FileVersion {
  sha256: string;
  size: number;
  mtimeMs: number;
}

export interface ReadResult extends FileVersion {
  bytes: Buffer;
}

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** Absolute path of a validated relative path; throws if it escapes the root through symlinks (D-040). */
export async function resolveInVault(root: string, rel: string): Promise<string> {
  const realRoot = await realpath(root);
  const target = join(realRoot, ...rel.split("/"));
  // Walk up to the deepest existing ancestor and check containment at a component boundary.
  let probe = target;
  for (;;) {
    try {
      const real = await realpath(probe);
      const back = relative(realRoot, real);
      if (back === ".." || back.startsWith(`..${sep}`) || back.startsWith(sep)) throw new PathError("escapes_root");
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const parent = dirname(probe);
      if (parent === probe) throw new PathError("no_root");
      probe = parent;
    }
  }
  return target;
}

/** Reads a regular file without following a final symlink, with stable-stat check and size bound. */
export async function readStable(abs: string): Promise<ReadResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const fh: FileHandle = await open(abs, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await fh.stat();
      if (!before.isFile()) throw new PathError("not_regular_file");
      if (before.size > MAX_NOTE_BYTES) throw new PathError("too_large");
      // Bounded: a file that grows while being read can never make us hold more than the limit + 1 byte.
      const buf = Buffer.alloc(Math.min(before.size, MAX_NOTE_BYTES) + 1);
      let n = 0;
      for (;;) {
        const { bytesRead } = await fh.read(buf, n, buf.length - n, n);
        if (bytesRead === 0 || (n += bytesRead) === buf.length) break;
      }
      if (n > MAX_NOTE_BYTES) throw new PathError("too_large");
      const bytes = buf.subarray(0, n);
      const after = await fh.stat();
      if (after.size === before.size && after.mtimeMs === before.mtimeMs && bytes.length === after.size) {
        return { bytes, sha256: sha256(bytes), size: bytes.length, mtimeMs: after.mtimeMs };
      }
    } finally {
      await fh.close();
    }
  }
  throw new PathError("unstable_read");
}

async function fsyncDir(dir: string): Promise<void> {
  const fh = await open(dir, constants.O_RDONLY);
  try { await fh.sync(); } finally { await fh.close(); }
}

/** Writes bytes to a fresh temp file next to `abs` (O_EXCL, fsync). Returns the temp path. */
export async function writeTemp(abs: string, bytes: Buffer): Promise<string> {
  await mkdir(dirname(abs), { recursive: true });
  const temp = join(dirname(abs), `.hub-tmp-${randomBytes(8).toString("hex")}`);
  const fh = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
  try {
    await fh.writeFile(bytes);
    await fh.sync();
  } finally {
    await fh.close();
  }
  return temp;
}

/** Publishes a temp file as a NEW file: fails with EEXIST instead of overwriting (D-050). */
export async function publishNew(temp: string, abs: string): Promise<void> {
  try {
    await link(temp, abs);
  } finally {
    await unlink(temp).catch(() => undefined);
  }
  await fsyncDir(dirname(abs));
}

/** Replaces an existing regular file atomically. The caller re-validated the destination's version. */
export async function publishReplace(temp: string, abs: string): Promise<void> {
  const st = await lstat(abs);
  if (!st.isFile()) {
    await unlink(temp).catch(() => undefined);
    throw new PathError("not_regular_file");
  }
  await rename(temp, abs);
  await fsyncDir(dirname(abs));
}
