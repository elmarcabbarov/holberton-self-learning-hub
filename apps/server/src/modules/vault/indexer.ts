import { posix } from "node:path";
import { eq, isNull } from "drizzle-orm";
import type { Db } from "../../lib/db/index.ts";
import { noteAliases, noteLinks, notes, notesFtsMap, noteTags } from "../../lib/db/schema.ts";
import { foldKey } from "../../lib/fs-safe/paths.ts";
import { parseNote, searchFold, type ParsedNote } from "./parse.ts";

type Sqlite = { prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] } };

const fileTitle = (path: string) => posix.basename(path).replace(/\.md$/i, "");

/** Replaces the derived index rows (links, tags, aliases, FTS, title) of one note in one transaction. */
export function indexNote(db: Db, sqlite: Sqlite, noteId: string, path: string, text: string): ParsedNote {
  const parsed = parseNote(text, fileTitle(path));
  db.transaction((tx) => {
    tx.delete(noteLinks).where(eq(noteLinks.fromNoteId, noteId)).run();
    tx.delete(noteTags).where(eq(noteTags.noteId, noteId)).run();
    tx.delete(noteAliases).where(eq(noteAliases.noteId, noteId)).run();
    for (const l of parsed.links) tx.insert(noteLinks).values({ fromNoteId: noteId, kind: l.kind, target: l.target, anchor: l.anchor, state: "unresolved" }).run();
    for (const tag of parsed.tags) tx.insert(noteTags).values({ noteId, tag }).run();
    for (const alias of parsed.aliases) tx.insert(noteAliases).values({ noteId, alias, aliasKey: foldKey(alias) }).run();
    tx.update(notes).set({ title: parsed.title }).where(eq(notes.id, noteId)).run();

    let map = tx.select().from(notesFtsMap).where(eq(notesFtsMap.noteId, noteId)).get();
    if (!map) {
      tx.insert(notesFtsMap).values({ noteId }).run();
      map = tx.select().from(notesFtsMap).where(eq(notesFtsMap.noteId, noteId)).get()!;
    }
    sqlite.prepare("DELETE FROM notes_fts WHERE rowid = ?").run(map.rowid);
    sqlite.prepare("INSERT INTO notes_fts(rowid, title, body, raw_title, raw_body) VALUES (?, ?, ?, ?, ?)")
      .run(map.rowid, searchFold(parsed.title), searchFold(parsed.body), parsed.title, parsed.body);
  });
  return parsed;
}

/** Removes a missing note from search; its links and tags stay for when it comes back. */
export function unindexNote(db: Db, sqlite: Sqlite, noteId: string): void {
  const map = db.select().from(notesFtsMap).where(eq(notesFtsMap.noteId, noteId)).get();
  if (map) sqlite.prepare("DELETE FROM notes_fts WHERE rowid = ?").run(map.rowid);
}

const stripMd = (p: string) => p.replace(/\.md$/i, "");

/**
 * Resolves every link against present notes. Path-qualified targets match the full path;
 * bare names match a unique file name or alias; several candidates → ambiguous (never guessed).
 */
export function resolveLinks(db: Db): void {
  const present = db.select({ id: notes.id, path: notes.path }).from(notes).where(isNull(notes.missingSince)).all();
  const presentIds = new Set(present.map((n) => n.id));
  const byPath = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, id: string) => m.set(k, [...(m.get(k) ?? []), id]);
  for (const n of present) {
    add(byPath, foldKey(stripMd(n.path)), n.id);
    add(byName, foldKey(fileTitle(n.path)), n.id);
  }
  for (const a of db.select().from(noteAliases).all()) if (presentIds.has(a.noteId)) add(byName, a.aliasKey, a.noteId);
  const pathOf = new Map(present.map((n) => [n.id, n.path]));

  const links = db.select().from(noteLinks).all();
  db.transaction((tx) => {
    for (const l of links) {
      let state: string; let target: string | null = null;
      const raw = l.target.replace(/^\.\//, "");
      if (raw === "") { state = "self"; target = l.fromNoteId; }
      else {
        let candidates: string[];
        if (l.kind === "md" || l.kind === "md-embed") {
          const fromDir = posix.dirname(pathOf.get(l.fromNoteId) ?? "");
          candidates = byPath.get(foldKey(stripMd(posix.normalize(posix.join(fromDir, raw))))) ?? [];
        } else if (raw.includes("/")) {
          candidates = byPath.get(foldKey(stripMd(raw))) ?? [];
        } else {
          candidates = [...new Set(byName.get(foldKey(stripMd(raw))) ?? [])];
        }
        if (candidates.length === 1) { state = "resolved"; target = candidates[0]!; }
        else if (candidates.length > 1) state = "ambiguous";
        // An unmatched embed with a non-Markdown extension is an attachment, not a missing note.
        else state = (l.kind === "embed" || l.kind === "md-embed") && /\.[a-z0-9]{1,5}$/i.test(raw) && !/\.md$/i.test(raw) ? "file" : "unresolved";
      }
      if (state !== l.state || target !== l.targetNoteId) {
        tx.update(noteLinks).set({ state, targetNoteId: target }).where(eq(noteLinks.id, l.id)).run();
      }
    }
  });
}
