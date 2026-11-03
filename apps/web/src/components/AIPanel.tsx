import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AIStatus, type AIMode } from "@hub/contracts";
import { ApiError, apiJson } from "../api.ts";
import { Button, TextInput } from "./ui.tsx";
import { useExamMode } from "../features/examMode.ts";

const PRESETS = [
  { label: "Ollama", url: "http://localhost:11434/v1" },
  { label: "Ollama (Docker)", url: "http://host.docker.internal:11434/v1" },
  { label: "LM Studio", url: "http://localhost:1234/v1" },
  { label: "OpenRouter", url: "https://openrouter.ai/api/v1" },
];
const KEY = ["ai", "status"] as const;

/** Settings → AI (HSLH-014, D-065). Off by default; the key is write-only; a test runs only on request. */
export function AIPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const exam = useExamMode();
  // A late answer (a slow probe, an old refetch) must never roll the form back to an older revision, and a
  // newer one must never be discarded: every path keeps whichever revision is higher.
  const newest = (next: AIStatus) => {
    const cur = qc.getQueryData<AIStatus>(KEY);
    return cur && cur.revision > next.revision ? cur : next;
  };
  const status = useQuery({ queryKey: KEY, queryFn: async () => newest(await apiJson("/api/ai/status", AIStatus)) });
  const accept = (next: AIStatus) => { qc.setQueryData<AIStatus>(KEY, newest(next)); };
  const [mode, setMode] = useState<AIMode>("disabled");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [clearKey, setClearKey] = useState(false);

  // The form follows the server whenever its revision changes (another tab, or our own save).
  const revision = status.data?.revision;
  useEffect(() => {
    if (!status.data) return;
    setMode(status.data.mode === "mock" ? "disabled" : status.data.mode);
    setBaseUrl(status.data.baseUrl);
    setModel(status.data.model);
    setKey("");
    setClearKey(false);
  }, [revision]); // only on a new revision: a refetch must not wipe what is being typed

  const save = useMutation({
    mutationFn: () => apiJson("/api/ai/settings", AIStatus, {
      method: "PUT",
      body: { mode, baseUrl, model, maxOutputTokens: status.data?.maxOutputTokens ?? 1024, revision: status.data?.revision ?? 0, key: key ? { op: "replace", value: key } : clearKey ? { op: "clear" } : { op: "keep" } },
    }),
    onSuccess: accept,
    onError: (e) => { if (e instanceof ApiError && e.status === 409) void qc.invalidateQueries({ queryKey: KEY }); },
  });
  const probe = useMutation({
    mutationFn: () => apiJson("/api/ai/probe", AIStatus, { method: "POST" }),
    onSuccess: accept,
  });

  if (!status.data) return null;
  const s = status.data;
  const errorKey = (e: unknown) => (e instanceof ApiError && (e.messageKey.startsWith("ai.") || e.messageKey.startsWith("errors.")) ? e.messageKey : "errors.saveFailed");
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  const remote = mode === "anthropic" || (mode === "openai_compatible" && s.mode === mode && s.baseUrl === baseUrl && s.locality === "remote");

  return (
    <section aria-labelledby="ai-title" className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-8">
      <h2 id="ai-title" className="hub-display text-[22px]">{t("ai.title")}</h2>
      <p className="mt-1 max-w-prose text-[14px] text-muted">{t("ai.intro")}</p>
      <form aria-label={t("ai.form")} onSubmit={submit} className="mt-5 flex max-w-xl flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{t("ai.mode")}</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as AIMode)} className="h-10 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px]">
            <option value="disabled">{t("ai.modes.disabled")}</option>
            <option value="openai_compatible">{t("ai.modes.openai_compatible")}</option>
            <option value="anthropic">{t("ai.modes.anthropic")}</option>
          </select>
        </label>
        {mode === "openai_compatible" ? (
          <div className="flex flex-col gap-2">
            <TextInput label={t("ai.baseUrl")} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" maxLength={500} />
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("ai.presets")}>
              {PRESETS.map((p) => <Button key={p.url} type="button" variant="ghost" className="h-8 px-2 text-[13px]" onClick={() => setBaseUrl(p.url)}>{p.label}</Button>)}
            </div>
          </div>
        ) : null}
        {mode !== "disabled" ? (
          <>
            <TextInput label={t("ai.model")} value={model} onChange={(e) => setModel(e.target.value)} placeholder={mode === "anthropic" ? "claude-…" : "llama3.2"} maxLength={200} />
            <div className="flex flex-col gap-1.5">
              <TextInput label={mode === "anthropic" ? t("ai.key") : t("ai.keyOptional")} type="password" autoComplete="off" value={key} onChange={(e) => { setKey(e.target.value); setClearKey(false); }} maxLength={500}
                placeholder={s.key.set && s.mode === mode ? t("ai.keyStored", { mask: s.key.mask }) : ""} />
              {s.key.set && s.mode === mode ? (
                <label className="flex items-center gap-2 text-[13px] text-muted">
                  <input type="checkbox" checked={clearKey} onChange={(e) => { setClearKey(e.target.checked); if (e.target.checked) setKey(""); }} />{t("ai.clearKey")}
                </label>
              ) : null}
              <p className="text-[13px] text-muted">{s.key.encrypted ? t("ai.keyEncrypted") : t("ai.keyPlain")}</p>
            </div>
            {remote ? <p role="note" className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3 text-[14px]">{t("ai.remoteNote")}</p> : null}
          </>
        ) : null}
        <div><Button type="submit" variant="primary" disabled={save.isPending}>{t("common.save")}</Button></div>
        {save.isError ? <p role="alert" className="text-[14px]">{t(errorKey(save.error))}</p> : null}
      </form>

      {s.mode !== "disabled" ? (
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-[14px]">{s.ready ? t("ai.ready", { model: s.model }) : t("ai.notReady")}</p>
          <p className="mt-1 max-w-prose text-[13px] text-muted">{t("ai.testNote")}</p>
          <Button className="mt-3" onClick={() => probe.mutate()} disabled={!s.ready || probe.isPending || !exam.isSuccess || !!exam.data.until}>{probe.isPending ? t("ai.testing") : t("ai.test")}</Button>
          {probe.isError ? <p role="alert" className="mt-2 text-[14px]">{t(errorKey(probe.error))}</p> : null}
          {s.probes ? (
            <ul className="mt-4 space-y-1 text-[14px]" aria-label={t("ai.results")}>
              {s.probes.map((p) => (
                <li key={p.capability}>
                  <span className="font-medium">{t(`ai.capability.${p.capability}`)}</span>{" "}
                  {p.ok ? t("ai.passed", { ms: p.ms }) : t("ai.failed", { reason: t(`ai.error.${p.error ?? "unknown"}`) })}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
