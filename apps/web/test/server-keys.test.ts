import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/en.json";

/** Every messageKey the server can emit must exist in the locales (parity covers en↔az). */
function serverSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? serverSources(p) : p.endsWith(".ts") ? [p] : [];
  });
}

function has(obj: unknown, key: string): boolean {
  return key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj) !== undefined;
}

describe("server message keys", () => {
  it("are all translated", () => {
    const root = join(import.meta.dirname, "../../server/src");
    const keys = new Set<string>();
    for (const file of serverSources(root)) {
      for (const m of readFileSync(file, "utf8").matchAll(/messageKey: "([a-zA-Z.]+)"|"(errors|notes|auth)\.[a-zA-Z]+"/g)) {
        const k = m[1] ?? m[0].slice(1, -1);
        keys.add(k);
      }
    }
    const missing = [...keys].filter((k) => !has(en, k));
    expect(missing).toEqual([]);
  });
});
