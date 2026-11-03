import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CardList, ImportProjectResult, NoteDetail, SpaceDetail } from "@hub/contracts";
import { signedInApp, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeEach(async () => { t = await signedInApp(); });
afterEach(async () => { await t.close(); });

const payload = (note: { path: string; content: string } | null = { path: "Holberton/Pipes.md", content: "# Pipes\n" }) => ({
  spaceName: "Pipes and Friends",
  topics: [
    { name: "Pipes", cards: [{ front: "Explain: what a pipe connects", back: "Check yourself" }, { front: "Explain: sending output onward", back: "Check yourself" }] },
    { name: "Quoting", cards: [{ front: "Explain: single vs double quotes", back: "Check yourself" }] },
  ],
  note,
});

describe("POST /api/import/project", () => {
  it("creates the space, topics, self-check cards and the project note", async () => {
    const res = await t.req({ method: "POST", url: "/api/import/project", payload: payload() });
    expect(res.statusCode).toBe(201);
    const r = ImportProjectResult.parse(res.json());
    expect(r).toMatchObject({ topics: 2, cards: 3, notePath: "Holberton/Pipes.md" });
    const space = SpaceDetail.parse((await t.req({ method: "GET", url: `/api/spaces/${r.spaceId}` })).json());
    expect(space.topics.map((x) => x.name)).toEqual(["Pipes", "Quoting"]);
    const cards = CardList.parse((await t.req({ method: "GET", url: `/api/cards?spaceId=${r.spaceId}` })).json());
    expect(cards.cards).toHaveLength(3);
    const note = NoteDetail.parse((await t.req({ method: "GET", url: `/api/notes/${r.noteId}` })).json());
    expect(note.content).toBe("# Pipes\n");
  });

  it("never overwrites an existing note: the second import gets a suffixed path", async () => {
    await t.req({ method: "POST", url: "/api/import/project", payload: payload() });
    const r = ImportProjectResult.parse((await t.req({ method: "POST", url: "/api/import/project", payload: payload() })).json());
    expect(r.notePath).toBe("Holberton/Pipes (2).md");
  });

  it("points task-note links at the project note's real path when its name was taken (Codex review)", async () => {
    const body = {
      ...payload({ path: "Holberton/Pipes/Pipes.md", content: "# Pipes\n" }),
      taskNotes: [{ path: "Holberton/Pipes/0. First.md", content: "# 0. First\n\nProject: [[Holberton/Pipes/Pipes]]\n" }],
    };
    const first = ImportProjectResult.parse((await t.req({ method: "POST", url: "/api/import/project", payload: body })).json());
    const second = ImportProjectResult.parse((await t.req({ method: "POST", url: "/api/import/project", payload: body })).json());
    expect(second.notePath).toBe("Holberton/Pipes/Pipes (2).md");
    const task = (await t.req({ method: "GET", url: `/api/spaces/${second.spaceId}/notes` })).json().notes.find((n: { path: string }) => n.path.includes("First"));
    expect(NoteDetail.parse((await t.req({ method: "GET", url: `/api/notes/${task.id}` })).json()).content).toContain("[[Holberton/Pipes/Pipes (2)]]");
    const back = (id: string) => t.req({ method: "GET", url: `/api/notes/${id}/backlinks` }).then((r) => r.json().links.map((l: { id: string }) => l.id));
    expect(await back(second.noteId!)).toContain(task.id);
    expect(await back(first.noteId!)).not.toContain(task.id);
  });

  it("works without a note and rejects invalid input before creating anything", async () => {
    const r = ImportProjectResult.parse((await t.req({ method: "POST", url: "/api/import/project", payload: payload(null) })).json());
    expect(r.noteId).toBeNull();
    const before = (await t.req({ method: "GET", url: "/api/spaces" })).json().spaces.length;
    const bad = payload(null); bad.topics[0]!.cards[0]!.front = "";
    expect((await t.req({ method: "POST", url: "/api/import/project", payload: bad })).statusCode).toBe(400);
    expect((await t.req({ method: "GET", url: "/api/spaces" })).json().spaces.length).toBe(before);
  });
});

describe("Codex review regressions (import)", () => {
  it("undoes the database part when writing the note fails, and reports skipped notes", async () => {
    const before = (await t.req({ method: "GET", url: "/api/spaces" })).json().spaces.length;
    const original = t.app.vault.create.bind(t.app.vault);
    t.app.vault.create = async () => { throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }); };
    const res = await t.req({ method: "POST", url: "/api/import/project", payload: payload() });
    expect(res.statusCode).toBe(500);
    expect((await t.req({ method: "GET", url: "/api/spaces" })).json().spaces.length).toBe(before);
    expect(t.app.database.sqlite.prepare("SELECT COUNT(*) AS n FROM cards").get()).toEqual({ n: 0 });
    t.app.vault.create = original;
    const skipped = ImportProjectResult.parse((await t.req({ method: "POST", url: "/api/import/project", payload: payload({ path: "Holberton/CON.md", content: "x" }) })).json());
    expect(skipped).toMatchObject({ noteId: null, noteSkipped: true, cards: 3 });
  });
});
