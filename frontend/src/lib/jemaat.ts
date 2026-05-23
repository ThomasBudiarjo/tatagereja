import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/solid-query";
import { api } from "../api/client";
import type { Jemaat, JemaatReq, ListResp } from "../api/types";

export type JemaatListParams = { q: string; limit: number; offset: number };

export function useJemaatList(params: () => JemaatListParams) {
  return useQuery(() => {
    const p = params();
    const qs = `?q=${encodeURIComponent(p.q)}&limit=${p.limit}&offset=${p.offset}`;
    return {
      queryKey: ["jemaat", "list", p] as const,
      queryFn: () => api.get<ListResp<Jemaat>>(`/jemaat${qs}`),
      placeholderData: keepPreviousData,
    };
  });
}

export function useJemaat(id: () => number) {
  return useQuery(() => ({
    queryKey: ["jemaat", "detail", id()] as const,
    queryFn: () => api.get<{ jemaat: Jemaat }>(`/jemaat/${id()}`),
  }));
}

export function useCreateJemaat() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (body: JemaatReq) => api.post<{ jemaat: Jemaat }>("/jemaat", body),
    onSuccess: (data) => {
      qc.setQueryData(["jemaat", "detail", data.jemaat.id], data);
      qc.invalidateQueries({ queryKey: ["jemaat", "list"] });
    },
  }));
}

export function useUpdateJemaat() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (vars: { id: number; body: JemaatReq }) =>
      api.put<{ jemaat: Jemaat }>(`/jemaat/${vars.id}`, vars.body),
    onSuccess: (data) => {
      qc.setQueryData(["jemaat", "detail", data.jemaat.id], data);
      qc.invalidateQueries({ queryKey: ["jemaat", "list"] });
    },
  }));
}

// Optimistic delete: the row vanishes from every cached list immediately, with
// rollback if the server rejects it. This is the interaction that felt laggy
// under htmx (a full round trip to re-render the list).
export function useDeleteJemaat() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) => api.del(`/jemaat/${id}`),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["jemaat", "list"] });
      const snapshots = qc.getQueriesData<ListResp<Jemaat>>({ queryKey: ["jemaat", "list"] });
      for (const [key, data] of snapshots) {
        if (data) {
          qc.setQueryData(key, {
            ...data,
            items: data.items.filter((j) => j.id !== id),
            total: Math.max(0, data.total - 1),
          });
        }
      }
      return { snapshots };
    },
    onError: (_err, _id, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["jemaat", "list"] }),
  }));
}
