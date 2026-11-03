import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  /** Port the browser sees (compose may remap). Defaults to `port`. */
  publicPort: number;
  /** Development mode: also trusts the Vite dev server origin (D-046). */
  dev: boolean;
  /** File watcher on the vault (off in unit tests). */
  watchVault: boolean;
  /** Polling watcher for bind mounts without inotify (HUB_VAULT_POLL=1). */
  vaultPolling: boolean;
  /** Folder whose immediate subfolders can be imported into the vault (HUB_IMPORT_DIR, D-061). */
  importDir: string | null;
  /** Existing vault indexed read-only (HUB_LINKED_VAULT, D-062). */
  linkedVault: string | null;
  /** Encrypts BYOK secrets at rest when set (HUB_SECRET_KEY, ADR-008). */
  secretKey: string | undefined;
  /** Allows the deterministic mock AI provider (tests only). */
  aiMock: boolean;
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
    publicPort: env.HUB_PUBLIC_PORT ? parsePort(env.HUB_PUBLIC_PORT) : parsePort(env.HUB_PORT),
    dev: env.HUB_DEV === "1",
    watchVault: env.HUB_VAULT_WATCH !== "0",
    vaultPolling: env.HUB_VAULT_POLL === "1",
    importDir: env.HUB_IMPORT_DIR ? resolve(env.HUB_IMPORT_DIR) : null,
    linkedVault: env.HUB_LINKED_VAULT ? resolve(env.HUB_LINKED_VAULT) : null,
    secretKey: env.HUB_SECRET_KEY || undefined,
    aiMock: env.HUB_AI_MOCK === "1",
    bindHost,
    // Default is the repository root's .data, independent of the working directory.
    dataDir: env.HUB_DATA ? resolve(env.HUB_DATA) : fileURLToPath(new URL("../../../.data", import.meta.url)),
    webDist: env.HUB_WEB_DIST ? resolve(env.HUB_WEB_DIST) : null,
    version: PKG_VERSION,
  };
}
