import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AIStatus, ProbeResult, SaveAISettings } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import { aiSettings } from "../../lib/db/schema.ts";
import { EndpointError, guardedFetch, validateBaseUrl, type Resolve } from "./net.ts";
import { MockProvider, SdkProvider, type AIProvider } from "./provider.ts";
import { maskSecret, type SecretStore } from "./secrets.ts";

type Row = typeof aiSettings.$inferSelect;
const KEY = "ai_api_key";
const ANTHROPIC_URL = "https://api.anthropic.com/v1";
const CALL_TIMEOUT_MS = 60_000;
const PROBE_GAP_MS = 5_000;
const IMMEDIATE = { behavior: "immediate" } as const;

/** Loopback, private LAN and Docker host names count as local; anything else means the prompt leaves the machine. */
export function localityOf(baseUrl: string): "local" | "remote" {
  let host: string;
  try { host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "").toLowerCase(); } catch { return "remote"; }
  if (host === "localhost" || host.endsWith(".localhost") || host === "host.docker.internal" || host === "::1") return "local";
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) ? "local" : "remote";
  }
  return /^f[cd]/.test(host) ? "local" : "remote";
}

export type SaveOutcome = { kind: "ok"; status: AIStatus } | { kind: "conflict" } | { kind: "invalid"; reason: string };
export type ProbeOutcome = { kind: "ok"; status: AIStatus } | { kind: "not_ready" } | { kind: "busy" };

/**
 * AI provider registry (HSLH-014, D-065). Off by default. Saving settings or reading status never calls a
 * provider; only an explicit test (probe) or an AI feature does.
 */
export class AIService {
  private readonly db: Db;
  private readonly secrets: SecretStore;
  private readonly fetchImpl: typeof fetch;
  private readonly allowMock: boolean;
  private readonly resolve: Resolve | undefined;
  private probing = false;
  private lastProbe = 0;

  constructor(db: Db, secrets: SecretStore, opts: { fetch?: typeof fetch; allowMock?: boolean; resolve?: Resolve } = {}) {
    this.resolve = opts.resolve;
    this.db = db;
    this.secrets = secrets;
    this.fetchImpl = opts.fetch ?? fetch;
    this.allowMock = opts.allowMock ?? false;
  }

  private row(): Row {
    const r = this.db.select().from(aiSettings).where(eq(aiSettings.id, 1)).get();
    if (r) return r;
    this.db.insert(aiSettings).values({ id: 1 }).onConflictDoNothing().run();
    return this.db.select().from(aiSettings).where(eq(aiSettings.id, 1)).get()!;
  }

  private binding(r: Pick<Row, "mode" | "baseUrl">) { return `${r.mode}|${r.baseUrl}`; }

  /** The stored key, only for the endpoint it was saved for. */
  private async keyFor(r: Row): Promise<string | null> {
    if (r.keyBinding !== this.binding(r)) return null;
    return this.secrets.get(KEY);
  }

  async status(): Promise<AIStatus> {
    const r = this.row();
    const key = await this.keyFor(r);
    const needsKey = r.mode === "anthropic";
    const ready = r.mode !== "disabled" && r.model !== "" && (r.mode !== "openai_compatible" || r.baseUrl !== "") && (!needsKey || key !== null);
    const probes = r.probesJson && r.probedRevision === r.revision ? (JSON.parse(r.probesJson) as ProbeResult[]) : null;
    return {
      mode: r.mode as AIStatus["mode"], baseUrl: r.baseUrl, model: r.model, maxOutputTokens: r.maxOutputTokens, revision: r.revision,
      locality: r.mode === "disabled" || r.mode === "mock" ? null : r.mode === "anthropic" ? "remote" : localityOf(r.baseUrl),
      key: { set: key !== null, mask: key ? maskSecret(key) : null, encrypted: this.secrets.encrypted },
      ready, probes, probedAt: probes ? r.probedAt : null,
    };
  }

  async save(input: SaveAISettings): Promise<SaveOutcome> {
    if (input.mode === "mock" && !this.allowMock) return { kind: "invalid", reason: "mode" };
    let baseUrl = "";
    if (input.mode === "openai_compatible") {
      try { baseUrl = validateBaseUrl(input.baseUrl); } catch (e) { return { kind: "invalid", reason: e instanceof EndpointError ? e.reason : "invalid_url" }; }
    }
    const current = this.row();
    if (current.revision !== input.revision) return { kind: "conflict" };
    const next = { mode: input.mode, baseUrl };
    // A key moves with its endpoint only when it is entered again; switching endpoints drops it.
    const sameEndpoint = this.binding(current) === this.binding(next);
    const keyAction: "keep" | "set" | "clear" = input.key.op === "replace" ? "set" : input.key.op === "clear" || !sameEndpoint ? "clear" : "keep";
    const changed = this.db.transaction((tx) => {
      const r = tx.select().from(aiSettings).where(eq(aiSettings.id, 1)).get()!;
      if (r.revision !== input.revision) return false;
      tx.update(aiSettings).set({
        mode: input.mode, baseUrl, model: input.model, maxOutputTokens: input.maxOutputTokens, revision: r.revision + 1,
        keyBinding: keyAction === "set" ? this.binding(next) : keyAction === "clear" ? null : r.keyBinding,
      }).where(eq(aiSettings.id, 1)).run();
      return true;
    }, IMMEDIATE);
    if (!changed) return { kind: "conflict" };
    if (keyAction === "set" && input.key.op === "replace") await this.secrets.set(KEY, input.key.value);
    if (keyAction === "clear") await this.secrets.set(KEY, null);
    return { kind: "ok", status: await this.status() };
  }

  /** The configured provider, or null when AI is off or incomplete. Used by AI features (core never imports this). */
  async provider(): Promise<AIProvider | null> {
    const r = this.row();
    const st = await this.status();
    if (!st.ready) return null;
    const fetchImpl = guardedFetch(CALL_TIMEOUT_MS, this.fetchImpl, this.resolve);
    if (r.mode === "mock") return new MockProvider([{ answer: 4 }]);
    if (r.mode === "anthropic") {
      const key = (await this.keyFor(r))!;
      return new SdkProvider("anthropic", createAnthropic({ apiKey: key, baseURL: ANTHROPIC_URL, fetch: fetchImpl })(r.model));
    }
    const key = await this.keyFor(r);
    const p = createOpenAICompatible({ name: "openai-compatible", baseURL: r.baseUrl, ...(key ? { apiKey: key } : {}), fetch: fetchImpl });
    return new SdkProvider("openai_compatible", p.chatModel(r.model));
  }

  /**
   * Runs three small fixed tests (text, one schema without repair, one tool call with no handler) and stores
   * the result for the current settings revision only. One at a time, at most one every few seconds.
   */
  async probe(): Promise<ProbeOutcome> {
    if (this.probing || Date.now() - this.lastProbe < PROBE_GAP_MS) return { kind: "busy" };
    const provider = await this.provider();
    if (!provider) return { kind: "not_ready" };
    this.probing = true;
    const revision = this.row().revision;
    const max = Math.min(this.row().maxOutputTokens, 256);
    const results: ProbeResult[] = [];
    const timed = async (capability: ProbeResult["capability"], run: (signal: AbortSignal) => Promise<ProbeResult["error"]>) => {
      const t0 = Date.now();
      const signal = AbortSignal.timeout(CALL_TIMEOUT_MS);
      const error = await run(signal).catch(() => "unknown" as const);
      results.push({ capability, ok: error === null, error, ms: Date.now() - t0 });
    };
    try {
      await timed("text", async (signal) => {
        let got = false;
        for await (const ev of provider.generateText({ prompt: "Reply with the single word: ready", maxOutputTokens: max }, signal)) {
          if (ev.type === "delta") got = true;
          if (ev.type === "error") return ev.code;
        }
        return got ? null : "capability_missing";
      });
      await timed("structured", async (signal) => {
        const r = await provider.generateObject({ prompt: "What is 2 + 2? Give it as the field `answer`.", schema: z.object({ answer: z.number() }), maxOutputTokens: max, maxAttempts: 1 }, signal);
        return r.ok ? null : r.error;
      });
      await timed("tools", async (signal) => {
        const r = await provider.callTool({ prompt: "Use the tool to look up the topic 'pipes'.", toolName: "lookup_topic", description: "Looks up a study topic by name.", inputSchema: z.object({ name: z.string() }), maxOutputTokens: max }, signal);
        return r.ok ? null : r.error;
      });
    } finally {
      this.probing = false;
      this.lastProbe = Date.now();
    }
    // Settings changed while testing: the results describe a configuration that no longer exists.
    this.db.update(aiSettings).set({ probesJson: JSON.stringify(results), probedRevision: revision, probedAt: new Date().toISOString() })
      .where(eq(aiSettings.id, 1)).run();
    return { kind: "ok", status: await this.status() };
  }
}
