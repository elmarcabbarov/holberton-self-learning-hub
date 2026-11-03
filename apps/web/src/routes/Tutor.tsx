import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AIStatus, PeerDraft, TutorThread, TutorThreadDetail, TutorThreadList, type SendTutorMessage, type TutorEvent, type TutorMessage } from "@hub/contracts";
import { ApiError, apiJson } from "../api.ts";
import { Button, Card, PageTitle } from "../components/ui.tsx";
import { useSpace } from "../features/spaces.ts";
import { useExamMode } from "../features/examMode.ts";
import { sendTutorMessage } from "../features/tutorStream.ts";

const textareaClass = "min-h-20 w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2 text-[15px] text-fg";
const threadsKey = ["tutor", "threads"] as const;
const detailKey = (id: string) => ["tutor", "thread", id] as const;
type Start = Extract<TutorEvent, { event: "start" }>["data"];
type AnswerMeta = { kind: SendTutorMessage["kind"]; hintLevel?: number | null | undefined; approachStep?: number | null | undefined; mode?: string | null };

function useTutorError() {
  const { t, i18n } = useTranslation();
  return (error: unknown) => {
    const key = `tutor.error.${error instanceof ApiError ? error.code : "unknown"}`;
    return t(i18n.exists(key) ? key : "tutor.error.unknown");
  };
}

export function TutorPage() {
  const { spaceId } = useParams({ from: "/spaces/$spaceId/tutor" });
  const { topicId } = useSearch({ from: "/spaces/$spaceId/tutor" });
  return <TutorSpace key={`${spaceId}:${topicId ?? ""}`} spaceId={spaceId} topicId={topicId} />;
}

function TutorSpace({ spaceId, topicId }: { spaceId: string; topicId?: string | undefined }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const space = useSpace(spaceId);
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const ai = useQuery({ queryKey: ["ai", "status"], queryFn: async () => {
    const next = await apiJson("/api/ai/status", AIStatus);
    const current = qc.getQueryData<AIStatus>(["ai", "status"]);
    return current && current.revision > next.revision ? current : next;
  } });
  const exam = useExamMode();
  const threads = useQuery({ queryKey: [...threadsKey, spaceId, archived], queryFn: () => apiJson(`/api/tutor/threads?spaceId=${spaceId}${archived ? "&archived=1" : ""}`, TutorThreadList) });
  const errorText = useTutorError();
  const [busy, setBusy] = useState(false);
  const disabled = !space.isSuccess || !exam.isSuccess || !!exam.data.until || !ai.isSuccess || !ai.data.ready || space.data.archivedAt != null;
  const unavailable = exam.data?.until ? <p role="note">{t("tutor.examMode")}</p>
    : ai.data && !ai.data.ready ? <p>{t(ai.data.mode === "disabled" ? "tutor.aiOff" : "tutor.aiNotReady")} <Link to="/settings" hash="ai-title" className="underline underline-offset-4">{t("tutor.settings")}</Link></p>
      : space.isError || exam.isError || ai.isError ? <p role="alert">{t("errors.loadFailed")}</p>
        : !space.isSuccess || !exam.isSuccess || !ai.isSuccess ? <p role="status">{t("common.loading")}</p>
          : space.data?.archivedAt ? <p>{t("tutor.error.archived")}</p> : null;
  const topicName = (id: string | null) => [...(space.data?.topics ?? []), ...(space.data?.archivedTopics ?? [])].find((x) => x.id === id)?.name ?? t("tutor.general");
  return (
    <section aria-labelledby="tutor-title">
      <Link to="/spaces/$spaceId" params={{ spaceId }} className="text-[14px] text-muted underline underline-offset-4">{space.data?.name ?? t("spaces.title")}</Link>
      <PageTitle id="tutor-title">{t("tutor.title")}</PageTitle>
      <div className="mt-6 grid items-start gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside aria-label={t("tutor.threads")} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 className="text-[17px] font-medium">{t("tutor.threads")}</h2>
          <Button className="mt-3 w-full" disabled={busy || disabled} onClick={() => setSelected(null)}>{t("tutor.new")}</Button>
          <label className="mt-4 flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={archived} disabled={busy} onChange={(e) => setArchived(e.target.checked)} />{t("tutor.archived")}
          </label>
          {threads.isError ? <p role="alert" className="mt-3">{errorText(threads.error)}</p> : null}
          {threads.data?.threads.length === 0 ? <p className="mt-4 text-[14px] text-muted">{t("tutor.empty")}</p> : null}
          <ul className="mt-3 space-y-2">
            {threads.data?.threads.map((thread) => <li key={thread.id}>
              <button type="button" disabled={busy} aria-current={selected === thread.id ? "true" : undefined} onClick={() => setSelected(thread.id)} className={`w-full rounded-[var(--radius-control)] border p-2 text-left disabled:opacity-50 ${selected === thread.id ? "border-fg bg-surface-2" : "border-transparent hover:border-line"}`}>
                <span className="block text-[14px]">{topicName(thread.topicId)}</span>
                <span className="block text-[12px] text-muted">{new Date(thread.createdAt).toLocaleString(i18n.language)}</span>
              </button>
            </li>)}
          </ul>
        </aside>
        <Card className="min-w-0">
          {selected ? <Conversation key={selected} id={selected} ai={ai.data} disabled={disabled} unavailable={unavailable} onBusy={setBusy} />
            : <>{unavailable}{!disabled ? <NewThread spaceId={spaceId} topicId={topicId} onCreated={(id) => { setArchived(false); setSelected(id); void qc.invalidateQueries({ queryKey: threadsKey }); }} /> : null}</>}
        </Card>
      </div>
    </section>
  );
}

function NewThread({ spaceId, topicId, onCreated }: { spaceId: string; topicId?: string | undefined; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const space = useSpace(spaceId);
  const [topic, setTopic] = useState(topicId ?? "");
  const [framework, setFramework] = useState({ read: "", error: "", rephrase: "" });
  const create = useMutation({ mutationFn: (skipped: boolean) => apiJson("/api/tutor/threads", TutorThread, { method: "POST", body: { spaceId, ...(topic ? { topicId: topic } : {}), framework: skipped ? { skipped: true } : { ...framework, skipped: false } } }), onSuccess: (thread) => onCreated(thread.id) });
  const errorText = useTutorError();
  return (
    <form aria-label={t("tutor.new")} className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); create.mutate(false); }}>
      <h2 className="text-[20px] font-medium">{t("tutor.framework")}</h2>
      <p className="text-[14px] text-muted">{t("tutor.frameworkIntro")}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tutor-topic" className="text-[13px] text-muted">{t("tutor.topic")}</label>
        <select id="tutor-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-10 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3">
          <option value="">{t("tutor.general")}</option>
          {space.data?.topics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      {(["read", "error", "rephrase"] as const).map((key) => <label key={key} className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{t(`tutor.frameworkFields.${key}`)}</span>
        <textarea className={textareaClass} rows={2} value={framework[key]} maxLength={2000} onChange={(e) => setFramework({ ...framework, [key]: e.target.value })} />
      </label>)}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending}>{t("tutor.begin")}</Button>
        <Button type="button" disabled={create.isPending} onClick={() => create.mutate(true)}>{t("tutor.skip")}</Button>
      </div>
      {create.isError ? <p role="alert">{errorText(create.error)}</p> : null}
    </form>
  );
}

function MessageMeta({ message }: { message: AnswerMeta }) {
  const { t } = useTranslation();
  return <p className="text-[13px] text-muted">
    {message.kind === "hint" ? t("tutor.hintLevel", { level: message.hintLevel }) : message.kind === "approach" ? t("tutor.approachStep", { step: message.approachStep }) : t(`tutor.kind.${message.kind}`)}
    {message.mode ? ` · ${t(`tutor.modes.${message.mode}`)}` : ""}
  </p>;
}

function Conversation({ id, ai, disabled, unavailable, onBusy }: { id: string; ai: AIStatus | undefined; disabled: boolean; unavailable: ReactNode; onBusy: (busy: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const errorText = useTutorError();
  const thread = useQuery({ queryKey: detailKey(id), queryFn: () => apiJson(`/api/tutor/threads/${id}`, TutorThreadDetail), refetchInterval: (q) => q.state.data?.messages.some((m) => m.status === "streaming") ? 2000 : false });
  const [content, setContent] = useState("");
  // Each send owns an immutable payload, including its id and language, through failures and retries.
  const [active, setActive] = useState<{ payload: SendTutorMessage; text: string; meta?: Start; error?: string; settledAt?: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const controller = useRef<AbortController | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const loadedId = thread.data?.id;
  useEffect(() => { if (loadedId) heading.current?.focus(); }, [loadedId]);
  useEffect(() => () => { controller.current?.abort(); onBusy(false); }, [onBusy]);
  const send = useMutation({
    mutationFn: async (payload: SendTutorMessage) => {
      controller.current = new AbortController();
      setActive({ payload, text: "" }); setAnnouncement("");
      let completed = "";
      try {
        await sendTutorMessage(id, payload, controller.current.signal, (event) => {
          if (event.event === "delta") { completed += event.data.text; setActive((a) => a && { ...a, text: a.text + event.data.text }); }
          if (event.event === "start") setActive((a) => a && { ...a, meta: event.data });
        });
      } finally {
        // Only thread data fetched after this moment may replace the local copy (a cached older failure of the
        // same request must not).
        const settledAt = Date.now();
        setActive((a) => a && { ...a, settledAt });
      }
      return completed;
    },
    // The streamed answer stays on screen until the server's copy of this request is loaded (see the effect
    // below); a failed or slow refresh never hides it and never blocks the composer.
    onSuccess: (answer) => {
      setAnnouncement(answer);
      void qc.invalidateQueries({ queryKey: detailKey(id) });
    },
    onError: (error) => {
      const code = controller.current?.signal.aborted ? "cancelled" : error instanceof ApiError ? error.code : "interrupted";
      setActive((a) => a && { ...a, error: code });
      if (code === "exam_mode") void qc.invalidateQueries({ queryKey: ["exam-mode"] });
      if (code === "not_ready") void qc.invalidateQueries({ queryKey: ["ai", "status"] });
      void qc.invalidateQueries({ queryKey: detailKey(id) });
    },
    onSettled: () => { controller.current = null; onBusy(false); void qc.invalidateQueries({ queryKey: threadsKey }); composer.current?.focus(); },
  });
  // Reconcile by request id: once the server reports a final state for the active request (even one whose
  // stream dropped after the commit), its stored messages replace the local copy.
  useEffect(() => {
    if (!active?.settledAt || send.isPending || thread.dataUpdatedAt <= active.settledAt) return;
    const user = thread.data?.messages.find((m) => m.role === "user" && m.requestId === active.payload.requestId);
    const answer = user && thread.data?.messages.find((m) => m.replyTo === user.id);
    if (answer && answer.status !== "streaming") setActive(null);
  }, [thread.data, thread.dataUpdatedAt, active, send.isPending]);
  const archive = useMutation({ mutationFn: () => apiJson(`/api/tutor/threads/${id}`, TutorThread, { method: "PATCH", body: { archived: !thread.data?.archivedAt } }), onSuccess: () => { void qc.invalidateQueries({ queryKey: detailKey(id) }); void qc.invalidateQueries({ queryKey: threadsKey }); } });
  const submit = (kind: SendTutorMessage["kind"]) => {
    if (send.isPending) return;
    // An action without typed text sends a short request for that action, not a copy of the last question.
    const text = content.trim() || (kind !== "chat" ? t(`tutor.actionText.${kind}`) : undefined);
    if (!text) { composer.current?.focus(); return; }
    onBusy(true); send.mutate({ requestId: crypto.randomUUID(), kind, content: text, lang: i18n.language === "az" ? "az" : "en" }); setContent("");
  };
  const retry = (payload: SendTutorMessage) => { onBusy(true); send.mutate(payload); };
  if (!thread.data) return <p role={thread.isError ? "alert" : "status"}>{t(thread.isError ? "errors.loadFailed" : "common.loading")}</p>;
  const messages = thread.data.messages;
  const activeUser = active && messages.find((m) => m.requestId === active.payload.requestId);
  const otherStream = !send.isPending && messages.some((m) => m.status === "streaming");
  const hints = messages.filter((m) => m.role === "assistant" && m.kind === "hint" && m.status === "complete").length;
  const canSend = !disabled && !thread.data.archivedAt && !otherStream;
  const persistedRetry = (message: TutorMessage) => {
    const user = messages.find((m) => m.id === message.replyTo);
    return user?.requestId ? { requestId: user.requestId, kind: user.kind, content: user.content, lang: user.lang } : undefined;
  };
  return (
    <section aria-label={t("tutor.conversation")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 ref={heading} tabIndex={-1} className="text-[20px] font-medium">{t("tutor.conversation")}</h2>
        <Button disabled={send.isPending || otherStream || archive.isPending} onClick={() => archive.mutate()}>{t(thread.data.archivedAt ? "archive.restore" : "tutor.archive")}</Button>
      </div>
      {archive.isError ? <p role="alert">{errorText(archive.error)}</p> : null}
      {thread.isRefetchError ? <p role="alert" className="mt-2 text-[14px]">{t("errors.loadFailed")}</p> : null}
      <div role="group" className="mt-5 space-y-5" aria-label={t("tutor.messages")}>
        {messages.filter((m) => !active || (m.id !== activeUser?.id && m.replyTo !== activeUser?.id)).map((message) => {
          const payload = persistedRetry(message);
          return <article key={message.id} className="border-b border-line pb-4">
            <h3 className="text-[14px] font-medium">{t(`tutor.roles.${message.role}`)}</h3>
            {message.role === "assistant" ? <MessageMeta message={message} /> : null}
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px]">{message.content}</p>
            {message.errorCode ? <p role="alert" className="mt-2 text-[14px]">{errorText(new ApiError(502, message.errorCode))}</p> : null}
            {message.role === "assistant" && ["error", "cancelled", "interrupted"].includes(message.status) && payload ? <Button className="mt-2" disabled={!canSend || send.isPending} onClick={() => retry(payload)}>{t("tutor.retry")}</Button> : null}
          </article>;
        })}
        {active ? <>
          <article><h3 className="text-[14px] font-medium">{t("tutor.roles.user")}</h3><p className="mt-2 whitespace-pre-wrap break-words">{active.payload.content}</p></article>
          <article aria-busy={send.isPending}>
            <h3 className="text-[14px] font-medium">{t("tutor.roles.assistant")}</h3>
            {active.meta ? <MessageMeta message={{ kind: active.payload.kind, ...active.meta }} /> : null}
            <p className="mt-2 whitespace-pre-wrap break-words">{active.text || (send.isPending ? t("tutor.thinking") : "")}</p>
            {active.error ? <><p role="alert" className="mt-2 text-[14px]">{errorText(new ApiError(502, active.error))}</p><Button className="mt-2" disabled={!canSend || send.isPending} onClick={() => retry(active.payload)}>{t("tutor.retry")}</Button></> : null}
          </article>
        </> : null}
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
      <div className="mt-6">
        {unavailable}
        {thread.data.archivedAt ? <p>{t("tutor.error.archived")}</p> : null}
        {otherStream ? <p role="status">{t("tutor.error.busy")}</p> : null}
        {canSend ? <>
          {ai?.locality === "remote" ? <p role="note" className="mb-4 text-[14px] text-muted">{t("tutor.remote", { provider: `${ai.mode === "openai_compatible" ? ai.baseUrl : t(`ai.modes.${ai.mode}`)} / ${ai.model}` })}</p> : null}
          <form aria-label={t("tutor.composer")} onSubmit={(e) => { e.preventDefault(); submit("chat"); }}>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] text-muted">{t("tutor.message")}</span><textarea ref={composer} className={textareaClass} maxLength={8000} value={content} onChange={(e) => setContent(e.target.value)} /></label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={send.isPending || !content.trim()}>{t("tutor.send")}</Button>
              {(["hint", "explain", "approach"] as const).map((kind) => <Button type="button" key={kind} disabled={send.isPending} onClick={() => submit(kind)}>{t(`tutor.actions.${kind}`)}</Button>)}
            </div>
          </form>
        </> : null}
        {send.isPending ? <Button className="mt-3" onClick={() => controller.current?.abort()}>{t("tutor.stop")}</Button> : null}
      </div>
      {hints >= 3 ? <PeerBridge id={id} /> : null}
    </section>
  );
}

function PeerBridge({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tried, setTried] = useState("");
  const [copyState, setCopyState] = useState<"copied" | "select" | null>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const errorText = useTutorError();
  const draft = useMutation({ mutationFn: () => apiJson(`/api/tutor/threads/${id}/peer-draft`, PeerDraft, { method: "POST", body: { tried, lang: i18n.language === "az" ? "az" : "en" } }), onSuccess: () => setCopyState(null) });
  const copy = async () => {
    try { await navigator.clipboard.writeText(draft.data!.text); setCopyState("copied"); }
    catch { text.current?.focus(); text.current?.select(); setCopyState("select"); }
  };
  return <section className="mt-6 border-t border-line pt-5" aria-label={t("tutor.peer")}>
    <Button onClick={() => setOpen(!open)} aria-expanded={open}>{t("tutor.peer")}</Button>
    {open ? <>
      <p className="mt-3 text-[14px] text-muted">{t("tutor.peerIntro")}</p>
      <form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (tried.trim()) draft.mutate(); }}>
        <label className="flex flex-col gap-1.5"><span className="text-[13px] text-muted">{t("tutor.tried")}</span><textarea className={textareaClass} value={tried} onChange={(e) => setTried(e.target.value)} required maxLength={4000} /></label>
        <Button type="submit" className="mt-3" disabled={!tried.trim() || draft.isPending}>{t("tutor.draft")}</Button>
      </form>
      {draft.isError ? <p role="alert">{errorText(draft.error)}</p> : null}
      {draft.data ? <div className="mt-4">
        <label className="flex flex-col gap-1.5"><span className="text-[13px] text-muted">{t("tutor.draftText")}</span><textarea ref={text} className={`${textareaClass} min-h-60`} readOnly value={draft.data.text} /></label>
        <Button className="mt-3" onClick={() => void copy()}>{t("tutor.copy")}</Button>
        <p role="status" className="mt-2 text-[13px] text-muted">{copyState ? t(`tutor.${copyState}`) : ""}</p>
      </div> : null}
    </> : null}
  </section>;
}
