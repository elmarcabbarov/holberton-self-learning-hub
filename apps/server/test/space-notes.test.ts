import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreatedSpaceNote, ImportProjectResult, NoteDetail, Space, SpaceDetail, SpaceNoteList, SpaceRefList } from "@hub/contracts";
import { signedInApp, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeEach(async () => { t = await signedInApp(); });
afterEach(async () => { await t.close(); });

const space = async (name = "0x0B. C - malloc") => Space.parse((await t.req({ method: "POST", url: "/api/spaces", payload: { name } })).json());
const notesOf = async (id: string) => SpaceNoteList.parse((await t.req({ method: "GET", url: `/api/spaces/${id}/notes` })).json()).notes;
const create = (id: string, payload: Record<string, unknown>) => t.req({ method: "POST", url: `/api/spaces/${id}/notes`, payload });

describe("many notes per space (HSLH-028)", () => {
  it("creates notes in the space's folder, links them, and never overwrites a taken name", async () => {
    const s = await space();
    const a = CreatedSpaceNote.parse((await create(s.id, { title: "0. Float like a butterfly" })).json());
    expect(a.path).toBe("Spaces/0x0B. C - malloc/0. Float like a butterfly.md");
    const b = CreatedSpaceNote.parse((await create(s.id, { title: "0. Float like a butterfly" })).json());
    expect(b.path).toBe("Spaces/0x0B. C - malloc/0. Float like a butterfly (2).md");
    await create(s.id, { title: "1. The fourth" });
    const notes = await notesOf(s.id);
    expect(notes.map((n) => n.title)).toEqual(["0. Float like a butterfly", "0. Float like a butterfly", "1. The fourth"]);
    expect(notes.every((n) => n.direct && n.topicIds.length === 0)).toBe(true);
    expect(NoteDetail.parse((await t.req({ method: "GET", url: `/api/notes/${a.noteId}` })).json()).content).toBe("# 0. Float like a butterfly\n");

    // The folder is fixed once set: renaming the space does not move where new notes go.
    await t.req({ method: "PATCH", url: `/api/spaces/${s.id}`, payload: { name: "Renamed" } });
    expect(CreatedSpaceNote.parse((await create(s.id, { title: "2. Next" })).json()).path).toBe("Spaces/0x0B. C - malloc/2. Next.md");
    expect(SpaceDetail.parse((await t.req({ method: "GET", url: `/api/spaces/${s.id}` })).json()).noteFolder).toBe("Spaces/0x0B. C - malloc");
  });

  it("never stores a folder the vault rejects: a space named CON.notes still gets notes (Codex review)", async () => {
    const s = await space("CON.notes");
    const made = await create(s.id, { title: "First" });
    expect(made.statusCode).toBe(201);
    expect(CreatedSpaceNote.parse(made.json()).path).toBe("Spaces/CON project.notes/First.md");
    expect((await create(s.id, { title: "Second" })).statusCode).toBe(201);
  });

  it("links to a topic of the same space only, and refuses archived spaces", async () => {
    const s = await space();
    const other = await space("Other");
    const topic = (await t.req({ method: "POST", url: `/api/spaces/${s.id}/topics`, payload: { name: "malloc" } })).json();
    const foreign = (await t.req({ method: "POST", url: `/api/spaces/${other.id}/topics`, payload: { name: "x" } })).json();
    const made = CreatedSpaceNote.parse((await create(s.id, { title: "Notes", topicId: topic.id })).json());
    expect((await notesOf(s.id))[0]).toMatchObject({ id: made.noteId, direct: true, topicIds: [topic.id] });
    expect((await create(s.id, { title: "Bad", topicId: foreign.id })).statusCode).toBe(400);
    expect((await create(s.id, { title: "   " })).statusCode).toBe(400);
    await t.req({ method: "PATCH", url: `/api/spaces/${s.id}`, payload: { archived: true } });
    expect((await create(s.id, { title: "Late" })).statusCode).toBe(409);
    expect((await create("00000000-0000-4000-8000-000000000000", { title: "x" })).statusCode).toBe(404);
  });

  it("links an existing note to several spaces from the editor; one entry per note even with topic links too", async () => {
    const a = await space("A");
    const b = await space("B");
    const topic = (await t.req({ method: "POST", url: `/api/spaces/${a.id}/topics`, payload: { name: "t" } })).json();
    const note = (await t.req({ method: "POST", url: "/api/notes", payload: { path: "free.md", content: "# Free\n" } })).json();
    const set = SpaceRefList.parse((await t.req({ method: "PUT", url: `/api/notes/${note.id}/spaces`, payload: { spaceIds: [a.id, b.id, a.id] } })).json());
    expect(set.spaces.map((x) => x.name)).toEqual(["A", "B"]);
    await t.req({ method: "PUT", url: `/api/notes/${note.id}/topics`, payload: { topicIds: [topic.id] } });
    expect(await notesOf(a.id)).toEqual([{ id: note.id, title: "Free", path: "free.md", vault: "hub", direct: true, topicIds: [topic.id] }]);
    expect((await notesOf(b.id)).map((n) => n.id)).toEqual([note.id]);
    expect(SpaceRefList.parse((await t.req({ method: "PUT", url: `/api/notes/${note.id}/spaces`, payload: { spaceIds: [b.id] } })).json()).spaces.map((x) => x.id)).toEqual([b.id]);
    expect(await notesOf(a.id)).toEqual([{ id: note.id, title: "Free", path: "free.md", vault: "hub", direct: false, topicIds: [topic.id] }]);
    expect((await t.req({ method: "PUT", url: `/api/notes/${note.id}/spaces`, payload: { spaceIds: ["00000000-0000-4000-8000-000000000000"] } })).statusCode).toBe(400);
    expect((await t.req({ method: "GET", url: "/api/notes/00000000-0000-4000-8000-000000000000/spaces" })).statusCode).toBe(404);
  });

  it("project import: project note and one note per task in the project's folder, all linked to the space", async () => {
    const res = await t.req({ method: "POST", url: "/api/import/project", payload: {
      spaceName: "0x0B. C - malloc, free",
      topics: [{ name: "Memory", cards: [{ front: "Explain: malloc", back: "Check yourself" }] }],
      note: { path: "Holberton/0x0B. C - malloc, free/0x0B. C - malloc, free.md", content: "# Project\n" },
      taskNotes: [
        { path: "Holberton/0x0B. C - malloc, free/0. Float like a butterfly.md", content: "# 0. Float like a butterfly\n" },
        { path: "Holberton/0x0B. C - malloc, free/1. The fourth.md", content: "# 1. The fourth\n" },
        { path: "../escape.md", content: "x" },
      ],
    } });
    expect(res.statusCode).toBe(201);
    const r = ImportProjectResult.parse(res.json());
    expect(r).toMatchObject({ taskNotes: 2, taskNotesSkipped: 1, noteSkipped: false });
    const notes = await notesOf(r.spaceId);
    expect(notes.map((n) => n.path)).toEqual([
      "Holberton/0x0B. C - malloc, free/0. Float like a butterfly.md",
      "Holberton/0x0B. C - malloc, free/0x0B. C - malloc, free.md",
      "Holberton/0x0B. C - malloc, free/1. The fourth.md",
    ]);
    expect(notes.every((n) => n.direct)).toBe(true);
    // Notes created later from the space land next to the imported ones.
    expect(CreatedSpaceNote.parse((await create(r.spaceId, { title: "Scratch" })).json()).path).toBe("Holberton/0x0B. C - malloc, free/Scratch.md");
  });

  it("an import without notes reports nothing created", async () => {
    const r = ImportProjectResult.parse((await t.req({ method: "POST", url: "/api/import/project", payload: { spaceName: "X", topics: [], note: null } })).json());
    expect(r).toMatchObject({ noteId: null, noteSkipped: false, taskNotes: 0, taskNotesSkipped: 0 });
  });
});
