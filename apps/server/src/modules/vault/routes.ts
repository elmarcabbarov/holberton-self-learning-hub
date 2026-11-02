import type { FastifyInstance, FastifyReply } from "fastify";
import { Backlinks, SavedNote, CreateNote, IdParam, NoteDetail, NoteList, NoteMeta, NoteSummary, SaveNote, SearchResults, VaultStatus } from "@hub/contracts";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import { backlinks, noteMeta, searchNotes } from "./search.ts";
import { z } from "zod";
import { PathError } from "../../lib/fs-safe/paths.ts";
import type { Vault } from "./service.ts";

type Row = ReturnType<Vault["list"]>[number];
const PAGE = 200;
/** 2M chars of UTF-8 text can be up to ~6 MB once JSON-escaped and encoded. */
const NOTE_BODY_LIMIT = 12 * 1024 * 1024;

const summary = (r: Row) => NoteSummary.parse({
  id: r.id, vault: r.vault, path: r.path, title: r.title, missing: r.missingSince !== null,
  readOnlyReason: r.vault === "linked" ? "linked" : (r.readOnlyReason as "invalid_utf8" | "mixed_eol" | null) ?? null, updatedAt: r.updatedAt,
});
/** Sort and cursor key across both vaults: hub notes first, then linked, each by path. */
const keyOf = (r: Row) => `${r.vault}:${r.path}`;
const err = (reply: FastifyReply, status: number, code: string, messageKey: string, details?: unknown) =>
  reply.code(status).send({ error: { code, messageKey, ...(details === undefined ? {} : { details }) } });

export async function registerVaultRoutes(app: FastifyInstance, vault: Vault, database: DatabaseHandle, linked: Vault | null = null): Promise<void> {
  const vaults = linked ? [vault, linked] : [vault];
  const allRows = () => vaults.flatMap((v) => v.list());
  /** The vault instance that owns a note id (ids are globally unique). */
  const owner = (id: string) => vaults.find((v) => v.get(id));

  app.get("/api/notes/search", async (req, reply) => {
    const q = z.object({ q: z.string().max(200) }).safeParse(req.query ?? {});
    if (!q.success) return err(reply, 400, "validation_failed", "errors.validation");
    return SearchResults.parse({ hits: searchNotes(database.sqlite, q.data.q, vaults.map((v) => v.name)) });
  });

  app.get("/api/notes/:id/backlinks", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success || !owner(p.data.id)) return err(reply, 404, "not_found", "errors.notFound");
    return Backlinks.parse({ links: backlinks(database.db, p.data.id) });
  });

  app.get("/api/notes/:id/meta", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success || !owner(p.data.id)) return err(reply, 404, "not_found", "errors.notFound");
    return NoteMeta.parse(noteMeta(database.db, p.data.id));
  });

  app.get("/api/notes", async (req, reply) => {
    const q = z.object({ cursor: z.string().max(600).optional() }).safeParse(req.query ?? {});
    if (!q.success) return err(reply, 400, "validation_failed", "errors.validation");
    const { cursor } = q.data;
    const rows = allRows().sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1)).filter((r) => cursor === undefined || keyOf(r) > cursor);
    const page = rows.slice(0, PAGE);
    return NoteList.parse({ notes: page.map(summary), nextCursor: rows.length > PAGE ? keyOf(page[page.length - 1]!) : null });
  });

  // Most recently changed present notes, for "Continue where you left off".
  app.get("/api/notes/recent", async (req, reply) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }).safeParse(req.query ?? {});
    if (!q.success) return err(reply, 400, "validation_failed", "errors.validation");
    const rows = allRows().filter((r) => !r.missingSince).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, q.data.limit);
    return NoteList.parse({ notes: rows.map(summary), nextCursor: null });
  });

  app.get("/api/vault/status", async () => VaultStatus.parse({
    lastReconcile: vault.lastReconcile, collisions: vault.collisions(),
    linked: linked ? { state: linked.state, notes: linked.list().filter((r) => !r.missingSince).length, lastReconcile: linked.lastReconcile, collisions: linked.collisions() } : null,
  }));

  // Accepts the folder now mounted as the linked vault's source (after a deliberate move, or an intentionally emptied vault).
  app.post("/api/vault/linked/rebind", async (_req, reply) => {
    if (!linked) return err(reply, 404, "not_found", "errors.notFound");
    await linked.rebind();
    return reply.code(204).send();
  });

  app.get("/api/notes/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return err(reply, 404, "not_found", "errors.notFound");
    try {
      const v = owner(p.data.id);
      if (v && v.state !== "ready") return err(reply, 503, "vault_unavailable", "notes.vaultUnavailable");
      const r = v ? await v.read(p.data.id) : null;
      if (!r) return err(reply, 404, "not_found", "errors.notFound");
      return NoteDetail.parse({ ...summary(r.note), content: r.text, version: r.version, eol: r.decoded.eol, bom: r.decoded.bom });
    } catch (e) {
      if (e instanceof PathError || (e as NodeJS.ErrnoException).code === "ENOENT") return err(reply, 404, "not_found", "errors.notFound");
      throw e;
    }
  });

  app.post("/api/notes", { bodyLimit: NOTE_BODY_LIMIT }, async (req, reply) => {
    const body = CreateNote.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = await vault.create(body.data.path, body.data.content);
    switch (out.kind) {
      case "created": return reply.code(201).send(SavedNote.parse({ ...summary(out.note), version: out.version }));
      case "exists": return err(reply, 409, "conflict", "notes.exists");
      case "collision": return err(reply, 409, "conflict", "notes.collision", { with: out.with });
      case "invalid": return err(reply, 400, "validation_failed", "notes.invalidPath", { reason: out.reason });
    }
  });

  app.put("/api/notes/:id", { bodyLimit: NOTE_BODY_LIMIT }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return err(reply, 404, "not_found", "errors.notFound");
    const body = SaveNote.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    const out = await (owner(p.data.id) ?? vault).save(p.data.id, body.data.content, body.data.expectedSha256);
    switch (out.kind) {
      case "saved": return SavedNote.parse({ ...summary(out.note), version: out.version });
      case "conflict": return err(reply, 409, "conflict", "notes.conflict", { current: out.current });
      case "read_only": return err(reply, 409, "read_only", "notes.readOnly", { reason: out.reason });
      case "not_found": return err(reply, 404, "not_found", "errors.notFound");
    }
  });
}
