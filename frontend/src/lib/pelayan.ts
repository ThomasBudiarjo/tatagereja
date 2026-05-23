import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query";
import { api } from "../api/client";
import type { JemaatOption, Pelayan, PelayanReq } from "../api/types";

export function usePelayanList() {
  return useQuery(() => ({
    queryKey: ["pelayan", "list"] as const,
    queryFn: () => api.get<{ items: Pelayan[] }>("/pelayan"),
  }));
}

export function usePelayan(id: () => number) {
  return useQuery(() => ({
    queryKey: ["pelayan", "detail", id()] as const,
    queryFn: () => api.get<{ pelayan: Pelayan }>(`/pelayan/${id()}`),
  }));
}

export function useJemaatOptions() {
  return useQuery(() => ({
    queryKey: ["jemaat", "active"] as const,
    queryFn: () => api.get<{ items: JemaatOption[] }>("/jemaat/active"),
    staleTime: 30_000,
  }));
}

export function useCreatePelayan() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (body: PelayanReq) => api.post<{ pelayan: { id: number } }>("/pelayan", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pelayan"] }),
  }));
}

export function useUpdatePelayan() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (vars: { id: number; body: PelayanReq }) =>
      api.put<{ pelayan: { id: number } }>(`/pelayan/${vars.id}`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pelayan"] }),
  }));
}

export function useDeletePelayan() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) => api.del(`/pelayan/${id}`),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["pelayan", "list"] });
      const prev = qc.getQueryData<{ items: Pelayan[] }>(["pelayan", "list"]);
      if (prev) {
        qc.setQueryData(["pelayan", "list"], { items: prev.items.filter((p) => p.id !== id) });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pelayan", "list"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["pelayan", "list"] }),
  }));
}
