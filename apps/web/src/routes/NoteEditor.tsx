import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Link2, Tag } from "lucide-react";
import type { NoteVersion } from "@hub/contracts";
import { MarkdownEditor } from "../components/MarkdownEditor.tsx";
import { CardForm } from "../components/CardForm.tsx";
import { Button } from "../components/ui.tsx";
import { noteKeys, saveNote, useBacklinks, useCreateNote, useNote, useNoteMeta } from "../features/notes.ts";

type Status = "clean" | "dirty" | "saving" | "saved" | "conflict" | "error";

export function NoteEditorPage() {
  const { t } = useTranslation();
  const { noteId } = useParams({ from: "/notes/$noteId" });
  const qc = useQueryClient();
  const note = useNote(noteId);
  const meta = useNoteMeta(noteId);
  const back = useBacklinks(noteId);
  const createCopy = useCreateNote();

  const doc = useRef("");
  const version = useRef<NoteVersion | null>(null);
  const loadedFor = useRef<string | null>(null);
  const [docKey, setDocKey] = useState("");
  const [status, setStatus] = useState<Status>("clean");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [cardSeed, setCardSeed] = useState<string | null>(null);
  const statusRef = useRef<Status>("clean");
  statusRef.current = status;
  const hasUnsaved = () => ["dirty", "saving", "conflict", "error"].includes(statusRef.current);

  // Switching notes always starts from a clean slate (never carry a draft or version across notes).
  useEffect(() => {
    if (loadedFor.current !== noteId) {
      loadedFor.current = null;
      version.current = null;
      doc.current = "";
      setDocKey("");
      setStatus("clean");
      setSelection("");
      setCardSeed(null); // a card draft must never move to another note
    }
  }, [noteId]);

  // Load from the server copy only when nothing unsaved would be lost (D-053, Codex review).
  useEffect(() => {
    if (!note.data || note.data.id !== noteId) return;
    const first = loadedFor.current !== noteId;
    if (!first && note.data.version.sha256 === version.current?.sha256) return;
    if (!first && hasUnsaved()) return; // keep the draft and its baseline; the user resolves via save/conflict
    doc.current = note.data.content;
    version.current = note.data.version;
    loadedFor.current = noteId;
    setDocKey(`${noteId}:${note.data.version.sha256}`);
    setStatus("clean");
  }, [note.data, noteId]);

  // Block in-app navigation and tab close while there are unsaved changes.
  useBlocker({
    shouldBlockFn: () => (hasUnsaved() ? !window.confirm(t("editor.leaveConfirm")) : false),
    enableBeforeUnload: () => hasUnsaved(),
  });

  const save = useCallback(async () => {
    if (!version.current || note.data?.readOnlyReason || statusRef.current === "saving") return;
    const content = doc.current;
    setStatus("saving");
    try {
      const r = await saveNote(noteId, content, version.current.sha256);
      if (r.kind === "saved") {
        // The PUT response carries the version of exactly the bytes we wrote.
        version.current = r.version;
        setStatus(doc.current === content ? "saved" : "dirty");
        void qc.invalidateQueries({ queryKey: noteKeys.meta(noteId) });
        void qc.invalidateQueries({ queryKey: noteKeys.backlinks(noteId) });
        void qc.invalidateQueries({ queryKey: noteKeys.list });
      } else if (r.kind === "conflict") {
        setStatus("conflict");
      } else {
        setErrorKey(r.messageKey);
        setStatus("error");
      }
    } catch {
      setErrorKey("errors.saveFailed");
      setStatus("error");
    }
  }, [noteId, note.data?.readOnlyReason, qc]);

  const reloadFromDisk = async () => {
    // Explicit user choice: drop the draft and load the current file.
    const res = await note.refetch();
    if (!res.data) return;
    doc.current = res.data.content;
    version.current = res.data.version;
    loadedFor.current = noteId;
    setDocKey(`${noteId}:${res.data.version.sha256}:${Date.now()}`);
    setStatus("clean");
  };

  const keepMineAsCopy = () => {
    if (!note.data) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const path = note.data.path.replace(/\.md$/i, ` (conflict ${stamp}).md`);
    createCopy.mutate({ path, content: doc.current }, { onSuccess: () => void reloadFromDisk() });
  };

  if (note.isPending) return <p className="text-muted" role="status">{t("common.loading")}</p>;
  if (note.isError) return <p role="alert">{t("errors.loadFailed")}</p>;
  const n = note.data;
  const readOnly = n.readOnlyReason !== null;

  return (
    <section aria-labelledby="note-title" className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <Link to="/notes" className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-fg"><ArrowLeft size={16} aria-hidden />{t("notesPage.title")}</Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 id="note-title" className="truncate text-[28px] font-medium tracking-tight">{n.title}</h1>
            <p className="text-[13px] text-muted">{n.path}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted" role="status" aria-live="polite">{t(`editor.status.${status}`)}</span>
            <Button variant="primary" onClick={() => void save()} disabled={readOnly || status === "saving" || status === "clean" || status === "saved"}>{t("common.save")}</Button>
          </div>
        </div>

        {readOnly ? <p role="note" className="mt-4 rounded-[var(--radius-control)] border border-line bg-surface p-3 text-[14px]">{t(n.readOnlyReason === "linked" ? "notes.readOnlyLinked" : "notes.readOnly")}</p> : null}
        {status === "conflict" ? (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-brand bg-surface p-3 text-[14px]">
            <span className="flex-1">{t("editor.conflict")}</span>
            <Button onClick={keepMineAsCopy} disabled={createCopy.isPending}>{t("editor.keepCopy")}</Button>
            <Button variant="ghost" onClick={() => void reloadFromDisk()}>{t("editor.reload")}</Button>
          </div>
        ) : null}
        {status === "error" && errorKey ? <p role="alert" className="mt-4 text-[14px]">{t(errorKey)}</p> : null}

        <div className="mt-4">
          {docKey ? (
            <MarkdownEditor
              docKey={docKey}
              value={doc.current}
              readOnly={readOnly}
              label={t("editor.label", { title: n.title })}
              placeholder={t("editor.placeholder")}
              onChange={(d) => { doc.current = d; setStatus((s) => (s === "conflict" ? s : "dirty")); }}
              onSave={() => void save()}
              onSelection={setSelection}
            />
          ) : null}
        </div>
        <p className="mt-2 text-[12px] text-muted">{t("editor.hint")}</p>
      </div>

      <aside className="w-full shrink-0 space-y-6 lg:w-72" aria-label={t("editor.sidebar")}>
        <div>
          {cardSeed === null ? (
            <Button onClick={() => setCardSeed(selection)} className="w-full">{selection ? t("cards.fromSelection") : t("cards.makeCard")}</Button>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <h2 className="mb-3 text-[14px] font-medium">{t("cards.makeCard")}</h2>
              <CardForm key={cardSeed} noteId={noteId} initialBack={cardSeed} onDone={() => setCardSeed(null)} />
              <Button variant="ghost" className="mt-2" onClick={() => setCardSeed(null)}>{t("common.cancel")}</Button>
            </div>
          )}
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-medium"><Tag size={14} aria-hidden />{t("editor.tags")}</h2>
          {meta.data?.tags.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">{meta.data.tags.map((tag) => <li key={tag} className="rounded-[4px] bg-surface-2 px-2 py-0.5 text-[13px]">#{tag}</li>)}</ul>
          ) : <p className="mt-2 text-[13px] text-muted">{t("editor.none")}</p>}
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-medium"><Link2 size={14} aria-hidden />{t("editor.links")}</h2>
          <ul className="mt-2 space-y-1 text-[14px]">
            {meta.data?.links.filter((l) => l.state !== "self").map((l, i) => (
              <li key={`${l.target}-${i}`}>
                {l.state === "resolved" && l.targetId
                  ? <Link to="/notes/$noteId" params={{ noteId: l.targetId }} className="underline decoration-line underline-offset-4 hover:decoration-fg">{l.target}</Link>
                  : <span className="text-muted">{l.target} <span className="text-[12px]">· {t(`editor.linkState.${l.state}`)}</span></span>}
              </li>
            ))}
          </ul>
          {meta.data && meta.data.links.filter((l) => l.state !== "self").length === 0 ? <p className="mt-2 text-[13px] text-muted">{t("editor.none")}</p> : null}
        </div>
        <div>
          <h2 className="text-[14px] font-medium">{t("editor.backlinks")}</h2>
          <ul className="mt-2 space-y-1 text-[14px]">
            {back.data?.links.map((b) => (
              <li key={`${b.id}-${b.kind}-${b.anchor ?? ""}`}><Link to="/notes/$noteId" params={{ noteId: b.id }} className="underline decoration-line underline-offset-4 hover:decoration-fg">{b.title}</Link></li>
            ))}
          </ul>
          {back.data?.links.length === 0 ? <p className="mt-2 text-[13px] text-muted">{t("editor.none")}</p> : null}
        </div>
      </aside>
    </section>
  );
}
