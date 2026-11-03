import { noteFileName, type ImportProjectRequest } from "@hub/contracts";
export { noteFileName };
import type { ParsedProject } from "./parseProject.ts";

export interface ImportTexts {
  cardFront(objective: string): string;
  cardBack(resources: string[]): string;
  ungroupedTopic: string;
  taskPlaceholder(n: number): string;
  noteIntro(date: string): string;
  headings: { concepts: string; resources: string; objectives: string; requirements: string; tasks: string };
  /** Headings of a task note (HSLH-028), in the UI language: the note is the learner's own file. */
  taskNote: { project: string; read: string; problem: string; approach: string; pseudocode: string; notes: string };
}

/** The server accepts at most this many task notes per import (contracts `ImportProjectRequest`). */
export const MAX_TASK_NOTES = 100;
/** Task notes left out by the limit; the preview and the result say so (D-068: nothing is dropped silently). */
export const omittedTaskNotes = (p: ParsedProject) => Math.max(0, p.tasks.length - MAX_TASK_NOTES);

/** Builds the import request from a parsed page and the user's choices in the preview. */
export function buildImport(p: ParsedProject, choices: { spaceName: string; selected: Set<string>; withNote: boolean; withTaskNotes: boolean }, tx: ImportTexts, date: string): ImportProjectRequest {
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
  // Holberton is Projects → Tasks: the project note and one note per task share the project's folder (HSLH-028).
  const project = noteFileName(choices.spaceName);
  const folder = `Holberton/${project}`;
  const taskNotes = choices.withTaskNotes ? p.tasks.slice(0, MAX_TASK_NOTES).map((task) => {
    const title = `${task.number}. ${task.title ?? tx.taskPlaceholder(task.number)}`;
    const h = tx.taskNote;
    const content = [
      `# ${title}`, "",
      ...(choices.withNote ? [`${h.project}: [[${folder}/${project}]]`, ""] : []),
      `## ${h.read}`, "", `## ${h.problem}`, "", `## ${h.approach}`, "", `## ${h.pseudocode}`, "", `## ${h.notes}`, "",
    ].join("\n");
    return { path: `${folder}/${noteFileName(title)}.md`, content };
  }) : [];
  return {
    spaceName: choices.spaceName.trim().slice(0, 120),
    topics,
    note: choices.withNote ? { path: `${folder}/${project}.md`, content: `${sections.join("\n")}\n` } : null,
    taskNotes,
  };
}

/** Every objective selected by default. */
export const allObjectiveKeys = (p: ParsedProject) => new Set(p.groups.flatMap((g, gi) => g.objectives.map((_, oi) => `${gi}:${oi}`)));
