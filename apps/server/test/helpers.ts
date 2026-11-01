import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createBootstrapToken } from "../src/modules/auth/store.ts";

export const HOST = "127.0.0.1:3000";
export const ORIGIN = `http://${HOST}`;

export interface TestApp {
  app: FastifyInstance;
  dir: string;
  /** Authenticated request with Host/Origin/JSON headers set. */
  req(opts: InjectOptions): Promise<LightMyRequestResponse>;
  close(): Promise<void>;
}

export async function signedInApp(): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), "hub-test-"));
  const app = await buildApp(loadConfig({ HUB_DATA: dir }));
  const headers = { host: HOST, origin: ORIGIN, "content-type": "application/json" };
  const res = await app.inject({ method: "POST", url: "/api/auth/bootstrap", headers, payload: { token: createBootstrapToken(app.database.db) } });
  const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return {
    app,
    dir,
    req: (opts) => app.inject({ ...opts, headers: { ...headers, cookie, ...(opts.headers ?? {}) } }),
    close: async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}
