// Hub command line. Usage: node apps/server/src/cli.ts token
import { loadConfig } from "./config.ts";
import { openDatabase } from "./lib/db/index.ts";
import { createBootstrapToken } from "./modules/auth/store.ts";
import { bootstrapLink } from "./modules/auth/link.ts";

const [command] = process.argv.slice(2);
if (command !== "token") {
  console.error("usage: cli.ts token   — print a one-time sign-in link (valid 10 minutes)");
  process.exit(2);
}
const config = loadConfig();
const database = openDatabase(config.dataDir);
try {
  console.log(bootstrapLink(config, createBootstrapToken(database.db)));
} finally {
  database.close();
}
