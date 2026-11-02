import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Archive, Pencil } from "lucide-react";
import type { AttemptSummary, Question, QuizMode } from "@hub/contracts";
import { useArchiveQuestion, useAttempts, useQuiz, useStartAttempt, useUpdateQuiz } from "../features/quizzes.ts";
import { QuestionForm } from "../components/QuestionForm.tsx";
import { Button, Card, ConfirmButton, PageTitle } from "../components/ui.tsx";
import { ScoreLine } from "../components/ScoreLine.tsx";

const CONFIDENCE = [1, 2, 3, 4, 5] as const;

function QuestionRow({ quizId, question, n }: { quizId: string; question: Question; n: number }) {
  const { t } = useTranslation();
  const archive = useArchiveQuestion();
  const [editing, setEditing] = useState(false);
  if (editing) return <li className="py-4"><QuestionForm quizId={quizId} question={question} onDone={() => setEditing(false)} /></li>;
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="w-6 shrink-0 text-[13px] text-muted tabular-nums">{n}.</span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap">{question.prompt}</p>
        <p className="mt-0.5 text-[12px] text-muted">{t(`quizzes.types.${question.type}`)}</p>
      </div>
      <Button variant="ghost" aria-label={t("quizzes.editNamed", { n })} onClick={() => setEditing(true)}><Pencil size={16} aria-hidden /></Button>
      <ConfirmButton ariaLabel={t("quizzes.archiveQuestion", { n })} confirmAriaLabel={t("quizzes.archiveQuestionConfirm", { n })}
        confirmLabel={t("common.confirmArchive")} onConfirm={() => archive.mutate(question.id)}><Archive size={16} aria-hidden /></ConfirmButton>
    </li>
  );
}

/** Mode and pre-quiz confidence (US-06). Confidence can be skipped. */
function StartForm({ quizId, disabled }: { quizId: string; disabled: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const start = useStartAttempt(quizId);
  const [mode, setMode] = useState<QuizMode>("practice");
  const [confidence, setConfidence] = useState<number | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    start.mutate({ mode, confidencePre: confidence }, { onSuccess: (a) => void navigate({ to: "/attempts/$attemptId", params: { attemptId: a.id } }) });
  };
  const choice = "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2.5 has-[:checked]:border-fg";

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset>
        <legend className="text-[14px] font-medium">{t("quizzes.mode")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["practice", "exam"] as const).map((m) => (
            <label key={m} className={choice}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 accent-fg" />
              <span><span className="block text-[14px] font-medium">{t(`quizzes.modes.${m}`)}</span><span className="block text-[13px] text-muted">{t(`quizzes.modeHint.${m}`)}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-[14px] font-medium">{t("quizzes.confidenceQuestion")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CONFIDENCE.map((c) => (
            <label key={c} className={`${choice} items-center py-2`}>
              <input type="radio" name="confidence" checked={confidence === c} onChange={() => setConfidence(c)} className="accent-fg" />
              <span className="text-[14px]">{t(`quizzes.confidence.${c}`)}</span>
            </label>
          ))}
          <label className={`${choice} items-center py-2`}>
            <input type="radio" name="confidence" checked={confidence === null} onChange={() => setConfidence(null)} className="accent-fg" />
            <span className="text-[14px] text-muted">{t("quizzes.confidenceSkip")}</span>
          </label>
        </div>
      </fieldset>
      <div>
        <Button type="submit" variant="primary" disabled={disabled || start.isPending}>{t("quizzes.start")}</Button>
        {disabled ? <p className="mt-2 text-[13px] text-muted">{t("quizzes.needQuestions")}</p> : null}
        {start.isError ? <p role="alert" className="mt-2 text-[14px]">{t("errors.saveFailed")}</p> : null}
      </div>
    </form>
  );
}

function History({ quizId }: { quizId: string }) {
  const { t, i18n } = useTranslation();
  const attempts = useAttempts(quizId);
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  const list = attempts.data?.attempts ?? [];
  if (list.length === 0) return <p className="mt-3 text-muted">{t("quizzes.noAttempts")}</p>;
  return (
    <ul className="mt-3 divide-y divide-line" aria-label={t("quizzes.historyLabel")}>
      {list.map((a: AttemptSummary) => (
        <li key={a.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
          <Link to="/attempts/$attemptId" params={{ attemptId: a.id }} className="text-[14px] underline decoration-line underline-offset-4 hover:decoration-fg">{fmt.format(new Date(a.startedAt))}</Link>
          <span className="text-[13px] text-muted">{t(`quizzes.modes.${a.mode}`)}</span>
          <span className="flex-1 text-[14px]">{a.score ? <ScoreLine score={a.score} /> : t("quizzes.inProgress")}</span>
          <span className="text-[13px] text-muted">{a.confidencePre ? t("quizzes.confidenceWas", { label: t(`quizzes.confidence.${a.confidencePre}`) }) : null}</span>
        </li>
      ))}
    </ul>
  );
}

export function QuizPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { quizId } = useParams({ from: "/quizzes/$quizId" });
  const quiz = useQuiz(quizId);
  const update = useUpdateQuiz(quizId);

  if (quiz.isPending) return <p className="text-muted" role="status">{t("common.loading")}</p>;
  if (quiz.isError) return <p role="alert">{t("errors.loadFailed")}</p>;
  const q = quiz.data;
  const back = q.spaceId
    ? <Link to="/spaces/$spaceId" params={{ spaceId: q.spaceId }} className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-fg"><ArrowLeft size={16} aria-hidden />{t("quizzes.backToSpace")}</Link>
    : <Link to="/spaces" className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-fg"><ArrowLeft size={16} aria-hidden />{t("spaces.title")}</Link>;

  return (
    <section aria-labelledby="quiz-title">
      {back}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageTitle id="quiz-title">{q.title}</PageTitle>
          <p className="mt-1 text-[14px] text-muted">{q.topicName ?? t("quizzes.unassigned")}</p>
        </div>
        {!q.archivedAt ? (
          <ConfirmButton confirmLabel={t("common.confirmArchive")}
            onConfirm={() => update.mutate({ archived: true }, { onSuccess: () => void navigate(q.spaceId ? { to: "/spaces/$spaceId", params: { spaceId: q.spaceId } } : { to: "/spaces" }) })}
          ><Archive size={16} aria-hidden />{t("quizzes.archive")}</ConfirmButton>
        ) : null}
      </div>

      {q.archivedAt ? (
        <Card className="mt-8">
          <p>{t("quizzes.archivedNote")}</p>
          <Button className="mt-4" onClick={() => update.mutate({ archived: false })}>{t("archive.restore")}</Button>
        </Card>
      ) : (
        <Card className="mt-8"><StartForm quizId={quizId} disabled={q.questions.length === 0} /></Card>
      )}

      <Card className="mt-6">
        <h2 className="text-[20px] font-medium">{t("quizzes.questions", { count: q.questions.length })}</h2>
        {q.questions.length > 0
          ? <ol className="mt-4 divide-y divide-line" aria-label={t("quizzes.questionsLabel")}>{q.questions.map((qq, i) => <QuestionRow key={qq.id} quizId={quizId} question={qq} n={i + 1} />)}</ol>
          : <p className="mt-2 text-muted">{t("quizzes.noQuestions")}</p>}
        {!q.archivedAt ? (
          <div className="mt-6 border-t border-line pt-6">
            <h3 className="mb-4 text-[16px] font-medium">{t("quizzes.newQuestion")}</h3>
            <QuestionForm quizId={quizId} />
          </div>
        ) : null}
      </Card>

      <Card className="mt-6">
        <h2 className="text-[20px] font-medium">{t("quizzes.history")}</h2>
        <History quizId={quizId} />
      </Card>
    </section>
  );
}
