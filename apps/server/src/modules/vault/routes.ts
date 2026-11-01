import type { FastifyInstance, FastifyReply } from "fastify";
import { CreateNote, IdParam, NoteDetail, NoteList, NoteSummary, SaveNote, VaultStatus } from "@hub/contracts";
import { z } from "zod";
import { PathError } from "../../lib/fs-safe/paths.ts";
import type { Vault } from "./service.ts";

type Row = ReturnType<Vault["list"]>[number];
const PAGE = 200;

const summary = (r: Row) => NoteSummary.parse({
  id: r.id, path: r.path, title: r.title, missing: r.missingSince !== null,
  readOnlyReason: (r.readOnlyReason as "invalid_utf8" | "mixed_eol" | null) ?? null, updatedAt: r.updatedAt,
});
const err = (reply: FastifyReply, status: number, code: string, messageKey: string, details?: unknown) =>
  reply.code(status).send({ error: { code, messageKey, ...(details === undefined ? {} : { details }) } });

export async function registerVaultRoutes(app: FastifyInstance, vault: Vault): Promise<void> {
  app.get("/api/notes", async (req) => {
    const { cursor } = z.object({ cursor: z.string().max(600).optional() }).parse(req.query ?? {});
    const rows = vault.list().filter((r) => cursor === undefined || r.path > cursor);
    const page = rows.slice(0, PAGE);
    return NoteList.parse({ notes: page.map(summary), nextCursor: rows.length > PAGE ? page[page.length - 1]!.path : null });
  });

  app.get("/api/vault/status", async () => VaultStatus.parse({ lastReconcile: vault.lastReconcile, collisions: vault.collisions() }));

  app.get("/api/notes/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return err(reply, 404, "not_found", "errors.notFound");
    try {
      const r = await vault.read(p.data.id);
      if (!r) return err(reply, 404, "not_found", "errors.notFound");
      return NoteDetail.parse({ ...summary(r.note), content: r.text, version: r.version, eol: r.decoded.eol, bom: r.decoded.bom });
    } catch (e) {
      if (e instanceof PathError || (e as NodeJS.ErrnoException).code === "ENOENT") return err(reply, 404, "not_found", "errors.notFound");
      throw e;
    }
  });

  app.post("/api/notes", async (req, reply) => {
    const body = CreateNote.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = await vault.create(body.data.path, body.data.content);
    switch (out.kind) {
      case "created": return reply.code(201).send(summary(out.note));
      case "exists": return err(reply, 409, "conflict", "notes.exists");
      case "collision": return err(reply, 409, "conflict", "notes.collision", { with: out.with });
      case "invalid": return err(reply, 400, "validation_failed", "notes.invalidPath", { reason: out.reason });
    }
  });

  app.put("/api/notes/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return err(reply, 404, "not_found", "errors.notFound");
    const body = SaveNote.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = await vault.save(p.data.id, body.data.content, body.data.expectedSha256);
    switch (out.kind) {
      case "saved": return summary(out.note);
      case "conflict": return err(reply, 409, "conflict", "notes.conflict", { current: out.current });
      case "read_only": return err(reply, 409, "read_only", "notes.readOnly", { reason: out.reason });
      case "not_found": return err(reply, 404, "not_found", "errors.notFound");
    }
  });
}
