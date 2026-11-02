import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SessionOverview, StudySession } from "@hub/contracts";
import { apiJson } from "../api.ts";
import { useSpaces } from "../features/spaces.ts";
import { Button, Card, TextInput } from "./ui.tsx";

const KEY = ["sessions", "overview"] as const;
const textareaClass = "min-h-16 w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2 text-[15px] text-fg placeholder:text-muted";

/** Minutes since `iso`, refreshed every 30 s while shown. */
function useMinutesSince(iso: string | null): number {
  const [nowMs, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [iso]);
  return iso ? Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000)) : 0;
}

/** Today → optional study session: objective, start/stop, then a skippable reflection (HSLH-027, D-064). */
export function SessionCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const data = useQuery({ queryKey: KEY, queryFn: () => apiJson("/api/sessions/overview", SessionOverview) });
  const spaces = useSpaces();
  const [objective, setObjective] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [reflection, setReflection] = useState({ learned: "", stuck: "", next: "" });
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  const opts = { scope: { id: "study-session" }, onSuccess: done };

  const start = useMutation({ ...opts, mutationFn: () => apiJson("/api/sessions", StudySession, { method: "POST", body: { objective, spaceId: spaceId || null } }), onSuccess: () => { setObjective(""); void done(); } });
  const stop = useMutation({ ...opts, mutationFn: (id: string) => apiJson(`/api/sessions/${id}/stop`, StudySession, { method: "POST" }) });
  const reflect = useMutation({
    ...opts,
    mutationFn: ({ id, body }: { id: string; body: typeof reflection }) => apiJson(`/api/sessions/${id}/reflection`, StudySession, { method: "PUT", body }),
    onSuccess: () => { setReflection({ learned: "", stuck: "", next: "" }); void done(); },
  });

  const current = data.data?.current ?? null;
  const last = data.data?.last ?? null;
  const minutes = useMinutesSince(current?.startedAt ?? null);
  const failed = start.isError || stop.isError || reflect.isError;
  if (!data.isSuccess) return null;

  const time = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
  const context = (s: StudySession) => [s.spaceName, s.taskText].filter(Boolean).join(" · ");

  let body;
  if (current) {
    body = (
      <>
        <p className="mt-2 text-[18px]">{current.objective || t("sessions.noObjective")}</p>
        <p className="mt-1 text-[14px] text-muted" role="status">{t("sessions.running", { time: time(current.startedAt), minutes })}{context(current) ? ` · ${context(current)}` : ""}</p>
        <Button variant="primary" className="mt-4" onClick={() => stop.mutate(current.id)} disabled={stop.isPending}>{t("sessions.stop")}</Button>
      </>
    );
  } else if (last && !last.reflectedAt) {
    const submit = (e: FormEvent) => { e.preventDefault(); reflect.mutate({ id: last.id, body: reflection }); };
    body = (
      <form aria-label={t("sessions.reflectionForm")} onSubmit={submit} className="mt-2">
        <p className="text-[14px] text-muted">{t("sessions.reflectIntro", { objective: last.objective || t("sessions.noObjective") })}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {(["learned", "stuck", "next"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">{t(`sessions.${k}`)}</span>
              <textarea className={textareaClass} value={reflection[k]} maxLength={2000} onChange={(e) => setReflection({ ...reflection, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button type="submit" disabled={reflect.isPending}>{t("sessions.saveReflection")}</Button>
          <Button type="button" variant="ghost" disabled={reflect.isPending} onClick={() => reflect.mutate({ id: last.id, body: { learned: "", stuck: "", next: "" } })}>{t("sessions.skip")}</Button>
        </div>
      </form>
    );
  } else {
    const submit = (e: FormEvent) => { e.preventDefault(); start.mutate(); };
    body = (
      <>
        {last?.next ? <p className="mt-2 text-[14px]"><span className="text-muted">{t("sessions.lastNext")} </span>{last.next}</p> : null}
        <form aria-label={t("sessions.startForm")} onSubmit={submit} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextInput label={t("sessions.objective")} placeholder={t("sessions.objectivePlaceholder")} value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={300} className="flex-1" />
          {spaces.data && spaces.data.spaces.length > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">{t("sessions.space")}</span>
              <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className="h-10 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-[15px]">
                <option value="">{t("sessions.noSpace")}</option>
                {spaces.data.spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          ) : null}
          <Button type="submit" disabled={start.isPending}>{t("sessions.start")}</Button>
        </form>
      </>
    );
  }

  return (
    <Card className="mt-8">
      <h2 className="text-[14px] font-medium text-muted">{t("sessions.heading")}</h2>
      {body}
      {failed ? <p role="alert" className="mt-3 text-[14px]">{t("errors.saveFailed")}</p> : null}
    </Card>
  );
}
