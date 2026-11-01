import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PKG_VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

export type HubMode = "local" | "remote";

export interface HubConfig {
  mode: HubMode;
  port: number;
  /** Interface the HTTP server binds to. Separate from auth mode (D-036). */
  bindHost: string;
  dataDir: string;
  webDist: string | null;
  version: string;
}

function parseMode(raw: string | undefined): HubMode {
  if (raw === undefined || raw === "" || raw === "local") return "local";
  if (raw === "remote") return "remote";
  throw new Error(`HUB_MODE must be "local" or "remote", got "${raw}"`);
}

function parsePort(raw: string | undefined): number {
  const port = Number(raw ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`HUB_PORT is invalid: ${raw}`);
  return port;
}

/**
 * Bind rules (D-036):
 * - native local run: loopback only;
 * - inside the container (HUB_IN_CONTAINER=1): 0.0.0.0, while compose publishes 127.0.0.1 on the host;
 * - remote mode: whatever HUB_BIND says, default 0.0.0.0.
 */
function resolveBindHost(mode: HubMode, env: NodeJS.ProcessEnv): string {
  if (env.HUB_BIND) return env.HUB_BIND;
  if (mode === "remote" || env.HUB_IN_CONTAINER === "1") return "0.0.0.0";
  return "127.0.0.1";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HubConfig {
  const mode = parseMode(env.HUB_MODE);
  const bindHost = resolveBindHost(mode, env);
  const loopback = bindHost === "127.0.0.1" || bindHost === "::1" || bindHost === "localhost";
  if (mode === "local" && !loopback && env.HUB_IN_CONTAINER !== "1") {
    throw new Error("Refusing to bind a non-loopback address in local mode. Use HUB_MODE=remote with authentication.");
  }
  if (mode === "remote") {
    // Remote mode needs password auth, which is not implemented yet (HSLH-003).
    throw new Error("HUB_MODE=remote is not available yet.");
  }
  return {
    mode,
    port: parsePort(env.HUB_PORT),
    bindHost,
    dataDir: resolve(env.HUB_DATA ?? ".data"),
    webDist: env.HUB_WEB_DIST ? resolve(env.HUB_WEB_DIST) : null,
    version: PKG_VERSION,
  };
}
