import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { HubConfig } from "../../config.ts";
import { ZIP_IMPORT_PATH } from "../vault-import/routes.ts";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const VITE_DEV_PORT = 5173;

/** Exact `host:port` authorities a browser may use to reach this instance (D-046). */
export function allowedAuthorities(config: HubConfig): Set<string> {
  const ports = new Set([config.port, config.publicPort]);
  if (config.dev) ports.add(VITE_DEV_PORT);
  const out = new Set<string>();
  for (const port of ports) for (const host of ["127.0.0.1", "localhost"]) out.add(`${host}:${port}`);
  return out;
}

function reject(reply: FastifyReply, status: number, code: string, messageKey: string) {
  return reply.code(status).header("cache-control", "no-store").send({ error: { code, messageKey } });
}

/**
 * Request guards that run before routing, static files and SPA fallback:
 * Host allowlist (DNS rebinding), Origin + Sec-Fetch-Site on unsafe methods (CSRF), JSON-only bodies.
 */
export function registerGuards(app: FastifyInstance, config: HubConfig): void {
  const authorities = allowedAuthorities(config);

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const rawHost = req.headers.host;
    if (typeof rawHost !== "string" || !authorities.has(rawHost.toLowerCase())) {
      return reject(reply, 403, "forbidden_host", "errors.forbiddenHost");
    }

    if (req.headers["sec-fetch-site"] === "cross-site") {
      return reject(reply, 403, "forbidden_origin", "errors.forbiddenOrigin");
    }

    if (UNSAFE.has(req.method)) {
      const origin = req.headers.origin;
      if (origin !== `http://${rawHost.toLowerCase()}`) {
        return reject(reply, 403, "forbidden_origin", "errors.forbiddenOrigin");
      }
      const length = Number(req.headers["content-length"] ?? "0");
      const type = req.headers["content-type"] ?? "";
      // One exception: the zip upload of a vault import (D-061), on exactly that path and method.
      const zipUpload = req.method === "POST" && req.url.split("?")[0] === ZIP_IMPORT_PATH && /^application\/zip$/i.test(type);
      if ((length > 0 || req.headers["transfer-encoding"]) && !zipUpload && !/^application\/json(;|$)/i.test(type)) {
        return reject(reply, 415, "unsupported_media_type", "errors.unsupportedMediaType");
      }
    }
  });

  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    reply.header("content-security-policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.url.startsWith("/api")) reply.header("cache-control", "no-store");
    return payload;
  });
}
