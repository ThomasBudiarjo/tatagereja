import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query";
import { api } from "../api/client";
import type { Jemaat, Keluarga, KeluargaOption, KeluargaReq } from "../api/types";

export function useKeluargaList() {
  return useQuery(() => ({
    queryKey: ["keluarga", "list"] as const,
    queryFn: () => api.get<{ items: Keluarga[] }>("/keluarga"),
  }));
}

export function useKeluargaOptions() {
  return useQuery(() => ({
    queryKey: ["keluarga", "options"] as const,
    queryFn: () => api.get<{ items: KeluargaOption[] }>("/keluarga/options"),
    staleTime: 60_000,
  }));
}

export function useKeluarga(id: () => number) {
  return useQuery(() => ({
    queryKey: ["keluarga", "detail", id()] as const,
    queryFn: () => api.get<{ keluarga: Keluarga; members: Jemaat[] }>(`/keluarga/${id()}`),
  }));
}

export function useCreateKeluarga() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (body: KeluargaReq) => api.post<{ keluarga: Keluarga }>("/keluarga", body),
    onSuccess: (data) => {
      qc.setQueryData(["keluarga", "detail", data.keluarga.id], { keluarga: data.keluarga, members: [] });
      qc.invalidateQueries({ queryKey: ["keluarga"] });
    },
  }));
}

export function useUpdateKeluarga() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (vars: { id: number; body: KeluargaReq }) =>
      api.put<{ keluarga: Keluarga }>(`/keluarga/${vars.id}`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keluarga"] }),
  }));
}

export function useDeleteKeluarga() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) => api.del(`/keluarga/${id}`),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["keluarga", "list"] });
      const prev = qc.getQueryData<{ items: Keluarga[] }>(["keluarga", "list"]);
      if (prev) {
        qc.setQueryData(["keluarga", "list"], { items: prev.items.filter((k) => k.id !== id) });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["keluarga", "list"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["keluarga", "list"] }),
  }));
}
