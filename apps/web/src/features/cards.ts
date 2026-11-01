import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardList, ReviewQueue, ReviewSummary, type Rating } from "@hub/contracts";
import { apiJson } from "../api.ts";

export const cardKeys = {
  queue: (spaceId?: string) => ["review", "queue", spaceId ?? "all"] as const,
  summary: ["review", "summary"] as const,
  byTopic: (topicId: string) => ["cards", "topic", topicId] as const,
  byNote: (noteId: string) => ["cards", "note", noteId] as const,
  bySpace: (spaceId: string) => ["cards", "space", spaceId] as const,
};

export const useReviewQueue = (spaceId?: string) => useQuery({
  queryKey: cardKeys.queue(spaceId),
  queryFn: () => apiJson(spaceId ? `/api/review/queue?spaceId=${spaceId}` : "/api/review/queue", ReviewQueue),
  refetchOnWindowFocus: false,
});
export const useReviewSummary = () => useQuery({ queryKey: cardKeys.summary, queryFn: () => apiJson("/api/review/summary", ReviewSummary) });
export const useTopicCards = (topicId: string) => useQuery({ queryKey: cardKeys.byTopic(topicId), queryFn: () => apiJson(`/api/cards?topicId=${topicId}`, CardList) });

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { topicId: string | null; noteId: string | null; front: string; back: string }) => apiJson("/api/cards", Card, { method: "POST", body: input }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["cards"] }); void qc.invalidateQueries({ queryKey: ["review"] }); },
  });
}

export function useReviewCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating, eventId }: { id: string; rating: Rating; eventId: string }) =>
      apiJson(`/api/cards/${id}/review`, Card, { method: "POST", body: { rating, eventId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: cardKeys.summary }),
  });
}

/** Human interval for rating buttons: "<1 min", "10 min", "3 h", "4 d", "2 mo". */
export function formatInterval(seconds: number, t: (k: string, o?: { n: number }) => string): string {
  const m = seconds / 60, h = m / 60, d = h / 24;
  if (m < 1) return t("review.unit.lessMin");
  if (h < 1) return t("review.unit.min", { n: Math.round(m) });
  if (d < 1) return t("review.unit.hour", { n: Math.round(h) });
  if (d < 30) return t("review.unit.day", { n: Math.round(d) });
  if (d < 365) return t("review.unit.month", { n: Math.round(d / 30) });
  return t("review.unit.year", { n: Math.round((d / 365) * 10) / 10 });
}

export const useSpaceCards = (spaceId: string) => useQuery({ queryKey: cardKeys.bySpace(spaceId), queryFn: () => apiJson(`/api/cards?spaceId=${spaceId}`, CardList) });
