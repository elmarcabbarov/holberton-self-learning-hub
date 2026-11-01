import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NoteConflict, NoteDetail, NoteList, NoteSummary, VaultStatus } from "@hub/contracts";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { signedInApp, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeEach(async () => { t = await signedInApp(); });
afterEach(async () => { await t.close(); });

describe("notes API", () => {
  it("creates, lists, reads and saves a note", async () => {
    const created = await t.req({ method: "POST", url: "/api/notes", payload: { path: "Shell/execve.md", content: "# execve\n" } });
    expect(created.statusCode).toBe(201);
    const { id } = NoteSummary.parse(created.json());

    const list = NoteList.parse((await t.req({ method: "GET", url: "/api/notes" })).json());
    expect(list.notes.map((n) => n.path)).toEqual(["Shell/execve.md"]);

    const detail = NoteDetail.parse((await t.req({ method: "GET", url: `/api/notes/${id}` })).json());
    expect(detail).toMatchObject({ content: "# execve\n", eol: "lf", bom: false, title: "execve" });

    const saved = await t.req({ method: "PUT", url: `/api/notes/${id}`, payload: { content: "# execve(2)\n", expectedSha256: detail.version.sha256 } });
    expect(saved.statusCode).toBe(200);
    const again = NoteDetail.parse((await t.req({ method: "GET", url: `/api/notes/${id}` })).json());
    expect(again.content).toBe("# execve(2)\n");
  });

  it("returns 409 with the current version for a stale save", async () => {
    const { id } = NoteSummary.parse((await t.req({ method: "POST", url: "/api/notes", payload: { path: "a.md", content: "1\n" } })).json());
    const v = NoteDetail.parse((await t.req({ method: "GET", url: `/api/notes/${id}` })).json()).version;
    writeFileSync(join(t.dir, "vault", "a.md"), "changed outside\n");
    const res = await t.req({ method: "PUT", url: `/api/notes/${id}`, payload: { content: "mine\n", expectedSha256: v.sha256 } });
    expect(res.statusCode).toBe(409);
    expect(NoteConflict.parse(res.json()).error.details.current.sha256).not.toBe(v.sha256);
  });

  it("rejects bad paths and duplicate creates", async () => {
    expect((await t.req({ method: "POST", url: "/api/notes", payload: { path: "../x.md", content: "" } })).statusCode).toBe(400);
    expect((await t.req({ method: "POST", url: "/api/notes", payload: { path: "b.md", content: "" } })).statusCode).toBe(201);
    expect((await t.req({ method: "POST", url: "/api/notes", payload: { path: "b.md", content: "" } })).statusCode).toBe(409);
    expect((await t.req({ method: "POST", url: "/api/notes", payload: { path: "B.md", content: "" } })).json().error.messageKey).toBe("notes.collision");
  });

  it("exposes vault status", async () => {
    const s = VaultStatus.parse((await t.req({ method: "GET", url: "/api/vault/status" })).json());
    expect(s.lastReconcile?.error).toBeNull();
  });

  it("requires a session", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/notes", headers: { host: "127.0.0.1:3000" } })).statusCode).toBe(401);
  });
});

describe("data directory lock", () => {
  it("refuses a second server on the same data directory", async () => {
    await expect(buildApp(loadConfig({ HUB_DATA: t.dir, HUB_VAULT_WATCH: "0" }))).rejects.toThrow(/Another Hub server/);
  });
});
