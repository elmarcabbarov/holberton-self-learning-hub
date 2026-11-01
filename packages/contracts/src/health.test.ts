import { describe, expect, it } from "vitest";
import { HealthResponse } from "./health.ts";

describe("HealthResponse", () => {
  it("accepts a valid payload", () => {
    expect(HealthResponse.parse({ status: "ok", version: "0.0.0", mode: "local", db: "ok" })).toBeTruthy();
  });
  it("rejects an unknown mode", () => {
    expect(() => HealthResponse.parse({ status: "ok", version: "0", mode: "public", db: "ok" })).toThrow();
  });
});
