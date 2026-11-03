import { z } from "zod";

/** AI is off by default (ARCHITECTURE §3, D-065). `mock` exists only for tests (HUB_AI_MOCK=1). */
export const AIMode = z.enum(["disabled", "openai_compatible", "anthropic", "mock"]);
export type AIMode = z.infer<typeof AIMode>;
export const AICapability = z.enum(["text", "structured", "tools"]);
export const AIErrorCode = z.enum(["unreachable", "auth", "rate_limited", "context_overflow", "schema_invalid", "refused", "timeout", "cancelled", "capability_missing", "unknown"]);

export const ProbeResult = z.object({ capability: AICapability, ok: z.boolean(), error: AIErrorCode.nullable(), ms: z.number().int() });
export type ProbeResult = z.infer<typeof ProbeResult>;

export const AIStatus = z.object({
  mode: AIMode,
  baseUrl: z.string(),
  model: z.string(),
  maxOutputTokens: z.number().int(),
  revision: z.number().int(),
  /** `local` = loopback/LAN address; `remote` = the prompt leaves this machine. */
  locality: z.enum(["local", "remote"]).nullable(),
  /** The key is never returned: only whether one is stored, a short mask, and whether it is encrypted at rest. */
  key: z.object({ set: z.boolean(), mask: z.string().nullable(), encrypted: z.boolean() }),
  ready: z.boolean(),
  /** Results of the last test, only while the settings are unchanged since. */
  probes: z.array(ProbeResult).nullable(),
  probedAt: z.string().nullable(),
});
export type AIStatus = z.infer<typeof AIStatus>;

/** Key changes are explicit: keep, replace or clear — never a masked placeholder sent back. */
export const KeyOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("keep") }),
  z.object({ op: z.literal("replace"), value: z.string().trim().min(8).max(500) }),
  z.object({ op: z.literal("clear") }),
]);
export const SaveAISettings = z.object({
  mode: AIMode,
  baseUrl: z.string().trim().max(500).default(""),
  model: z.string().trim().max(200).default(""),
  maxOutputTokens: z.number().int().min(64).max(32_000).default(1024),
  key: KeyOp.default({ op: "keep" }),
  /** Optimistic concurrency: the revision the form was loaded with. */
  revision: z.number().int(),
});
export type SaveAISettings = z.infer<typeof SaveAISettings>;
