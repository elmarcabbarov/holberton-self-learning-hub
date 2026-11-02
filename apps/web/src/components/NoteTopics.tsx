import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { FolderTree, X } from "lucide-react";
import { useAllTopics, useNoteTopics, useSetNoteTopics, useSpaceNotes } from "../features/goals.ts";
import { Card } from "./ui.tsx";

/** Editor sidebar: link the note to topics. Stored in the database only; the file is never changed (D-002). */
export function NoteTopics({ noteId }: { noteId: string }) {
  const { t } = useTranslation();
  const linked = useNoteTopics(noteId);
  const all = useAllTopics();
  const set = useSetNoteTopics(noteId);
  const [pick, setPick] = useState("");
  const ids = linked.data?.topics.map((x) => x.id) ?? [];
  const options = (all.data?.topics ?? []).filter((x) => !ids.includes(x.id));

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
        <select aria-label={t("noteTopics.add")} value={pick} disabled={set.isPending}
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

/** Space → notes linked to its topics. */
export function SpaceNotes({ spaceId, topicName }: { spaceId: string; topicName: (id: string) => string | undefined }) {
  const { t } = useTranslation();
  const notes = useSpaceNotes(spaceId);
  return (
    <Card className="mt-6">
      <h2 className="text-[20px] font-medium">{t("noteTopics.spaceTitle")}</h2>
      <p className="mt-1 max-w-prose text-[14px] text-muted">{t("noteTopics.spaceIntro")}</p>
      {notes.data && notes.data.notes.length > 0 ? (
        <ul className="mt-5 divide-y divide-line" aria-label={t("noteTopics.spaceListLabel")}>
          {notes.data.notes.map((n) => (
            <li key={n.id} className="flex flex-wrap items-baseline gap-3 py-2.5">
              <Link to="/notes/$noteId" params={{ noteId: n.id }} className="min-w-0 flex-1 truncate underline decoration-line underline-offset-4 hover:decoration-fg">{n.title}</Link>
              <span className="text-[13px] text-muted">{n.topicIds.map(topicName).filter(Boolean).join(", ")}</span>
            </li>
          ))}
        </ul>
      ) : notes.isSuccess ? <p className="mt-5 text-[14px] text-muted">{t("noteTopics.spaceEmpty")}</p> : null}
    </Card>
  );
}
