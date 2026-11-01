import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Backlinks, NoteDetail, NoteList, NoteMeta, NoteVersion, SavedNote, SearchResults } from "@hub/contracts";
import { z } from "zod";
import { ApiError, apiJson } from "../api.ts";

export const noteKeys = {
  list: ["notes"] as const,
  detail: (id: string) => ["notes", id] as const,
  meta: (id: string) => ["notes", id, "meta"] as const,
  backlinks: (id: string) => ["notes", id, "backlinks"] as const,
  search: (q: string) => ["notes", "search", q] as const,
};

/** All notes, page by page (the API returns at most 200 per page). */
export const useNotes = () => useInfiniteQuery({
  queryKey: noteKeys.list,
  initialPageParam: null as string | null,
  queryFn: ({ pageParam }) => apiJson(pageParam ? `/api/notes?cursor=${encodeURIComponent(pageParam)}` : "/api/notes", NoteList),
  getNextPageParam: (last) => last.nextCursor,
});
export const useNote = (id: string) => useQuery({ queryKey: noteKeys.detail(id), queryFn: () => apiJson(`/api/notes/${id}`, NoteDetail), refetchOnWindowFocus: false });
export const useNoteMeta = (id: string) => useQuery({ queryKey: noteKeys.meta(id), queryFn: () => apiJson(`/api/notes/${id}/meta`, NoteMeta) });
export const useBacklinks = (id: string) => useQuery({ queryKey: noteKeys.backlinks(id), queryFn: () => apiJson(`/api/notes/${id}/backlinks`, Backlinks) });
export const useSearch = (q: string) => useQuery({
  queryKey: noteKeys.search(q),
  queryFn: () => apiJson(`/api/notes/search?q=${encodeURIComponent(q)}`, SearchResults),
  enabled: q.trim().length > 0,
});

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; content: string }) => apiJson("/api/notes", SavedNote, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.list }),
  });
}

const ConflictDetails = z.object({ current: NoteVersion });
export type SaveResult = { kind: "saved"; version: NoteVersion } | { kind: "conflict"; current: NoteVersion } | { kind: "error"; messageKey: string };

/** Saves with the expected version; a 409 conflict is returned as data, not thrown. */
export async function saveNote(id: string, content: string, expectedSha256: string): Promise<SaveResult> {
  try {
    const saved = await apiJson(`/api/notes/${id}`, SavedNote, { method: "PUT", body: { content, expectedSha256 } });
    return { kind: "saved", version: saved.version };
  } catch (e) {
    if (e instanceof ApiError && e.code === "conflict") {
      const d = ConflictDetails.safeParse(e.details);
      if (d.success) return { kind: "conflict", current: d.data.current };
    }
    return { kind: "error", messageKey: e instanceof ApiError ? e.messageKey : "errors.saveFailed" };
  }
}
