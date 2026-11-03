import type { FastifyInstance } from "fastify";
import { ImportProjectRequest, ImportProjectResult } from "@hub/contracts";
import { and, eq, isNull } from "drizzle-orm";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import { cards as cardsTable, spaces, topics as topicsTable } from "../../lib/db/schema.ts";
import { createCard } from "../cards/service.ts";
import { createSpace, createTopic } from "../spaces/service.ts";
import { linkNoteToSpace } from "../goals/service.ts";
import type { Vault } from "../vault/service.ts";

/**
 * Imports a parsed Holberton project (HSLH-024): space, topics and self-check cards in one transaction,
 * then the project note in the vault (a taken path gets a numeric suffix; the note is never overwritten).
 */
export async function registerImportRoutes(app: FastifyInstance, database: DatabaseHandle, vault: Vault): Promise<void> {
  app.post("/api/import/project", async (req, reply) => {
    const body = ImportProjectRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: { code: "validation_failed", messageKey: "errors.validation" } });
    const { db } = database;
    const { spaceId, cards } = db.transaction(() => {
      const space = createSpace(db, { name: body.data.spaceName, description: "" });
      db.update(spaces).set({ tutorMode: "project" }).where(eq(spaces.id, space.id)).run();
      let n = 0;
      for (const t of body.data.topics) {
        const topic = createTopic(db, space.id, { name: t.name });
        if (!topic) throw new Error("topic creation failed");
        for (const c of t.cards) {
          const out = createCard(db, { topicId: topic.id, noteId: null, front: c.front, back: c.back });
          if (out.kind !== "created") throw new Error("card creation failed");
          n++;
        }
      }
      return { spaceId: space.id, cards: n };
    }, { behavior: "immediate" });

    let noteId: string | null = null; let notePath: string | null = null; let noteSkipped = false;
    let taskNotes = 0; let taskNotesSkipped = 0;
    /** Creates the file under a free name (numeric suffix; never overwrites) and links it to the new space (HSLH-028). */
    const createLinked = async (note: { path: string; content: string }) => {
      const base = note.path.replace(/\.md$/i, "");
      for (let i = 1; i <= 50; i++) {
        const out = await vault.create(i === 1 ? `${base}.md` : `${base} (${i}).md`, note.content);
        if (out.kind === "created") {
          linkNoteToSpace(db, out.note.id, spaceId);
          // The first note decides the space's folder, so notes created later from the space land next to it.
          db.update(spaces).set({ noteFolder: out.note.path.slice(0, Math.max(0, out.note.path.lastIndexOf("/"))) || null })
            .where(and(eq(spaces.id, spaceId), isNull(spaces.noteFolder))).run();
          return out.note;
        }
        if (out.kind === "invalid") return null;
      }
      return null;
    };
    if (body.data.note || body.data.taskNotes.length > 0) {
      try {
        if (body.data.note) {
          const note = await createLinked(body.data.note);
          if (note) { noteId = note.id; notePath = note.path; }
        }
        for (const task of body.data.taskNotes) {
          if (await createLinked(task)) taskNotes++; else taskNotesSkipped++;
        }
      } catch (e) {
        // Writing the note failed (e.g. disk full): undo the database part so a retry starts clean.
        db.transaction(() => {
          const topicIds = db.select({ id: topicsTable.id }).from(topicsTable).where(eq(topicsTable.spaceId, spaceId)).all().map((r) => r.id);
          for (const id of topicIds) db.delete(cardsTable).where(eq(cardsTable.topicId, id)).run();
          db.delete(topicsTable).where(eq(topicsTable.spaceId, spaceId)).run();
          db.delete(spaces).where(eq(spaces.id, spaceId)).run();
        }, { behavior: "immediate" });
        throw e;
      }
      noteSkipped = body.data.note !== null && noteId === null;
    }
    return reply.code(201).send(ImportProjectResult.parse({ spaceId, topics: body.data.topics.length, cards, noteId, notePath, noteSkipped, taskNotes, taskNotesSkipped }));
  });
}
