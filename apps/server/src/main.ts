import { loadConfig } from "./config.ts";
import { buildApp } from "./app.ts";

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
