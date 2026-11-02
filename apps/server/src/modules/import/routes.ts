import type { FastifyInstance } from "fastify";
import { ImportProjectRequest, ImportProjectResult } from "@hub/contracts";
import { eq } from "drizzle-orm";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import { cards as cardsTable, spaces, topics as topicsTable } from "../../lib/db/schema.ts";
import { createCard } from "../cards/service.ts";
import { createSpace, createTopic } from "../spaces/service.ts";
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
    if (body.data.note) {
      const base = body.data.note.path.replace(/\.md$/i, "");
      try {
        for (let i = 1; i <= 50 && !noteId; i++) {
          const path = i === 1 ? `${base}.md` : `${base} (${i}).md`;
          const out = await vault.create(path, body.data.note.content);
          if (out.kind === "created") { noteId = out.note.id; notePath = out.note.path; }
          else if (out.kind === "invalid") break;
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
      noteSkipped = noteId === null;
    }
    return reply.code(201).send(ImportProjectResult.parse({ spaceId, topics: body.data.topics.length, cards, noteId, notePath, noteSkipped }));
  });
}
