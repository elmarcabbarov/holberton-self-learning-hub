import { describe, expect, it } from "vitest";
import { parseProject } from "../src/features/import/parseProject.ts";

// Synthetic page with the same structure as an intranet project page (not real curriculum text).
const PAGE = `Toggle navigation
42%
Pipes and Friends
 Novice
 By: Some Author
 Weight: 1
 Your score will be updated as you progress.
Description
Quiz
For this project, we expect you to look at these concepts:
Shell
Unix
Resources

Read or watch:

Intro to pipes
Quoting rules

man or help:

grep
sort
Learning Objectives

At the end of this project, you are expected to be able to explain to anyone, without the help of Google:

Pipes
What a pipe connects
How to send output of one program to another
Quoting
What single and double quotes change
Requirements
General
Allowed editors: vi, vim, emacs
All scripts end with a new line
More Info
Some extra notes here.
Tasks
 Report an issue
0. First filter
mandatory
Print the lines that match.
Repo:
1. Second filter
#advanced
2. Sort it out
mandatory
Copyright © 2026 Holberton Inc, All rights reserved.
AI
People`;

describe("parseProject", () => {
  const p = parseProject(PAGE);
  it("finds the title before the metadata block", () => expect(p.title).toBe("Pipes and Friends"));
  it("collects concepts and resources without labels", () => {
    expect(p.concepts).toEqual(["Shell", "Unix"]);
    expect(p.resources).toEqual(["Intro to pipes", "Quoting rules", "grep", "sort"]);
  });
  it("groups learning objectives under their headers", () => {
    expect(p.groups).toEqual([
      { name: "Pipes", objectives: ["What a pipe connects", "How to send output of one program to another"] },
      { name: "Quoting", objectives: ["What single and double quotes change"] },
    ]);
  });
  it("collects requirements and only task titles (never task bodies)", () => {
    expect(p.requirements).toEqual(["Allowed editors: vi, vim, emacs", "All scripts end with a new line"]);
    expect(p.tasks).toEqual([{ number: 0, title: "First filter" }, { number: 1, title: "Second filter" }, { number: 2, title: "Sort it out" }]);
    expect(JSON.stringify(p)).not.toContain("Print the lines that match");
  });
  it("fills tasks not shown on the page from the 'Task N of M' counter", () => {
    const q = parseProject("P\nBy: X\nTasks\n0. Only this one\nScore of the task\nTasks list\n0\n1\n2\nTask 0 of 2\n");
    expect(q.tasks).toEqual([{ number: 0, title: "Only this one" }, { number: 1, title: null }, { number: 2, title: null }]);
  });
  it("handles ungrouped objectives and CRLF", () => {
    const q = parseProject("My Project\r\nBy: X\r\nLearning Objectives\r\nWhat is a process\r\nHow fork works\r\nRequirements\r\n");
    expect(q.groups).toEqual([{ name: null, objectives: ["What is a process", "How fork works"] }]);
  });
  it("returns empty structures for unrelated text", () => {
    expect(parseProject("hello world").groups).toEqual([]);
  });
});

describe("intranet layouts", () => {
  it("takes all task titles from the 'Tasks list' summary with scores", () => {
    const q = parseProject("P\nBy: X\nTasks\n0. First\nBody text\n1 domain name pointing somewhere\nScore of the task\n20 /20 pts\nTasks list\n0\n1\n2\nTask 0 of 2\nTasks list\n0. First\n20/20\n1. Second\n10/10\n2. Third\n5/5\n");
    expect(q.tasks).toEqual([{ number: 0, title: "First" }, { number: 1, title: "Second" }, { number: 2, title: "Third" }]);
  });
  it("tolerates indented lines from other browsers", () => {
    const q = parseProject("Project badge\n100%\nMy Project\n\n    Novice\n    By: X\nLearning Objectives\nGeneral\n\n    You must be able to explain it\n    Know the acronyms\nRequirements\n");
    expect(q.title).toBe("My Project");
    expect(q.groups).toEqual([{ name: "General", objectives: ["You must be able to explain it", "Know the acronyms"] }]);
  });
});

describe("Codex review regressions (parser)", () => {
  it("keeps ambiguous lines as objectives instead of headings", () => {
    const q = parseProject("P\nBy: X\nLearning Objectives\nList the available signals\nHow to handle a signal\nRequirements\n");
    expect(q.groups).toEqual([{ name: null, objectives: ["List the available signals", "How to handle a signal"] }]);
  });
  it("ignores numbered steps inside a task body and respects the counter", () => {
    const q = parseProject("P\nBy: X\nTasks\n0. Run it\nmandatory\nDo this:\n1. Read the input\n2. Execute the command\nTask 0 of 0\n");
    expect(q.tasks).toEqual([{ number: 0, title: "Run it" }]);
  });
});
