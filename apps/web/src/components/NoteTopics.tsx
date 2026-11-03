import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { Folder, FolderTree, X } from "lucide-react";
import type { SpaceDetail as Space } from "@hub/contracts";
import { ApiError } from "../api.ts";
import { useAllTopics, useCreateSpaceNote, useNoteSpaces, useNoteTopics, useSetNoteSpaces, useSetNoteTopics, useSpaceNotes } from "../features/goals.ts";
import { useSpaces } from "../features/spaces.ts";
import { Button, Card, TextInput } from "./ui.tsx";

/** Editor sidebar: link the note to topics. Stored in the database only; the file is never changed (D-002). */
export function NoteTopics({ noteId }: { noteId: string }) {
  const { t } = useTranslation();
  const linked = useNoteTopics(noteId);
  const all = useAllTopics();
  const set = useSetNoteTopics(noteId);
  const [pick, setPick] = useState("");
  const ids = linked.data?.topics.map((x) => x.id) ?? [];
  // Changes replace the whole set: only offer them once the current links are known.
  const options = linked.isSuccess ? (all.data?.topics ?? []).filter((x) => !ids.includes(x.id)) : [];

  return (
    <div>
      <h2 className="flex items-center gap-2 text-[14px] font-medium"><FolderTree size={14} aria-hidden />{t("noteTopics.title")}</h2>
      {linked.data && linked.data.topics.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("noteTopics.listLabel")}>
          {linked.data.topics.map((x) => (
            <li key={x.id} className="inline-flex items-center gap-1 rounded-[4px] bg-surface-2 py-0.5 pl-2 pr-1 text-[13px]">
              <Link to="/spaces/$spaceId" params={{ spaceId: x.spaceId }} className="hover:underline">{x.spaceName} / {x.name}</Link>
              <button type="button" aria-label={t("noteTopics.remove", { name: x.name })} disabled={set.isPending}
                onClick={() => set.mutate(ids.filter((id) => id !== x.id))} className="rounded-[3px] p-0.5 text-muted hover:text-fg"><X size={12} aria-hidden /></button>
            </li>
          ))}
        </ul>
      ) : linked.isSuccess ? <p className="mt-2 text-[13px] text-muted">{t("editor.none")}</p> : null}
      {options.length > 0 ? (
        <select aria-label={t("noteTopics.add")} value={pick} disabled={set.isPending || !linked.isSuccess}
          onChange={(e) => { const id = e.target.value; setPick(""); if (id) set.mutate([...ids, id]); }}
          className="mt-2 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-2 text-[14px]">
          <option value="">{t("noteTopics.add")}</option>
          {options.map((x) => <option key={x.id} value={x.id}>{x.spaceName} / {x.name}</option>)}
        </select>
      ) : null}
      {set.isError ? <p role="alert" className="mt-2 text-[13px]">{t("errors.saveFailed")}</p> : null}
    </div>
  );
}

/** Editor sidebar: link the note to spaces directly (HSLH-028). Database only; the file is never changed. */
export function NoteSpaces({ noteId }: { noteId: string }) {
  const { t } = useTranslation();
  const linked = useNoteSpaces(noteId);
  const all = useSpaces();
  const set = useSetNoteSpaces(noteId);
  const [pick, setPick] = useState("");
  const ids = linked.data?.spaces.map((x) => x.id) ?? [];
  const options = linked.isSuccess ? (all.data?.spaces ?? []).filter((x) => !ids.includes(x.id)) : [];
  return (
    <div>
      <h2 className="flex items-center gap-2 text-[14px] font-medium"><Folder size={14} aria-hidden />{t("noteSpaces.title")}</h2>
      {linked.data && linked.data.spaces.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("noteSpaces.listLabel")}>
          {linked.data.spaces.map((x) => (
            <li key={x.id} className="inline-flex items-center gap-1 rounded-[4px] bg-surface-2 py-0.5 pl-2 pr-1 text-[13px]">
              <Link to="/spaces/$spaceId" params={{ spaceId: x.id }} className="hover:underline">{x.name}</Link>
              <button type="button" aria-label={t("noteSpaces.remove", { name: x.name })} disabled={set.isPending}
                onClick={() => set.mutate(ids.filter((id) => id !== x.id))} className="rounded-[3px] p-0.5 text-muted hover:text-fg"><X size={12} aria-hidden /></button>
            </li>
          ))}
        </ul>
      ) : linked.isSuccess ? <p className="mt-2 text-[13px] text-muted">{t("editor.none")}</p> : null}
      {options.length > 0 ? (
        <select aria-label={t("noteSpaces.add")} value={pick} disabled={set.isPending || !linked.isSuccess}
          onChange={(e) => { const id = e.target.value; setPick(""); if (id) set.mutate([...ids, id]); }}
          className="mt-2 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-2 text-[14px]">
          <option value="">{t("noteSpaces.add")}</option>
          {options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      ) : null}
      {set.isError ? <p role="alert" className="mt-2 text-[13px]">{t("errors.saveFailed")}</p> : null}
    </div>
  );
}

/** A space's notes: linked directly or through its topics. New notes are created in the space's folder (HSLH-028). */
export function SpaceNotes({ space }: { space: Space }) {
  const { t } = useTranslation();
  const notes = useSpaceNotes(space.id);
  const create = useCreateSpaceNote(space.id);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const topicName = (id: string) => [...space.topics, ...space.archivedTopics].find((x) => x.id === id)?.name;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title: title.trim(), ...(topic ? { topicId: topic } : {}) }, {
      onSuccess: (out) => { setTitle(""); void navigate({ to: "/notes/$noteId", params: { noteId: out.noteId } }); },
    });
  };
  const errorKey = (e: unknown) => (e instanceof ApiError && e.messageKey.startsWith("noteSpaces.") ? e.messageKey : "errors.saveFailed");
  return (
    <Card className="mt-6">
      <h2 className="text-[20px] font-medium">{t("noteTopics.spaceTitle")}</h2>
      <p className="mt-1 max-w-prose text-[14px] text-muted">{t("noteTopics.spaceIntro")}</p>
      {!space.archivedAt ? (
        <form aria-label={t("noteSpaces.new")} onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1"><TextInput label={t("noteSpaces.newTitle")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t("noteSpaces.newPlaceholder")} /></div>
          {space.topics.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="space-note-topic" className="text-[13px] text-muted">{t("noteSpaces.newTopic")}</label>
              <select id="space-note-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-10 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-[15px]">
                <option value="">{t("noteSpaces.noTopic")}</option>
                {space.topics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          ) : null}
          <Button type="submit" disabled={!title.trim() || create.isPending}>{t("noteSpaces.create")}</Button>
        </form>
      ) : null}
      {space.noteFolder ? <p className="mt-2 text-[13px] text-muted">{t("noteSpaces.folder", { folder: space.noteFolder })}</p> : null}
      {create.isError ? <p role="alert" className="mt-2 text-[14px]">{t(errorKey(create.error))}</p> : null}
      {notes.data && notes.data.notes.length > 0 ? (
        <ul className="mt-5 divide-y divide-line" aria-label={t("noteTopics.spaceListLabel")}>
          {notes.data.notes.map((n) => (
            <li key={n.id} className="flex flex-wrap items-baseline gap-3 py-2.5">
              <Link to="/notes/$noteId" params={{ noteId: n.id }} className="min-w-0 flex-1 truncate underline decoration-line underline-offset-4 hover:decoration-fg">{n.title}</Link>
              <span className="text-[13px] text-muted">{[...(n.direct && n.topicIds.length === 0 ? [t("noteSpaces.linkedDirect")] : []), ...n.topicIds.map(topicName).filter(Boolean)].join(", ")}</span>
            </li>
          ))}
        </ul>
      ) : notes.isSuccess ? <p className="mt-5 text-[14px] text-muted">{t("noteTopics.spaceEmpty")}</p> : null}
    </Card>
  );
}
