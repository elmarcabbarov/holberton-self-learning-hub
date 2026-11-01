import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Space, SpaceDetail, SpaceList, Topic, type CreateSpace, type UpdateSpace, type UpdateTopic } from "@hub/contracts";
import { apiJson } from "../api.ts";

export const spaceKeys = {
  all: ["spaces"] as const,
  detail: (id: string) => ["spaces", id] as const,
};

export function useSpaces() {
  return useQuery({ queryKey: spaceKeys.all, queryFn: () => apiJson("/api/spaces", SpaceList) });
}

export function useArchivedSpaces(enabled: boolean) {
  return useQuery({ queryKey: [...spaceKeys.all, "archived"], queryFn: () => apiJson("/api/spaces?archived=1", SpaceList), enabled });
}

export function useRestoreSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiJson(`/api/spaces/${id}`, Space, { method: "PATCH", body: { archived: false } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: spaceKeys.all }),
  });
}

export function useSpace(id: string) {
  return useQuery({ queryKey: spaceKeys.detail(id), queryFn: () => apiJson(`/api/spaces/${id}`, SpaceDetail) });
}

export function useCreateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSpace) => apiJson("/api/spaces", Space, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: spaceKeys.all }),
  });
}

export function useUpdateSpace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSpace) => apiJson(`/api/spaces/${id}`, Space, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: spaceKeys.all }),
  });
}

export function useCreateTopic(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiJson(`/api/spaces/${spaceId}/topics`, Topic, { method: "POST", body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: spaceKeys.all }),
  });
}

export function useUpdateTopic(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTopic & { id: string }) => apiJson(`/api/topics/${id}`, Topic, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: spaceKeys.detail(spaceId) }),
  });
}
