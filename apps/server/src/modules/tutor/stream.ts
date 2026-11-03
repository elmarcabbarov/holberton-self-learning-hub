import { PassThrough, Readable } from "node:stream";
import { once } from "node:events";
import type { FastifyReply } from "fastify";
import { TutorEvent, TutorFailureCode, type TutorMessage } from "@hub/contracts";
import type { Db } from "../../lib/db/index.ts";
import type { ExamService } from "../exam-mode/service.ts";
import type { TutorSession } from "./ai.ts";
import { finalize } from "./service.ts";

function frame(event: TutorEvent): string {
  const validated = TutorEvent.parse(event); // every event, including replays and errors
  return `event: ${validated.event}\ndata: ${JSON.stringify(validated.data)}\n\n`;
}
const start = (m: TutorMessage): TutorEvent => ({ event: "start", data: { messageId: m.id, mode: m.mode ?? "project", ...(m.hintLevel ? { hintLevel: m.hintLevel } : {}), ...(m.approachStep ? { approachStep: m.approachStep } : {}) } });
const headers = (reply: FastifyReply) => reply.type("text/event-stream").header("cache-control", "no-store").header("x-accel-buffering", "no");
export function replay(reply: FastifyReply, m: TutorMessage) {
  return headers(reply).send(Readable.from([frame(start(m)), frame({ event: "delta", data: { text: m.content } }), frame({ event: "done", data: { messageId: m.id } })]));
}

/** Single owner for finalization. Abort finalizes synchronously, even if the adapter is slow to unwind. */
export function generate(reply: FastifyReply, db: Db, exam: ExamService, session: TutorSession, m: TutorMessage, prompt: { system: string; prompt: string }) {
  const stream = new PassThrough();
  const controller = new AbortController();
  let finished = false;
  let text = "";
  const finish = (status: "complete" | "error" | "cancelled", code: string | null) => {
    if (finished) return;
    try {
      if (!finalize(db, m.id, status, text, code)) throw new Error("Tutor message already finalized");
    } catch {
      // Never acknowledge an answer whose commit failed. Recovery handles the remaining placeholder.
      finished = true;
      stream.destroy();
      controller.abort("storage");
      return;
    }
    finished = true;
    if (!stream.destroyed) {
      stream.end(frame(status === "complete" ? { event: "done", data: { messageId: m.id } } : { event: "error", data: { code: TutorFailureCode.parse(code) } }));
    }
  };
  const onAbort = () => {
    const code = controller.signal.reason === "exam_mode" ? "exam_mode" : controller.signal.reason === "timeout" ? "timeout" : "cancelled";
    finish(code === "cancelled" ? "cancelled" : "error", code);
  };
  const onClose = () => { if (!finished) controller.abort("cancelled"); };
  reply.raw.on("close", onClose);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const untrack = exam.track(controller);
  // A complete provider response is bounded by the configured token budget. The adapter enforces tokens;
  // this additional character ceiling bounds a broken adapter's memory (not a token estimator).
  const maxChars = session.maxOutputTokens * 16;
  const run = async () => {
    let stop: (() => void) | undefined;
    try {
      if (finished) return;
      stream.write(frame(start(m)));
      const source = session.provider.generateText({ ...prompt, maxOutputTokens: session.maxOutputTokens }, controller.signal);
      const iter = source[Symbol.asyncIterator]();
      stop = () => { void iter.return?.().catch(() => undefined); };
      // Wait on abort as well as next(): a provider must not pin shutdown or leave streaming rows behind.
      const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true }));
      aborted.catch(() => undefined);
      while (!finished) {
        const item = await Promise.race([iter.next(), aborted]);
        if (finished) break;
        if (item.done) { finish("error", "unknown"); break; } // a truncated provider stream is never a success
        const ev = item.value;
        if (ev.type === "error") { const c = TutorFailureCode.safeParse(ev.code); finish("error", c.success ? c.data : "unknown"); break; }
        if (ev.type === "done") { finish("complete", null); break; }
        const delta = ev.text.slice(0, Math.max(0, maxChars - text.length));
        text += delta;
        if (delta && !stream.write(frame({ event: "delta", data: { text: delta } }))) await once(stream, "drain", { signal: controller.signal });
        if (delta.length < ev.text.length || text.length >= maxChars) {
          finish("complete", null);
          controller.abort("output_limit");
        }
      }
    } catch {
      if (!finished) finish("error", "unknown"); // never SDK messages, prompt text or causes
    } finally {
      clearTimeout(timeout);
      if (!controller.signal.aborted) controller.abort("finished");
      stop?.();
      untrack();
      reply.raw.off("close", onClose);
      controller.signal.removeEventListener("abort", onAbort);
    }
  };
  const timeout = setTimeout(() => controller.abort("timeout"), 60_000);
  headers(reply).send(stream);
  const completion = new Promise<void>((resolve) => setImmediate(() => { void run().finally(resolve); }));
  return { reply, completion };
}
