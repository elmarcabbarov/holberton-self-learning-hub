import type { ImportProjectRequest } from "@hub/contracts";
import type { ParsedProject } from "./parseProject.ts";

export interface ImportTexts {
  cardFront(objective: string): string;
  cardBack(resources: string[]): string;
  ungroupedTopic: string;
  taskPlaceholder(n: number): string;
  noteIntro(date: string): string;
  headings: { concepts: string; resources: string; objectives: string; requirements: string; tasks: string };
}

/** File-safe name for the project note (OBSIDIAN_STRATEGY §5): no reserved characters, no trailing dot/space. */
export function noteFileName(title: string): string {
  const noControl = [...title].map((c) => (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f ? " " : c)).join("");
  const cleaned = noControl.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return (cleaned || "Project").slice(0, 120);
}

/** Builds the import request from a parsed page and the user's choices in the preview. */
export function buildImport(p: ParsedProject, choices: { spaceName: string; selected: Set<string>; withNote: boolean }, tx: ImportTexts, date: string): ImportProjectRequest {
  const key = (gi: number, oi: number) => `${gi}:${oi}`;
  const topics = p.groups
    .map((g, gi) => ({
      name: (g.name ?? tx.ungroupedTopic).slice(0, 120),
      cards: g.objectives
        .map((o, oi) => ({ o, k: key(gi, oi) }))
        .filter(({ k }) => choices.selected.has(k))
        .map(({ o }) => ({ front: tx.cardFront(o).slice(0, 5000), back: tx.cardBack(p.resources).slice(0, 5000) })),
    }))
    .filter((t) => t.cards.length > 0);

  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
  const sections = [
    `# ${choices.spaceName}`, "", `> ${tx.noteIntro(date)}`,
    ...(p.concepts.length ? ["", `## ${tx.headings.concepts}`, list(p.concepts)] : []),
    ...(p.resources.length ? ["", `## ${tx.headings.resources}`, list(p.resources)] : []),
    ...(p.groups.length ? ["", `## ${tx.headings.objectives}`, ...p.groups.flatMap((g) => [...(g.name ? ["", `### ${g.name}`] : []), g.objectives.map((o) => `- [ ] ${o}`).join("\n")])] : []),
    ...(p.requirements.length ? ["", `## ${tx.headings.requirements}`, list(p.requirements)] : []),
    ...(p.tasks.length ? ["", `## ${tx.headings.tasks}`, p.tasks.map((t) => `- [ ] ${t.number}. ${t.title ?? tx.taskPlaceholder(t.number)}`).join("\n")] : []),
  ];
  return {
    spaceName: choices.spaceName.trim().slice(0, 120),
    topics,
    note: choices.withNote ? { path: `Holberton/${noteFileName(choices.spaceName)}.md`, content: `${sections.join("\n")}\n` } : null,
  };
}

/** Every objective selected by default. */
export const allObjectiveKeys = (p: ParsedProject) => new Set(p.groups.flatMap((g, gi) => g.objectives.map((_, oi) => `${gi}:${oi}`)));
