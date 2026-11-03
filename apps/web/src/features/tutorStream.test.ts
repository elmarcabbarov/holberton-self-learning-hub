import { describe, expect, it } from "vitest";
import { readTutorEvents } from "./tutorStream.ts";
import type { TutorEvent } from "@hub/contracts";

function stream(parts: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({ start(c) { for (const p of parts) c.enqueue(p); c.close(); } });
}
const encode = (s: string) => new TextEncoder().encode(s);
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("tutor SSE", () => {
  it("handles every byte boundary, including UTF-8 and split frames", async () => {
    const source = encode(frame("delta", { text: "Öyrənək" }));
    const events: TutorEvent[] = [];
    await readTutorEvents(stream(Array.from(source, (b) => new Uint8Array([b]))), (e) => events.push(e));
    expect(events).toEqual([{ event: "delta", data: { text: "Öyrənək" } }]);
  });
  it("reads multiple events in one chunk and CRLF boundaries", async () => {
    const events: TutorEvent[] = [];
    const text = frame("delta", { text: "first" }) + frame("delta", { text: "second" });
    await readTutorEvents(stream([encode(text.replaceAll("\n", "\r\n"))]), (e) => events.push(e));
    expect(events.map((e) => e.data)).toEqual([{ text: "first" }, { text: "second" }]);
  });
  it("delivers deltas before the stream closes, including split CRLF delimiters", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let received!: () => void;
    const delta = new Promise<void>((resolve) => { received = resolve; });
    const events: TutorEvent[] = [];
    const reading = readTutorEvents(new ReadableStream({ start(c) { controller = c; } }), (e) => { events.push(e); received(); });
    controller.enqueue(encode('event: delta\r\ndata: {"text":"live"}\r'));
    controller.enqueue(encode('\n\r'));
    controller.enqueue(encode('\n'));
    await delta;
    expect(events).toEqual([{ event: "delta", data: { text: "live" } }]);
    controller.close();
    await reading;
  });
  it("rejects malformed contracts and truncated frames", async () => {
    await expect(readTutorEvents(stream([encode(frame("delta", { text: 42 }))]), () => {})).rejects.toThrow();
    await expect(readTutorEvents(stream([encode('event: delta\ndata: {"text":"partial"}')]), () => {})).rejects.toThrow();
  });
});
