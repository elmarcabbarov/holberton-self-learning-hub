import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FileText, Search } from "lucide-react";
import { useCreateNote, useNotes, useSearch } from "../features/notes.ts";
import { Button, Card, PageTitle, TextInput } from "../components/ui.tsx";
import { ApiError } from "../api.ts";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export function Notes() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notes = useNotes();
  const create = useCreateNote();
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 200);
  const search = useSearch(q);
  const [path, setPath] = useState("");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    const p = path.trim().endsWith(".md") ? path.trim() : `${path.trim()}.md`;
    create.mutate({ path: p, content: "" }, { onSuccess: (n) => void navigate({ to: "/notes/$noteId", params: { noteId: n.id } }) });
  };
  const createError = create.error instanceof ApiError ? create.error.messageKey : create.isError ? "errors.saveFailed" : null;
  const present = notes.data?.pages.flatMap((p) => p.notes).filter((n) => !n.missing) ?? [];

  return (
    <section aria-labelledby="notes-title">
      <PageTitle id="notes-title">{t("notesPage.title")}</PageTitle>
      <p className="mt-2 max-w-prose text-muted">{t("notesPage.intro")}</p>

      <Card className="mt-8">
        <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextInput label={t("notesPage.newLabel")} placeholder={t("notesPage.newPlaceholder")} value={path} onChange={(e) => setPath(e.target.value)} maxLength={500} className="flex-1" required />
          <Button type="submit" variant="primary" disabled={create.isPending || !path.trim()}>{t("notesPage.create")}</Button>
        </form>
        {createError ? <p role="alert" className="mt-3 text-[14px]">{t(createError)}</p> : null}
      </Card>

      <div className="mt-8">
        <label className="relative block">
          <span className="sr-only">{t("notesPage.search")}</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("notesPage.searchPlaceholder")}
            className="h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface pl-9 pr-3 text-fg placeholder:text-muted" />
        </label>

        {q.trim() ? (
          <ul className="mt-4 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface" aria-label={t("notesPage.results")}>
            {search.data?.hits.length === 0 ? <li className="p-5 text-muted">{t("notesPage.noResults")}</li> : null}
            {search.data?.hits.map((h) => (
              <li key={h.id}>
                <Link to="/notes/$noteId" params={{ noteId: h.id }} className="block p-5 hover:bg-surface-2">
                  <span className="block font-medium">{h.title}{h.vault === "linked" ? <span className="ml-2 rounded-[3px] border border-line px-1.5 text-[12px] font-normal text-muted">{t("linkedVault.badge")}</span> : null}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{h.path}</span>
                  <span className="mt-2 block text-[14px] text-muted">{h.snippet}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {notes.isPending ? <p className="mt-4 text-muted" role="status">{t("common.loading")}</p> : null}
            {notes.isSuccess && present.length === 0 ? <p className="mt-4 text-muted">{t("notesPage.empty")}</p> : null}
            <ul className="mt-4 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface empty:hidden">
              {present.map((n) => (
                <li key={n.id}>
                  <Link to="/notes/$noteId" params={{ noteId: n.id }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2">
                    <FileText size={16} aria-hidden className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{n.title}</span>
                    {n.vault === "linked" ? <span className="shrink-0 rounded-[3px] border border-line px-1.5 text-[12px] text-muted">{t("linkedVault.badge")}</span> : null}
                    <span className="hidden truncate text-[13px] text-muted sm:block">{n.path}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {notes.hasNextPage ? (
              <Button className="mt-4" onClick={() => void notes.fetchNextPage()} disabled={notes.isFetchingNextPage}>{t("notesPage.loadMore")}</Button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
