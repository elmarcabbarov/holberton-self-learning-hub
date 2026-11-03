import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIStatus } from "@hub/contracts";
import yauzl from "yauzl";
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { signedInApp, type TestApp } from "./helpers.ts";
import { addressBlocked, guardedFetch, validateBaseUrl } from "../src/modules/ai/net.ts";
import { localityOf } from "../src/modules/ai/service.ts";
import { SdkProvider } from "../src/modules/ai/provider.ts";

const KEY = "sk-test-CANARY-0123456789abcd";
const OLLAMA = "http://127.0.0.1:11434/v1";

interface Seen { url: string; headers: Record<string, string>; body: Record<string, unknown>; redirect: RequestInit["redirect"] }

const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
const chat = (message: Record<string, unknown>) => Response.json({
  id: "c1", object: "chat.completion", created: 1, model: "m",
  choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: message.tool_calls ? "tool_calls" : "stop" }],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
});

/** A fake OpenAI-compatible server: answers by what the request asks for. Records every request. */
function fakeOpenAI(seen: Seen[], opts: { status?: number; json?: string[]; finish?: string; gate?: Promise<void> } = {}): typeof fetch {
  const jsonAnswers = [...(opts.json ?? ['{"answer":4}'])];
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    seen.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()), body, redirect: init?.redirect });
    if (opts.gate) await opts.gate;
    if (opts.finish) return Response.json({ id: "c1", object: "chat.completion", created: 1, model: "m", choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: opts.finish }] });
    if (opts.status) return new Response(`{"error":{"message":"bad key ${KEY} for prompt ${JSON.stringify(body).slice(0, 80)}"}}`, { status: opts.status });
    if (body.stream) return sse([{ id: "c1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: { role: "assistant", content: "ready" }, finish_reason: null }] }, { id: "c1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }]);
    if (body.tools) return chat({ content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "lookup_topic", arguments: '{"name":"pipes"}' } }] });
    return chat({ content: jsonAnswers.length > 1 ? jsonAnswers.shift() : jsonAnswers[0] });
  }) as typeof fetch;
}

let t: TestApp;
afterEach(async () => { await t.close(); vi.restoreAllMocks(); });

const status = async () => AIStatus.parse((await t.req({ method: "GET", url: "/api/ai/status" })).json());
const save = (body: Record<string, unknown>) => t.req({ method: "PUT", url: "/api/ai/settings", payload: body });

describe("AI provider registry", () => {
  it("is off by default and makes no provider call until an explicit test", async () => {
    const seen: Seen[] = [];
    t = await signedInApp({}, { aiFetch: fakeOpenAI(seen) });
    expect(await status()).toMatchObject({ mode: "disabled", ready: false, key: { set: false, mask: null }, probes: null });
    expect((await t.req({ method: "POST", url: "/api/ai/probe", payload: {} })).statusCode).toBe(409);
    const saved = AIStatus.parse((await save({ mode: "openai_compatible", baseUrl: `${OLLAMA}/`, model: "llama3.2", revision: 0 })).json());
    expect(saved).toMatchObject({ baseUrl: OLLAMA, locality: "local", ready: true, revision: 1 });
    expect(seen).toHaveLength(0); // saving and reading status never call the provider

    const probed = AIStatus.parse((await t.req({ method: "POST", url: "/api/ai/probe", payload: {} })).json());
    expect(probed.probes!.map((p) => [p.capability, p.ok])).toEqual([["text", true], ["structured", true], ["tools", true]]);
    expect(seen.every((s) => s.url.startsWith(`${OLLAMA}/chat/completions`) && s.redirect === "error")).toBe(true);
    expect(seen.some((s) => "authorization" in s.headers)).toBe(false); // no key, no header
    expect(seen.find((s) => !s.body.stream && !s.body.tools)!.body.response_format).toMatchObject({ type: "json_schema" }); // probe tests native schema
    expect((await t.req({ method: "POST", url: "/api/ai/probe", payload: {} })).statusCode).toBe(429); // throttled

    // Results belong to one settings revision.
    await save({ mode: "openai_compatible", baseUrl: OLLAMA, model: "qwen3", revision: probed.revision });
    expect((await status()).probes).toBeNull();
  });

  it("stores the key outside the database, never returns it, and drops it when the endpoint changes", async () => {
    const seen: Seen[] = [];
    t = await signedInApp({ HUB_SECRET_KEY: "test-master-key" }, { aiFetch: fakeOpenAI(seen) });
    const res = await save({ mode: "openai_compatible", baseUrl: "https://openrouter.example/api/v1", model: "x", key: { op: "replace", value: KEY }, revision: 0 });
    expect(res.body).not.toContain("CANARY");
    const st = AIStatus.parse(res.json());
    expect(st).toMatchObject({ locality: "remote", key: { set: true, mask: "…abcd", encrypted: true } });
    const file = join(t.dir, "data", "secrets.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8")).not.toContain("CANARY"); // encrypted at rest
    expect(t.app.database.sqlite.prepare("SELECT * FROM ai_settings").all().map((r) => JSON.stringify(r)).join("")).not.toContain("CANARY");

    expect((await save({ mode: "openai_compatible", baseUrl: "https://openrouter.example/api/v1", model: "y", revision: 0 })).statusCode).toBe(409); // stale form
    const moved = AIStatus.parse((await save({ mode: "openai_compatible", baseUrl: OLLAMA, model: "y", revision: st.revision })).json());
    expect(moved.key.set).toBe(false); // a key never follows a different endpoint
  });

  it("keeps the key out of backups", async () => {
    t = await signedInApp({}, { aiFetch: fakeOpenAI([]) });
    await save({ mode: "anthropic", model: "claude-x", key: { op: "replace", value: KEY }, revision: 0 });
    const backup = (await t.req({ method: "POST", url: "/api/backups", payload: {} })).json();
    const zipPath = join(t.dir, "backups", backup.name);
    const texts = await new Promise<string[]>((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (e, zip) => {
        if (e) return reject(e);
        const out: string[] = [];
        zip.on("entry", (entry) => zip.openReadStream(entry, (err, s) => {
          if (err) return reject(err);
          const chunks: Buffer[] = [];
          s.on("data", (c: Buffer) => chunks.push(c)).on("end", () => { out.push(`${entry.fileName}:${Buffer.concat(chunks).toString("latin1")}`); zip.readEntry(); });
        }));
        zip.on("end", () => resolve(out));
        zip.readEntry();
      });
    });
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((x) => x.includes("CANARY"))).toBe(false);
    expect(texts.some((x) => x.startsWith("data/secrets.json"))).toBe(false);
  });

  it("maps provider errors to codes and never echoes the key or the prompt", async () => {
    const seen: Seen[] = [];
    t = await signedInApp({}, { aiFetch: fakeOpenAI(seen, { status: 401 }) });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await save({ mode: "openai_compatible", baseUrl: OLLAMA, model: "m", key: { op: "replace", value: KEY }, revision: 0 });
    const res = await t.req({ method: "POST", url: "/api/ai/probe", payload: {} });
    expect(res.body).not.toContain("CANARY");
    expect(AIStatus.parse(res.json()).probes!.map((p) => p.error)).toEqual(["auth", "auth", "auth"]);
    expect(seen[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(errors.mock.calls.flat().map(String).join("")).not.toContain("CANARY");
  });

  it("refuses metadata and link-local endpoints before any request", async () => {
    const seen: Seen[] = [];
    t = await signedInApp({}, { aiFetch: fakeOpenAI(seen), aiResolve: async () => [{ address: "169.254.169.254" }] });
    await save({ mode: "openai_compatible", baseUrl: "http://metadata.example/v1", model: "m", revision: 0 });
    const st = AIStatus.parse((await t.req({ method: "POST", url: "/api/ai/probe", payload: {} })).json());
    expect(st.probes!.every((p) => p.error === "unreachable")).toBe(true);
    expect(seen).toHaveLength(0);
    for (const baseUrl of ["ftp://x/v1", "http://user:pw@x/v1", "http://x/v1?k=1", "not a url"]) {
      expect((await save({ mode: "openai_compatible", baseUrl, model: "m", revision: st.revision })).statusCode).toBe(400);
    }
    expect((await save({ mode: "mock", model: "m", revision: st.revision })).statusCode).toBe(400); // tests only
  });

  it("anthropic: key in x-api-key, fixed endpoint, streaming text", async () => {
    const seen: Seen[] = [];
    const anthropic = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      seen.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(String(init?.body)), redirect: init?.redirect });
      const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
      return new Response([
        ev("message_start", { message: { id: "m1", type: "message", role: "assistant", model: "claude-x", content: [], stop_reason: null, usage: { input_tokens: 3, output_tokens: 0 } } }),
        ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
        ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "ready" } }),
        ev("content_block_stop", { index: 0 }),
        ev("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }),
        ev("message_stop", {}),
      ].join(""), { headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch;
    t = await signedInApp({}, { aiFetch: anthropic, aiResolve: async () => [{ address: "203.0.113.10" }] });
    await save({ mode: "anthropic", model: "claude-x", key: { op: "replace", value: KEY }, revision: 0 });
    const st = AIStatus.parse((await t.req({ method: "POST", url: "/api/ai/probe", payload: {} })).json());
    expect(st.probes![0]).toMatchObject({ capability: "text", ok: true });
    expect(seen[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(seen[0]!.headers["x-api-key"]).toBe(KEY);
  });
});

describe("races and fail-closed key handling", () => {
  it("lets only one of two simultaneous probes run", async () => {
    const seen: Seen[] = [];
    let open!: () => void;
    t = await signedInApp({}, { aiFetch: fakeOpenAI(seen, { gate: new Promise<void>((r) => { open = r; }) }) });
    await save({ mode: "openai_compatible", baseUrl: OLLAMA, model: "m", revision: 0 });
    const a = t.req({ method: "POST", url: "/api/ai/probe", payload: {} });
    const b = t.req({ method: "POST", url: "/api/ai/probe", payload: {} });
    setTimeout(open, 20);
    const codes = (await Promise.all([a, b])).map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 429]);
    expect(seen).toHaveLength(3);
  });

  it("never pairs a stored key with an endpoint it was not saved for", async () => {
    t = await signedInApp({ HUB_SECRET_KEY: "k" }, { aiFetch: fakeOpenAI([]), aiResolve: async () => [{ address: "203.0.113.10" }] });
    const st = AIStatus.parse((await save({ mode: "openai_compatible", baseUrl: "https://a.example/v1", model: "m", key: { op: "replace", value: KEY }, revision: 0 })).json());
    expect(st.key.set).toBe(true);
    // Simulate a save that updated the row for endpoint B but crashed before touching the key file.
    t.app.database.sqlite.prepare("UPDATE ai_settings SET base_url = ?, key_binding = ? WHERE id = 1").run("https://b.example/v1", "openai_compatible|https://b.example/v1");
    expect((await status()).key.set).toBe(false);
  });

  it("stops at a refusal instead of spending the structured budget", async () => {
    const seen: Seen[] = [];
    const p = new SdkProvider("t", createOpenAICompatible({ name: "t", baseURL: OLLAMA, fetch: fakeOpenAI(seen, { finish: "content_filter" }) }).chatModel("m"));
    const r = await p.generateObject({ prompt: "x", schema: z.object({ answer: z.number() }), maxOutputTokens: 64 }, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, error: "refused" });
    expect(seen).toHaveLength(1);
  });

  it("applies the deadline to DNS resolution too", async () => {
    const f = guardedFetch(30, (async () => new Response("x")) as typeof fetch, () => new Promise(() => undefined));
    await expect(f("http://stalled.example/v1/chat/completions")).rejects.toMatchObject({ name: "TimeoutError" });
    const ac = new AbortController();
    const g = guardedFetch(60_000, (async () => new Response("x")) as typeof fetch, () => new Promise(() => undefined));
    const pending = g("http://stalled.example/v1", { signal: ac.signal });
    ac.abort();
    await expect(pending).rejects.toBeDefined();
  });
});

describe("structured output budget", () => {
  const provider = (answers: string[], seen: Seen[]) =>
    new SdkProvider("t", createOpenAICompatible({ name: "t", baseURL: OLLAMA, fetch: fakeOpenAI(seen, { json: answers }), supportsStructuredOutputs: true }).chatModel("m"));

  it("falls back to JSON text and one repair turn, within three attempts in all", async () => {
    const seen: Seen[] = [];
    const p = provider(["not json", '{"answer":"four"}', '{"answer":4}'], seen);
    const r = await p.generateObject({ prompt: "2+2", schema: z.object({ answer: z.number() }), maxOutputTokens: 64 }, new AbortController().signal);
    expect(r).toEqual({ ok: true, value: { answer: 4 }, attempts: 3 });
    expect(String((seen[2]!.body.messages as { content: string }[]).at(-1)!.content)).toContain("answer");
    expect(seen[0]!.body.response_format).toMatchObject({ type: "json_schema" }); // native schema first
    expect(String((seen[1]!.body.messages as { content: string }[]).at(-1)!.content)).toContain('"answer":{"type":"number"}'); // schema in the fallback
  });

  it("gives up as schema_invalid after the budget, and maxAttempts: 1 means no fallback", async () => {
    const seen: Seen[] = [];
    const p = provider(["nope"], seen);
    expect(await p.generateObject({ prompt: "x", schema: z.object({ answer: z.number() }), maxOutputTokens: 64 }, new AbortController().signal)).toEqual({ ok: false, error: "schema_invalid", attempts: 3 });
    expect(seen).toHaveLength(3);
    const once: Seen[] = [];
    expect(await provider(["nope"], once).generateObject({ prompt: "x", schema: z.object({ answer: z.number() }), maxOutputTokens: 64, maxAttempts: 1 }, new AbortController().signal)).toMatchObject({ ok: false, attempts: 1 });
    expect(once).toHaveLength(1);
  });
});

describe("endpoint policy", () => {
  it("blocks metadata, link-local, unspecified and multicast; allows loopback and LAN", () => {
    for (const ip of ["169.254.169.254", "0.0.0.0", "224.0.0.1", "fe80::1", "::", "ff02::1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:a9fe:a9fe", "::ffff:0:0", "fe80::1%eth0", "FF02::1", "fd00:ec2:0::254", "nonsense"]) expect(addressBlocked(ip)).toBe(true);
    for (const ip of ["127.0.0.1", "192.168.1.20", "10.0.0.5", "::1", "203.0.113.10"]) expect(addressBlocked(ip)).toBe(false);
    expect(addressBlocked("::ffff:7f00:1")).toBe(false); // mapped loopback is loopback
    expect(new URL("http://[::ffff:169.254.169.254]/").hostname).toBe("[::ffff:a9fe:a9fe]"); // why hex forms matter
    expect(validateBaseUrl("http://localhost:11434/v1/")).toBe("http://localhost:11434/v1");
    expect(localityOf("https://fcloud.example/v1")).toBe("remote");
    expect(localityOf("http://[fd12::5]:11434/v1")).toBe("local");
    expect(localityOf("http://192.168.1.20:1234/v1")).toBe("local");
  });
});
