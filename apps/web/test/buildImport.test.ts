import { describe, expect, it } from "vitest";
import { allObjectiveKeys, buildImport, noteFileName, type ImportTexts } from "../src/features/import/buildImport.ts";
import type { ParsedProject } from "../src/features/import/parseProject.ts";

const tx: ImportTexts = {
  cardFront: (o) => `Explain without Google: ${o}`, cardBack: (r) => `Check: ${r.slice(0, 2).join(", ")}`, ungroupedTopic: "Objectives",
  taskPlaceholder: (n) => `Task ${n}`, noteIntro: (d) => `Imported ${d}`,
  headings: { concepts: "Concepts", resources: "Resources", objectives: "Learning objectives", requirements: "Requirements", tasks: "Tasks" },
  taskNote: { project: "Project", read: "What I read", problem: "The problem in my own words", approach: "Approach", pseudocode: "Pseudocode", notes: "Notes" },
};
const parsed: ParsedProject = {
  title: "Pipes: and Friends?", concepts: ["Shell"], resources: ["man grep", "Quoting"],
  groups: [{ name: "Pipes", objectives: ["What a pipe is", "How to chain"] }, { name: null, objectives: ["Why quotes"] }],
  requirements: ["vi only"], tasks: [{ number: 0, title: "First" }, { number: 1, title: null }],
};

describe("buildImport", () => {
  it("turns selected objectives into self-check cards per topic", () => {
    const sel = allObjectiveKeys(parsed); sel.delete("0:1");
    const r = buildImport(parsed, { spaceName: "Pipes", selected: sel, withNote: false, withTaskNotes: false }, tx, "2026-11-02");
    expect(r.topics).toEqual([
      { name: "Pipes", cards: [{ front: "Explain without Google: What a pipe is", back: "Check: man grep, Quoting" }] },
      { name: "Objectives", cards: [{ front: "Explain without Google: Why quotes", back: "Check: man grep, Quoting" }] },
    ]);
    expect(r.note).toBeNull();
    expect(r.taskNotes).toEqual([]);
  });
  it("writes a project note with checklists and task placeholders", () => {
    const r = buildImport(parsed, { spaceName: "Pipes: and Friends?", selected: allObjectiveKeys(parsed), withNote: true, withTaskNotes: false }, tx, "2026-11-02");
    expect(r.note?.path).toBe("Holberton/Pipes and Friends/Pipes and Friends.md");
    expect(r.note?.content).toContain("### Pipes\n- [ ] What a pipe is\n- [ ] How to chain");
    expect(r.note?.content).toContain("- [ ] 1. Task 1");
  });
  it("writes one note per task next to the project note, linking back to it (HSLH-028)", () => {
    const r = buildImport(parsed, { spaceName: "Pipes: and Friends?", selected: allObjectiveKeys(parsed), withNote: true, withTaskNotes: true }, tx, "2026-11-02");
    expect(r.taskNotes.map((n) => n.path)).toEqual(["Holberton/Pipes and Friends/0. First.md", "Holberton/Pipes and Friends/1. Task 1.md"]);
    expect(r.taskNotes[0]!.content).toBe("# 0. First\n\nProject: [[Pipes and Friends]]\n\n## What I read\n\n## The problem in my own words\n\n## Approach\n\n## Pseudocode\n\n## Notes\n");
    const alone = buildImport(parsed, { spaceName: "Pipes", selected: allObjectiveKeys(parsed), withNote: false, withTaskNotes: true }, tx, "2026-11-02");
    expect(alone.taskNotes[0]!.content).not.toContain("[["); // no link to a project note that is not created
  });
  it("makes safe file names", () => {
    expect(noteFileName('a/b\\c:d*e?"f<g>h|i.')).toBe("a b c d e f g h i");
    expect(noteFileName("...")).toBe("Project");
    expect(noteFileName(".NET basics")).toBe("NET basics");
    expect(noteFileName("CON")).toBe("CON project");
  });
});
