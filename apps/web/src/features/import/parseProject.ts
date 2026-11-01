/**
 * Parses text copied from a Holberton intranet project page (Ctrl+A, Ctrl+C) into a structure the Hub
 * can import (docs/INTRANET_FINDINGS.md §2). Pure and tolerant: unknown lines are ignored, nothing is guessed
 * silently — the preview lets the user fix the result before anything is saved. Task solutions are never read.
 */
export interface ObjectiveGroup { name: string | null; objectives: string[] }
/** The intranet shows one task at a time, so only some titles are in the copied text; the rest are null. */
export interface ParsedTask { number: number; title: string | null }
export interface ParsedProject {
  title: string | null;
  concepts: string[];
  resources: string[];
  groups: ObjectiveGroup[];
  requirements: string[];
  tasks: ParsedTask[];
}

const NOISE = /^(toggle navigation|description|quiz|ai|people|report an issue|welcome to the chat!.*|\d{1,3}%|novice|amateur|master|beginner|intermediate)$/i;
const LEVELS = /^(novice|amateur|master|beginner|intermediate|advanced)$/i;
const META = /^(by:|weight:|your score|manual qa review|project will start|project over|an auto review|checker was released)/i;
const QUESTIONISH = /^(what|how|why|when|where|which|who|understand|know|explain|describe|use|you must|you should|be able|the difference|difference)\b/i;

type Section = "none" | "concepts" | "resources" | "objectives" | "requirements" | "moreinfo" | "tasks";

function sectionOf(line: string): Section | null {
  const l = line.toLowerCase();
  if (l.startsWith("for this project, we expect you to look at these concepts")) return "concepts";
  if (l === "resources") return "resources";
  if (l === "learning objectives") return "objectives";
  if (l === "requirements") return "requirements";
  if (l === "more info") return "moreinfo";
  if (l === "tasks") return "tasks";
  if (l.startsWith("copyright") || l.startsWith("©")) return "none";
  return null;
}

const TASK_MARKER = /^(mandatory|optional|#advanced|advanced)$/i;
/** Score line under a task in the intranet's "Tasks list" summary, e.g. "20/20" or "12 /12 pts". */
const TASK_SCORE = /^\d+\s*\/\s*\d+(\s*pts)?$/i;
const titleCase = (line: string) => line.split(/\s+/).every((w) => /^[^a-z]/.test(w) || /^(and|or|of|the|in|on|to|a|an|vs)$/.test(w));

/**
 * Group headings need strong evidence (Codex review): "General", a known concept/resource title,
 * or a short Title Case line. Anything ambiguous stays an objective, so no objective is lost.
 */
function isGroupHeader(line: string, next: string | undefined, known: Set<string>): boolean {
  if (next === undefined || !QUESTIONISH.test(next)) return false;
  if (QUESTIONISH.test(line) || /[?.:]$/.test(line)) return false;
  if (/^general$/i.test(line) || known.has(line.toLowerCase())) return true;
  return line.split(/\s+/).length <= 4 && titleCase(line);
}

export function parseProject(raw: string): ParsedProject {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: ParsedProject = { title: null, concepts: [], resources: [], groups: [], requirements: [], tasks: [] };

  // Title: the line before the metadata block ("By: …"), skipping level words and percentages.
  const byIdx = lines.findIndex((l) => /^by:/i.test(l));
  if (byIdx > 0) {
    for (let i = byIdx - 1; i >= 0; i--) {
      if (LEVELS.test(lines[i]!) || /^\d{1,3}%$/.test(lines[i]!)) continue;
      out.title = lines[i]!;
      break;
    }
  }
  if (!out.title) out.title = lines.find((l) => !NOISE.test(l) && !META.test(l) && !sectionOf(l)) ?? null;

  let section: Section = "none";
  let lastTaskIndex = -1;
  let taskHeaders = 0;
  const known = new Set<string>();
  let group: ObjectiveGroup | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const s = sectionOf(line);
    if (s) { section = s; group = null; continue; }
    if (NOISE.test(line) || META.test(line)) continue;
    switch (section) {
      case "concepts": out.concepts.push(line); known.add(line.toLowerCase()); break;
      case "resources":
        if (/^(read or watch|man or help|watch|read):?$/i.test(line)) break;
        out.resources.push(line);
        known.add(line.toLowerCase());
        break;
      case "objectives": {
        if (/^at the end of this project, you are expected to be able to/i.test(line)) break;
        const next = lines[i + 1];
        const nextIsSection = next !== undefined && sectionOf(next) !== null;
        if (!nextIsSection && isGroupHeader(line, next, known)) {
          group = { name: line, objectives: [] };
          out.groups.push(group);
          break;
        }
        if (!group) { group = { name: null, objectives: [] }; out.groups.push(group); }
        group.objectives.push(line);
        break;
      }
      case "requirements":
        if (/^general$/i.test(line)) break;
        out.requirements.push(line);
        break;
      case "tasks": {
        // A task heading is the first numbered line, or one followed by a task marker (classic layout).
        // Numbered steps inside a task body are not tasks.
        const m = /^(\d{1,3})\.\s+(.+)$/.exec(line);
        const nextLine = lines[i + 1];
        const followedByMarker = nextLine !== undefined && (TASK_MARKER.test(nextLine) || TASK_SCORE.test(nextLine));
        if (m && (taskHeaders === 0 || followedByMarker) && !out.tasks.some((x) => x.number === Number(m[1]))) {
          out.tasks.push({ number: Number(m[1]), title: m[2]! });
          taskHeaders++;
        }
        const of = /^task \d+ of (\d+)$/i.exec(line);
        if (of) lastTaskIndex = Math.max(lastTaskIndex, Number(of[1]));
        break;
      }
      default: break;
    }
  }
  out.groups = out.groups.filter((g) => g.objectives.length > 0);
  // "Task 0 of 5" → tasks 0..5; fill the ones whose titles were not on the copied page.
  if (lastTaskIndex >= 0) out.tasks = out.tasks.filter((x) => x.number <= lastTaskIndex);
  for (let n = 0; n <= lastTaskIndex; n++) if (!out.tasks.some((x) => x.number === n)) out.tasks.push({ number: n, title: null });
  out.tasks.sort((a, b) => a.number - b.number);
  return out;
}
