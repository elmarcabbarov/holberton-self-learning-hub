import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, X } from "lucide-react";
import type { Attempt, AttemptItem, Response } from "@hub/contracts";
import { useAnswer, useAttempt, useGrade, useSubmitAttempt } from "../features/quizzes.ts";
import { Button, Card, PageTitle } from "../components/ui.tsx";
import { ScoreLine } from "../components/ScoreLine.tsx";

const field = "w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2 text-[15px] text-fg";
const same = (a: Response | null | undefined, b: Response | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isEmpty = (r: Response | undefined) => !r || ("selected" in r ? r.selected.length === 0 : r.text.trim() === "");

function Verdict({ correct }: { correct: boolean | null }) {
  const { t } = useTranslation();
  if (correct === null) return null;
  return (
    <p className="flex items-center gap-1.5 text-[15px] font-medium">
      {correct ? <Check size={18} aria-hidden /> : <X size={18} aria-hidden />}{correct ? t("quizzes.correct") : t("quizzes.incorrect")}
    </p>
  );
}

function ItemCard({ attempt, item, n, draft, setDraft }: {
  attempt: Attempt; item: AttemptItem; n: number; draft: Response | undefined; setDraft: (r: Response) => void;
}) {
  const { t } = useTranslation();
  const answer = useAnswer(attempt.id);
  const grade = useGrade(attempt.id);
  const exam = attempt.mode === "exam";
  const locked = !!attempt.finishedAt || (!exam && item.feedback !== null);
  const current = draft ?? item.response ?? undefined;
  const selected = current && "selected" in current ? current.selected : [];
  const fb = item.feedback;
  const key = fb && "correct" in fb.answer ? fb.answer.correct : [];

  const send = (r: Response) => answer.mutate({ questionId: item.id, response: r });
  const pick = (i: number) => {
    const next = item.type === "mcq" ? [i] : selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i].sort();
    const r = { selected: next };
    setDraft(r);
    if (exam) send(r); // exam answers save as you go (an empty selection clears) and can change until submit
  };

  return (
    <li>
      <Card>
        <fieldset disabled={locked}>
          <legend className="flex gap-3 text-[17px] leading-snug">
            <span className="shrink-0 text-muted tabular-nums">{n}.</span>
            <span className="whitespace-pre-wrap">{item.prompt}</span>
          </legend>
          <p className="mt-1 text-[12px] text-muted">{t(`quizzes.types.${item.type}`)}</p>

          {item.type === "short_self" ? (
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">{t("quizzes.yourAnswer")}</span>
              <textarea rows={3} maxLength={5000} className={field} value={current && "text" in current ? current.text : ""}
                onChange={(e) => setDraft({ text: e.target.value })}
                onBlur={() => { if (exam && current && "text" in current && !same(current, item.response) && !(isEmpty(current) && !item.response)) send(current); }} />
            </label>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {item.options.map((o, i) => {
                const chosen = selected.includes(i);
                const isKey = key.includes(i);
                return (
                  <label key={i} className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 ${fb && isKey ? "border-fg" : "border-line"} bg-surface-2`}>
                    <input type={item.type === "mcq" ? "radio" : "checkbox"} name={`q-${item.id}`} checked={chosen} onChange={() => pick(i)} className="mt-1 accent-fg" />
                    <span className="flex-1">{o}</span>
                    {fb && isKey ? <span className="text-[12px] font-medium">{t("quizzes.keyMark")}</span> : null}
                    {fb && chosen && !isKey ? <span className="text-[12px] text-muted">{t("quizzes.yourPick")}</span> : null}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        {!exam && !locked ? (
          <Button className="mt-4" variant="secondary" disabled={isEmpty(current) || answer.isPending} onClick={() => current && send(current)}>
            {item.type === "short_self" ? t("quizzes.showReference") : t("quizzes.check")}
          </Button>
        ) : null}
        {exam && !attempt.finishedAt && item.response ? <p className="mt-3 text-[12px] text-muted" role="status">{t("quizzes.saved")}</p> : null}
        {answer.isError ? <p role="alert" className="mt-3 text-[14px]">{t("errors.saveFailed")}</p> : null}

        {fb ? (
          <div className="mt-5 border-t border-line pt-4" aria-live="polite">
            {item.type !== "short_self" ? <Verdict correct={fb.correct} /> : null}
            {"reference" in fb.answer ? (
              <>
                <p className="text-[13px] text-muted">{t("quizzes.reference")}</p>
                <p className="mt-1 whitespace-pre-wrap">{fb.answer.reference}</p>
                {item.response ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t("quizzes.selfGrade")}>
                    <span className="text-[14px]">{t("quizzes.selfGrade")}</span>
                    <Button aria-pressed={fb.correct === true} variant={fb.correct === true ? "primary" : "secondary"} disabled={grade.isPending}
                      onClick={() => grade.mutate({ questionId: item.id, correct: true })}>{t("quizzes.gotIt")}</Button>
                    <Button aria-pressed={fb.correct === false} disabled={grade.isPending}
                      className={fb.correct === false ? "border-fg" : ""}
                      onClick={() => grade.mutate({ questionId: item.id, correct: false })}>{t("quizzes.missedIt")}</Button>
                  </div>
                ) : <p className="mt-3 text-[13px] text-muted">{t("quizzes.notAnswered")}</p>}
              </>
            ) : null}
            {fb.explanation ? <p className="mt-3 whitespace-pre-wrap text-[15px] text-muted">{fb.explanation}</p> : null}
            {grade.isError ? <p role="alert" className="mt-3 text-[14px]">{t("errors.saveFailed")}</p> : null}
          </div>
        ) : null}
      </Card>
    </li>
  );
}

function Result({ attempt }: { attempt: Attempt }) {
  const { t } = useTranslation();
  if (!attempt.score) return null;
  return (
    <Card className="mt-8">
      <h2 className="text-[20px] font-medium">{t("quizzes.resultTitle")}</h2>
      <p className="mt-2 text-[17px]"><ScoreLine score={attempt.score} /></p>
      <p className="mt-2 text-muted">
        {attempt.confidencePre
          ? t("quizzes.calibration", { label: t(`quizzes.confidence.${attempt.confidencePre}`), n: attempt.confidencePre })
          : t("quizzes.calibrationSkipped")}
      </p>
      <p className="mt-2 text-[13px] text-muted">{t("quizzes.signalNote")}</p>
      <Link to="/quizzes/$quizId" params={{ quizId: attempt.quizId }} className="mt-5 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 text-[14px] font-medium hover:bg-surface">{t("quizzes.backToQuiz")}</Link>
    </Card>
  );
}

export function AttemptPage() {
  const { t } = useTranslation();
  const { attemptId } = useParams({ from: "/attempts/$attemptId" });
  const attempt = useAttempt(attemptId);
  const answer = useAnswer(attemptId);
  const submit = useSubmitAttempt(attemptId);
  const [drafts, setDrafts] = useState<Record<string, Response>>({});

  if (attempt.isPending) return <p className="text-muted" role="status">{t("common.loading")}</p>;
  if (attempt.isError) return <p role="alert">{t("errors.loadFailed")}</p>;
  const a = attempt.data;
  const answered = a.items.filter((i) => i.response).length;

  const finish = async () => {
    // Exam: text answers typed without leaving the field are saved before submitting.
    try {
      if (a.mode === "exam") {
        for (const item of a.items) {
          const d = drafts[item.id];
          if (d && !same(d, item.response) && !(isEmpty(d) && !item.response)) await answer.mutateAsync({ questionId: item.id, response: d });
        }
      }
    } catch { return; } // the error is shown below; nothing is submitted
    submit.mutate();
  };

  return (
    <section aria-labelledby="attempt-title">
      <Link to="/quizzes/$quizId" params={{ quizId: a.quizId }} className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-fg"><ArrowLeft size={16} aria-hidden />{t("quizzes.backToQuiz")}</Link>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
        <PageTitle id="attempt-title">{a.quizTitle}</PageTitle>
        <span className="text-[14px] text-muted">{t(`quizzes.modes.${a.mode}`)} · {t("quizzes.answeredOf", { done: answered, total: a.items.length })}</span>
      </div>
      {a.mode === "exam" && !a.finishedAt ? <p className="mt-2 text-[14px] text-muted">{t("quizzes.examNote")}</p> : null}

      {a.finishedAt ? <Result attempt={a} /> : null}

      <ol className="mt-8 flex flex-col gap-4" aria-label={t("quizzes.questionsLabel")}>
        {a.items.map((item, i) => (
          <ItemCard key={item.id} attempt={a} item={item} n={i + 1} draft={drafts[item.id]} setDraft={(r) => setDrafts((d) => ({ ...d, [item.id]: r }))} />
        ))}
      </ol>

      {!a.finishedAt ? (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void finish()} disabled={submit.isPending || answer.isPending}>
            {a.mode === "exam" ? t("quizzes.submitExam") : t("quizzes.finish")}
          </Button>
          {answered < a.items.length ? <span className="text-[13px] text-muted">{t("quizzes.unansweredWarning", { count: a.items.length - answered })}</span> : null}
          {submit.isError || answer.isError ? <p role="alert" className="w-full text-[14px]">{t("errors.saveFailed")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
