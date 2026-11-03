import { and, eq, isNull } from "drizzle-orm";
import { noteFileName, type CreateSpaceNote } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import { spaces, topics } from "../../lib/db/schema.ts";
import type { Vault } from "../vault/service.ts";
import { linkNoteToSpace } from "./service.ts";

/**
 * The vault folder for a space's new notes (HSLH-028). Set once, on first use: `Holberton/<project>` for imported
 * projects (set by the import), `Spaces/<space name>` otherwise. Renaming the space later moves nothing.
 */
export function spaceFolder(db: Db, spaceId: string, name: string): string {
  db.update(spaces).set({ noteFolder: `Spaces/${noteFileName(name)}` }).where(and(eq(spaces.id, spaceId), isNull(spaces.noteFolder))).run();
  return db.select({ f: spaces.noteFolder }).from(spaces).where(eq(spaces.id, spaceId)).get()!.f!;
}

export type CreateSpaceNoteOutcome =
  | { kind: "created"; noteId: string; path: string }
  | { kind: "not_found" } | { kind: "archived" } | { kind: "bad_topic" } | { kind: "invalid" } | { kind: "taken" };

/**
 * Creates `<folder>/<title>.md` in the Hub vault (a taken name gets a numeric suffix, never overwritten) and links it to
 * the space. The file comes first: if linking fails afterwards the note still exists and can be linked from the editor.
 */
export async function createSpaceNote(db: Db, vault: Vault, spaceId: string, input: CreateSpaceNote): Promise<CreateSpaceNoteOutcome> {
  const space = db.select().from(spaces).where(eq(spaces.id, spaceId)).get();
  if (!space) return { kind: "not_found" };
  if (space.archivedAt) return { kind: "archived" };
  if (input.topicId && !db.select().from(topics).where(and(eq(topics.id, input.topicId), eq(topics.spaceId, spaceId), isNull(topics.archivedAt))).get()) {
    return { kind: "bad_topic" };
  }
  const base = `${spaceFolder(db, spaceId, space.name)}/${noteFileName(input.title)}`;
  for (let i = 1; i <= 50; i++) {
    const out = await vault.create(i === 1 ? `${base}.md` : `${base} (${i}).md`, `# ${input.title}\n`);
    if (out.kind === "created") {
      linkNoteToSpace(db, out.note.id, spaceId, input.topicId);
      return { kind: "created", noteId: out.note.id, path: out.note.path };
    }
    if (out.kind === "invalid") return { kind: "invalid" };
  }
  return { kind: "taken" };
}
