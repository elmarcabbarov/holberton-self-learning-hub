import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { checkSession, createBootstrapToken, redeemBootstrapToken, touchSession, SESSION_ABSOLUTE_MS } from "../src/modules/auth/store.ts";
import { sessionCookieName } from "../src/modules/auth/routes.ts";

const HOST = "127.0.0.1:3000";
const ORIGIN = `http://${HOST}`;
let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "hub-auth-"));
  app = await buildApp(loadConfig({ HUB_DATA: dir }));
});
afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const json = { host: HOST, origin: ORIGIN, "content-type": "application/json" };

async function signIn(): Promise<string> {
  const token = createBootstrapToken(app.database.db);
  const res = await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers: json, payload: { token } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === sessionCookieName(app.database));
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  return `${cookie!.name}=${cookie!.value}`;
}

describe("host guard (DNS rebinding)", () => {
  it("rejects an unknown Host with 403", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health", headers: { host: "evil.example:3000" } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("forbidden_host");
  });
  it("rejects the right hostname on a wrong port", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health", headers: { host: "127.0.0.1:9999" } });
    expect(res.statusCode).toBe(403);
  });
  it("accepts localhost and 127.0.0.1 on the configured port", async () => {
    for (const host of ["127.0.0.1:3000", "localhost:3000"]) {
      const res = await app.inject({ method: "GET", url: "/api/health", headers: { host } });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe("session requirement", () => {
  it("returns 401 for protected API routes without a session", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/logout", headers: json, payload: {} });
    expect(res.statusCode).toBe(401);
  });
  it("reports unauthenticated status", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/status", headers: { host: HOST } });
    expect(res.json()).toEqual({ authenticated: false });
  });
});

describe("bootstrap", () => {
  it("exchanges a valid token for a session exactly once", async () => {
    const token = createBootstrapToken(app.database.db);
    const first = await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers: json, payload: { token } });
    expect(first.statusCode).toBe(200);
    const again = await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers: json, payload: { token } });
    expect(again.statusCode).toBe(401);
    expect(again.json().error.code).toBe("invalid_token");
  });
  it("returns the same error for unknown, malformed and expired tokens", async () => {
    const expired = createBootstrapToken(app.database.db, Date.now() - 11 * 60_000);
    for (const token of ["A".repeat(43), "short", expired]) {
      const res = await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers: json, payload: { token } });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("invalid_token");
    }
  });
  it("rate-limits repeated failures", async () => {
    for (let i = 0; i < 10; i++) {
      await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers: json, payload: { token: "A".repeat(43) } });
    }
    const res = await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers: json, payload: { token: createBootstrapToken(app.database.db) } });
    expect(res.statusCode).toBe(429);
  });
  it("the authenticated status and logout work with the cookie", async () => {
    const cookie = await signIn();
    const status = await app.inject({ method: "GET", url: "/api/auth/status", headers: { host: HOST, cookie } });
    expect(status.json()).toEqual({ authenticated: true });
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { ...json, cookie }, payload: {} });
    expect(out.statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url: "/api/auth/status", headers: { host: HOST, cookie } });
    expect(after.json()).toEqual({ authenticated: false });
  });
});

describe("CSRF guards on unsafe methods", () => {
  it("rejects a missing Origin", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers: { host: HOST, "content-type": "application/json" }, payload: { token: "x" } });
    expect(res.statusCode).toBe(403);
  });
  it("rejects a foreign or null Origin", async () => {
    for (const origin of ["http://evil.example", "null", "http://localhost:3000"]) {
      const res = await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers: { ...json, origin }, payload: { token: "x" } });
      expect(res.statusCode).toBe(403);
    }
  });
  it("rejects Sec-Fetch-Site: cross-site even on GET", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/status", headers: { host: HOST, "sec-fetch-site": "cross-site" } });
    expect(res.statusCode).toBe(403);
  });
  it("rejects non-JSON bodies with 415", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers: { host: HOST, origin: ORIGIN, "content-type": "text/plain" }, payload: "token=x" });
    expect(res.statusCode).toBe(415);
  });
});

describe("security headers", () => {
  it("sets CSP, nosniff, no-referrer and no-store on API responses", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health", headers: { host: HOST } });
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("session store", () => {
  it("sessions survive a server restart", async () => {
    const cookie = await signIn();
    await app.close();
    app = await buildApp(loadConfig({ HUB_DATA: dir }));
    const res = await app.inject({ method: "GET", url: "/api/auth/status", headers: { host: HOST, cookie } });
    expect(res.json()).toEqual({ authenticated: true });
  });
  it("expires sessions at the absolute limit even when active", () => {
    const now = Date.now();
    const sid = redeemBootstrapToken(app.database.db, createBootstrapToken(app.database.db, now), now)!;
    expect(touchSession(app.database.db, sid, now + 1000)).toBe(true);
    expect(touchSession(app.database.db, sid, now + SESSION_ABSOLUTE_MS + 1)).toBe(false);
  });
});

describe("sliding cookie", () => {
  it("asks for a cookie refresh when the expiry slides, capped by the absolute limit", () => {
    const now = Date.now();
    const sid = redeemBootstrapToken(app.database.db, createBootstrapToken(app.database.db, now), now)!;
    expect(checkSession(app.database.db, sid, now + 10_000)).toEqual({ valid: true });
    const later = checkSession(app.database.db, sid, now + 2 * 60_000);
    expect(later.valid && later.renewedMaxAgeSec).toBeGreaterThan(29 * 24 * 3600);
    // Stay active (touch every 29 days) until one hour before the absolute limit.
    const day = 24 * 3600_000;
    for (const d of [29, 58, 87]) expect(checkSession(app.database.db, sid, now + d * day).valid).toBe(true);
    const nearEnd = checkSession(app.database.db, sid, now + SESSION_ABSOLUTE_MS - 3600_000);
    expect(nearEnd.valid && nearEnd.renewedMaxAgeSec).toBeLessThanOrEqual(3600);
  });
});

describe("remapped public port", () => {
  it("accepts the published port from HUB_PUBLIC_PORT", async () => {
    const remapped = await buildApp(loadConfig({ HUB_DATA: mkdtempSync(join(tmpdir(), "hub-auth-pp-")), HUB_PUBLIC_PORT: "8080" }));
    const res = await remapped.inject({ method: "GET", url: "/api/health", headers: { host: "127.0.0.1:8080" } });
    expect(res.statusCode).toBe(200);
    await remapped.close();
  });
});
