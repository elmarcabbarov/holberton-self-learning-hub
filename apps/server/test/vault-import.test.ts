import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import yazl from "yazl";
import { ImportSources, IMPORT_LIMITS, VaultImport } from "@hub/contracts";
import { HOST, ORIGIN, signedInApp, type TestApp } from "./helpers.ts";
import { receiveUpload } from "../src/modules/vault-import/read.ts";

type ZipItem = { name: string; data: string | Buffer; mode?: number };

function zipOf(items: ZipItem[], compress = true): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const i of items) zip.addBuffer(Buffer.isBuffer(i.data) ? i.data : Buffer.from(i.data), i.name, { compress, ...(i.mode ? { mode: i.mode } : {}) });
  zip.end();
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (c: Buffer) => chunks.push(c)).on("end", () => res(Buffer.concat(chunks))).on("error", rej);
  });
}

let t: TestApp;
let importDir: string;
beforeEach(async () => {
  importDir = mkdtempSync(join(tmpdir(), "hub-import-src-"));
  t = await signedInApp({ HUB_IMPORT_DIR: importDir });
});
afterEach(async () => { await t.close(); rmSync(importDir, { recursive: true, force: true }); });

const upload = (zip: Buffer, query = "name=My%20vault.zip") =>
  t.req({ method: "POST", url: `/api/vault/imports?${query}`, payload: zip, headers: { "content-type": "application/zip" } });
const commit = (id: string) => t.req({ method: "POST", url: `/api/vault/imports/${id}/commit`, payload: {} });
const byPath = (imp: VaultImport) => Object.fromEntries(imp.entries.map((e) => [e.source, e]));
const staging = () => readdirSync(join(t.dir, "imports"));
const vaultFile = (p: string) => readFileSync(join(t.dir, "vault", ...p.split("/")));

describe("zip import", () => {
  it("previews without touching the vault, then imports the exact bytes", async () => {
    const crlf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("# A\r\nline\r\n")]);
    const res = await upload(await zipOf([
      { name: "a.md", data: crlf },
      { name: "sub/b.md", data: "# B\n[[a]]" },
      { name: "img.png", data: "png" },
      { name: ".obsidian/workspace.md", data: "x" },
      { name: "CON.md", data: "x" },
      { name: "mixed.md", data: "a\r\nb\n" },
    ]));
    expect(res.statusCode).toBe(201);
    const imp = VaultImport.parse(res.json());
    expect(imp).toMatchObject({ state: "preview", prefix: "Imported/My vault", counts: { import: 3, skip: 3 } });
    const e = byPath(imp);
    expect(e["a.md"]).toMatchObject({ action: "import", dest: "Imported/My vault/a.md" });
    expect(e["img.png"]!.reason).toBe("not_markdown");
    expect(e[".obsidian/workspace.md"]!.reason).toBe("hidden");
    expect(e["CON.md"]!.reason).toBe("invalid_path");
    expect(e["mixed.md"]).toMatchObject({ action: "import", readOnlyReason: "mixed_eol" });
    expect((await t.req({ method: "GET", url: "/api/notes" })).json().notes).toHaveLength(0);

    const done = VaultImport.parse((await commit(imp.id)).json());
    expect(done).toMatchObject({ state: "done", counts: { created: 3, failed: 0 } });
    expect(vaultFile("Imported/My vault/a.md").equals(crlf)).toBe(true);
    expect(vaultFile("Imported/My vault/mixed.md").toString()).toBe("a\r\nb\n");
    const notes = (await t.req({ method: "GET", url: "/api/notes" })).json().notes as { path: string; readOnlyReason: string | null }[];
    expect(notes.map((n) => n.path).sort()).toEqual(["Imported/My vault/a.md", "Imported/My vault/mixed.md", "Imported/My vault/sub/b.md"]);
    expect(notes.find((n) => n.path.endsWith("mixed.md"))!.readOnlyReason).toBe("mixed_eol");
    expect(staging()).toEqual([]);
    expect((await commit(imp.id)).statusCode).toBe(409); // a done import cannot run again
  });

  it("never overwrites and never inherits a missing note's row", async () => {
    await t.req({ method: "POST", url: "/api/notes", payload: { path: "Imported/v/kept.md", content: "mine" } });
    await t.req({ method: "POST", url: "/api/notes", payload: { path: "Imported/v/file.md", content: "a note" } });
    const gone = (await t.req({ method: "POST", url: "/api/notes", payload: { path: "Imported/v/gone.md", content: "old" } })).json();
    unlinkSync(join(t.dir, "vault", "Imported", "v", "gone.md"));
    await t.app.vault.reconcile();
    const imp = VaultImport.parse((await upload(await zipOf([
      { name: "KEPT.md", data: "theirs" }, { name: "gone.md", data: "new" }, { name: "file.md/inner.md", data: "x" },
    ]), "prefix=Imported/v")).json());
    const e = byPath(imp);
    expect(e["KEPT.md"]!.reason).toBe("exists");
    expect(e["gone.md"]!.reason).toBe("missing_note");
    expect(e["file.md/inner.md"]!.reason).toBe("exists"); // a note file sits where a folder is needed
    await commit(imp.id);
    expect(vaultFile("Imported/v/kept.md").toString()).toBe("mine");
    expect(t.app.vault.get(gone.id)!.missingSince).not.toBeNull();
  });

  it("skips every member of a colliding group instead of picking one", async () => {
    const imp = VaultImport.parse((await upload(await zipOf([
      { name: "Note.md", data: "1" }, { name: "note.md", data: "2" },
      { name: "x.md", data: "file" }, { name: "x.md/y.md", data: "under a file" },
      { name: "ok.md", data: "fine" },
    ]))).json());
    const e = byPath(imp);
    for (const s of ["Note.md", "note.md", "x.md", "x.md/y.md"]) expect(e[s]!.reason).toBe("collision_in_source");
    expect(e["ok.md"]!.action).toBe("import");
  });

  it("rejects symlink entries, special files and oversized files per entry", async () => {
    const imp = VaultImport.parse((await upload(await zipOf([
      { name: "link.md", data: "/etc/passwd", mode: 0o120777 },
      { name: "fifo.md", data: "", mode: 0o010644 },
      { name: "big.md", data: Buffer.alloc(IMPORT_LIMITS.fileBytes + 1, 0x61) },
    ]))).json());
    const e = byPath(imp);
    expect(e["link.md"]!.reason).toBe("symlink");
    expect(e["fifo.md"]!.reason).toBe("special_file");
    expect(e["big.md"]!.reason).toBe("too_large");
    expect(imp.counts.import).toBe(0);
  });

  it("fails the whole archive on unsafe names, a bad CRC or garbage, and leaves no staging", async () => {
    const slip = await zipOf([{ name: "aa/evil.md", data: "x" }]);
    const evil = Buffer.from(slip.toString("latin1").replaceAll("aa/evil.md", "../evil.md"), "latin1");
    const r1 = await upload(evil);
    expect(r1.statusCode).toBe(400);
    expect(r1.json().error.messageKey).toBe("vaultImport.bad_archive");

    const stored = await zipOf([{ name: "c.md", data: "hello world" }], false);
    const at = stored.indexOf("hello world");
    stored[at] = 0x48; // 'H': same size, wrong CRC
    expect((await upload(stored)).json().error.messageKey).toBe("vaultImport.bad_archive");
    expect((await upload(Buffer.from("not a zip"))).json().error.messageKey).toBe("vaultImport.bad_archive");
    expect(existsSync(join(t.dir, "vault", "evil.md"))).toBe(false);
    expect(staging()).toEqual([]);
  });

  it("checks the session before reading the body, and only takes zip on its own route", async () => {
    const zip = await zipOf([{ name: "a.md", data: "x" }]);
    const anon = await t.app.inject({ method: "POST", url: "/api/vault/imports", payload: zip, headers: { host: HOST, origin: ORIGIN, "content-type": "application/zip" } });
    expect(anon.statusCode).toBe(401);
    expect(staging()).toEqual([]);
    expect((await t.req({ method: "POST", url: "/api/notes", payload: zip, headers: { "content-type": "application/zip" } })).statusCode).toBe(415);
    expect((await t.req({ method: "POST", url: "/api/vault/imports", payload: zip, headers: { "content-type": "application/octet-stream" } })).statusCode).toBe(415);
    expect((await t.req({ method: "POST", url: "/api/vault/imports", payload: zip, headers: { "content-type": "application/zip", "content-encoding": "gzip" } })).statusCode).toBe(415);
    expect((await upload(zip, "prefix=../x")).json().error.messageKey).toBe("vaultImport.bad_prefix");
  });

  it("counts upload bytes itself and stops past the limit", async () => {
    const dest = join(t.dir, "upload-test.zip");
    let sent = 0;
    const body = new Readable({
      read() {
        if (sent > IMPORT_LIMITS.uploadBytes) { this.push(null); return; }
        sent += 1024 * 1024;
        this.push(Buffer.alloc(1024 * 1024));
      },
    });
    await expect(receiveUpload(body, dest)).rejects.toMatchObject({ reason: "upload_too_large", status: 413 });
  });

  it("limits open previews, cancels them, and resumes an interrupted commit", async () => {
    const zip = await zipOf([{ name: "a.md", data: "a" }, { name: "b.md", data: "b" }]);
    const ids: string[] = [];
    for (let i = 0; i < IMPORT_LIMITS.pending; i++) ids.push(VaultImport.parse((await upload(zip, `prefix=P${i}`)).json()).id);
    expect((await upload(zip, "prefix=P9")).statusCode).toBe(409);
    expect((await t.req({ method: "DELETE", url: `/api/vault/imports/${ids[2]}`, payload: {} })).statusCode).toBe(204);
    expect((await commit(ids[2]!)).statusCode).toBe(410);

    const original = t.app.vault.importFile.bind(t.app.vault);
    let calls = 0;
    t.app.vault.importFile = async (...args) => {
      if (++calls === 2) throw new Error("disk full");
      return original(...args);
    };
    expect((await commit(ids[0]!)).statusCode).toBe(500);
    expect(VaultImport.parse((await t.req({ method: "GET", url: `/api/vault/imports/${ids[0]}` })).json()).state).toBe("interrupted");
    t.app.vault.importFile = original;
    const done = VaultImport.parse((await commit(ids[0]!)).json());
    expect(done).toMatchObject({ state: "done", counts: { created: 2, failed: 0 } });
  });
});

describe("Codex review regressions (vault import)", () => {
  it("crash after publish: recovery gives the file its journaled id, not a missing note's identity", async () => {
    const old = (await t.req({ method: "POST", url: "/api/notes", payload: { path: "old.md", content: "same bytes" } })).json();
    unlinkSync(join(t.dir, "vault", "old.md"));
    await t.app.vault.reconcile();
    // Simulate: the file reached the disk, the journal says "intent", the notes row was never written.
    const db = t.app.database.sqlite;
    mkdirSync(join(t.dir, "vault", "Imported"), { recursive: true });
    writeFileSync(join(t.dir, "vault", "Imported", "new.md"), "same bytes");
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update("same bytes").digest("hex");
    db.prepare("INSERT INTO file_ops (id, kind, note_id, path, after_sha256, state, created_at, updated_at) VALUES (?, 'create', ?, 'Imported/new.md', ?, 'intent', 'x', 'x')")
      .run("00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-0000000000aa", sha);
    const dir = t.dir;
    await t.app.close();
    const { buildApp } = await import("../src/app.ts");
    const { loadConfig } = await import("../src/config.ts");
    const app = await buildApp(loadConfig({ HUB_DATA: dir, HUB_VAULT_WATCH: "0" }));
    try {
      const rows = app.vault.list();
      expect(rows.find((r) => r.path === "Imported/new.md")!.id).toBe("00000000-0000-4000-8000-0000000000aa");
      expect(rows.find((r) => r.id === old.id)!.missingSince).not.toBeNull();
    } finally {
      await app.close();
      t = { ...t, close: async () => { rmSync(dir, { recursive: true, force: true }); } };
    }
  });

  it("concurrent previews cannot pass the open-preview limit", async () => {
    const zip = await zipOf([{ name: "a.md", data: "a" }]);
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => upload(zip, `prefix=C${i}`)));
    expect(res.filter((r) => r.statusCode === 201)).toHaveLength(IMPORT_LIMITS.pending);
    const open = (await t.req({ method: "GET", url: "/api/vault/imports" })).json().imports as VaultImport[];
    expect(open).toHaveLength(IMPORT_LIMITS.pending);
  });

  it("a transient staging read error interrupts the commit instead of failing the entry", async () => {
    const imp = VaultImport.parse((await upload(await zipOf([{ name: "a.md", data: "a" }]))).json());
    const staged = join(t.dir, "imports", imp.id, "0");
    const bytes = readFileSync(staged);
    rmSync(staged); mkdirSync(staged); // reading a directory fails with EISDIR, not ENOENT
    expect((await commit(imp.id)).statusCode).toBe(500);
    rmSync(staged, { recursive: true }); writeFileSync(staged, bytes);
    expect(VaultImport.parse((await commit(imp.id)).json()).counts.created).toBe(1);
  });

  it("identical bytes written by someone else count as exists, not created", async () => {
    const imp = VaultImport.parse((await upload(await zipOf([{ name: "a.md", data: "same" }]), "prefix=P")).json());
    await t.req({ method: "POST", url: "/api/notes", payload: { path: "P/a.md", content: "same" } });
    expect(VaultImport.parse((await commit(imp.id)).json()).counts).toMatchObject({ created: 0, exists: 1 });
  });
});

describe("folder import (HUB_IMPORT_DIR)", () => {
  it("lists only real child folders and copies Markdown without following links", async () => {
    const outside = mkdtempSync(join(tmpdir(), "hub-outside-"));
    writeFileSync(join(outside, "secret.md"), "secret");
    mkdirSync(join(importDir, "course", "week1"), { recursive: true });
    writeFileSync(join(importDir, "course", "intro.md"), "# Intro\n");
    writeFileSync(join(importDir, "course", "week1", "pipes.md"), "# Pipes\n");
    writeFileSync(join(importDir, "course", "photo.jpg"), "jpg");
    symlinkSync(join(outside, "secret.md"), join(importDir, "course", "leak.md"));
    symlinkSync(outside, join(importDir, "course", "linkdir"));
    symlinkSync(outside, join(importDir, "linked"));
    try {
      const src = ImportSources.parse((await t.req({ method: "GET", url: "/api/vault/import-sources" })).json());
      expect(src).toEqual({ folderImport: true, folders: ["course"] });
      for (const folder of ["linked", "../", "nope"]) {
        expect((await t.req({ method: "POST", url: "/api/vault/imports/folder", payload: { folder } })).statusCode).toBe(404);
      }
      const imp = VaultImport.parse((await t.req({ method: "POST", url: "/api/vault/imports/folder", payload: { folder: "course" } })).json());
      const e = byPath(imp);
      expect(e["leak.md"]!.reason).toBe("symlink");
      expect(e["linkdir"]!.reason).toBe("symlink");
      expect(e["photo.jpg"]!.reason).toBe("not_markdown");
      // The commit writes the bytes seen at preview time, even if the source changes in between.
      writeFileSync(join(importDir, "course", "intro.md"), "changed");
      const done = VaultImport.parse((await commit(imp.id)).json());
      expect(done.counts.created).toBe(2);
      expect(vaultFile("Imported/course/intro.md").toString()).toBe("# Intro\n");
      expect(vaultFile("Imported/course/week1/pipes.md").toString()).toBe("# Pipes\n");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("reports folder import as unavailable without HUB_IMPORT_DIR", async () => {
    const plain = await signedInApp();
    try {
      expect((await plain.req({ method: "GET", url: "/api/vault/import-sources" })).json()).toEqual({ folderImport: false, folders: [] });
      expect((await plain.req({ method: "POST", url: "/api/vault/imports/folder", payload: { folder: "x" } })).statusCode).toBe(404);
    } finally {
      await plain.close();
    }
  });
});
