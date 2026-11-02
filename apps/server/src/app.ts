import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { existsSync } from "node:fs";
import { HealthResponse } from "@hub/contracts";
import type { HubConfig } from "./config.ts";
import { openDatabase, pingDatabase, type DatabaseHandle } from "./lib/db/index.ts";
import { registerGuards } from "./modules/auth/guard.ts";
import { registerAuth } from "./modules/auth/routes.ts";
import { pruneAuth } from "./modules/auth/store.ts";
import { registerSpaceRoutes } from "./modules/spaces/routes.ts";
import { registerCardRoutes } from "./modules/cards/routes.ts";
import { registerBackupRoutes } from "./modules/backup/routes.ts";
import { registerImportRoutes } from "./modules/import/routes.ts";
import { registerQuizRoutes } from "./modules/quizzes/routes.ts";
import { restorePending } from "./modules/backup/restore.ts";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";
import { acquireLock } from "./lib/lockfile.ts";
import { Vault } from "./modules/vault/service.ts";
import { registerVaultRoutes } from "./modules/vault/routes.ts";
import { startWatching } from "./modules/vault/watcher.ts";
import { VaultImporter } from "./modules/vault-import/service.ts";
import { registerVaultImportRoutes } from "./modules/vault-import/routes.ts";

declare module "fastify" {
  interface FastifyInstance {
    database: DatabaseHandle;
    vault: Vault;
    linkedVault: Vault | null;
  }
}

export async function buildApp(config: HubConfig): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: false,
    logger: { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers.cookie", "req.headers.authorization"] },
  });

  // The linked vault is read-only and must never overlap a folder the Hub writes to (D-062).
  // Checked before anything opens, creates or cleans files under the data folder.
  if (config.linkedVault && await overlaps(config.linkedVault, config.dataDir)) {
    throw new Error("HUB_LINKED_VAULT must not overlap the Hub data folder.");
  }
  if (await restorePending(config.dataDir)) {
    throw new Error("A restore did not finish. Run the restore command again before starting the Hub.");
  }
  const database = openDatabase(config.dataDir);
  const releaseLock = await acquireLock(join(config.dataDir, "data", "hub.lock.db")).catch((e) => { database.close(); throw e; });
  app.decorate("database", database);

  const vault = new Vault(database.db, join(config.dataDir, "vault"), database.sqlite);
  await vault.init();
  app.decorate("vault", vault);
  const importer = new VaultImporter(database.db, vault, config.dataDir, config.importDir);
  await importer.init();
  let linked: Vault | null = null;
  if (config.linkedVault) {
    linked = new Vault(database.db, config.linkedVault, database.sqlite, { name: "linked", readOnly: true });
    await linked.init();
  }
  app.decorate("linkedVault", linked);
  const watch = (v: Vault) => (config.watchVault
    ? startWatching(v, { polling: config.vaultPolling, log: (m) => app.log.warn(`${v.name} vault: ${m}`) })
    : async () => undefined);
  const stopHub = watch(vault);
  const stopLinked = linked ? watch(linked) : async () => undefined;
  const stopWatching = async () => { await stopHub(); await stopLinked(); };

  // Shutdown order: watcher → pending vault work → database → lock.
  app.addHook("onClose", async () => {
    await stopWatching();
    await vault.idle();
    await linked?.idle();
    database.close();
    await releaseLock();
  });
  pruneAuth(database.db);

  // Set before any route or plugin registers: an awaited register builds the routes declared so far.
  // Framework errors (body too large, bad JSON) use the same contract envelope as route errors.
  app.setErrorHandler((error: { statusCode?: number; code?: string }, req, reply) => {
    const status = error.statusCode ?? 500;
    if (status === 413) return reply.code(413).send({ error: { code: "payload_too_large", messageKey: "errors.payloadTooLarge" } });
    if (status >= 400 && status < 500) return reply.code(status).send({ error: { code: "validation_failed", messageKey: "errors.validation" } });
    req.log.error(error);
    return reply.code(500).send({ error: { code: "internal", messageKey: "errors.internal" } });
  });

  registerGuards(app, config);
  await app.register(fastifyCookie);
  await registerAuth(app, database);
  await registerSpaceRoutes(app, database);
  await registerCardRoutes(app, database);
  await registerQuizRoutes(app, database);
  await registerImportRoutes(app, database, vault);
  await registerBackupRoutes(app, { database, vault, dataDir: config.dataDir, appVersion: config.version });
  await registerVaultRoutes(app, vault, database, linked);
  await registerVaultImportRoutes(app, importer);

  app.get("/api/health", async (_req, reply) => {
    const dbOk = pingDatabase(database.sqlite);
    // Responses are validated too (D-014). Unhealthy → 503 so Docker and clients notice.
    const body = HealthResponse.parse({
      status: dbOk ? "ok" : "degraded",
      version: config.version,
      mode: config.mode,
      db: dbOk ? "ok" : "error",
    });
    return reply.code(dbOk ? 200 : 503).send(body);
  });

  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    // SPA fallback for client-side routes; API paths stay 404.
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split("?")[0] ?? "";
      if (path === "/api" || path.startsWith("/api/")) return reply.code(404).send({ error: { code: "not_found", messageKey: "errors.notFound" } });
      return reply.sendFile("index.html");
    });
  }

  return app;
}

/** True when one path contains the other, compared after resolving symlinks where the path exists. */
async function overlaps(a: string, b: string): Promise<boolean> {
  const real = async (p: string) => realpath(p).catch(() => resolve(p));
  const [x, y] = [await real(a), await real(b)];
  // By path component: a child named `..hub` is inside; only `..` itself or `../…` is outside.
  const inside = (p: string, q: string) => { const r = relative(q, p); return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };
  return inside(x, y) || inside(y, x);
}
