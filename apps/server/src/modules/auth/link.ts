import type { HubConfig } from "../../config.ts";

/** Bootstrap link; the token lives in the fragment so it never reaches the server or its logs (D-044). */
export function bootstrapLink(config: HubConfig, token: string): string {
  const port = config.dev ? 5173 : config.publicPort;
  return `http://127.0.0.1:${port}/auth#t=${token}`;
}
