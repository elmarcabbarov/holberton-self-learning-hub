import { constants } from "node:fs";
import { open, readFile, unlink } from "node:fs/promises";

/** Locks held by this process right now (absolute paths). */
const held = new Set<string>();

function alive(pid: number, path: string): boolean {
  // Same PID but not held by us: stale lock from an earlier run (e.g. PID 1 in a restarted container).
  if (pid === process.pid) return held.has(path);
  try { process.kill(pid, 0); return true; } catch (err) { return (err as NodeJS.ErrnoException).code === "EPERM"; }
}

/** One server per data directory (D-051). Returns a release function. */
export async function acquireLock(path: string): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      await fh.writeFile(String(process.pid));
      await fh.close();
      held.add(path);
      return async () => { held.delete(path); await unlink(path).catch(() => undefined); };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const pid = Number((await readFile(path, "utf8").catch(() => "")).trim());
      if (Number.isInteger(pid) && pid > 0 && alive(pid, path)) {
        throw new Error(`Another Hub server (pid ${pid}) is using this data directory.`, { cause: err });
      }
      await unlink(path).catch(() => undefined);
    }
  }
  throw new Error("Could not acquire the data directory lock.");
}
