import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExamMode } from "@hub/contracts";
import { apiJson } from "../api.ts";

const KEY = ["exam-mode"] as const;
export function useExamMode() {
  const query = useQuery({ queryKey: KEY, queryFn: () => apiJson("/api/exam-mode", ExamMode), refetchOnWindowFocus: "always", refetchInterval: 30_000 });
  const { refetch } = query;
  const until = query.data?.until;
  useEffect(() => {
    const focus = () => { void refetch(); };
    window.addEventListener("focus", focus);
    // Expiry only triggers a read. The server decides whether AI can be enabled again.
    const timer = until ? window.setTimeout(focus, Math.min(2_147_483_647, Math.max(100, Date.parse(until) - Date.now() + 50))) : undefined;
    return () => { window.removeEventListener("focus", focus); window.clearTimeout(timer); };
  }, [until, refetch]);
  return query;
}
export function useSetExamMode() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => qc.cancelQueries({ queryKey: KEY }),
    mutationFn: (until: string | null) => apiJson("/api/exam-mode", ExamMode, { method: "PUT", body: { until } }),
    onSuccess: (state) => { qc.setQueryData(KEY, state); void qc.invalidateQueries({ queryKey: KEY }); void qc.invalidateQueries({ queryKey: ["ai", "status"] }); },
  });
}
