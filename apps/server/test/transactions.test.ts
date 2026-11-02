import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith(".ts") ? [p] : [];
  });
}

/** Text of each `.transaction(...)` call, with balanced parentheses. */
function transactionCalls(src: string): string[] {
  const calls: string[] = [];
  for (const m of src.matchAll(/\.transaction\(/g)) {
    let depth = 1; let i = m.index + m[0].length;
    while (depth > 0 && i < src.length) { const c = src[i++]; if (c === "(") depth++; else if (c === ")") depth--; }
    calls.push(src.slice(m.index, i));
  }
  return calls;
}

describe("SQLite transactions", () => {
  // A DEFERRED transaction that reads and then writes fails at once with SQLITE_BUSY when another
  // process (the token CLI, D-047) committed in between; busy_timeout does not help there (#33, D-060).
  it("all take the write lock up front (BEGIN IMMEDIATE)", () => {
    const root = join(import.meta.dirname, "../src");
    const deferred = sources(root).flatMap((f) => transactionCalls(readFileSync(f, "utf8"))
      .filter((call) => !/behavior: "immediate"|\bIMMEDIATE\)$/.test(call))
      .map((call) => `${f.slice(root.length + 1)}: ${call.slice(0, 60)}`));
    expect(deferred).toEqual([]);
  });
});
