import { TutorEvent, type SendTutorMessage } from "@hub/contracts";
import { ApiError } from "../api.ts";

/** Decode bytes incrementally: neither UTF-8 characters nor SSE frames align with fetch chunks. */
export async function readTutorEvents(body: ReadableStream<Uint8Array>, receive: (event: TutorEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const drain = () => {
    let boundary;
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const lines = frame.split(/\r?\n/);
      const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
      const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
      if (data) receive(TutorEvent.parse({ event, data: JSON.parse(data) }));
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      drain();
      if (done) break;
    }
    if (buffer.trim()) throw new Error("Truncated SSE frame");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function sendTutorMessage(threadId: string, payload: SendTutorMessage, signal: AbortSignal, receive: (event: TutorEvent) => void) {
  const res = await fetch(`/api/tutor/threads/${threadId}/messages`, {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(payload), signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: { code?: string } } | null;
    throw new ApiError(res.status, data?.error?.code ?? "unknown");
  }
  if (!res.body || !res.headers.get("content-type")?.startsWith("text/event-stream")) throw new ApiError(502, "unknown");
  let terminal = false;
  await readTutorEvents(res.body, (event) => {
    receive(event);
    if (event.event === "error") throw new ApiError(502, event.data.code);
    if (event.event === "done") terminal = true;
  });
  if (!terminal) throw new ApiError(502, "interrupted");
}
