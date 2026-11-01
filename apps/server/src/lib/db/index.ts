import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.ts";

export type Db = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  sqlite: Database.Database;
  db: Db;
  path: string;
  close(): void;
}

const MIGRATIONS = fileURLToPath(new URL("../../../drizzle", import.meta.url));

/**
 * Opens (or creates) the Hub database under `dataDir` and applies pending migrations.
 * Pragmas follow ADR-003: WAL, foreign keys, busy timeout.
 */
export function openDatabase(dataDir: string): DatabaseHandle {
  const dir = join(dataDir, "data");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "hub.db");
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  // FULL: journal commits must survive power loss before files change (D-049).
  sqlite.pragma("synchronous = FULL");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  ensureInstanceMeta(db);

  return { sqlite, db, path, close: () => sqlite.close() };
}

function ensureInstanceMeta(db: Db): void {
  const now = new Date().toISOString();
  db.insert(schema.appMeta).values([
    { key: "instance_id", value: randomUUID() },
    { key: "created_at", value: now },
  ]).onConflictDoNothing().run();
}

export function getMeta(db: Db, key: string): string | undefined {
  return db.select().from(schema.appMeta).where(eq(schema.appMeta.key, key)).get()?.value;
}

/** True when the database answers a trivial query. */
export function pingDatabase(sqlite: Database.Database): boolean {
  try {
    return sqlite.prepare("SELECT 1 AS ok").get() !== undefined;
  } catch {
    return false;
  }
}

/**
 * Consistent online copy via SQLite's backup API (never a raw file copy, ADR-003).
 * Safe while the app keeps writing.
 */
export async function backupDatabase(sqlite: Database.Database, destination: string): Promise<void> {
  await sqlite.backup(destination);
}
