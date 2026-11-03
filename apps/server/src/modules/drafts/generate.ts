import { z } from "zod";
import { AIErrorCode, DraftCardPayload, DraftQuestionPayload, type DraftPayload } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import type { ExamService } from "../exam-mode/service.ts";
import type { DraftSession } from "./ai.ts";
import { assemblePrompt } from "./prompts.ts";
import * as svc from "./service.ts";

// Keep the real item schemas in the provider's JSON schema. Invalid individual items are dropped,
// while an invalid envelope/oversized batch takes the registry's structured fallback path.
const cards = z.object({ cards: z.array(DraftCardPayload.nullable().catch(null)).min(1).max(20) });
const quiz = z.object({ questions: z.array(DraftQuestionPayload.nullable().catch(null)).min(1).max(10) });
type Batch = { cards?: (DraftPayload | null)[]; questions?: (DraftPayload | null)[] };

/** One deadline and signal cover every native/JSON/repair attempt, including a misbehaving adapter. */
export async function generate(db: Db, exam: ExamService, session: DraftSession, draft: ReturnType<typeof svc.row>, controller: AbortController) {
  const untrack = exam.track(controller);
  const deadline = setTimeout(() => controller.abort("timeout"), 60_000);
  const signal = controller.signal;
  const cancelled = new Promise<{ ok: false; error: string; attempts: number }>((resolve) => {
    const done = () => resolve({ ok: false, error: typeof signal.reason === "string" ? signal.reason : "cancelled", attempts: 0 });
    if (signal.aborted) done();
    else signal.addEventListener("abort", done, { once: true });
  });
  try {
    const prompt = assemblePrompt(draft.kind, draft.lang, draft.noteText);
    let attempts = 0;
    let error = "schema_invalid";
    let payloads: DraftPayload[] = [];
    let dropped = 0;
    while (attempts < 3 && !signal.aborted) {
      const result = await Promise.race([session.provider.generateObject<Batch>({ ...prompt,
        schema: draft.kind === "cards" ? cards : quiz, maxOutputTokens: session.maxOutputTokens, maxAttempts: 3 - attempts,
      }, signal), cancelled]);
      attempts += Math.max(1, result.attempts);
      if (signal.aborted) break;
      if (result.ok) {
        // Validate again at the domain boundary; never trust a provider implementation's types.
        const parsed = (draft.kind === "cards" ? cards : quiz).safeParse(result.value);
        if (!parsed.success) continue;
        const batch = "cards" in parsed.data ? parsed.data.cards : parsed.data.questions;
        payloads = batch.filter((p): p is DraftPayload => p !== null);
        dropped = batch.length - payloads.length;
        error = payloads.length > 0 ? "" : "schema_invalid";
        break;
      }
      error = AIErrorCode.safeParse(result.error).success ? result.error : "unknown";
      if (error !== "schema_invalid" && error !== "capability_missing" && error !== "unknown") break;
    }
    if (signal.aborted) {
      error = signal.reason === "exam_mode" ? "exam_mode" : signal.reason === "timeout" ? "timeout" : "cancelled";
      payloads = [];
    }
    svc.finish(db, draft.id, payloads, dropped, error || null);
  } catch {
    // SDK errors may include the note. Persist a safe code only, without logging the exception.
    svc.finish(db, draft.id, [], 0, signal.aborted ? (signal.reason === "exam_mode" ? "exam_mode" : signal.reason === "timeout" ? "timeout" : "cancelled") : "unknown");
  } finally {
    clearTimeout(deadline);
    untrack();
  }
}
