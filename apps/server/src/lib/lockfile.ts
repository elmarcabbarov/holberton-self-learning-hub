import Database from "better-sqlite3";

/**
 * One server per data directory (D-051), via an OS-level lock held by SQLite:
 * a dedicated lock database in EXCLUSIVE locking mode keeps its lock after the first write
 * until the connection closes. The OS drops it when the process dies, so there are no stale locks.
 * The main database is not locked this way, so the token CLI keeps working while the server runs.
 */
export async function acquireLock(path: string): Promise<() => Promise<void>> {
  const lockDb = new Database(path);
  try {
    lockDb.pragma("busy_timeout = 0");
    lockDb.pragma("locking_mode = EXCLUSIVE");
    lockDb.exec("BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS holder (pid INTEGER); DELETE FROM holder; INSERT INTO holder VALUES (" + Number(process.pid) + "); COMMIT;");
  } catch (err) {
    lockDb.close();
    if ((err as { code?: string }).code === "SQLITE_BUSY") {
      throw new Error("Another Hub server is using this data directory.", { cause: err });
    }
    throw err;
  }
  return async () => { lockDb.close(); };
}
