import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Attempt, AttemptList, Question, Quiz, QuizDetail, QuizList, type QuestionDraft, type QuizMode, type Response } from "@hub/contracts";
import { z } from "zod";
import { apiJson } from "../api.ts";

export const quizKeys = {
  all: ["quizzes"] as const,
  bySpace: (spaceId: string) => ["quizzes", "space", spaceId] as const,
  detail: (id: string) => ["quizzes", id] as const,
  attempts: (id: string) => ["quizzes", id, "attempts"] as const,
  attempt: (id: string) => ["attempts", id] as const,
};

export const useSpaceQuizzes = (spaceId: string) => useQuery({ queryKey: quizKeys.bySpace(spaceId), queryFn: () => apiJson(`/api/quizzes?spaceId=${spaceId}`, QuizList) });
export const useQuiz = (id: string) => useQuery({ queryKey: quizKeys.detail(id), queryFn: () => apiJson(`/api/quizzes/${id}`, QuizDetail) });
export const useAttempts = (quizId: string) => useQuery({ queryKey: quizKeys.attempts(quizId), queryFn: () => apiJson(`/api/quizzes/${quizId}/attempts`, AttemptList) });
export const useAttempt = (id: string) => useQuery({ queryKey: quizKeys.attempt(id), queryFn: () => apiJson(`/api/attempts/${id}`, Attempt), refetchOnWindowFocus: false });

export function useCreateQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { topicId: string | null; title: string }) => apiJson("/api/quizzes", Quiz, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: quizKeys.all }),
  });
}

export function useUpdateQuiz(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; topicId?: string | null; archived?: boolean }) => apiJson(`/api/quizzes/${id}`, Quiz, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: quizKeys.all }),
  });
}

export function useSaveQuestion(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id?: string; draft: QuestionDraft }) => id
      ? apiJson(`/api/questions/${id}`, Question, { method: "PUT", body: draft })
      : apiJson(`/api/quizzes/${quizId}/questions`, Question, { method: "POST", body: draft }),
    onSuccess: () => qc.invalidateQueries({ queryKey: quizKeys.all }),
  });
}

export function useArchiveQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiJson(`/api/questions/${id}`, z.null(), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: quizKeys.all }),
  });
}

export function useStartAttempt(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode: QuizMode; confidencePre: number | null }) => apiJson(`/api/quizzes/${quizId}/attempts`, Attempt, { method: "POST", body: input }),
    onSuccess: (a) => { qc.setQueryData(quizKeys.attempt(a.id), a); void qc.invalidateQueries({ queryKey: quizKeys.all }); },
  });
}

/**
 * Every attempt mutation returns the whole attempt view; it replaces the cached one.
 * They share one scope, so they run one at a time in order: a late autosave can never overwrite a newer choice,
 * and submit always runs after every save queued before it.
 */
function useAttemptMutation<V>(attemptId: string, fn: (v: V) => Promise<Attempt>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    scope: { id: `attempt:${attemptId}` },
    onSuccess: (a) => { qc.setQueryData(quizKeys.attempt(attemptId), a); void qc.invalidateQueries({ queryKey: quizKeys.all }); },
  });
}

export const useAnswer = (attemptId: string) => useAttemptMutation(attemptId, ({ questionId, response }: { questionId: string; response: Response }) =>
  apiJson(`/api/attempts/${attemptId}/answers/${questionId}`, Attempt, { method: "PUT", body: { response } }));
export const useSubmitAttempt = (attemptId: string) => useAttemptMutation(attemptId, () =>
  apiJson(`/api/attempts/${attemptId}/submit`, Attempt, { method: "POST" }));
export const useGrade = (attemptId: string) => useAttemptMutation(attemptId, ({ questionId, correct }: { questionId: string; correct: boolean }) =>
  apiJson(`/api/attempts/${attemptId}/answers/${questionId}/grade`, Attempt, { method: "POST", body: { correct } }));
