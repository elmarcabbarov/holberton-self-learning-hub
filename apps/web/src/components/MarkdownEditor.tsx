import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const theme = EditorView.theme({
  "&": { color: "var(--hub-fg)", backgroundColor: "transparent", fontSize: "15px", height: "100%" },
  ".cm-content": { fontFamily: "var(--font-mono)", lineHeight: "1.7", padding: "16px 0", caretColor: "var(--hub-fg)" },
  ".cm-line": { padding: "0 20px" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--hub-fg)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgba(224,0,60,0.25)" },
  ".cm-placeholder": { color: "var(--hub-muted)" },
  ".cm-scroller": { overflow: "auto" },
});

/** Markdown highlighting from Hub tokens (works in dark and light themes; no underlines, red only for code). */
const hubHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "650", fontSize: "1.3em", color: "var(--hub-fg)" },
  { tag: tags.heading2, fontWeight: "650", fontSize: "1.15em", color: "var(--hub-fg)" },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: "650", color: "var(--hub-fg)" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--hub-focus)" },
  { tag: tags.monospace, color: "var(--hub-focus)" },
  { tag: tags.quote, color: "var(--hub-muted)", fontStyle: "italic" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator, tags.labelName], color: "var(--hub-muted)" },
  { tag: [tags.keyword, tags.atom, tags.bool], color: "var(--hub-focus)" },
  { tag: [tags.string, tags.number], color: "var(--hub-fg)" },
  { tag: tags.comment, color: "var(--hub-muted)", fontStyle: "italic" },
]);

export interface MarkdownEditorProps {
  /** Initial document. Changing `docKey` replaces the document (e.g. after reload); changing `value` alone does not. */
  value: string;
  docKey: string;
  readOnly: boolean;
  label: string;
  placeholder?: string;
  onChange(doc: string): void;
  onSave(): void;
  /** Current selection text (empty when nothing is selected). */
  onSelection?(text: string): void;
}

/** CodeMirror 6 Markdown editor. Text is edited as-is (LF); the server restores EOL/BOM (D-015, D-053). */
export function MarkdownEditor({ value, docKey, readOnly, label, placeholder, onChange, onSave, onSelection }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onSave, onSelection });
  handlers.current = { onChange, onSave, onSelection };

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([{ key: "Mod-s", preventDefault: true, run: () => { handlers.current.onSave(); return true; } }, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown(),
        syntaxHighlighting(hubHighlight),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", role: "textbox" }),
        cmPlaceholder(placeholder ?? ""),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          if (u.selectionSet) { const s = u.state.selection.main; handlers.current.onSelection?.(u.state.sliceDoc(s.from, s.to)); }
        }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => { view.current?.destroy(); view.current = null; };
    // A new docKey (or read-only change) creates a fresh state: no undo history across reloads.
  }, [docKey, readOnly]);

  return <div ref={host} className="min-h-[420px] rounded-[var(--radius-card)] border border-line bg-surface-2" data-testid="markdown-editor" />;
}
