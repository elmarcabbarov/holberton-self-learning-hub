import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionList, SessionOverview, StudySession } from "@hub/contracts";
import { signedInApp, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeEach(async () => { t = await signedInApp(); });
afterEach(async () => { await t.close(); });

const overview = async () => SessionOverview.parse((await t.req({ method: "GET", url: "/api/sessions/overview" })).json());

describe("study sessions", () => {
  it("start → stop → optional reflection; only one session is open at a time", async () => {
    expect(await overview()).toEqual({ current: null, last: null });
    const s = StudySession.parse((await t.req({ method: "POST", url: "/api/sessions", payload: { objective: "Understand fork" } })).json());
    expect((await overview()).current!.id).toBe(s.id);
    const second = await t.req({ method: "POST", url: "/api/sessions", payload: { objective: "Another" } });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.details.session.id).toBe(s.id);
    expect((await t.req({ method: "PUT", url: `/api/sessions/${s.id}/reflection`, payload: { learned: "x" } })).statusCode).toBe(409);

    const stopped = StudySession.parse((await t.req({ method: "POST", url: `/api/sessions/${s.id}/stop`, payload: {} })).json());
    expect(stopped.endedAt).not.toBeNull();
    const again = StudySession.parse((await t.req({ method: "POST", url: `/api/sessions/${s.id}/stop`, payload: {} })).json());
    expect(again.endedAt).toBe(stopped.endedAt); // stopping twice keeps the first end time

    const r = StudySession.parse((await t.req({ method: "PUT", url: `/api/sessions/${s.id}/reflection`, payload: { learned: "fork copies the process", stuck: "  ", next: "Read about exec" } })).json());
    expect(r).toMatchObject({ learned: "fork copies the process", stuck: null, next: "Read about exec" });
    expect(r.reflectedAt).not.toBeNull();
    expect(await overview()).toMatchObject({ current: null, last: { id: s.id, next: "Read about exec" } });
    expect(SessionList.parse((await t.req({ method: "GET", url: "/api/sessions?limit=5" })).json()).sessions).toHaveLength(1);
  });

  it("links a session to a goal task and takes the goal's space; rejects mismatched or unknown links", async () => {
    const space = (await t.req({ method: "POST", url: "/api/spaces", payload: { name: "Shell" } })).json();
    const other = (await t.req({ method: "POST", url: "/api/spaces", payload: { name: "Other" } })).json();
    const goal = (await t.req({ method: "POST", url: `/api/spaces/${space.id}/goals`, payload: { title: "Finish" } })).json();
    const task = (await t.req({ method: "POST", url: `/api/goals/${goal.id}/tasks`, payload: { text: "Task 0" } })).json().tasks[0];
    const unknown = "00000000-0000-4000-8000-000000000000";
    for (const payload of [{ taskId: task.id, spaceId: other.id }, { taskId: unknown }, { spaceId: unknown }]) {
      expect((await t.req({ method: "POST", url: "/api/sessions", payload })).statusCode).toBe(400);
    }
    const s = StudySession.parse((await t.req({ method: "POST", url: "/api/sessions", payload: { taskId: task.id } })).json());
    expect(s).toMatchObject({ spaceId: space.id, spaceName: "Shell", taskId: task.id, taskText: "Task 0", objective: "" });
  });

  it("validates input", async () => {
    expect((await t.req({ method: "POST", url: "/api/sessions", payload: { objective: "x".repeat(301) } })).statusCode).toBe(400);
    expect((await t.req({ method: "POST", url: "/api/sessions/00000000-0000-4000-8000-000000000000/stop", payload: {} })).statusCode).toBe(404);
    expect((await t.req({ method: "GET", url: "/api/sessions?limit=0" })).statusCode).toBe(400);
  });
});
