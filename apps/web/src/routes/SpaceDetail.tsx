import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Archive, Pencil, Check, X } from "lucide-react";
import type { Topic } from "@hub/contracts";
import { useCreateTopic, useSpace, useUpdateSpace, useUpdateTopic } from "../features/spaces.ts";
import { Button, Card, ConfirmButton, PageTitle, TextInput } from "../components/ui.tsx";

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

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-2">
        <form onSubmit={save} className="flex flex-1 items-center gap-2">
          <input aria-label={t("topics.nameLabel")} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus
            className="h-9 flex-1 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-fg" />
          <Button type="submit" variant="ghost" aria-label={t("common.save")}><Check size={16} aria-hidden /></Button>
          <Button type="button" variant="ghost" aria-label={t("common.cancel")} onClick={() => { setName(topic.name); setEditing(false); }}><X size={16} aria-hidden /></Button>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 py-2">
      <span className="flex-1">{topic.name}</span>
      <Button variant="ghost" aria-label={t("topics.rename", { name: topic.name })} onClick={() => setEditing(true)}><Pencil size={16} aria-hidden /></Button>
      <ConfirmButton
        ariaLabel={t("topics.archive", { name: topic.name })}
        confirmAriaLabel={t("topics.archiveConfirm", { name: topic.name })}
        confirmLabel={t("common.confirmArchive")}
        onConfirm={() => update.mutate({ id: topic.id, archived: true })}
      ><Archive size={16} aria-hidden /></ConfirmButton>
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

      <Card className="mt-8">
        <h2 className="text-[20px] font-medium">{t("topics.title")}</h2>
        <p className="mt-1 text-[14px] text-muted">{t("topics.intro")}</p>
        <form onSubmit={onAdd} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextInput label={t("topics.nameLabel")} placeholder={t("topics.namePlaceholder")} value={topicName} onChange={(e) => setTopicName(e.target.value)} maxLength={120} className="flex-1" required />
          <Button type="submit" variant="primary" disabled={addTopic.isPending || !topicName.trim()}>{t("topics.add")}</Button>
        </form>
        {space.data.topics.length === 0
          ? <p className="mt-6 text-muted">{t("topics.empty")}</p>
          : <ul className="mt-6 divide-y divide-line">{space.data.topics.map((tp) => <TopicRow key={tp.id} topic={tp} spaceId={spaceId} />)}</ul>}
      </Card>
    </section>
  );
}
