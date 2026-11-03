/** Structural port: tutor never imports the AI registry or its SDKs (D-066). */
export interface TutorSession {
  provider: {
    generateText(req: { system?: string; prompt: string; maxOutputTokens: number }, signal: AbortSignal): AsyncIterable<
      { type: "delta"; text: string } | { type: "done"; usage: { inputTokens: number | null; outputTokens: number | null } } | { type: "error"; code: string }
    >;
  };
  providerId: string;
  model: string;
  revision: number;
  maxOutputTokens: number;
  locality: "local" | "remote";
}
export interface TutorAI { session(): Promise<TutorSession | null> }
