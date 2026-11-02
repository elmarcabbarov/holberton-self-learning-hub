import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { MAX_OPTIONS, type Question, type QuestionType } from "@hub/contracts";
import { useSaveQuestion } from "../features/quizzes.ts";
import { Button } from "./ui.tsx";

const field = "w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2 text-[15px] text-fg placeholder:text-muted";

/** Create or edit one question. Choice questions mark correct options inline; short answers take a reference. */
export function QuestionForm({ quizId, question, onDone }: { quizId: string; question?: Question; onDone?: () => void }) {
  const { t } = useTranslation();
  const save = useSaveQuestion(quizId);
  const uid = useId();
  const [type, setType] = useState<QuestionType>(question?.type ?? "mcq");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [options, setOptions] = useState<string[]>(question && question.type !== "short_self" ? question.options : ["", ""]);
  const [correct, setCorrect] = useState<number[]>(question && "correct" in question.answer ? question.answer.correct : []);
  const [reference, setReference] = useState(question && "reference" in question.answer ? question.answer.reference : "");
  const [explanation, setExplanation] = useState(question?.explanation ?? "");

  const choice = type !== "short_self";
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = prompt.trim() !== "" && (choice
    ? filled.length >= 2 && filled.length === options.length && correct.length >= 1 && (type === "multi" || correct.length === 1)
    : reference.trim() !== "");

  const toggle = (i: number) => setCorrect((c) => (type === "mcq" ? [i] : c.includes(i) ? c.filter((x) => x !== i) : [...c, i].sort()));
  const removeOption = (i: number) => {
    setOptions((o) => o.filter((_, j) => j !== i));
    setCorrect((c) => c.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)));
  };
  const changeType = (next: QuestionType) => { setType(next); if (next === "mcq") setCorrect((c) => c.slice(0, 1)); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const draft = choice
      ? { type, prompt, options, answer: { correct }, explanation }
      : { type, prompt, options: [], answer: { reference }, explanation };
    save.mutate({ ...(question ? { id: question.id } : {}), draft }, {
      onSuccess: () => {
        if (!question) { setPrompt(""); setOptions(["", ""]); setCorrect([]); setReference(""); setExplanation(""); }
        onDone?.();
      },
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={question ? t("quizzes.editQuestion") : t("quizzes.newQuestion")}>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{t("quizzes.type")}</span>
        <select value={type} onChange={(e) => changeType(e.target.value as QuestionType)} className={`${field} h-10 py-0`}>
          <option value="mcq">{t("quizzes.types.mcq")}</option>
          <option value="multi">{t("quizzes.types.multi")}</option>
          <option value="short_self">{t("quizzes.types.short_self")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{t("quizzes.prompt")}</span>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} maxLength={5000} required className={field} />
      </label>

      {choice ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] text-muted">{type === "mcq" ? t("quizzes.optionsMcq") : t("quizzes.optionsMulti")}</legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={type === "mcq" ? "radio" : "checkbox"} name={`${uid}-correct`} checked={correct.includes(i)} onChange={() => toggle(i)}
                aria-label={t("quizzes.markCorrect", { n: i + 1 })} className="size-4 accent-fg"
              />
              <input value={o} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))} maxLength={500}
                aria-label={t("quizzes.option", { n: i + 1 })} className={`${field} h-10 flex-1 py-0`} />
              <Button type="button" variant="ghost" onClick={() => removeOption(i)} disabled={options.length <= 2} aria-label={t("quizzes.removeOption", { n: i + 1 })}><X size={16} aria-hidden /></Button>
            </div>
          ))}
          <Button type="button" variant="ghost" className="self-start" onClick={() => setOptions((o) => [...o, ""])} disabled={options.length >= MAX_OPTIONS}>
            <Plus size={16} aria-hidden />{t("quizzes.addOption")}
          </Button>
        </fieldset>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{t("quizzes.reference")}</span>
          <textarea value={reference} onChange={(e) => setReference(e.target.value)} rows={2} maxLength={5000} required className={field} />
          <span className="text-[12px] text-muted">{t("quizzes.referenceHint")}</span>
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{t("quizzes.explanation")}</span>
        <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} maxLength={5000} className={field} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={save.isPending || !ready}>{question ? t("common.save") : t("quizzes.addQuestion")}</Button>
        {question ? <Button type="button" onClick={onDone}>{t("common.cancel")}</Button> : null}
        {!ready && choice && correct.length === 0 ? <span className="text-[13px] text-muted">{t("quizzes.pickCorrect")}</span> : null}
      </div>
      {save.isError ? <p role="alert" className="text-[14px]">{t("errors.saveFailed")}</p> : null}
    </form>
  );
}
