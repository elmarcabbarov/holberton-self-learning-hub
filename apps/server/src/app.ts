import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { HealthResponse } from "@hub/contracts";
import type { HubConfig } from "./config.ts";
import { openDatabase, pingDatabase, type DatabaseHandle } from "./lib/db/index.ts";

declare module "fastify" {
  interface FastifyInstance {
    database: DatabaseHandle;
  }
}

export async function buildApp(config: HubConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers.cookie", "req.headers.authorization"] },
  });

  const database = openDatabase(config.dataDir);
  app.decorate("database", database);
  app.addHook("onClose", async () => database.close());

  app.get("/api/health", async () => {
    // Responses are validated too (D-014).
    return HealthResponse.parse({
      status: "ok",
      version: config.version,
      mode: config.mode,
      db: pingDatabase(database.sqlite) ? "ok" : "error",
    });
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
