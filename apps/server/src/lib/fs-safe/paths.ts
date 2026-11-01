import { posix } from "node:path";

/** Windows-reserved device names (case-insensitive, with or without extension). */
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const FORBIDDEN_CHARS = /[<>:"|?*\\]/;
const hasControlChar = (s: string) => [...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);
const IGNORED_DIRS = new Set([".obsidian", ".trash", ".git", ".hub"]);

export class PathError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`invalid vault path: ${reason}`);
    this.reason = reason;
  }
}

/**
 * Validates a vault-relative note path given by a client and returns it in canonical POSIX form.
 * Rules (D-052, OBSIDIAN_STRATEGY §5): relative, forward slashes, no `.`/`..`/empty segments,
 * no hidden or ignored segments, no Windows-reserved names or characters, no trailing dot/space,
 * `.md` extension, at most 512 chars.
 */
export function validateNotePath(input: string): string {
  if (typeof input !== "string" || input.length === 0) throw new PathError("empty");
  if (input.length > 512) throw new PathError("too_long");
  if (input.includes("\\")) throw new PathError("backslash");
  if (input.startsWith("/") || /^[a-zA-Z]:/.test(input)) throw new PathError("absolute");
  const segments = input.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") throw new PathError("bad_segment");
    if (seg.startsWith(".")) throw new PathError("hidden");
    if (IGNORED_DIRS.has(seg.toLowerCase())) throw new PathError("ignored");
    if (FORBIDDEN_CHARS.test(seg) || hasControlChar(seg)) throw new PathError("forbidden_char");
    if (/[. ]$/.test(seg)) throw new PathError("trailing_dot_or_space");
    if (RESERVED.test(seg)) throw new PathError("reserved_name");
  }
  if (!input.toLowerCase().endsWith(".md")) throw new PathError("not_markdown");
  return posix.normalize(input);
}

/** True for directory names the indexer never enters. */
export function isIgnoredDir(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRS.has(name.toLowerCase());
}

/** Portability key: NFC + lowercase. Not unique on disk; used only to detect collisions (D-052). */
export function foldKey(path: string): string {
  return path.normalize("NFC").toLowerCase();
}
