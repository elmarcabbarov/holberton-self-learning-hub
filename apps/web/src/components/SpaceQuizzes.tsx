import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSpace } from "../features/spaces.ts";
import { useArchivedQuizzes, useCreateQuiz, useSpaceQuizzes } from "../features/quizzes.ts";
import { Button, Card, TextInput } from "./ui.tsx";

const field = "h-10 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px] text-fg";

/** Quizzes of a space. A quiz belongs to a topic so it shows up here (a quiz without a topic lives only under its own link). */
export function SpaceQuizzes({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const space = useSpace(spaceId);
  const quizzes = useSpaceQuizzes(spaceId);
  const create = useCreateQuiz();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archived = useArchivedQuizzes(spaceId, showArchived);
  const topics = space.data?.topics ?? [];
  const topicId = topic || topics[0]?.id || "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !topicId) return;
    create.mutate({ title, topicId }, { onSuccess: (q) => void navigate({ to: "/quizzes/$quizId", params: { quizId: q.id } }) });
  };

  return (
    <Card className="mt-6">
      <h2 className="hub-display text-[22px]">{t("quizzes.title")}</h2>
      <p className="mt-1 text-[14px] text-muted">{t("quizzes.intro")}</p>
      {topics.length === 0 ? <p className="mt-4 text-[14px] text-muted">{t("quizzes.needTopic")}</p> : (
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" aria-label={t("quizzes.newQuiz")}>
          <TextInput label={t("quizzes.titleLabel")} placeholder={t("quizzes.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="flex-1" required />
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted">{t("cards.topic")}</span>
            <select value={topicId} onChange={(e) => setTopic(e.target.value)} className={field}>
              {topics.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            </select>
          </label>
          <Button type="submit" variant="primary" disabled={create.isPending || !title.trim()}>{t("quizzes.create")}</Button>
        </form>
      )}
      {create.isError ? <p role="alert" className="mt-3 text-[14px]">{t("errors.saveFailed")}</p> : null}
      {quizzes.data && quizzes.data.quizzes.length > 0 ? (
        <ul className="mt-6 divide-y divide-line" aria-label={t("quizzes.listLabel")}>
          {quizzes.data.quizzes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
              <Link to="/quizzes/$quizId" params={{ quizId: q.id }} className="min-w-0 flex-1 truncate underline decoration-line underline-offset-4 hover:decoration-fg">{q.title}</Link>
              <span className="text-[12px] text-muted">{q.topicName}</span>
              <span className="text-[12px] text-muted">{t("quizzes.questions", { count: q.questionCount })}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <details className="mt-4" onToggle={(e) => setShowArchived(e.currentTarget.open)}>
        <summary className="cursor-pointer text-[14px] text-muted">{t("quizzes.archivedSummary")}</summary>
        {archived.isPending && showArchived ? <p className="mt-2 text-[14px] text-muted" role="status">{t("common.loading")}</p> : null}
        {archived.data ? (archived.data.quizzes.length === 0 ? <p className="mt-2 text-[14px] text-muted">{t("quizzes.noArchived")}</p> : (
          <ul className="mt-2 divide-y divide-line" aria-label={t("quizzes.archivedLabel")}>
            {archived.data.quizzes.map((q) => (
              <li key={q.id} className="py-2"><Link to="/quizzes/$quizId" params={{ quizId: q.id }} className="text-muted underline decoration-line underline-offset-4 hover:text-fg">{q.title}</Link></li>
            ))}
          </ul>
        )) : null}
      </details>
    </Card>
  );
}
