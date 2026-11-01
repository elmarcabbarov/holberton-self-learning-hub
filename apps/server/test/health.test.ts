import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HealthResponse } from "@hub/contracts";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";

describe("GET /api/health", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  it("returns a contract-valid payload with db ok", async () => {
    dir = mkdtempSync(join(tmpdir(), "hub-health-"));
    const app = await buildApp(loadConfig({ HUB_DATA: dir }));
    const res = await app.inject({ method: "GET", url: "/api/health", headers: { host: "127.0.0.1:3000" } });
    expect(res.statusCode).toBe(200);
    const body = HealthResponse.parse(res.json());
    expect(body.mode).toBe("local");
    expect(body.db).toBe("ok");
    await app.close();
  });
});

describe("GET /api/health when the database fails", () => {
  it("returns 503 with status degraded", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-health-down-"));
    const app = await buildApp(loadConfig({ HUB_DATA: dir }));
    app.database.close();
    const res = await app.inject({ method: "GET", url: "/api/health", headers: { host: "127.0.0.1:3000" } });
    expect(res.statusCode).toBe(503);
    const body = HealthResponse.parse(res.json());
    expect(body).toMatchObject({ status: "degraded", db: "error" });
    await app.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("loadConfig", () => {
  it("binds loopback by default", () => {
    expect(loadConfig({}).bindHost).toBe("127.0.0.1");
  });
  it("binds all interfaces inside the container (host publishes loopback only)", () => {
    expect(loadConfig({ HUB_IN_CONTAINER: "1" }).bindHost).toBe("0.0.0.0");
  });
  it("refuses a public bind in local mode", () => {
    expect(() => loadConfig({ HUB_BIND: "0.0.0.0" })).toThrow(/Refusing/);
  });
  it("rejects unknown modes", () => {
    expect(() => loadConfig({ HUB_MODE: "public" })).toThrow();
  });
});
