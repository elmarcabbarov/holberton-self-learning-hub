import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Space, SpaceDetail, SpaceList, Topic } from "@hub/contracts";
import { signedInApp, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeEach(async () => { t = await signedInApp(); });
afterEach(async () => { await t.close(); });

async function createSpace(name = "Simple Shell") {
  const res = await t.req({ method: "POST", url: "/api/spaces", payload: { name } });
  expect(res.statusCode).toBe(201);
  return Space.parse(res.json());
}

describe("spaces", () => {
  it("creates, lists and reads a space (Azerbaijani names kept intact)", async () => {
    const s = await createSpace("  Linux əsasları  ");
    expect(s.name).toBe("Linux əsasları");
    const list = SpaceList.parse((await t.req({ method: "GET", url: "/api/spaces" })).json());
    expect(list.spaces.map((x) => x.id)).toEqual([s.id]);
    const detail = SpaceDetail.parse((await t.req({ method: "GET", url: `/api/spaces/${s.id}` })).json());
    expect(detail.topics).toEqual([]);
  });

  it("rejects empty and too long names with a validation error", async () => {
    for (const name of ["   ", "x".repeat(121)]) {
      const res = await t.req({ method: "POST", url: "/api/spaces", payload: { name } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("validation_failed");
    }
  });

  it("renames and archives (soft delete); archived spaces leave the list", async () => {
    const s = await createSpace();
    const renamed = Space.parse((await t.req({ method: "PATCH", url: `/api/spaces/${s.id}`, payload: { name: "Shell" } })).json());
    expect(renamed.name).toBe("Shell");
    const archived = Space.parse((await t.req({ method: "PATCH", url: `/api/spaces/${s.id}`, payload: { archived: true } })).json());
    expect(archived.archivedAt).not.toBeNull();
    const list = SpaceList.parse((await t.req({ method: "GET", url: "/api/spaces" })).json());
    expect(list.spaces).toEqual([]);
    const restored = Space.parse((await t.req({ method: "PATCH", url: `/api/spaces/${s.id}`, payload: { archived: false } })).json());
    expect(restored.archivedAt).toBeNull();
  });

  it("returns 404 for unknown or malformed ids", async () => {
    expect((await t.req({ method: "GET", url: "/api/spaces/00000000-0000-4000-8000-000000000000" })).statusCode).toBe(404);
    expect((await t.req({ method: "GET", url: "/api/spaces/not-an-id" })).statusCode).toBe(404);
  });

  it("requires a session", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/spaces", headers: { host: "127.0.0.1:3000" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("topics", () => {
  it("appends topics in order and counts only active ones", async () => {
    const s = await createSpace();
    const names = ["fork", "execve", "waitpid"];
    for (const name of names) {
      const res = await t.req({ method: "POST", url: `/api/spaces/${s.id}/topics`, payload: { name } });
      expect(res.statusCode).toBe(201);
    }
    let detail = SpaceDetail.parse((await t.req({ method: "GET", url: `/api/spaces/${s.id}` })).json());
    expect(detail.topics.map((x) => x.name)).toEqual(names);
    expect(detail.topics.map((x) => x.position)).toEqual([0, 1, 2]);
    expect(detail.topicCount).toBe(3);

    const first = detail.topics[0]!;
    const archived = Topic.parse((await t.req({ method: "PATCH", url: `/api/topics/${first.id}`, payload: { archived: true } })).json());
    expect(archived.archivedAt).not.toBeNull();
    detail = SpaceDetail.parse((await t.req({ method: "GET", url: `/api/spaces/${s.id}` })).json());
    expect(detail.topics.map((x) => x.name)).toEqual(["execve", "waitpid"]);
    expect(detail.topicCount).toBe(2);
  });

  it("does not add topics to an archived space", async () => {
    const s = await createSpace();
    await t.req({ method: "PATCH", url: `/api/spaces/${s.id}`, payload: { archived: true } });
    const res = await t.req({ method: "POST", url: `/api/spaces/${s.id}/topics`, payload: { name: "x" } });
    expect(res.statusCode).toBe(404);
  });

  it("rejects an empty update", async () => {
    const s = await createSpace();
    const topic = Topic.parse((await t.req({ method: "POST", url: `/api/spaces/${s.id}/topics`, payload: { name: "fork" } })).json());
    const res = await t.req({ method: "PATCH", url: `/api/topics/${topic.id}`, payload: {} });
    expect(res.statusCode).toBe(400);
  });
});
