import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type DatabaseHandle } from "../src/lib/db/index.ts";
import { Vault } from "../src/modules/vault/service.ts";
import { backlinks, ftsQuery, noteMeta, searchNotes } from "../src/modules/vault/search.ts";

let dir: string; let h: DatabaseHandle; let vault: Vault; let root: string;
const id = (path: string) => vault.list().find((n) => n.path === path)!.id;
const write = (p: string, s: string) => { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), s); };

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "hub-idx-"));
  h = openDatabase(dir);
  root = join(dir, "vault");
  vault = new Vault(h.db, root, h.sqlite);
  await vault.init();
});
afterEach(() => { h.close(); rmSync(dir, { recursive: true, force: true }); });

describe("link resolution", () => {
  it("resolves names, paths, aliases and relative markdown links; flags ambiguity", async () => {
    write("Shell/waitpid.md", "# waitpid");
    write("Shell/execve.md", "---\naliases: [exec]\n---\n");
    write("A/dup.md", ""); write("B/dup.md", "");
    write("Shell/index.md", "[[waitpid]] [[Shell/execve]] [[exec]] [[dup]] [[nope]] [w](waitpid.md) [[#Local]] ![[pic.png]]");
    await vault.reconcile();
    const states = noteMeta(h.db, id("Shell/index.md")).links.map((l) => [l.target, l.state]);
    expect(states).toEqual([
      ["waitpid", "resolved"], ["Shell/execve", "resolved"], ["exec", "resolved"], ["dup", "ambiguous"],
      ["nope", "unresolved"], ["waitpid.md", "resolved"], ["", "self"], ["pic.png", "file"],
    ]);
    expect(backlinks(h.db, id("Shell/waitpid.md")).map((b) => b.kind)).toEqual(["wiki", "md"]);
  });

  it("re-resolves links when a target appears, moves or disappears", async () => {
    write("index.md", "[[later]]");
    await vault.reconcile();
    expect(noteMeta(h.db, id("index.md")).links[0]!.state).toBe("unresolved");
    write("later.md", "x");
    await vault.reconcile();
    expect(noteMeta(h.db, id("index.md")).links[0]!.state).toBe("resolved");
    mkdirSync(join(root, "moved"));
    renameSync(join(root, "later.md"), join(root, "moved/later.md"));
    await vault.reconcile();
    expect(noteMeta(h.db, id("index.md")).links[0]!.state).toBe("resolved"); // name still unique
    rmSync(join(root, "moved/later.md"));
    await vault.reconcile();
    expect(noteMeta(h.db, id("index.md")).links[0]!.state).toBe("unresolved");
  });
});

describe("full-text search", () => {
  it("matches Azerbaijani text with or without special letters and returns an original-text snippet", async () => {
    write("az.md", "# Qısa izah\nProseslərin idarə edilməsi və şəbəkə çağırışları.");
    await vault.reconcile();
    for (const q of ["qısa", "qisa", "QISA", "şəbəkə", "sebeke", "idarə", "proses"]) {
      expect(searchNotes(h.sqlite, q).map((r) => r.title), q).toEqual(["Qısa izah"]);
    }
    expect(searchNotes(h.sqlite, "sebeke")[0]!.snippet).toContain("şəbəkə");
  });

  it("ranks title matches first and drops missing notes", async () => {
    write("a.md", "# fork\nbody"); write("b.md", "# other\nfork fork fork");
    await vault.reconcile();
    expect(searchNotes(h.sqlite, "fork").map((r) => r.path)).toEqual(["a.md", "b.md"]);
    rmSync(join(root, "a.md"));
    await vault.reconcile();
    expect(searchNotes(h.sqlite, "fork").map((r) => r.path)).toEqual(["b.md"]);
  });

  it("treats FTS syntax in user input as plain text", async () => {
    write("q.md", "near or and not");
    await vault.reconcile();
    for (const q of ['"', "NEAR(a b)", "a OR", "*", "title:x", "(-)"]) expect(() => searchNotes(h.sqlite, q)).not.toThrow();
    expect(ftsQuery("   ")).toBeNull();
    expect(searchNotes(h.sqlite, "near or")).toHaveLength(1);
  });

  it("indexes notes that existed before the index (upgrade path)", async () => {
    write("old.md", "legacy content");
    const plain = new Vault(h.db, root); // index disabled, like an older version
    await plain.init();
    const upgraded = new Vault(h.db, root, h.sqlite);
    await upgraded.init();
    expect(searchNotes(h.sqlite, "legacy")).toHaveLength(1);
  });
});

describe("tags and titles", () => {
  it("stores tags and the parsed title", async () => {
    write("t.md", "---\ntags: linux\n---\n# Siqnallar\n#signals text");
    await vault.reconcile();
    expect(noteMeta(h.db, id("t.md")).tags).toEqual(["linux", "signals"]);
    expect(vault.get(id("t.md"))!.title).toBe("Siqnallar");
  });
});
