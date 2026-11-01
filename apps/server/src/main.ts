import { loadConfig } from "./config.ts";
import { buildApp } from "./app.ts";
import { createBootstrapToken } from "./modules/auth/store.ts";
import { bootstrapLink } from "./modules/auth/link.ts";

const config = loadConfig();
const app = await buildApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.bindHost, port: config.port });

// Printed directly (not through the request logger): one-time link, valid 10 minutes (D-047).
console.log(`\nOpen the Hub: ${bootstrapLink(config, createBootstrapToken(app.database.db))}\n` +
  "New link later: node apps/server/src/cli.ts token\n");
