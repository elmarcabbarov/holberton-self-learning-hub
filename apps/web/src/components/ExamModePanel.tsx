import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useExamMode, useSetExamMode } from "../features/examMode.ts";
import { Button, Card, TextInput } from "./ui.tsx";

export function ExamModePanel() {
  const { t, i18n } = useTranslation();
  const exam = useExamMode();
  const set = useSetExamMode();
  const [chosen, setChosen] = useState("");
  const valid = Number.isFinite(Date.parse(chosen)) && Date.parse(chosen) > Date.now();
  return (
    <Card className="mt-6">
      <section aria-labelledby="exam-title">
        <h2 id="exam-title" className="text-[20px] font-medium">{t("exam.title")}</h2>
        <p className="mt-1 text-[14px] text-muted">{t("exam.intro")}</p>
        {exam.data?.until ? (
          <div className="mt-4">
            <p>{t("exam.until", { time: new Date(exam.data.until).toLocaleString(i18n.language) })}</p>
            <Button className="mt-3" disabled={set.isPending} onClick={() => set.mutate(null)}>{t("exam.end")}</Button>
          </div>
        ) : exam.isSuccess ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map((hours) => <Button key={hours} disabled={set.isPending} onClick={() => set.mutate(new Date(Date.now() + hours * 3_600_000).toISOString())}>{t("exam.hours", { hours })}</Button>)}
            </div>
            <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) set.mutate(new Date(chosen).toISOString()); }}>
              <TextInput type="datetime-local" label={t("exam.chosen")} value={chosen} onChange={(e) => setChosen(e.target.value)} required />
              <Button type="submit" disabled={!valid || set.isPending}>{t("exam.start")}</Button>
            </form>
          </div>
        ) : null}
        {exam.isError || set.isError ? <p role="alert" className="mt-3">{t("errors.saveFailed")}</p> : null}
      </section>
    </Card>
  );
}
