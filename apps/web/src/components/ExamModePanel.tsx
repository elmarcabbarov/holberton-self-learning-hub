import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useExamMode, useSetExamMode } from "../features/examMode.ts";
import { Button, Card, TextInput } from "./ui.tsx";

export function ExamModePanel() {
  const { t, i18n } = useTranslation();
  const exam = useExamMode();
  const set = useSetExamMode();
  const [chosen, setChosen] = useState("");
  // After a confirmed start or end the pressed control disappears: move focus to its replacement.
  const moveFocus = useRef(false);
  const endButton = useRef<HTMLButtonElement>(null);
  const firstStart = useRef<HTMLButtonElement>(null);
  const active = !!exam.data?.until;
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (active ? endButton : firstStart).current?.focus();
  }, [active]);
  const change = (until: string | null) => { moveFocus.current = true; set.mutate(until); };
  const valid = Number.isFinite(Date.parse(chosen)) && Date.parse(chosen) > Date.now();
  return (
    <Card className="mt-6">
      <section aria-labelledby="exam-title">
        <h2 id="exam-title" className="text-[20px] font-medium">{t("exam.title")}</h2>
        <p className="mt-1 text-[14px] text-muted">{t("exam.intro")}</p>
        {exam.data?.until ? (
          <div className="mt-4">
            <p>{t("exam.until", { time: new Date(exam.data.until).toLocaleString(i18n.language) })}</p>
            <Button ref={endButton} className="mt-3" disabled={set.isPending} onClick={() => change(null)}>{t("exam.end")}</Button>
          </div>
        ) : exam.isSuccess ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map((hours) => <Button key={hours} ref={hours === 1 ? firstStart : undefined} disabled={set.isPending} onClick={() => change(new Date(Date.now() + hours * 3_600_000).toISOString())}>{t("exam.hours", { hours })}</Button>)}
            </div>
            <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) change(new Date(chosen).toISOString()); }}>
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
