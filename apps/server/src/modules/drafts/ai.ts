import type { z } from "zod";

/** Structural registry port: SDKs and modules/ai stay behind compose/ (D-067). */
export interface DraftSession {
  provider: {
    generateObject<T>(req: { system?: string; prompt: string; schema: z.ZodType<T>; maxOutputTokens: number; maxAttempts?: number }, signal: AbortSignal): Promise<
      { ok: true; value: T; attempts: number } | { ok: false; error: string; attempts: number }
    >;
  };
  providerId: string;
  model: string;
  revision: number;
  maxOutputTokens: number;
  locality: "local" | "remote";
}
export interface DraftAI { session(): Promise<DraftSession | null> }
