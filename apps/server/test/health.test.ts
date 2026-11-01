import { describe, expect, it } from "vitest";
import { HealthResponse } from "@hub/contracts";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";

describe("GET /api/health", () => {
  it("returns a contract-valid payload", async () => {
    const app = await buildApp(loadConfig({ HUB_DATA: "/tmp/hub-test" }));
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json()).mode).toBe("local");
    await app.close();
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
