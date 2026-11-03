import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Archive, Pencil, Check, X } from "lucide-react";
import type { Topic } from "@hub/contracts";
import { useCreateTopic, useSpace, useUpdateSpace, useUpdateTopic } from "../features/spaces.ts";
import { Button, Card, ConfirmButton, PageTitle, TextInput } from "../components/ui.tsx";
import { CardForm } from "../components/CardForm.tsx";
import { SpaceQuizzes } from "../components/SpaceQuizzes.tsx";
import { SpaceGoals } from "../components/SpaceGoals.tsx";
import { SpaceNotes } from "../components/NoteTopics.tsx";
import { useSpaceCards } from "../features/cards.ts";

function TopicRow({ topic, spaceId }: { topic: Topic; spaceId: string }) {
  const { t } = useTranslation();
  const update = useUpdateTopic(spaceId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(topic.name);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    update.mutate({ id: topic.id, name }, { onSuccess: () => setEditing(false) });
  };

  const failed = update.isError ? <p role="alert" className="w-full text-[13px] text-fg">{t("errors.saveFailed")}</p> : null;

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2">
        <form onSubmit={save} className="flex flex-1 items-center gap-2">
          <input aria-label={t("topics.nameLabel")} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus
            className="h-9 flex-1 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-fg" />
          <Button type="submit" variant="ghost" aria-label={t("common.save")}><Check size={16} aria-hidden /></Button>
          <Button type="button" variant="ghost" aria-label={t("common.cancel")} onClick={() => { setName(topic.name); setEditing(false); }}><X size={16} aria-hidden /></Button>
        </form>
        {failed}
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="flex-1">{topic.name}</span>
      <Link to="/spaces/$spaceId/tutor" params={{ spaceId }} search={{ topicId: topic.id }} className="text-[14px] text-muted underline underline-offset-4">{t("tutor.ask")}</Link>
      <Button variant="ghost" aria-label={t("topics.rename", { name: topic.name })} onClick={() => setEditing(true)}><Pencil size={16} aria-hidden /></Button>
      <ConfirmButton
        ariaLabel={t("topics.archive", { name: topic.name })}
        confirmAriaLabel={t("topics.archiveConfirm", { name: topic.name })}
        confirmLabel={t("common.confirmArchive")}
        onConfirm={() => update.mutate({ id: topic.id, archived: true })}
      ><Archive size={16} aria-hidden /></ConfirmButton>
      {failed}
    </li>
  );
}

function ArchivedTopicRow({ topic, spaceId }: { topic: Topic; spaceId: string }) {
  const { t } = useTranslation();
  const update = useUpdateTopic(spaceId);
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span className="flex-1 text-muted">{topic.name}</span>
      <Button onClick={() => update.mutate({ id: topic.id, archived: false })} disabled={update.isPending} aria-label={t("archive.restoreNamed", { name: topic.name })}>{t("archive.restore")}</Button>
      {update.isError ? <p role="alert" className="w-full text-[13px]">{t("errors.saveFailed")}</p> : null}
    </li>
  );
}

export function SpaceDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { spaceId } = useParams({ from: "/spaces/$spaceId" });
  const space = useSpace(spaceId);
  const addTopic = useCreateTopic(spaceId);
  const updateSpace = useUpdateSpace(spaceId);
  const [topicName, setTopicName] = useState("");
  const spaceCards = useSpaceCards(spaceId);

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!topicName.trim()) return;
    addTopic.mutate(topicName, { onSuccess: () => { setTopicName(""); void space.refetch(); } });
  };

  if (space.isPending) return <p className="text-muted" role="status">{t("common.loading")}</p>;
  if (space.isError) return <p role="alert">{t("errors.loadFailed")}</p>;

  return (
    <section aria-labelledby="space-title">
      <Link to="/spaces" className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-fg"><ArrowLeft size={16} aria-hidden />{t("spaces.title")}</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <PageTitle id="space-title">{space.data.name}</PageTitle>
        <ConfirmButton
          confirmLabel={t("common.confirmArchive")}
          onConfirm={() => updateSpace.mutate({ archived: true }, { onSuccess: () => void navigate({ to: "/spaces" }) })}
        ><Archive size={16} aria-hidden />{t("spaces.archive")}</ConfirmButton>
      </div>
      {updateSpace.isError ? <p role="alert" className="mt-3 text-[14px] text-fg">{t("errors.saveFailed")}</p> : null}

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <Link to="/spaces/$spaceId/tutor" params={{ spaceId }} className="inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line bg-surface px-4 text-[14px] font-medium">{t("tutor.ask")}</Link>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tutor-mode" className="text-[13px] text-muted">{t("tutor.mode")}</label>
          <select id="tutor-mode" value={space.data.tutorMode ?? "project"} disabled={updateSpace.isPending} onChange={(e) => updateSpace.mutate({ tutorMode: e.target.value as "project" | "explain" })} aria-describedby="tutor-mode-note" className="h-10 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3">
            <option value="project">{t("tutor.modes.project")}</option>
            <option value="explain">{t("tutor.modes.explain")}</option>
          </select>
        </div>
        <p id="tutor-mode-note" className="w-full text-[13px] text-muted">{t(`tutor.modeHelp.${space.data.tutorMode ?? "project"}`)}</p>
      </div>

      <Card className="mt-8">
        <h2 className="text-[20px] font-medium">{t("topics.title")}</h2>
        <p className="mt-1 text-[14px] text-muted">{t("topics.intro")}</p>
        <form onSubmit={onAdd} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextInput label={t("topics.nameLabel")} placeholder={t("topics.namePlaceholder")} value={topicName} onChange={(e) => setTopicName(e.target.value)} maxLength={120} className="flex-1" required />
          <Button type="submit" variant="primary" disabled={addTopic.isPending || !topicName.trim()}>{t("topics.add")}</Button>
        </form>
        {addTopic.isError ? <p role="alert" className="mt-3 text-[14px] text-fg">{t("errors.saveFailed")}</p> : null}
        {space.data.topics.length === 0
          ? <p className="mt-6 text-muted">{t("topics.empty")}</p>
          : <ul className="mt-6 divide-y divide-line" aria-label={t("topics.listLabel")}>{space.data.topics.map((tp) => <TopicRow key={tp.id} topic={tp} spaceId={spaceId} />)}</ul>}
      </Card>

      {space.data.archivedTopics.length > 0 ? (
        <details className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface px-6 py-4">
          <summary className="cursor-pointer text-[14px] text-muted">{t("archive.topicsSummary", { count: space.data.archivedTopics.length })}</summary>
          <ul className="mt-3 divide-y divide-line" aria-label={t("archive.topicsLabel")}>
            {space.data.archivedTopics.map((tp) => <ArchivedTopicRow key={tp.id} topic={tp} spaceId={spaceId} />)}
          </ul>
        </details>
      ) : null}

      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[20px] font-medium">{t("cards.title")}</h2>
          <div className="flex gap-4">
            <a href={`/api/cards/export/anki?spaceId=${spaceId}`} download className="text-[14px] text-muted underline decoration-line underline-offset-4 hover:text-fg">{t("anki.downloadSpace")}</a>
            <Link to="/review" search={{ space: spaceId }} className="text-[14px] text-muted underline decoration-line underline-offset-4 hover:text-fg">{t("cards.startReview")}</Link>
          </div>
        </div>
        <p className="mt-1 text-[14px] text-muted">{t("cards.intro")}</p>
        <div className="mt-5"><CardForm spaceId={spaceId} /></div>
        {spaceCards.data && spaceCards.data.cards.length > 0 ? (
          <ul className="mt-6 divide-y divide-line" aria-label={t("cards.listLabel")}>
            {spaceCards.data.cards.map((c) => (
              <li key={c.id} className="flex items-baseline gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate">{c.front}</span>
                <span className="shrink-0 text-[12px] text-muted">{t(`cards.state.${c.state}`)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <SpaceGoals spaceId={spaceId} />
      <SpaceNotes spaceId={spaceId} topicName={(id) => [...space.data.topics, ...space.data.archivedTopics].find((x) => x.id === id)?.name} />
      <SpaceQuizzes spaceId={spaceId} />
    </section>
  );
}
