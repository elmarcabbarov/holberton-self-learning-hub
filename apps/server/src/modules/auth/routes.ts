import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthStatus, BootstrapRequest } from "@hub/contracts";
import type { DatabaseHandle } from "../../lib/db/index.ts";
import { getMeta } from "../../lib/db/index.ts";
import { isCanonicalSecret } from "./crypto.ts";
import { checkSession, deleteSession, redeemBootstrapToken, SESSION_IDLE_MS } from "./store.ts";

const PUBLIC_API = new Set(["/api/health", "/api/auth/bootstrap", "/api/auth/status"]);
const FAILS_PER_MINUTE = 10;

declare module "fastify" {
  interface FastifyRequest { sessionId?: string }
}

export function sessionCookieName(database: DatabaseHandle): string {
  const id = getMeta(database.db, "instance_id") ?? "local";
  return `hub_sid_${id.replace(/-/g, "").slice(0, 8)}`;
}

export async function registerAuth(app: FastifyInstance, database: DatabaseHandle): Promise<void> {
  const cookieName = sessionCookieName(database);
  let windowStart = Date.now();
  let failures = 0;

  const cookieOptions = { httpOnly: true, sameSite: "strict" as const, path: "/" };

  /** Valid session id or undefined; refreshes the cookie whenever the server slides the expiry (D-045). */
  const currentSession = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const raw = req.cookies[cookieName];
    if (!isCanonicalSecret(raw)) return undefined;
    const check = checkSession(database.db, raw);
    if (!check.valid) return undefined;
    if (check.renewedMaxAgeSec !== undefined) reply.setCookie(cookieName, raw, { ...cookieOptions, maxAge: check.renewedMaxAgeSec });
    return raw;
  };

  // Every /api route except the public ones requires a valid session (D-046).
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0] ?? "";
    if (!(path === "/api" || path.startsWith("/api/")) || PUBLIC_API.has(path)) return;
    const sid = currentSession(req, reply);
    if (!sid) return reply.code(401).send({ error: { code: "unauthorized", messageKey: "errors.unauthorized" } });
    req.sessionId = sid;
  });

  app.get("/api/auth/status", async (req, reply) => AuthStatus.parse({ authenticated: currentSession(req, reply) !== undefined }));

  app.post("/api/auth/bootstrap", async (req, reply) => {
    const now = Date.now();
    if (now - windowStart > 60_000) { windowStart = now; failures = 0; }
    if (failures >= FAILS_PER_MINUTE) {
      return reply.code(429).send({ error: { code: "rate_limited", messageKey: "errors.rateLimited" } });
    }
    const parsed = BootstrapRequest.safeParse(req.body);
    const sid = parsed.success && isCanonicalSecret(parsed.data.token)
      ? redeemBootstrapToken(database.db, parsed.data.token)
      : null;
    if (!sid) {
      failures += 1;
      return reply.code(401).send({ error: { code: "invalid_token", messageKey: "errors.invalidToken" } });
    }
    reply.setCookie(cookieName, sid, { ...cookieOptions, maxAge: Math.floor(SESSION_IDLE_MS / 1000) });
    return AuthStatus.parse({ authenticated: true });
  });

  app.post("/api/auth/logout", async (req, reply) => {
    if (req.sessionId) deleteSession(database.db, req.sessionId);
    reply.clearCookie(cookieName, { path: "/" });
    return AuthStatus.parse({ authenticated: false });
  });
}
