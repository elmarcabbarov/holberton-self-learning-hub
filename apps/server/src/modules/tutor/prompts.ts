import { readFileSync } from "node:fs";
import type { TutorMessage, TutorThread } from "@hub/contracts";

export const PROMPT_VERSION = "1";
// Static application assets, read once. Never paths supplied by a peer.
const load = (name: string) => readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), "utf8").trim();
const base = load("system");
const modes = { project: load("mode-project"), explain: load("mode-explain") };
const hints = [1, 2, 3, 4].map((n) => load(`hint-${n}`));
const approach = [1, 2, 3, 4, 5].map((n) => load(`approach-${n}`));

/** JSON escaping prevents peer text from closing the envelope. Keep complete turns, newest first. */
export function assemblePrompt(thread: TutorThread, messages: TutorMessage[], assistant: TutorMessage) {
  const current = messages.findIndex((m) => m.id === assistant.replyTo);
  const history = current < 0 ? messages : messages.slice(0, current + 1);
  const turns: { role: string; content: string }[][] = [];
  for (const m of history) {
    if (m.role === "user") turns.push([{ role: "user", content: m.content }]);
    else if (m.status === "complete" && m.id !== assistant.id) turns.at(-1)?.push({ role: "assistant", content: m.content });
  }
  const kept: typeof turns = [];
  let chars = 0;
  for (const turn of turns.toReversed()) {
    const size = JSON.stringify(turn).length;
    if (chars + size > 12_000 && kept.length > 0) break;
    kept.unshift(turn);
    chars += size;
  }
  return {
    system: [base, modes[assistant.mode ?? "project"],
      assistant.hintLevel ? hints[assistant.hintLevel - 1] : "",
      assistant.approachStep ? approach[assistant.approachStep - 1] : "",
      assistant.kind === "explain" && assistant.mode === "project" ? "Explain the concept only; keep all project mode restrictions." : "",
      `Reply language: ${assistant.lang === "az" ? "Azerbaijani (az)" : "English (en)"}.`,
    ].filter(Boolean).join("\n\n"),
    prompt: JSON.stringify({ untrusted_peer_data: { framework: thread.framework, turns: kept } }),
  };
}
