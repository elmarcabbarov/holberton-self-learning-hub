import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { foldKey, PathError, validateNotePath } from "../src/lib/fs-safe/paths.ts";
import { decodeNote, encodeNote } from "../src/lib/fs-safe/text.ts";
import { resolveInVault } from "../src/lib/fs-safe/vault-fs.ts";

describe("validateNotePath", () => {
  it("accepts nested Markdown paths with Azerbaijani names", () => {
    expect(validateNotePath("Linux/Proseslər və siqnallar.md")).toBe("Linux/Proseslər və siqnallar.md");
  });
  it.each([
    ["", "empty"], ["/etc/passwd.md", "absolute"], ["C:/x.md", "absolute"], ["a\\b.md", "backslash"],
    ["../x.md", "bad_segment"], ["a//b.md", "bad_segment"], ["a/./b.md", "bad_segment"],
    [".obsidian/x.md", "hidden"], ["a/.hidden.md", "hidden"], ["con.md", "reserved_name"], ["a/NUL.txt.md", "reserved_name"],
    ["a?.md", "forbidden_char"], ["dir./a.md", "trailing_dot_or_space"], ["notes.txt", "not_markdown"],
  ])("rejects %j (%s)", (input, reason) => {
    expect(() => validateNotePath(input)).toThrow(PathError);
    try { validateNotePath(input); } catch (e) { expect((e as PathError).reason).toBe(reason); }
  });
  it("folds case and Unicode normalization for collision detection", () => {
    expect(foldKey("Ə/Note.md")).toBe(foldKey("ə/note.md"));
    expect(foldKey("e\u0301.md")).toBe(foldKey("\u00e9.md"));
  });
});

describe("decodeNote / encodeNote", () => {
  it("round-trips CRLF + BOM byte for byte", () => {
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("# Başlıq\r\nmətn\r\n", "utf8")]);
    const d = decodeNote(original);
    expect(d).toMatchObject({ eol: "crlf", bom: true, readOnlyReason: null, text: "# Başlıq\nmətn\n" });
    expect(encodeNote(d.text, d.eol, d.bom).equals(original)).toBe(true);
  });
  it("keeps the absence of a final newline", () => {
    const d = decodeNote(Buffer.from("a\nb", "utf8"));
    expect(encodeNote(d.text, d.eol, d.bom).toString()).toBe("a\nb");
  });
  it("marks mixed line endings and invalid UTF-8 read-only", () => {
    expect(decodeNote(Buffer.from("a\r\nb\nc")).readOnlyReason).toBe("mixed_eol");
    expect(decodeNote(Buffer.from([0x61, 0xff, 0x62])).readOnlyReason).toBe("invalid_utf8");
  });
});

describe("resolveInVault", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "hub-fs-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("rejects a path that escapes through a symlinked directory", async () => {
    const root = join(dir, "vault"); const outside = join(dir, "outside");
    mkdirSync(root); mkdirSync(outside); writeFileSync(join(outside, "secret.md"), "x");
    symlinkSync(outside, join(root, "link"));
    await expect(resolveInVault(root, "link/secret.md")).rejects.toThrow(PathError);
  });
  it("does not confuse a sibling with the same prefix for the root", async () => {
    const root = join(dir, "vault"); mkdirSync(root); mkdirSync(join(dir, "vault-evil"));
    symlinkSync(join(dir, "vault-evil"), join(root, "x"));
    await expect(resolveInVault(root, "x/a.md")).rejects.toThrow(PathError);
  });
  it("resolves a not-yet-existing nested path inside the root", async () => {
    const root = join(dir, "vault"); mkdirSync(root);
    await expect(resolveInVault(root, "new/dir/a.md")).resolves.toContain("new");
  });
});

describe("control characters", () => {
  it("rejects NUL and other control characters in names", () => {
    for (const bad of ["a\u0000.md", "a\u001f.md", "a\u007f.md"]) expect(() => validateNotePath(bad)).toThrow(PathError);
  });
});
