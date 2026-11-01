// Hub command line.
//   node apps/server/src/cli.ts token              one-time sign-in link (valid 10 minutes)
//   node apps/server/src/cli.ts inspect <zip>      show what a backup contains (no changes)
//   node apps/server/src/cli.ts restore <zip>      restore a backup into an EMPTY data dir (server stopped)
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./lib/db/index.ts";
import { acquireLock } from "./lib/lockfile.ts";
import { createBootstrapToken } from "./modules/auth/store.ts";
import { bootstrapLink } from "./modules/auth/link.ts";
import { inspectBackup, restoreBackup, RestoreError } from "./modules/backup/restore.ts";

const [command, arg] = process.argv.slice(2);
const config = loadConfig();

function printManifest(m: Awaited<ReturnType<typeof inspectBackup>>) {
  console.log(`Backup from ${m.createdAt} (app ${m.appVersion}, instance ${m.instanceId.slice(0, 8)})`);
  console.log(`  notes ${m.counts.notes} · spaces ${m.counts.spaces} · topics ${m.counts.topics} · cards ${m.counts.cards} · reviews ${m.counts.reviews}`);
  console.log(`  vault files ${m.files.length} · schema migrations ${m.migrations}`);
}

try {
  if (command === "token") {
    const database = openDatabase(config.dataDir);
    try { console.log(bootstrapLink(config, createBootstrapToken(database.db))); } finally { database.close(); }
  } else if (command === "inspect" && arg) {
    printManifest(await inspectBackup(arg));
  } else if (command === "restore" && arg) {
    mkdirSync(join(config.dataDir, "data"), { recursive: true });
    const release = await acquireLock(join(config.dataDir, "data", "hub.lock.db")); // refuses while a server runs
    try {
      const m = await restoreBackup(arg, config.dataDir);
      console.log(`Restored into ${config.dataDir}`);
      printManifest(m);
    } finally { await release(); }
  } else {
    console.error("usage: cli.ts token | inspect <backup.zip> | restore <backup.zip>");
    process.exit(2);
  }
} catch (err) {
  console.error(err instanceof RestoreError ? `Restore refused: ${err.message}` : String((err as Error).message ?? err));
  process.exit(1);
}
