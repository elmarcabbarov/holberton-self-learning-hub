import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Goal, GoalList, GOAL_LIMITS, SpaceNoteList, TopicRefList } from "@hub/contracts";
import { signedInApp, type TestApp } from "./helpers.ts";

let t: TestApp;
let spaceId: string;
let topicId: string;
beforeEach(async () => {
  t = await signedInApp();
  spaceId = (await t.req({ method: "POST", url: "/api/spaces", payload: { name: "Shell" } })).json().id;
  topicId = (await t.req({ method: "POST", url: `/api/spaces/${spaceId}/topics`, payload: { name: "Pipes" } })).json().id;
});
afterEach(async () => { await t.close(); });

const newGoal = async (title = "Finish the shell project") =>
  Goal.parse((await t.req({ method: "POST", url: `/api/spaces/${spaceId}/goals`, payload: { title, criteria: "All tasks pass the checker" } })).json());
const addTask = async (goalId: string, text: string) => Goal.parse((await t.req({ method: "POST", url: `/api/goals/${goalId}/tasks`, payload: { text } })).json());

describe("goals", () => {
  it("creates a goal with checklist tasks and counts tasks completed", async () => {
    const g = await newGoal();
    expect(g).toMatchObject({ title: "Finish the shell project", criteria: "All tasks pass the checker", progress: { done: 0, total: 0 } });
    await addTask(g.id, "Read man pipe");
    const two = await addTask(g.id, "Write task 0");
    expect(two.tasks.map((x) => x.text)).toEqual(["Read man pipe", "Write task 0"]);
    const checked = Goal.parse((await t.req({ method: "PATCH", url: `/api/tasks/${two.tasks[0]!.id}`, payload: { done: true } })).json());
    expect(checked.progress).toEqual({ done: 1, total: 2 });
    const doneAt = checked.tasks[0]!.doneAt;
    const again = Goal.parse((await t.req({ method: "PATCH", url: `/api/tasks/${two.tasks[0]!.id}`, payload: { done: true } })).json());
    expect(again.tasks[0]!.doneAt).toBe(doneAt); // re-checking keeps the original time
    const unchecked = Goal.parse((await t.req({ method: "PATCH", url: `/api/tasks/${two.tasks[0]!.id}`, payload: { done: false } })).json());
    expect(unchecked.tasks[0]).toMatchObject({ done: false, doneAt });
    expect(unchecked.progress.done).toBe(0);
    const rechecked = Goal.parse((await t.req({ method: "PATCH", url: `/api/tasks/${two.tasks[0]!.id}`, payload: { done: true } })).json());
    expect(rechecked.tasks[0]!.doneAt).toBe(doneAt); // first completion survives unchecking
    const list = GoalList.parse((await t.req({ method: "GET", url: `/api/spaces/${spaceId}/goals` })).json());
    expect(list.goals).toHaveLength(1);
  });

  it("reorders, edits and deletes tasks; a reorder must name every task once", async () => {
    const g = await newGoal();
    await addTask(g.id, "a"); await addTask(g.id, "b");
    const three = await addTask(g.id, "c");
    const [a, b, c] = three.tasks.map((x) => x.id);
    const re = Goal.parse((await t.req({ method: "PUT", url: `/api/goals/${g.id}/tasks/order`, payload: { taskIds: [c, a, b] } })).json());
    expect(re.tasks.map((x) => x.text)).toEqual(["c", "a", "b"]);
    for (const bad of [[a, b], [a, a, b], [a, b, c, c]]) {
      expect((await t.req({ method: "PUT", url: `/api/goals/${g.id}/tasks/order`, payload: { taskIds: bad } })).statusCode).toBe(400);
    }
    const edited = Goal.parse((await t.req({ method: "PATCH", url: `/api/tasks/${a}`, payload: { text: "a2" } })).json());
    expect(edited.tasks.find((x) => x.id === a)!.text).toBe("a2");
    const deleted = Goal.parse((await t.req({ method: "DELETE", url: `/api/tasks/${b}`, payload: {} })).json());
    expect(deleted.tasks.map((x) => x.text)).toEqual(["c", "a2"]);
  });

  it("archives and restores a goal; an archived goal's tasks cannot change", async () => {
    const g = await addTask((await newGoal()).id, "x");
    await t.req({ method: "PATCH", url: `/api/goals/${g.id}`, payload: { archived: true } });
    expect(GoalList.parse((await t.req({ method: "GET", url: `/api/spaces/${spaceId}/goals` })).json()).goals).toHaveLength(0);
    expect(GoalList.parse((await t.req({ method: "GET", url: `/api/spaces/${spaceId}/goals?archived=1` })).json()).goals).toHaveLength(1);
    expect((await t.req({ method: "PATCH", url: `/api/tasks/${g.tasks[0]!.id}`, payload: { done: true } })).statusCode).toBe(409);
    expect((await t.req({ method: "POST", url: `/api/goals/${g.id}/tasks`, payload: { text: "y" } })).statusCode).toBe(409);
    const back = Goal.parse((await t.req({ method: "PATCH", url: `/api/goals/${g.id}`, payload: { archived: false } })).json());
    expect(back.archivedAt).toBeNull();
  });

  it("validates input and limits", async () => {
    for (const payload of [{ title: "" }, { title: "x".repeat(201) }, { title: "ok", criteria: "x".repeat(2001) }]) {
      expect((await t.req({ method: "POST", url: `/api/spaces/${spaceId}/goals`, payload })).statusCode).toBe(400);
    }
    expect((await t.req({ method: "POST", url: "/api/spaces/00000000-0000-4000-8000-000000000000/goals", payload: { title: "x" } })).statusCode).toBe(404);
    expect((await t.req({ method: "PATCH", url: `/api/goals/${(await newGoal()).id}`, payload: {} })).statusCode).toBe(400);
    const g = await newGoal("many");
    for (let i = 0; i < GOAL_LIMITS.tasksPerGoal; i++) t.app.database.sqlite.prepare("INSERT INTO goal_tasks (id, goal_id, text, position, created_at) VALUES (?, ?, 'x', ?, 'x')").run(crypto.randomUUID(), g.id, i);
    expect((await t.req({ method: "POST", url: `/api/goals/${g.id}/tasks`, payload: { text: "one more" } })).statusCode).toBe(409);
    await t.req({ method: "PATCH", url: `/api/spaces/${spaceId}`, payload: { archived: true } });
    expect((await t.req({ method: "POST", url: `/api/spaces/${spaceId}/goals`, payload: { title: "x" } })).statusCode).toBe(409);
  });
});

describe("note ↔ topic links", () => {
  it("links notes to topics in the database only and lists them per space", async () => {
    const note = (await t.req({ method: "POST", url: "/api/notes", payload: { path: "pipes.md", content: "# Pipes\n" } })).json();
    const before = (await t.req({ method: "GET", url: `/api/notes/${note.id}` })).json().version.sha256;
    const set = TopicRefList.parse((await t.req({ method: "PUT", url: `/api/notes/${note.id}/topics`, payload: { topicIds: [topicId, topicId] } })).json());
    expect(set.topics).toEqual([{ id: topicId, name: "Pipes", spaceId, spaceName: "Shell" }]);
    expect((await t.req({ method: "GET", url: `/api/notes/${note.id}` })).json().version.sha256).toBe(before); // file untouched
    expect(SpaceNoteList.parse((await t.req({ method: "GET", url: `/api/spaces/${spaceId}/notes` })).json()).notes).toEqual([
      { id: note.id, title: "Pipes", path: "pipes.md", vault: "hub", topicIds: [topicId] },
    ]);
    expect(TopicRefList.parse((await t.req({ method: "GET", url: "/api/topics" })).json()).topics.map((x) => x.id)).toEqual([topicId]);
    const cleared = TopicRefList.parse((await t.req({ method: "PUT", url: `/api/notes/${note.id}/topics`, payload: { topicIds: [] } })).json());
    expect(cleared.topics).toEqual([]);
    expect((await t.req({ method: "PUT", url: `/api/notes/${note.id}/topics`, payload: { topicIds: ["00000000-0000-4000-8000-000000000000"] } })).statusCode).toBe(400);
    expect((await t.req({ method: "PUT", url: "/api/notes/00000000-0000-4000-8000-000000000000/topics", payload: { topicIds: [] } })).statusCode).toBe(404);
    expect((await t.req({ method: "GET", url: "/api/notes/00000000-0000-4000-8000-000000000000/topics" })).statusCode).toBe(404);
    expect((await t.req({ method: "GET", url: "/api/spaces/00000000-0000-4000-8000-000000000000/notes" })).statusCode).toBe(404);
  });
});
