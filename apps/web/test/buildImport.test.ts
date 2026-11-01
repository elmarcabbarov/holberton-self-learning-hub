import { describe, expect, it } from "vitest";
import { allObjectiveKeys, buildImport, noteFileName, type ImportTexts } from "../src/features/import/buildImport.ts";
import type { ParsedProject } from "../src/features/import/parseProject.ts";

const tx: ImportTexts = {
  cardFront: (o) => `Explain without Google: ${o}`, cardBack: (r) => `Check: ${r.slice(0, 2).join(", ")}`, ungroupedTopic: "Objectives",
  taskPlaceholder: (n) => `Task ${n}`, noteIntro: (d) => `Imported ${d}`,
  headings: { concepts: "Concepts", resources: "Resources", objectives: "Learning objectives", requirements: "Requirements", tasks: "Tasks" },
};
const parsed: ParsedProject = {
  title: "Pipes: and Friends?", concepts: ["Shell"], resources: ["man grep", "Quoting"],
  groups: [{ name: "Pipes", objectives: ["What a pipe is", "How to chain"] }, { name: null, objectives: ["Why quotes"] }],
  requirements: ["vi only"], tasks: [{ number: 0, title: "First" }, { number: 1, title: null }],
};

describe("buildImport", () => {
  it("turns selected objectives into self-check cards per topic", () => {
    const sel = allObjectiveKeys(parsed); sel.delete("0:1");
    const r = buildImport(parsed, { spaceName: "Pipes", selected: sel, withNote: false }, tx, "2026-11-02");
    expect(r.topics).toEqual([
      { name: "Pipes", cards: [{ front: "Explain without Google: What a pipe is", back: "Check: man grep, Quoting" }] },
      { name: "Objectives", cards: [{ front: "Explain without Google: Why quotes", back: "Check: man grep, Quoting" }] },
    ]);
    expect(r.note).toBeNull();
  });
  it("writes a project note with checklists and task placeholders", () => {
    const r = buildImport(parsed, { spaceName: "Pipes: and Friends?", selected: allObjectiveKeys(parsed), withNote: true }, tx, "2026-11-02");
    expect(r.note?.path).toBe("Holberton/Pipes and Friends.md");
    expect(r.note?.content).toContain("### Pipes\n- [ ] What a pipe is\n- [ ] How to chain");
    expect(r.note?.content).toContain("- [ ] 1. Task 1");
  });
  it("makes safe file names", () => {
    expect(noteFileName('a/b\\c:d*e?"f<g>h|i.')).toBe("a b c d e f g h i");
    expect(noteFileName("...")).toBe("Project");
    expect(noteFileName(".NET basics")).toBe("NET basics");
    expect(noteFileName("CON")).toBe("CON project");
  });
});
