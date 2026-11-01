import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type DatabaseHandle } from "../src/lib/db/index.ts";
import { fileOps } from "../src/lib/db/schema.ts";
import { Vault } from "../src/modules/vault/service.ts";
import { sha256 } from "../src/lib/fs-safe/vault-fs.ts";

let dir: string; let db: DatabaseHandle; let vault: Vault; let root: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "hub-vault-"));
  db = openDatabase(dir);
  root = join(dir, "vault");
  vault = new Vault(db.db, root);
  await vault.init();
});
afterEach(() => { db.close(); chmodSync(dir, 0o755); rmSync(dir, { recursive: true, force: true }); });

describe("create / read / save", () => {
  it("creates a note file and reads it back", async () => {
    const out = await vault.create("Linux/fork.md", "# fork\n");
    expect(out.kind).toBe("created");
    expect(readFileSync(join(root, "Linux/fork.md"), "utf8")).toBe("# fork\n");
    const r = await vault.read(out.kind === "created" ? out.note.id : "");
    expect(r?.text).toBe("# fork\n");
  });

  it("refuses to overwrite an existing file on create, and refuses case collisions", async () => {
    writeFileSync(join(root, "a.md"), "external");
    await vault.reconcile();
    expect((await vault.create("a.md", "mine")).kind).toBe("exists");
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("external");
    expect((await vault.create("A.md", "mine")).kind).toBe("collision");
  });

  it("rejects invalid paths", async () => {
    expect(await vault.create("../escape.md", "x")).toEqual({ kind: "invalid", reason: "bad_segment" });
  });

  it("saves with the expected version and preserves CRLF + BOM", async () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a\r\nb\r\n")]);
    writeFileSync(join(root, "win.md"), bytes);
    await vault.reconcile();
    const note = vault.list().find((n) => n.path === "win.md")!;
    const r = (await vault.read(note.id))!;
    expect(r.text).toBe("a\nb\n");
    const out = await vault.save(note.id, "a\nb\nc\n", r.version.sha256);
    expect(out.kind).toBe("saved");
    expect(readFileSync(join(root, "win.md")).equals(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a\r\nb\r\nc\r\n")]))).toBe(true);
  });

  it("returns a conflict with the current version when the file changed on disk", async () => {
    const created = await vault.create("c.md", "one\n");
    const id = created.kind === "created" ? created.note.id : "";
    const v1 = (await vault.read(id))!.version;
    writeFileSync(join(root, "c.md"), "edited in Obsidian\n");
    const out = await vault.save(id, "mine\n", v1.sha256);
    expect(out.kind).toBe("conflict");
    if (out.kind === "conflict") expect(out.current.sha256).toBe(sha256(Buffer.from("edited in Obsidian\n")));
    expect(readFileSync(join(root, "c.md"), "utf8")).toBe("edited in Obsidian\n");
  });

  it("does not write mixed-EOL files", async () => {
    writeFileSync(join(root, "mixed.md"), "a\r\nb\nc");
    await vault.reconcile();
    const note = vault.list().find((n) => n.path === "mixed.md")!;
    const out = await vault.save(note.id, "x", note.contentSha256);
    expect(out).toEqual({ kind: "read_only", reason: "mixed_eol" });
  });

  it("serializes concurrent saves: the second one with a stale version conflicts", async () => {
    const created = await vault.create("race.md", "0\n");
    const id = created.kind === "created" ? created.note.id : "";
    const v = (await vault.read(id))!.version.sha256;
    const [a, b] = await Promise.all([vault.save(id, "A\n", v), vault.save(id, "B\n", v)]);
    expect([a.kind, b.kind].sort()).toEqual(["conflict", "saved"]);
  });
});

describe("reconcile", () => {
  it("adds, updates (even with preserved size), renames by unique hash, and marks missing", async () => {
    writeFileSync(join(root, "one.md"), "aaaa"); writeFileSync(join(root, "two.md"), "bbbb");
    expect((await vault.reconcile()).added).toBe(2);
    const one = vault.list().find((n) => n.path === "one.md")!;

    writeFileSync(join(root, "two.md"), "cccc"); // same size
    expect((await vault.reconcile()).updated).toBe(1);

    mkdirSync(join(root, "moved"));
    renameSync(join(root, "one.md"), join(root, "moved/one.md"));
    const r = await vault.reconcile();
    expect(r.renamed).toBe(1);
    expect(vault.get(one.id)?.path).toBe("moved/one.md");

    rmSync(join(root, "two.md"));
    expect((await vault.reconcile()).missing).toBe(1);
    expect(vault.list().find((n) => n.path === "two.md")?.missingSince).not.toBeNull();
  });

  it("does not guess a rename when two files share the hash", async () => {
    writeFileSync(join(root, "t1.md"), "template"); await vault.reconcile();
    const t1 = vault.list()[0]!;
    rmSync(join(root, "t1.md"));
    writeFileSync(join(root, "x.md"), "template"); writeFileSync(join(root, "y.md"), "template");
    const r = await vault.reconcile();
    expect(r.renamed).toBe(0);
    expect(vault.get(t1.id)?.missingSince).not.toBeNull();
  });

  it("ignores hidden folders, temp files, non-Markdown files and symlinks", async () => {
    mkdirSync(join(root, ".obsidian")); writeFileSync(join(root, ".obsidian/workspace.md"), "x");
    writeFileSync(join(root, ".hub-tmp-123"), "x"); writeFileSync(join(root, "img.png"), "x");
    writeFileSync(join(dir, "outside.md"), "secret"); symlinkSync(join(dir, "outside.md"), join(root, "link.md"));
    writeFileSync(join(root, "real.md"), "ok");
    await vault.reconcile();
    expect(vault.list().map((n) => n.path)).toEqual(["real.md"]);
  });

  it("never marks notes missing after a failed enumeration", async () => {
    writeFileSync(join(root, "keep.md"), "x"); await vault.reconcile();
    chmodSync(root, 0o000);
    const r = await vault.reconcile();
    chmodSync(root, 0o755);
    if (process.getuid?.() === 0) return; // root ignores permissions
    expect(r.error).not.toBeNull();
    expect(vault.list()[0]?.missingSince).toBeNull();
  });

  it("reports case collisions created outside the Hub", async () => {
    writeFileSync(join(root, "Note.md"), "a"); writeFileSync(join(root, "note.md"), "b");
    await vault.reconcile();
    expect(vault.collisions()).toEqual([["Note.md", "note.md"]]);
  });
});

describe("crash recovery", () => {
  it("marks an interrupted operation with unexpected content as conflict and keeps the file", async () => {
    writeFileSync(join(root, "r.md"), "user text");
    db.db.insert(fileOps).values({ id: "op1", kind: "replace", noteId: "n", path: "r.md", beforeSha256: sha256("old"), afterSha256: sha256("new"), state: "intent", createdAt: "x", updatedAt: "x" }).run();
    const v2 = new Vault(db.db, root); await v2.init();
    expect(db.db.select().from(fileOps).where(eq(fileOps.id, "op1")).get()?.state).toBe("conflict");
    expect(readFileSync(join(root, "r.md"), "utf8")).toBe("user text");
  });
  it("completes an operation whose new content is already on disk and removes its temp file", async () => {
    writeFileSync(join(root, "d.md"), "new");
    writeFileSync(join(root, ".hub-tmp-abc"), "new");
    db.db.insert(fileOps).values({ id: "op2", kind: "replace", noteId: "n", path: "d.md", tempPath: join(root, ".hub-tmp-abc"), beforeSha256: sha256("old"), afterSha256: sha256("new"), state: "intent", createdAt: "x", updatedAt: "x" }).run();
    const v2 = new Vault(db.db, root); await v2.init();
    expect(db.db.select().from(fileOps).where(eq(fileOps.id, "op2")).get()?.state).toBe("done");
    expect(() => readFileSync(join(root, ".hub-tmp-abc"))).toThrow();
  });
});
