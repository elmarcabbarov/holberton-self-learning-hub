import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { BackupCreated, BackupList } from "@hub/contracts";
import { z } from "zod";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import type { Vault } from "../vault/service.ts";
import { createBackup, listBackups } from "./create.ts";
import { BACKUP_NAME } from "./manifest.ts";

export async function registerBackupRoutes(app: FastifyInstance, opts: { database: DatabaseHandle; vault: Vault; dataDir: string; appVersion: string }) {
  app.get("/api/backups", async () => BackupList.parse({ backups: await listBackups(opts.dataDir) }));

  app.post("/api/backups", async (_req, reply) => {
    const r = await createBackup(opts);
    return reply.code(201).send(BackupCreated.parse({ name: r.name, counts: r.manifest.counts, files: r.manifest.files.length }));
  });

  app.get("/api/backups/:name", async (req, reply) => {
    const p = z.object({ name: z.string().regex(BACKUP_NAME) }).safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: { code: "not_found", messageKey: "errors.notFound" } });
    const backups = await listBackups(opts.dataDir);
    if (!backups.some((b) => b.name === p.data.name)) return reply.code(404).send({ error: { code: "not_found", messageKey: "errors.notFound" } });
    return reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="${p.data.name}"`)
      .send(createReadStream(join(opts.dataDir, "backups", p.data.name)));
  });
}
