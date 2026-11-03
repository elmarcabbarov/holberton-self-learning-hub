import { readFileSync } from "node:fs";

export const PROMPT_VERSION = "1";
// Static application assets; these paths never contain user input.
const load = (name: string) => readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), "utf8").trim();
const system = load("system");
const kinds = { cards: load("cards"), quiz: load("quiz") };
export function assemblePrompt(kind: "cards" | "quiz", lang: "en" | "az", noteText: string) {
  return {
    system: `${system}\n\n${kinds[kind]}\n\nReply language: ${lang === "az" ? "Azerbaijani (az)" : "English (en)"}. Keep excerpts verbatim in the source language.`,
    prompt: JSON.stringify({ untrusted_note_data: { text: noteText } }),
  };
}
