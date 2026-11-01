import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCreateCard } from "../features/cards.ts";
import { useSpace, useSpaces } from "../features/spaces.ts";
import { Button } from "./ui.tsx";

const field = "w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2 text-[15px] text-fg placeholder:text-muted";

function TopicPicker({ spaceId, value, onChange }: { spaceId: string; value: string; onChange(v: string): void }) {
  const { t } = useTranslation();
  const space = useSpace(spaceId);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{t("cards.topic")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} h-10 py-0`}>
        <option value="">{t("cards.noTopic")}</option>
        {space.data?.topics.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
      </select>
    </label>
  );
}

/** Create a card. With `spaceId` the topic list is that space's; otherwise the user picks a space first. */
export function CardForm({ spaceId, noteId = null, initialFront = "", initialBack = "", onDone }: {
  spaceId?: string; noteId?: string | null; initialFront?: string; initialBack?: string; onDone?: () => void;
}) {
  const { t } = useTranslation();
  const spaces = useSpaces();
  const create = useCreateCard();
  const [space, setSpace] = useState(spaceId ?? "");
  const [topic, setTopic] = useState("");
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    create.mutate({ topicId: topic || null, noteId, front, back }, {
      onSuccess: () => { setFront(""); setBack(""); onDone?.(); },
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t("cards.formLabel")}>
      {!spaceId ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{t("cards.space")}</span>
          <select value={space} onChange={(e) => { setSpace(e.target.value); setTopic(""); }} className={`${field} h-10 py-0`}>
            <option value="">{t("cards.noSpace")}</option>
            {spaces.data?.spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      ) : null}
      {space ? <TopicPicker spaceId={space} value={topic} onChange={setTopic} /> : null}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{t("cards.front")}</span>
        <textarea value={front} onChange={(e) => setFront(e.target.value)} rows={2} maxLength={5000} required className={field} placeholder={t("cards.frontPlaceholder")} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{t("cards.back")}</span>
        <textarea value={back} onChange={(e) => setBack(e.target.value)} rows={3} maxLength={5000} required className={field} placeholder={t("cards.backPlaceholder")} />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={create.isPending || !front.trim() || !back.trim()}>{t("cards.create")}</Button>
        {create.isSuccess ? <span role="status" className="text-[13px] text-muted">{t("cards.created")}</span> : null}
      </div>
      {create.isError ? <p role="alert" className="text-[14px]">{t("errors.saveFailed")}</p> : null}
    </form>
  );
}
