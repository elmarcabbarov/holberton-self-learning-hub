import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireLock } from "../src/lib/lockfile.ts";

describe("acquireLock", () => {
  it("lets exactly one of two simultaneous callers win, and frees the lock on release", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-lock-"));
    const path = join(dir, "hub.lock.db");
    const results = await Promise.allSettled([acquireLock(path), acquireLock(path)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const winner = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<() => Promise<void>>;
    await winner.value();
    const again = await acquireLock(path);
    await again();
    rmSync(dir, { recursive: true, force: true });
  });
});
