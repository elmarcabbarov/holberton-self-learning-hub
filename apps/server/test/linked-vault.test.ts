import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NoteDetail, NoteList, SearchResults, VaultImport, VaultStatus } from "@hub/contracts";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { signedInApp, type TestApp } from "./helpers.ts";

let t: TestApp;
let linked: string;

/** Every file under `dir` with size and mtime: proves the Hub wrote nothing there. */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const st = statSync(p); out.push(`${p}:${st.size}:${st.mtimeMs}`); }
    }
  };
  walk(dir);
  return out.sort();
}

beforeEach(async () => {
  linked = mkdtempSync(join(tmpdir(), "hub-linked-"));
  mkdirSync(join(linked, "Shell"));
  writeFileSync(join(linked, "Shell", "pipes.md"), "# Pipes\nSee [[quoting]] and #shell\n");
  writeFileSync(join(linked, "Shell", "quoting.md"), "# Quoting\r\nsingle vs double\r\n");
  mkdirSync(join(linked, ".obsidian"));
  writeFileSync(join(linked, ".obsidian", "app.json"), "{}");
  t = await signedInApp({ HUB_LINKED_VAULT: linked });
});
afterEach(async () => { await t.close(); rmSync(linked, { recursive: true, force: true }); });

const list = async () => NoteList.parse((await t.req({ method: "GET", url: "/api/notes" })).json()).notes;
const status = async () => VaultStatus.parse((await t.req({ method: "GET", url: "/api/vault/status" })).json());
const linkedNote = async (path: string) => (await list()).find((n) => n.vault === "linked" && n.path === path)!;

describe("linked read-only vault", () => {
  it("indexes the linked vault next to the Hub vault, read-only, with vault-local links", async () => {
    await t.req({ method: "POST", url: "/api/notes", payload: { path: "Shell/pipes.md", content: "# Mine about pipes\n[[quoting]]" } });
    await t.req({ method: "POST", url: "/api/notes", payload: { path: "quoting.md", content: "hub quoting" } });
    const notes = await list();
    expect(notes.map((n) => `${n.vault}:${n.path}`)).toEqual(["hub:Shell/pipes.md", "hub:quoting.md", "linked:Shell/pipes.md", "linked:Shell/quoting.md"]);
    const pipes = await linkedNote("Shell/pipes.md");
    expect(pipes.readOnlyReason).toBe("linked");

    const meta = (await t.req({ method: "GET", url: `/api/notes/${pipes.id}/meta` })).json();
    const quoting = await linkedNote("Shell/quoting.md");
    expect(meta.links[0]).toMatchObject({ target: "quoting", state: "resolved", targetId: quoting.id });
    expect(meta.tags).toEqual(["shell"]);
    const hubPipes = notes.find((n) => n.vault === "hub" && n.path === "Shell/pipes.md")!;
    const hubQuoting = notes.find((n) => n.vault === "hub" && n.path === "quoting.md")!;
    expect((await t.req({ method: "GET", url: `/api/notes/${hubPipes.id}/meta` })).json().links[0].targetId).toBe(hubQuoting.id);

    const detail = NoteDetail.parse((await t.req({ method: "GET", url: `/api/notes/${quoting.id}` })).json());
    expect(detail).toMatchObject({ vault: "linked", eol: "crlf", content: "# Quoting\nsingle vs double\n" });
    const put = await t.req({ method: "PUT", url: `/api/notes/${quoting.id}`, payload: { content: "changed", expectedSha256: detail.version.sha256 } });
    expect(put.statusCode).toBe(409);
    expect(put.json().error.details).toEqual({ reason: "linked" });

    const hits = SearchResults.parse((await t.req({ method: "GET", url: "/api/notes/search?q=pipes" })).json()).hits;
    expect(hits.map((h) => h.vault).sort()).toEqual(["hub", "linked"]);
    const card = await t.req({ method: "POST", url: "/api/cards", payload: { topicId: null, noteId: pipes.id, front: "What does a pipe do?", back: "Connects stdout to stdin" } });
    expect(card.statusCode).toBe(201);
  });

  it("never writes to the linked folder, even across restarts and reconciles", async () => {
    const before = snapshot(linked);
    await t.app.linkedVault!.reconcile();
    const dir = t.dir;
    await t.app.close();
    const app = await buildApp(loadConfig({ HUB_DATA: dir, HUB_VAULT_WATCH: "0", HUB_LINKED_VAULT: linked }));
    await app.linkedVault!.reconcile();
    await app.close();
    t = await signedInApp({ HUB_LINKED_VAULT: linked });
    rmSync(dir, { recursive: true, force: true });
    expect(snapshot(linked)).toEqual(before);
  });

  it("keeps notes when the folder is unavailable, and comes back when it returns", async () => {
    const id = (await linkedNote("Shell/pipes.md")).id;
    const away = `${linked}-away`;
    renameSync(linked, away);
    await t.app.linkedVault!.reconcile();
    expect((await status()).linked).toMatchObject({ state: "unavailable", notes: 2 });
    expect((await list()).filter((n) => n.vault === "linked" && !n.missing)).toHaveLength(2);
    expect((await t.req({ method: "GET", url: `/api/notes/${id}` })).statusCode).toBe(503);
    renameSync(away, linked);
    await t.app.linkedVault!.reconcile();
    expect((await status()).linked!.state).toBe("ready");
    expect((await t.req({ method: "GET", url: `/api/notes/${id}` })).statusCode).toBe(200);
  });

  it("an empty folder marks nothing missing until confirmed", async () => {
    unlinkSync(join(linked, "Shell", "pipes.md"));
    unlinkSync(join(linked, "Shell", "quoting.md"));
    await t.app.linkedVault!.reconcile();
    expect((await status()).linked!.state).toBe("empty_unconfirmed");
    expect((await list()).filter((n) => n.vault === "linked" && n.missing)).toHaveLength(0);
    expect((await t.req({ method: "POST", url: "/api/vault/linked/rebind", payload: {} })).statusCode).toBe(204);
    expect((await status()).linked!.state).toBe("ready");
    expect((await list()).filter((n) => n.vault === "linked" && n.missing)).toHaveLength(2);
  });

  it("a different folder at the same path changes nothing until rebound", async () => {
    const id = (await linkedNote("Shell/pipes.md")).id;
    renameSync(linked, `${linked}-old`);
    mkdirSync(join(linked, "Shell"), { recursive: true });
    writeFileSync(join(linked, "Shell", "pipes.md"), "# Someone else's pipes\n");
    try {
      await t.app.linkedVault!.reconcile();
      expect((await status()).linked!.state).toBe("replaced");
      expect(t.app.linkedVault!.get(id)!.contentSha256).not.toBe(undefined);
      expect((await list()).filter((n) => n.vault === "linked" && n.missing)).toHaveLength(0);
      await t.req({ method: "POST", url: "/api/vault/linked/rebind", payload: {} });
      expect((await status()).linked!.state).toBe("ready");
      expect((await linkedNote("Shell/pipes.md")).id).toBe(id); // same path keeps its identity after a confirmed rebind
    } finally {
      rmSync(`${linked}-old`, { recursive: true, force: true });
    }
  });

  it("does not repair the index from an unconfirmed replacement folder", async () => {
    const id = (await linkedNote("Shell/quoting.md")).id;
    t.app.database.sqlite.prepare("DELETE FROM notes_fts WHERE rowid = (SELECT rowid FROM notes_fts_map WHERE note_id = ?)").run(id);
    const dir = t.dir;
    await t.app.close();
    renameSync(linked, `${linked}-old`);
    mkdirSync(join(linked, "Shell"), { recursive: true });
    writeFileSync(join(linked, "Shell", "quoting.md"), "# Stranger\n");
    const app = await buildApp(loadConfig({ HUB_DATA: dir, HUB_VAULT_WATCH: "0", HUB_LINKED_VAULT: linked }));
    try {
      expect(app.linkedVault!.state).toBe("replaced");
      expect(app.linkedVault!.get(id)!.title).toBe("Quoting");
    } finally {
      await app.close();
      rmSync(`${linked}-old`, { recursive: true, force: true });
      t = await signedInApp({ HUB_LINKED_VAULT: linked });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("paginates past notes with very long paths", async () => {
    // The 2 now-missing Shell rows and 197 files sort before the long path, so it is the last row of page one: the cursor.
    rmSync(join(linked, "Shell"), { recursive: true });
    mkdirSync(join(linked, "a"));
    for (let i = 0; i < 197; i++) writeFileSync(join(linked, "a", `${String(i).padStart(3, "0")}.md`), `note ${i}`);
    let deep = linked;
    for (let i = 0; i < 4; i++) { deep = join(deep, "b".repeat(140)); mkdirSync(deep); }
    writeFileSync(join(deep, `${"n".repeat(30)}.md`), "deep");
    mkdirSync(join(linked, "c"));
    writeFileSync(join(linked, "c", "after.md"), "after");
    await t.app.linkedVault!.rebind(); // the old Shell notes are gone on purpose
    const first = NoteList.parse((await t.req({ method: "GET", url: "/api/notes" })).json());
    expect(first.nextCursor!.length).toBeGreaterThan(600);
    const second = await t.req({ method: "GET", url: `/api/notes?cursor=${encodeURIComponent(first.nextCursor!)}` });
    expect(second.statusCode).toBe(200);
    expect(NoteList.parse(second.json()).notes.filter((n) => !n.missing).map((n) => n.path)).toContain("c/after.md");
  });

  it("linked notes never block a Hub import to the same path", async () => {
    const yazl = (await import("yazl")).default;
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from("hub copy"), "pipes.md");
    zip.end();
    const chunks: Buffer[] = [];
    for await (const c of zip.outputStream) chunks.push(c as Buffer);
    const imp = VaultImport.parse((await t.req({ method: "POST", url: "/api/vault/imports?prefix=Shell", payload: Buffer.concat(chunks), headers: { "content-type": "application/zip" } })).json());
    expect(imp.counts.import).toBe(1);
    const done = VaultImport.parse((await t.req({ method: "POST", url: `/api/vault/imports/${imp.id}/commit`, payload: {} })).json());
    expect(done.counts.created).toBe(1);
  });

  it("re-indexes a note whose FTS row is gone although its map row survived", async () => {
    const id = (await linkedNote("Shell/quoting.md")).id;
    t.app.database.sqlite.prepare("DELETE FROM notes_fts WHERE rowid = (SELECT rowid FROM notes_fts_map WHERE note_id = ?)").run(id);
    const dir = t.dir;
    await t.app.close();
    const app = await buildApp(loadConfig({ HUB_DATA: dir, HUB_VAULT_WATCH: "0", HUB_LINKED_VAULT: linked }));
    const { searchNotes } = await import("../src/modules/vault/search.ts");
    try {
      expect(searchNotes(app.database.sqlite, "double", ["linked"]).map((h) => h.id)).toEqual([id]);
    } finally {
      await app.close();
      t = await signedInApp({ HUB_LINKED_VAULT: linked });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a linked vault that overlaps the Hub data folder", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-overlap-"));
    try {
      await expect(buildApp(loadConfig({ HUB_DATA: dir, HUB_VAULT_WATCH: "0", HUB_LINKED_VAULT: join(dir, "vault") }))).rejects.toThrow(/overlap/);
      await expect(buildApp(loadConfig({ HUB_DATA: join(dir, "inner"), HUB_VAULT_WATCH: "0", HUB_LINKED_VAULT: dir }))).rejects.toThrow(/overlap/);
      await expect(buildApp(loadConfig({ HUB_DATA: join(dir, "..hub"), HUB_VAULT_WATCH: "0", HUB_LINKED_VAULT: dir }))).rejects.toThrow(/overlap/);
      // Rejected before startup cleanup runs: files in an overlapping folder survive.
      mkdirSync(join(dir, "imports", "notes"), { recursive: true });
      writeFileSync(join(dir, "imports", "notes", "keep.md"), "keep");
      await expect(buildApp(loadConfig({ HUB_DATA: dir, HUB_VAULT_WATCH: "0", HUB_LINKED_VAULT: join(dir, "imports") }))).rejects.toThrow(/overlap/);
      expect(readdirSync(join(dir, "imports", "notes"))).toEqual(["keep.md"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
