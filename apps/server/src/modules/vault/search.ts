import type { Db } from "../../lib/db/index.ts";
import { and, eq, isNull } from "drizzle-orm";
import { noteAliases, noteLinks, notes, noteTags } from "../../lib/db/schema.ts";
import { searchFold } from "./parse.ts";

type Sqlite = { prepare(sql: string): { all(...args: unknown[]): unknown[] } };

/** Builds a safe FTS5 query: each folded term quoted, prefix-matched, all terms required. */
export function ftsQuery(q: string): string | null {
  const terms = searchFold(q).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0).slice(0, 12);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(" ");
}

/** Snippet from the original text around the first matching term (folding keeps AZ text length). */
function snippet(raw: string, q: string, width = 160): string {
  const folded = searchFold(raw);
  const terms = searchFold(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const at = folded.length === raw.length ? Math.min(...terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0), Infinity) : Infinity;
  if (!Number.isFinite(at)) return raw.slice(0, width);
  const start = Math.max(0, at - 40);
  return `${start > 0 ? "…" : ""}${raw.slice(start, start + width)}${start + width < raw.length ? "…" : ""}`;
}

export function searchNotes(sqlite: Sqlite, q: string, limit = 50) {
  const match = ftsQuery(q);
  if (!match) return [];
  const rows = sqlite.prepare(
    `SELECT n.id, n.path, f.raw_title AS title, f.raw_body AS body
       FROM notes_fts f JOIN notes_fts_map m ON m.rowid = f.rowid JOIN notes n ON n.id = m.note_id
      WHERE notes_fts MATCH ? AND n.missing_since IS NULL
      ORDER BY bm25(notes_fts, 5.0, 1.0) LIMIT ?`,
  ).all(match, limit) as { id: string; path: string; title: string; body: string }[];
  return rows.map((r) => ({ id: r.id, path: r.path, title: r.title, snippet: snippet(r.body, q) }));
}

export function backlinks(db: Db, noteId: string) {
  return db.select({ id: notes.id, path: notes.path, title: notes.title, kind: noteLinks.kind, anchor: noteLinks.anchor })
    .from(noteLinks).innerJoin(notes, eq(notes.id, noteLinks.fromNoteId))
    .where(and(eq(noteLinks.targetNoteId, noteId), eq(noteLinks.state, "resolved"), isNull(notes.missingSince)))
    .orderBy(notes.path).all();
}

export function noteMeta(db: Db, noteId: string) {
  return {
    tags: db.select({ tag: noteTags.tag }).from(noteTags).where(eq(noteTags.noteId, noteId)).all().map((r) => r.tag).sort(),
    aliases: db.select({ alias: noteAliases.alias }).from(noteAliases).where(eq(noteAliases.noteId, noteId)).all().map((r) => r.alias),
    links: db.select().from(noteLinks).where(eq(noteLinks.fromNoteId, noteId)).orderBy(noteLinks.id).all()
      .map((l) => ({ kind: l.kind, target: l.target, anchor: l.anchor, state: l.state, targetId: l.targetNoteId })),
  };
}
