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
import { join } from "node:path";
import { acquireLock } from "./lib/lockfile.ts";
import { Vault } from "./modules/vault/service.ts";
import { registerVaultRoutes } from "./modules/vault/routes.ts";
import { startWatching } from "./modules/vault/watcher.ts";

declare module "fastify" {
  interface FastifyInstance {
    database: DatabaseHandle;
    vault: Vault;
  }
}

export async function buildApp(config: HubConfig): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: false,
    logger: { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers.cookie", "req.headers.authorization"] },
  });

  const database = openDatabase(config.dataDir);
  const releaseLock = await acquireLock(join(config.dataDir, "data", "hub.lock.db")).catch((e) => { database.close(); throw e; });
  app.decorate("database", database);

  const vault = new Vault(database.db, join(config.dataDir, "vault"));
  await vault.init();
  app.decorate("vault", vault);
  const stopWatching = config.watchVault
    ? startWatching(vault, { polling: config.vaultPolling, log: (m) => app.log.warn(m) })
    : async () => undefined;

  // Shutdown order: watcher → pending vault work → database → lock.
  app.addHook("onClose", async () => {
    await stopWatching();
    await vault.idle();
    database.close();
    await releaseLock();
  });
  pruneAuth(database.db);

  registerGuards(app, config);
  await app.register(fastifyCookie);
  await registerAuth(app, database);
  await registerSpaceRoutes(app, database);
  await registerVaultRoutes(app, vault);

  // Framework errors (body too large, bad JSON) use the same contract envelope as route errors.
  app.setErrorHandler((error: { statusCode?: number; code?: string }, req, reply) => {
    const status = error.statusCode ?? 500;
    if (status === 413) return reply.code(413).send({ error: { code: "payload_too_large", messageKey: "errors.payloadTooLarge" } });
    if (status >= 400 && status < 500) return reply.code(status).send({ error: { code: "validation_failed", messageKey: "errors.validation" } });
    req.log.error(error);
    return reply.code(500).send({ error: { code: "internal", messageKey: "errors.internal" } });
  });

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
