import type { FastifyInstance, FastifyReply } from "fastify";
import { FolderImportRequest, IdParam, IMPORT_LIMITS, ImportSources, VaultImport, ZipImportQuery } from "@hub/contracts";
import { ImportError } from "./read.ts";
import type { VaultImporter } from "./service.ts";

/** The only route that takes a non-JSON body (D-046 amendment, D-061). */
export const ZIP_IMPORT_PATH = "/api/vault/imports";

const err = (reply: FastifyReply, status: number, code: string, messageKey: string) => reply.code(status).send({ error: { code, messageKey } });
const notFound = (reply: FastifyReply) => err(reply, 404, "not_found", "errors.notFound");

function importError(reply: FastifyReply, e: unknown) {
  if (!(e instanceof ImportError)) throw e;
  const code = e.status === 413 ? "payload_too_large" : e.status === 409 ? "conflict" : e.status === 404 ? "not_found" : "validation_failed";
  return err(reply, e.status, code, `vaultImport.${e.reason}`);
}

export async function registerVaultImportRoutes(app: FastifyInstance, importer: VaultImporter): Promise<void> {
  app.get("/api/vault/import-sources", async () => ImportSources.parse(await importer.sources()));

  // Scoped stream parser: the body stays unread until the handler runs, i.e. after the session check
  // (preHandler). bodyLimit does not apply to it, so receiveUpload counts bytes itself.
  await app.register(async (scope) => {
    scope.addContentTypeParser("application/zip", (_req, payload, done) => done(null, payload));
    scope.post(ZIP_IMPORT_PATH, async (req, reply) => {
      if (req.headers["content-encoding"]) return err(reply, 415, "unsupported_media_type", "errors.unsupportedMediaType");
      if (Number(req.headers["content-length"] ?? "0") > IMPORT_LIMITS.uploadBytes) return err(reply, 413, "payload_too_large", "vaultImport.upload_too_large");
      const q = ZipImportQuery.safeParse(req.query ?? {});
      if (!q.success || !(req.headers["content-type"] ?? "").startsWith("application/zip")) return err(reply, 400, "validation_failed", "errors.validation");
      try {
        return reply.code(201).send(VaultImport.parse(await importer.previewZip(req.body as NodeJS.ReadableStream, q.data.name, q.data.prefix)));
      } catch (e) {
        return importError(reply, e);
      }
    });
  });

  app.post("/api/vault/imports/folder", async (req, reply) => {
    const body = FolderImportRequest.safeParse(req.body);
    if (!body.success) return err(reply, 400, "validation_failed", "errors.validation");
    try {
      return reply.code(201).send(VaultImport.parse(await importer.previewFolder(body.data.folder, body.data.prefix)));
    } catch (e) {
      return importError(reply, e);
    }
  });

  app.get("/api/vault/imports/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    const out = p.success ? importer.get(p.data.id) : undefined;
    return out ? VaultImport.parse(out) : notFound(reply);
  });

  app.post("/api/vault/imports/:id/commit", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const out = await importer.commit(p.data.id);
    if (out.kind === "not_found") return notFound(reply);
    if (out.kind === "expired") return err(reply, 410, "expired", "vaultImport.expired");
    if (out.kind === "conflict") return err(reply, 409, "conflict", "vaultImport.notOpen");
    return VaultImport.parse(out.import);
  });

  app.delete("/api/vault/imports/:id", async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success || !(await importer.cancel(p.data.id))) return notFound(reply);
    return reply.code(204).send();
  });
}
