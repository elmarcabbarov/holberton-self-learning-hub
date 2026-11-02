import type { ImportEntry } from "@hub/contracts";
import { foldKey, PathError, validateNotePath } from "../../lib/fs-safe/paths.ts";
import type { RawEntry } from "./read.ts";

/** Stored form of an entry: the API view plus where its bytes are staged and their hash. */
export interface StoredEntry extends ImportEntry {
  staged: string | null;
  sha256: string | null;
  /** Identity the note gets if this entry is imported; proves on resume that the file there is ours. */
  noteId?: string;
}

/** Validates a vault folder prefix (same segment rules as note paths) and returns it without edge slashes. */
export function validatePrefix(input: string): string {
  const p = input.trim();
  if (p.startsWith("/") || p.endsWith("/")) throw new PathError("bad_segment");
  validateNotePath(`${p}/x.md`);
  return p;
}

/** Default prefix: `Imported/<source name>` with characters a vault path cannot hold replaced. */
export function defaultPrefix(name: string): string {
  const base = [...name.replace(/\.zip$/i, "")].map((c) => (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f || '<>:"|?*\\/'.includes(c) ? "-" : c)).join("")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80);
  try { return validatePrefix(`Imported/${base}`); } catch { return "Imported/import"; }
}

export interface VaultRow { path: string; foldKey: string; missingSince: string | null }

/**
 * Decides what happens to every entry (D-061). Paths are validated before any normalization;
 * entries that collide with each other (same fold key, or a file where another entry needs a folder)
 * are all skipped, never resolved by order. Targets owned by a note row — present or missing — are skipped.
 */
export function planEntries(raw: RawEntry[], prefix: string, vault: VaultRow[]): StoredEntry[] {
  const out: StoredEntry[] = raw.map((r) => {
    const base = { source: r.source, size: r.size, readOnlyReason: r.readOnlyReason, outcome: null, staged: r.staged, sha256: r.sha256 };
    if (r.reason) return { ...base, dest: null, action: "skip" as const, reason: r.reason };
    let dest: string;
    try { dest = validateNotePath(`${prefix}/${r.source}`); } catch { return { ...base, dest: null, action: "skip" as const, reason: "invalid_path" as const }; }
    return { ...base, dest, action: "import" as const, reason: null };
  });

  const candidates = out.filter((e) => e.action === "import");
  const byKey = new Map<string, StoredEntry[]>();
  for (const e of candidates) {
    const k = foldKey(e.dest!);
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  const colliding = new Set<StoredEntry>();
  for (const group of byKey.values()) if (group.length > 1) group.forEach((e) => colliding.add(e));
  // A file whose path is a folder of another entry: both are skipped.
  for (const e of candidates) {
    for (const dir of ancestors(foldKey(e.dest!))) {
      const files = byKey.get(dir);
      if (files) { colliding.add(e); files.forEach((f) => colliding.add(f)); }
    }
  }

  const rows = new Map(vault.map((r) => [r.foldKey, r]));
  for (const e of candidates) {
    if (colliding.has(e)) { skip(e, "collision_in_source"); continue; }
    const key = foldKey(e.dest!);
    const row = rows.get(key);
    if (row) { skip(e, row.missingSince ? "missing_note" : "exists"); continue; }
    // A note file where this entry needs a folder.
    if (ancestors(key).some((d) => rows.has(d))) skip(e, "exists");
  }
  return out;
}

function skip(e: StoredEntry, reason: NonNullable<ImportEntry["reason"]>) {
  e.action = "skip";
  e.reason = reason;
}

/** `a/b/c.md` → [`a`, `a/b`]. */
function ancestors(path: string): string[] {
  const segs = path.split("/");
  return segs.slice(0, -1).map((_, i) => segs.slice(0, i + 1).join("/"));
}
