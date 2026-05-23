import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query";
import { api } from "../api/client";
import type { JadwalEditor, JadwalSlot, Kebaktian, KebaktianReq } from "../api/types";

export function useKebaktianList() {
  return useQuery(() => ({
    queryKey: ["kebaktian", "list"] as const,
    queryFn: () => api.get<{ items: Kebaktian[] }>("/kebaktian"),
  }));
}

export function useKebaktian(id: () => number) {
  return useQuery(() => ({
    queryKey: ["kebaktian", "detail", id()] as const,
    queryFn: () => api.get<{ kebaktian: Kebaktian }>(`/kebaktian/${id()}`),
  }));
}

export function useCreateKebaktian() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (body: KebaktianReq) => api.post<{ kebaktian: Kebaktian }>("/kebaktian", body),
    onSuccess: (data) => {
      qc.setQueryData(["kebaktian", "detail", data.kebaktian.id], data);
      qc.invalidateQueries({ queryKey: ["kebaktian", "list"] });
    },
  }));
}

export function useUpdateKebaktian() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (vars: { id: number; body: KebaktianReq }) =>
      api.put<{ kebaktian: Kebaktian }>(`/kebaktian/${vars.id}`, vars.body),
    onSuccess: (data) => {
      qc.setQueryData(["kebaktian", "detail", data.kebaktian.id], data);
      qc.invalidateQueries({ queryKey: ["kebaktian", "list"] });
    },
  }));
}

export function useDeleteKebaktian() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) => api.del(`/kebaktian/${id}`),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["kebaktian", "list"] });
      const prev = qc.getQueryData<{ items: Kebaktian[] }>(["kebaktian", "list"]);
      if (prev) {
        qc.setQueryData(["kebaktian", "list"], { items: prev.items.filter((k) => k.id !== id) });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["kebaktian", "list"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["kebaktian", "list"] }),
  }));
}

export function useJadwal(kebaktianId: () => number) {
  return useQuery(() => ({
    queryKey: ["jadwal", kebaktianId()] as const,
    queryFn: () => api.get<JadwalEditor>(`/kebaktian/${kebaktianId()}/jadwal`),
  }));
}

export function useSaveJadwal(kebaktianId: () => number) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (slots: JadwalSlot[]) =>
      api.post(`/kebaktian/${kebaktianId()}/jadwal`, { slots }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jadwal", kebaktianId()] }),
  }));
}
