import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Rating } from "@hub/contracts";
import { formatInterval, useReviewCard, useReviewQueue } from "../features/cards.ts";
import { Button, Card, PageTitle } from "../components/ui.tsx";

const RATINGS: { value: Rating; key: "again" | "hard" | "good" | "easy" }[] = [
  { value: 1, key: "again" }, { value: 2, key: "hard" }, { value: 3, key: "good" }, { value: 4, key: "easy" },
];

/** Remounts the session when the filter changes, so position and reveal state never leak between queues. */
export function Review() {
  const { space } = useSearch({ from: "/review" });
  return <ReviewSession key={space ?? "all"} space={space} />;
}

const cardKey = (c: { id: string; due: string }) => `${c.id}@${c.due}`;

function ReviewSession({ space }: { space: string | undefined }) {
  const { t } = useTranslation();
  const queue = useReviewQueue(space);
  const review = useReviewCard();
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set());
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  // A rating that has not been acknowledged keeps its eventId, so a retry can never apply twice (D-056).
  const pending = useRef<{ key: string; rating: Rating; eventId: string } | null>(null);

  const remaining = (queue.data?.items ?? []).filter((c) => !reviewed.has(cardKey(c)));
  // While a fresh batch loads, nothing from the old batch is shown or rateable.
  const card = queue.isFetching ? undefined : remaining[0];

  const rate = useCallback((rating: Rating) => {
    if (!card || !shown || review.isPending) return;
    const key = cardKey(card);
    if (pending.current?.key !== key || pending.current.rating !== rating) pending.current = { key, rating, eventId: crypto.randomUUID() };
    review.mutate({ id: card.id, rating, eventId: pending.current.eventId }, {
      onSuccess: () => {
        pending.current = null;
        setDone((n) => n + 1);
        setShown(false);
        const next = new Set(reviewed).add(key);
        setReviewed(next);
        if (remaining.length <= 1) void queue.refetch(); // cards rated Again come back with a new due date
      },
    });
  }, [card, shown, review, reviewed, remaining.length, queue]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === " " && !shown && card) { e.preventDefault(); setShown(true); }
      else if (shown && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as Rating);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, card, rate]);

  if (queue.isPending || (queue.isFetching && remaining.length === 0)) return <p className="text-muted" role="status">{t("common.loading")}</p>;
  if (queue.isError) return <p role="alert">{t("errors.loadFailed")}</p>;

  return (
    <section aria-labelledby="review-title">
      <div className="flex items-baseline justify-between gap-4">
        <PageTitle id="review-title">{t("review.title")}</PageTitle>
        {card ? <span className="text-[14px] text-muted" role="status">{t("review.progress", { done, total: done + remaining.length })}</span> : null}
      </div>

      {!card ? (
        <Card className="mt-8">
          <h2 className="text-[20px] font-medium">{done > 0 ? t("review.finishedTitle") : t("review.emptyTitle")}</h2>
          <p className="mt-2 text-muted">{done > 0 ? t("review.finishedBody", { count: done }) : t("review.emptyBody")}</p>
          <Link to="/spaces" className="mt-6 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 text-[14px] font-medium hover:bg-surface">{t("review.addCards")}</Link>
        </Card>
      ) : (
        <Card className="mt-8">
          {card.topicName ? <p className="text-[13px] text-muted">{card.topicName}</p> : null}
          <p className="mt-2 whitespace-pre-wrap text-[22px] leading-snug" data-testid="card-front">{card.front}</p>
          {shown ? (
            <>
              <hr className="my-6 border-line" />
              <p className="whitespace-pre-wrap text-[17px] leading-relaxed" data-testid="card-back">{card.back}</p>
              <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t("review.rateLabel")}>
                {RATINGS.map((r) => (
                  <Button key={r.value} variant={r.value === 3 ? "primary" : "secondary"} onClick={() => rate(r.value)} disabled={review.isPending}
                    className="h-auto flex-col gap-0.5 py-2.5" aria-keyshortcuts={String(r.value)}>
                    <span>{t(`review.rating.${r.key}`)}</span>
                    <span className="text-[12px] font-normal opacity-80">{formatInterval(card.preview[r.key], (k, o) => (o ? t(k, o) : t(k)))}</span>
                  </Button>
                ))}
              </div>
              {review.isError ? <p role="alert" className="mt-3 text-[14px]">{t("errors.saveFailed")}</p> : null}
            </>
          ) : (
            <Button variant="primary" className="mt-8" onClick={() => setShown(true)} aria-keyshortcuts="Space">{t("review.show")}</Button>
          )}
          <p className="mt-6 text-[12px] text-muted">{t("review.keys")}</p>
        </Card>
      )}
    </section>
  );
}
