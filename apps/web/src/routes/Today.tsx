import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, FolderTree } from "lucide-react";
import { NoteList, ReviewSummary } from "@hub/contracts";
import { apiJson } from "../api.ts";
import { useSpaces } from "../features/spaces.ts";
import { Card, PageTitle } from "../components/ui.tsx";

const primaryLink = "inline-flex h-10 items-center rounded-[var(--radius-control)] bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-dark";
const secondaryLink = "inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 text-[14px] font-medium hover:bg-surface";

/** Today: what to do now, from real data only (no invented numbers, no "mastery" scores). */
export function Today() {
  const { t } = useTranslation();
  const summary = useQuery({ queryKey: ["review", "summary"], queryFn: () => apiJson("/api/review/summary", ReviewSummary) });
  const recent = useQuery({ queryKey: ["notes", "recent"], queryFn: () => apiJson("/api/notes/recent?limit=5", NoteList) });
  const spaces = useSpaces();

  const loading = summary.isPending || recent.isPending || spaces.isPending;
  const failed = summary.isError || recent.isError || spaces.isError;
  // Empty states only from successful responses: a failed request is an error, never "nothing to do".
  const nothingYet = !loading && !failed && (spaces.data?.spaces.length ?? 0) === 0 && (recent.data?.notes.length ?? 0) === 0 && (summary.data?.due ?? 0) === 0;

  return (
    <section aria-labelledby="today-title">
      <PageTitle id="today-title">{t("today.title")}</PageTitle>
      {loading ? <p className="mt-6 text-muted" role="status">{t("common.loading")}</p> : null}
      {failed ? <p role="alert" className="mt-6">{t("errors.loadFailed")}</p> : null}

      {nothingYet ? (
        <Card className="mt-8">
          <h2 className="text-[20px] font-medium">{t("today.emptyTitle")}</h2>
          <p className="mt-2 max-w-prose text-muted">{t("today.emptyBody")}</p>
          <Link to="/spaces" className={`mt-6 ${primaryLink}`}>{t("today.emptyCta")}</Link>
        </Card>
      ) : null}

      {!loading && !failed && !nothingYet ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <h2 className="text-[14px] font-medium text-muted">{t("today.reviewHeading")}</h2>
            {(summary.data?.due ?? 0) > 0 ? (
              <>
                <p className="mt-2 text-[32px] font-medium tracking-tight" data-testid="due-count">{t("today.due", { count: summary.data!.due })}</p>
                <Link to="/review" className={`mt-5 ${primaryLink}`}>{t("today.startReview")}</Link>
              </>
            ) : (
              <p className="mt-2 text-[18px]">{t("today.noneDue")}</p>
            )}
            {(summary.data?.reviewedToday ?? 0) > 0 ? <p className="mt-4 text-[14px] text-muted">{t("today.reviewedToday", { count: summary.data!.reviewedToday })}</p> : null}
          </Card>

          <Card>
            <h2 className="text-[14px] font-medium text-muted">{t("today.continueHeading")}</h2>
            {recent.data && recent.data.notes.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {recent.data.notes.map((n) => (
                  <li key={n.id}>
                    <Link to="/notes/$noteId" params={{ noteId: n.id }} className="flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-surface-2">
                      <FileText size={16} aria-hidden className="shrink-0 text-muted" />
                      <span className="truncate">{n.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="mt-2 text-[14px] text-muted">{t("today.noNotes")}</p>
                <Link to="/notes" className={`mt-4 ${secondaryLink}`}>{t("today.writeNote")}</Link>
              </>
            )}
          </Card>

          {spaces.data && spaces.data.spaces.length > 0 ? (
            <Card className="lg:col-span-2">
              <h2 className="text-[14px] font-medium text-muted">{t("today.spacesHeading")}</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {spaces.data.spaces.map((s) => (
                  <li key={s.id}>
                    <Link to="/spaces/$spaceId" params={{ spaceId: s.id }} className="flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-surface-2">
                      <FolderTree size={16} aria-hidden className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="shrink-0 text-[13px] text-muted">{t("spaces.topicCount", { count: s.topicCount })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
