import { useCallback, useEffect, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Rating } from "@hub/contracts";
import { formatInterval, useReviewCard, useReviewQueue } from "../features/cards.ts";
import { Button, Card, PageTitle } from "../components/ui.tsx";

const RATINGS: { value: Rating; key: "again" | "hard" | "good" | "easy" }[] = [
  { value: 1, key: "again" }, { value: 2, key: "hard" }, { value: 3, key: "good" }, { value: 4, key: "easy" },
];

export function Review() {
  const { t } = useTranslation();
  const { space } = useSearch({ from: "/review" });
  const queue = useReviewQueue(space);
  const review = useReviewCard();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const items = queue.data?.items ?? [];
  const card = items[index];

  const rate = useCallback((rating: Rating) => {
    if (!card || !shown || review.isPending) return;
    review.mutate({ id: card.id, rating, eventId: crypto.randomUUID() }, {
      onSuccess: () => {
        setDone((n) => n + 1);
        setShown(false);
        if (index + 1 < items.length) setIndex(index + 1);
        else { setIndex(0); void queue.refetch(); } // cards rated Again may be due again
      },
    });
  }, [card, shown, review, index, items.length, queue]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === " " && !shown && card) { e.preventDefault(); setShown(true); }
      else if (shown && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as Rating);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, card, rate]);

  if (queue.isPending) return <p className="text-muted" role="status">{t("common.loading")}</p>;
  if (queue.isError) return <p role="alert">{t("errors.loadFailed")}</p>;

  return (
    <section aria-labelledby="review-title">
      <div className="flex items-baseline justify-between gap-4">
        <PageTitle id="review-title">{t("review.title")}</PageTitle>
        {card ? <span className="text-[14px] text-muted" role="status">{t("review.progress", { done, total: done + (queue.data?.dueTotal ?? 0) - index })}</span> : null}
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
