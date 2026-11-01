import { describe, expect, it } from "vitest";
import { parseNote, searchFold, splitFrontmatter } from "../src/modules/vault/parse.ts";

describe("splitFrontmatter", () => {
  it("splits a leading YAML block", () => {
    expect(splitFrontmatter("---\ntitle: X\n---\nbody")).toEqual({ yaml: "title: X", content: "body" });
  });
  it("ignores --- that does not open the file or never closes", () => {
    expect(splitFrontmatter("text\n---\na: 1\n---").yaml).toBeNull();
    expect(splitFrontmatter("---\na: 1\nno close").yaml).toBeNull();
  });
});

describe("parseNote", () => {
  const note = [
    "---", "title: Proseslər", "tags: [linux, \"os/process\"]", "aliases:", "  - procs", "---",
    "# fork və execve",
    "Bax [[Shell/waitpid#WNOHANG|waitpid]] və ![[diagram.png]], həmçinin [[#Siqnallar]] və [[note#^abc123]].",
    "Markdown link: [exec](exec%20family.md#return) and [web](https://man7.org) #syscalls #2024 #linux/signals",
    "```c", "// [[NotALink]] #notatag", "```",
    "`[[inline]]` text",
  ].join("\n");
  const p = parseNote(note, "file");

  it("uses frontmatter title, tags and aliases", () => {
    expect(p.title).toBe("Proseslər");
    expect(p.aliases).toEqual(["procs"]);
    expect(p.tags.sort()).toEqual(["linux", "linux/signals", "os/process", "syscalls"]);
  });

  it("extracts wiki links, embeds, anchors and local markdown links; skips code and URLs", () => {
    expect(p.links).toEqual([
      { kind: "wiki", target: "Shell/waitpid", anchor: "WNOHANG" },
      { kind: "embed", target: "diagram.png", anchor: null },
      { kind: "wiki", target: "", anchor: "Siqnallar" },
      { kind: "wiki", target: "note", anchor: "^abc123" },
      { kind: "md", target: "exec family.md", anchor: "return" },
    ]);
  });

  it("falls back to first H1, then file name", () => {
    expect(parseNote("# Başlıq\n", "f").title).toBe("Başlıq");
    expect(parseNote("no heading", "fayl").title).toBe("fayl");
  });

  it("keeps invalid YAML editable and records the error", () => {
    const r = parseNote("---\na: [\n---\nbody", "f");
    expect(r.frontmatter).toBeNull();
    expect(r.frontmatterError).not.toBeNull();
    expect(r.body).toContain("body");
  });

  it("bounds YAML alias expansion", () => {
    const bomb = "---\na: &a [x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c]\n---\n";
    expect(parseNote(bomb, "f").frontmatterError).not.toBeNull();
  });
});

describe("searchFold", () => {
  it("folds Azerbaijani letters so ASCII queries match", () => {
    expect(searchFold("Qısa İzah Əsas Şəbəkə Çağırış Öyrən Üzv")).toBe("qisa izah esas sebeke cagiris oyren uzv");
    expect(searchFold("INSTALL")).toBe("install");
  });
});

describe("Codex review regressions (parser)", () => {
  it("resolves reference-style links and images through definitions", () => {
    const p = parseNote("[label][ref] and ![pic][img]\n\n[ref]: Note.md#Part\n[img]: assets/a.png", "f");
    expect(p.links).toEqual([
      { kind: "md", target: "Note.md", anchor: "Part" },
      { kind: "md-embed", target: "assets/a.png", anchor: null },
    ]);
  });
  it("finds wiki links whose label contains formatting, but not inside code", () => {
    const p = parseNote("[[Note|**bold** label]] `[[no]]`\n\n```\n[[no2]]\n```", "f");
    expect(p.links).toEqual([{ kind: "wiki", target: "Note", anchor: null }]);
  });
  it("keeps %23 in file names instead of treating it as an anchor", () => {
    expect(parseNote("[x](part%23one.md#sec)", "f").links).toEqual([{ kind: "md", target: "part#one.md", anchor: "sec" }]);
  });
  it("reads formatted H1 text recursively", () => {
    expect(parseNote("# **Important**", "f").title).toBe("Important");
    expect(parseNote("# A **bold** title", "f").title).toBe("A bold title");
  });
});
