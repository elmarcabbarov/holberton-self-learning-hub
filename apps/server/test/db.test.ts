import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupDatabase, getMeta, openDatabase, pingDatabase } from "../src/lib/db/index.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "hub-db-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("openDatabase", () => {
  it("creates the database with WAL, foreign keys and busy timeout", () => {
    const h = openDatabase(dir);
    expect(h.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(h.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(h.sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(pingDatabase(h.sqlite)).toBe(true);
    h.close();
  });

  it("applies migrations idempotently and keeps the instance id across reopen", () => {
    const first = openDatabase(dir);
    const id = getMeta(first.db, "instance_id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    first.close();

    const second = openDatabase(dir);
    expect(getMeta(second.db, "instance_id")).toBe(id);
    const applied = second.sqlite.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get() as { n: number };
    const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: unknown[] };
    expect(applied.n).toBe(journal.entries.length);
    second.close();
  });

  it("reports a closed database as not ok", () => {
    const h = openDatabase(dir);
    h.close();
    expect(pingDatabase(h.sqlite)).toBe(false);
  });
});

describe("backupDatabase", () => {
  it("produces an openable copy with the same data while the source stays open", async () => {
    const h = openDatabase(dir);
    const id = getMeta(h.db, "instance_id");
    const dest = join(dir, "backup.db");
    await backupDatabase(h.sqlite, dest);

    const copy = new Database(dest, { readonly: true });
    const row = copy.prepare("SELECT value FROM app_meta WHERE key = 'instance_id'").get() as { value: string };
    expect(row.value).toBe(id);
    expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
    copy.close();
    h.close();
  });
});
