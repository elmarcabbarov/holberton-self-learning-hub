import { APICallError, generateObject, generateText, NoObjectGeneratedError, streamText, tool, type LanguageModel } from "ai";
import { z } from "zod";
import { EndpointError } from "./net.ts";

/** Our thin AI interface (ARCHITECTURE §3.2). Domain code sees only this; SDK objects never leave this module. */
export type Capability = "text" | "structured" | "tools";
export type AIErrorCode = "unreachable" | "auth" | "rate_limited" | "context_overflow" | "schema_invalid"
  | "refused" | "timeout" | "cancelled" | "capability_missing" | "unknown";

export interface Usage { inputTokens: number | null; outputTokens: number | null }
export type TextEvent = { type: "delta"; text: string } | { type: "done"; usage: Usage } | { type: "error"; code: AIErrorCode };
export interface TextRequest { system?: string; prompt: string; maxOutputTokens: number }
export interface ObjectRequest<T> { system?: string; prompt: string; schema: z.ZodType<T>; maxOutputTokens: number; maxAttempts?: number }
export type ObjectResult<T> = { ok: true; value: T; attempts: number } | { ok: false; error: AIErrorCode; attempts: number };
export interface ToolRequest { prompt: string; toolName: string; description: string; inputSchema: z.ZodType; maxOutputTokens: number }
/** A tool call is only a proposal: nothing is executed here (T9). */
export type ToolResult = { ok: true; toolName: string; input: unknown } | { ok: false; error: AIErrorCode };

export interface AIProvider {
  readonly id: string;
  generateText(req: TextRequest, signal: AbortSignal): AsyncIterable<TextEvent>;
  generateObject<T>(req: ObjectRequest<T>, signal: AbortSignal): Promise<ObjectResult<T>>;
  callTool(req: ToolRequest, signal: AbortSignal): Promise<ToolResult>;
}

/** Errors that make another attempt pointless. */
const FINAL: AIErrorCode[] = ["auth", "cancelled", "refused", "unreachable", "timeout", "rate_limited", "context_overflow"];

/**
 * Maps any SDK/network error to a code. Raw messages, bodies and causes are dropped on purpose:
 * they can echo the prompt or the key (T7).
 */
export function mapError(e: unknown, signal?: AbortSignal): AIErrorCode {
  if (signal?.aborted) return signal.reason instanceof DOMException && signal.reason.name === "TimeoutError" ? "timeout" : "cancelled";
  if (e instanceof EndpointError) return "unreachable";
  if (e instanceof NoObjectGeneratedError) return e.finishReason === "content-filter" ? "refused" : "schema_invalid";
  if (APICallError.isInstance(e)) {
    const s = e.statusCode ?? 0;
    if (s === 401 || s === 403) return "auth";
    if (s === 429) return "rate_limited";
    if (s === 413) return "context_overflow";
    if (s === 0) return "unreachable";
    return "unknown";
  }
  const name = (e as { name?: string } | null)?.name;
  if (name === "TimeoutError") return "timeout";
  if (name === "AbortError") return "cancelled";
  if (e instanceof TypeError) return "unreachable"; // fetch failed, redirect refused
  return "unknown";
}

const sys = (req: { system?: string }) => (req.system ? { system: req.system } : {});
const usageOf = (u: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined): Usage =>
  ({ inputTokens: u?.inputTokens ?? null, outputTokens: u?.outputTokens ?? null }); // missing = unknown, never 0

/** The JSON Schema as text for prompts; null when the schema cannot be represented (the model then gets none). */
function schemaText(schema: z.ZodType): string | null {
  try { return JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" })).slice(0, 4000); } catch { return null; }
}

/** Pulls the first JSON object out of a model's text answer. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Provider over an AI SDK language model. SDK retries are off (maxRetries: 0); our own budget applies:
 * one native structured attempt, then JSON mode, then one repair turn — at most `maxAttempts` (default 3) in all.
 */
export class SdkProvider implements AIProvider {
  readonly id: string;
  private readonly model: LanguageModel;

  constructor(id: string, model: LanguageModel) {
    this.id = id;
    this.model = model;
  }

  async *generateText(req: TextRequest, signal: AbortSignal): AsyncIterable<TextEvent> {
    let failure: unknown = null;
    const result = streamText({
      model: this.model, ...sys(req), prompt: req.prompt, maxOutputTokens: req.maxOutputTokens, maxRetries: 0, abortSignal: signal,
      onError: ({ error }) => { failure = error; }, // never the SDK's console.error default
    });
    try {
      for await (const text of result.textStream) if (text) yield { type: "delta", text };
      if (failure) { yield { type: "error", code: mapError(failure, signal) }; return; }
      yield { type: "done", usage: usageOf(await result.usage) };
    } catch (e) {
      yield { type: "error", code: mapError(failure ?? e, signal) };
    }
  }

  async generateObject<T>(req: ObjectRequest<T>, signal: AbortSignal): Promise<ObjectResult<T>> {
    const max = Math.max(1, Math.min(req.maxAttempts ?? 3, 3));
    let attempts = 0;
    let last: AIErrorCode;
    // 1. Native structured output.
    try {
      attempts++;
      const r = await generateObject({ model: this.model, ...sys(req), prompt: req.prompt, schema: req.schema, maxOutputTokens: req.maxOutputTokens, maxRetries: 0, abortSignal: signal });
      const v = req.schema.safeParse(r.object);
      if (v.success) return { ok: true, value: v.data, attempts };
      last = "schema_invalid";
    } catch (e) {
      last = mapError(e, signal);
      if (FINAL.includes(last)) return { ok: false, error: last, attempts };
    }
    // 2. JSON in plain text, 3. one repair turn with the validation errors.
    let previous: string | null = null;
    let issues: string | null = null;
    const shape = schemaText(req.schema);
    const schemaLine = shape ? `\nIt must match this JSON Schema: ${shape}` : "";
    while (attempts < max) {
      attempts++;
      const prompt: string = previous === null
        ? `${req.prompt}\n\nAnswer with one JSON object only, no other text.${schemaLine}`
        : `${req.prompt}\n\nYour previous answer was not valid:\n${previous.slice(0, 2000)}\nProblems: ${issues}\nAnswer again with one corrected JSON object only.${schemaLine}`;
      try {
        const r = await generateText({ model: this.model, ...sys(req), prompt, maxOutputTokens: req.maxOutputTokens, maxRetries: 0, abortSignal: signal });
        if (r.finishReason === "content-filter") return { ok: false, error: "refused", attempts };
        previous = r.text;
        let parsed: unknown;
        try { parsed = extractJson(r.text); } catch { issues = "not JSON"; last = "schema_invalid"; continue; }
        const v = req.schema.safeParse(parsed);
        if (v.success) return { ok: true, value: v.data, attempts };
        issues = v.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        last = "schema_invalid";
      } catch (e) {
        last = mapError(e, signal);
        if (FINAL.includes(last)) break;
      }
    }
    return { ok: false, error: last, attempts };
  }

  async callTool(req: ToolRequest, signal: AbortSignal): Promise<ToolResult> {
    try {
      // No `execute`: the SDK returns the call instead of running anything.
      const r = await generateText({
        model: this.model, prompt: req.prompt, maxOutputTokens: req.maxOutputTokens, maxRetries: 0, abortSignal: signal,
        tools: { [req.toolName]: tool({ description: req.description, inputSchema: req.inputSchema }) }, toolChoice: "required",
      });
      const call = r.toolCalls[0];
      return call ? { ok: true, toolName: call.toolName, input: call.input } : { ok: false, error: "capability_missing" };
    } catch (e) {
      return { ok: false, error: mapError(e, signal) };
    }
  }
}

/** Deterministic provider for tests of AI features (ARCHITECTURE §3.2). Never calls a network. */
export class MockProvider implements AIProvider {
  readonly id = "mock";
  private readonly objects: unknown[];
  constructor(objects: unknown[] = []) { this.objects = [...objects]; }

  async *generateText(req: TextRequest): AsyncIterable<TextEvent> {
    for (const word of `mock: ${req.prompt.slice(0, 60)}`.split(/(?<= )/)) yield { type: "delta", text: word };
    yield { type: "done", usage: { inputTokens: null, outputTokens: null } };
  }

  async generateObject<T>(req: ObjectRequest<T>): Promise<ObjectResult<T>> {
    const v = req.schema.safeParse(this.objects.shift());
    return v.success ? { ok: true, value: v.data, attempts: 1 } : { ok: false, error: "schema_invalid", attempts: 1 };
  }

  async callTool(req: ToolRequest): Promise<ToolResult> {
    return { ok: true, toolName: req.toolName, input: {} };
  }
}
