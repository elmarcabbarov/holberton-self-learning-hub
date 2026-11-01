import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { visit, SKIP } from "unist-util-visit";
import type { Heading, Image, Link, Root, Text } from "mdast";
import { parse as parseYaml } from "yaml";

export type LinkKind = "wiki" | "embed" | "md";

export interface ParsedLink {
  kind: LinkKind;
  /** Target as written, without alias; e.g. "Folder/Note" or "Note.md". */
  target: string;
  /** Heading or block anchor (without '#'), e.g. "Heading" or "^abc123". */
  anchor: string | null;
}

export interface ParsedNote {
  title: string;
  frontmatter: Record<string, unknown> | null;
  frontmatterError: string | null;
  aliases: string[];
  tags: string[];
  links: ParsedLink[];
  /** Plain text for full-text search (no frontmatter, no Markdown syntax). */
  body: string;
}

const MAX_FRONTMATTER = 64 * 1024;
// [[target#anchor|alias]] and ![[...]]; target cannot contain [ ] | or newline.
const WIKI = /(!?)\[\[([^[\]|\n]+?)(?:\|[^[\]\n]*)?\]\]/g;
// Obsidian-style tags: preceded by start or whitespace; letters, digits, _ - / ; not purely numeric.
const TAG = /(?:^|(?<=\s))#([\p{L}\p{N}_\-/]+)/gu;

/** Splits YAML frontmatter delimited by --- at the very start (BOM already removed). */
export function splitFrontmatter(text: string): { yaml: string | null; content: string } {
  if (!text.startsWith("---\n")) return { yaml: null, content: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { yaml: null, content: text };
  const after = text.indexOf("\n", end + 4);
  const closeLine = text.slice(end + 1, after === -1 ? undefined : after);
  if (closeLine.trim() !== "---") return { yaml: null, content: text };
  return { yaml: text.slice(4, end), content: after === -1 ? "" : text.slice(after + 1) };
}

function asStringList(v: unknown): string[] {
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v)) return v.filter((x): x is string | number => typeof x === "string" || typeof x === "number").map(String).map((s) => s.trim()).filter(Boolean);
  return [];
}

function splitAnchor(raw: string): { target: string; anchor: string | null } {
  const i = raw.indexOf("#");
  if (i === -1) return { target: raw.trim(), anchor: null };
  return { target: raw.slice(0, i).trim(), anchor: raw.slice(i + 1).trim() || null };
}

function isLocal(url: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("//") && !url.startsWith("#");
}

function normalizeTag(t: string): string | null {
  const tag = t.replace(/^#/, "").replace(/\/+$/, "");
  if (!tag || /^[\d/]+$/.test(tag)) return null;
  return tag;
}

export function parseNote(text: string, fileTitle: string): ParsedNote {
  const { yaml, content } = splitFrontmatter(text);
  let frontmatter: Record<string, unknown> | null = null;
  let frontmatterError: string | null = null;
  if (yaml !== null) {
    if (yaml.length > MAX_FRONTMATTER) frontmatterError = "too_large";
    else {
      try {
        const v: unknown = parseYaml(yaml, { maxAliasCount: 10, prettyErrors: false });
        if (v && typeof v === "object" && !Array.isArray(v)) frontmatter = v as Record<string, unknown>;
        else if (v !== null && v !== undefined) frontmatterError = "not_a_mapping";
      } catch (e) {
        frontmatterError = (e as Error).name || "yaml_error";
      }
    }
  }

  const tree: Root = fromMarkdown(content, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const links: ParsedLink[] = [];
  const tags = new Set<string>(asStringList(frontmatter?.tags ?? frontmatter?.tag).map(normalizeTag).filter((t): t is string => t !== null));
  const aliases = asStringList(frontmatter?.aliases ?? frontmatter?.alias);
  const bodyParts: string[] = [];
  let firstH1: string | null = null;

  visit(tree, (node) => {
    if (node.type === "code" || node.type === "inlineCode" || node.type === "html") return SKIP;
    if (node.type === "heading" && (node as Heading).depth === 1 && firstH1 === null) {
      firstH1 = (node as Heading).children.map((c) => ("value" in c ? String(c.value) : "")).join("").trim() || null;
    }
    if (node.type === "link") {
      const url = decodeURIComponentSafe((node as Link).url);
      if (isLocal(url)) links.push({ kind: "md", ...splitAnchor(url) });
    }
    if (node.type === "image") {
      const url = decodeURIComponentSafe((node as Image).url);
      if (isLocal(url)) links.push({ kind: "embed", ...splitAnchor(url) });
    }
    if (node.type === "text") {
      const value = (node as Text).value;
      bodyParts.push(value);
      for (const m of value.matchAll(WIKI)) {
        const { target, anchor } = splitAnchor(m[2]!);
        if (target || anchor) links.push({ kind: m[1] ? "embed" : "wiki", target, anchor });
      }
      for (const m of value.matchAll(TAG)) {
        const t = normalizeTag(m[1]!);
        if (t) tags.add(t);
      }
    }
    return undefined;
  });

  const fmTitle = typeof frontmatter?.title === "string" ? frontmatter.title.trim() : "";
  return {
    title: fmTitle || firstH1 || fileTitle,
    frontmatter, frontmatterError, aliases,
    tags: [...tags],
    links,
    body: bodyParts.join(" ").replace(/\s+/g, " ").trim(),
  };
}

function decodeURIComponentSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Search folding for Azerbaijani + English (D-054): recall over precision.
 * İ/I/ı → i, ə → e, then strip remaining diacritics (ş ç ğ ö ü), lowercase.
 */
export function searchFold(s: string): string {
  return s
    .replace(/[İIı]/g, "i")
    .replace(/[Əə]/g, "e")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}
