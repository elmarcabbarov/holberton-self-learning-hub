import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Goal, GoalList, SpaceNoteList, TopicRefList } from "@hub/contracts";
import type { GoalList as GoalListType } from "@hub/contracts";
import { apiJson } from "../api.ts";

export const goalKeys = {
  all: ["goals"] as const,
  bySpace: (spaceId: string, archived: boolean) => ["goals", spaceId, archived ? "archived" : "active"] as const,
};

export const useGoals = (spaceId: string, archived = false, enabled = true) => useQuery({
  queryKey: goalKeys.bySpace(spaceId, archived),
  queryFn: () => apiJson(`/api/spaces/${spaceId}/goals${archived ? "?archived=1" : ""}`, GoalList),
  enabled,
});

/** Every goal mutation returns the whole goal; refresh the space's lists. Mutations of one goal run in order. */
function useGoalMutation<V>(scopeId: string, fn: (v: V) => Promise<Goal>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, scope: { id: `goal:${scopeId}` }, onSuccess: () => qc.invalidateQueries({ queryKey: goalKeys.all }) });
}

export const useCreateGoal = (spaceId: string) => useGoalMutation(`new:${spaceId}`, (input: { title: string; criteria: string }) =>
  apiJson(`/api/spaces/${spaceId}/goals`, Goal, { method: "POST", body: input }));
export const useUpdateGoal = (goalId: string) => useGoalMutation(goalId, (input: { title?: string; criteria?: string; archived?: boolean }) =>
  apiJson(`/api/goals/${goalId}`, Goal, { method: "PATCH", body: input }));
export const useAddTask = (goalId: string) => useGoalMutation(goalId, (text: string) =>
  apiJson(`/api/goals/${goalId}/tasks`, Goal, { method: "POST", body: { text } }));
/** Checking a task updates the list at once (the checkbox must not wait for the server); errors roll back. */
export function useUpdateTask(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; text?: string; done?: boolean }) => apiJson(`/api/tasks/${id}`, Goal, { method: "PATCH", body: input }),
    scope: { id: `goal:${goalId}` },
    onMutate: async ({ id, done, text }) => {
      await qc.cancelQueries({ queryKey: goalKeys.all });
      const before = qc.getQueriesData<GoalListType>({ queryKey: goalKeys.all });
      qc.setQueriesData<GoalListType>({ queryKey: goalKeys.all }, (list) => list && {
        goals: list.goals.map((g) => {
          if (g.id !== goalId) return g;
          const tasks = g.tasks.map((x) => (x.id !== id ? x : { ...x, ...(text !== undefined ? { text } : {}), ...(done !== undefined ? { done, doneAt: done ? (x.doneAt ?? new Date().toISOString()) : null } : {}) }));
          return { ...g, tasks, progress: { done: tasks.filter((x) => x.done).length, total: tasks.length } };
        }),
      });
      return { before };
    },
    onError: (_e, _v, ctx) => { for (const [key, data] of ctx?.before ?? []) qc.setQueryData(key, data); },
    onSettled: () => qc.invalidateQueries({ queryKey: goalKeys.all }),
  });
}
export const useDeleteTask = (goalId: string) => useGoalMutation(goalId, (id: string) =>
  apiJson(`/api/tasks/${id}`, Goal, { method: "DELETE" }));
export const useReorderTasks = (goalId: string) => useGoalMutation(goalId, (taskIds: string[]) =>
  apiJson(`/api/goals/${goalId}/tasks/order`, Goal, { method: "PUT", body: { taskIds } }));

export const useAllTopics = () => useQuery({ queryKey: ["topics", "all"], queryFn: () => apiJson("/api/topics", TopicRefList) });
export const useNoteTopics = (noteId: string) => useQuery({ queryKey: ["notes", noteId, "topics"], queryFn: () => apiJson(`/api/notes/${noteId}/topics`, TopicRefList) });
export function useSetNoteTopics(noteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topicIds: string[]) => apiJson(`/api/notes/${noteId}/topics`, TopicRefList, { method: "PUT", body: { topicIds } }),
    scope: { id: `note-topics:${noteId}` },
    onSuccess: (data) => { qc.setQueryData(["notes", noteId, "topics"], data); void qc.invalidateQueries({ queryKey: ["space-notes"] }); },
  });
}
export const useSpaceNotes = (spaceId: string) => useQuery({ queryKey: ["space-notes", spaceId], queryFn: () => apiJson(`/api/spaces/${spaceId}/notes`, SpaceNoteList) });
