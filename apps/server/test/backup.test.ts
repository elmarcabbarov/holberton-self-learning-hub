import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackupCreated, BackupList, Card, NoteList, Space, Topic } from "@hub/contracts";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { inspectBackup, restoreBackup, RestoreError } from "../src/modules/backup/restore.ts";
import { HOST, signedInApp, type TestApp } from "./helpers.ts";

let t: TestApp; const cleanup: string[] = [];
beforeEach(async () => { t = await signedInApp(); });
afterEach(async () => { await t.close().catch(() => undefined); for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "hub-restore-")); cleanup.push(d); return d; };

async function seedAndBackup() {
  const space = Space.parse((await t.req({ method: "POST", url: "/api/spaces", payload: { name: "Linux əsasları" } })).json());
  const topic = Topic.parse((await t.req({ method: "POST", url: `/api/spaces/${space.id}/topics`, payload: { name: "fork" } })).json());
  const card = Card.parse((await t.req({ method: "POST", url: "/api/cards", payload: { topicId: topic.id, front: "Q", back: "A" } })).json());
  await t.req({ method: "POST", url: `/api/cards/${card.id}/review`, payload: { rating: 3, eventId: randomUUID() } });
  await t.req({ method: "POST", url: "/api/notes", payload: { path: "Linux/fork.md", content: "# fork\n[[exec]]\n" } });
  const crlf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("win\r\nline\r\n")]);
  writeFileSync(join(t.dir, "vault", "win.md"), crlf);
  mkdirSync(join(t.dir, "vault", "img"), { recursive: true });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
  writeFileSync(join(t.dir, "vault", "img", "diagram.png"), png);
  await t.app.vault.reconcile();
  const res = await t.req({ method: "POST", url: "/api/backups", payload: {} });
  expect(res.statusCode).toBe(201);
  const created = BackupCreated.parse(res.json());
  return { created, zip: join(t.dir, "backups", created.name), crlf, png, cardId: card.id };
}

describe("backup → restore round trip", () => {
  it("restores data, files byte for byte and review state into a fresh instance; old sessions do not carry over", async () => {
    const { created, zip, crlf, png, cardId } = await seedAndBackup();
    expect(created.counts).toMatchObject({ spaces: 1, topics: 1, cards: 1, reviews: 1, notes: 2 });
    expect(BackupList.parse((await t.req({ method: "GET", url: "/api/backups" })).json()).backups.map((b) => b.name)).toEqual([created.name]);
    const download = await t.req({ method: "GET", url: `/api/backups/${created.name}` });
    expect(download.headers["content-type"]).toBe("application/zip");
    const oldCookie = (await t.app.inject({ method: "GET", url: "/api/auth/status", headers: { host: HOST } })).headers["set-cookie"];
    void oldCookie;

    const target = tmp();
    const manifest = await restoreBackup(zip, target);
    expect(manifest.counts.cards).toBe(1);
    expect(readFileSync(join(target, "vault", "win.md")).equals(crlf)).toBe(true);
    expect(readFileSync(join(target, "vault", "img", "diagram.png")).equals(png)).toBe(true);

    const restored = await buildApp(loadConfig({ HUB_DATA: target, HUB_VAULT_WATCH: "0" }));
    try {
      const sessions = restored.database.sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
      expect(sessions.n).toBe(0);
      const row = restored.database.sqlite.prepare("SELECT reps, state FROM cards WHERE id = ?").get(cardId) as { reps: number; state: number };
      expect(row.reps).toBe(1);
      const notes = restored.vault.list().map((n) => n.path).sort();
      expect(notes).toEqual(["Linux/fork.md", "win.md"]);
    } finally { await restored.close(); }
    void NoteList;
  });

  it("previews a backup without extracting it", async () => {
    const { zip } = await seedAndBackup();
    const m = await inspectBackup(zip);
    expect(m.files.map((f) => f.path).sort()).toEqual(["Linux/fork.md", "img/diagram.png", "win.md"]);
  });
});

describe("restore safety", () => {
  async function tamper(mutate: (entries: Zippable) => void): Promise<string> {
    const { zip } = await seedAndBackup();
    const entries = unzipSync(readFileSync(zip)) as Zippable;
    mutate(entries);
    const out = join(tmp(), "evil.zip");
    writeFileSync(out, zipSync(entries));
    return out;
  }
  const expectRefused = async (zip: string, reason: string | RegExp) => {
    const err = await restoreBackup(zip, tmp()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err instanceof RestoreError ? err.reason : String(err)).toMatch(reason);
  };

  it("refuses a non-empty target", async () => {
    const { zip } = await seedAndBackup();
    await expect(restoreBackup(zip, t.dir)).rejects.toMatchObject({ reason: "target_not_empty" });
  });
  it("detects a modified file", async () => {
    await expectRefused(await tamper((e) => { e["vault/win.md"] = strToU8("changed"); }), "hash_mismatch");
  });
  it("rejects unexpected and path-traversal entries", async () => {
    await expectRefused(await tamper((e) => { e["vault/extra.md"] = strToU8("x"); }), "unexpected_entry");
    await expectRefused(await tamper((e) => { e["../escape.md"] = strToU8("x"); }), /invalid relative path|escape|unexpected/i);
  });
  it("rejects a missing file and a backup from a newer schema", async () => {
    await expectRefused(await tamper((e) => { delete e["vault/win.md"]; }), "missing_file");
    await expectRefused(await tamper((e) => {
      const m = JSON.parse(Buffer.from(e["manifest.json"] as Uint8Array).toString());
      m.migrations = 999; e["manifest.json"] = strToU8(JSON.stringify(m));
    }), "backup_newer_than_app");
  });
});
