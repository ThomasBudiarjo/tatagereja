import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query";
import { api } from "../api/client";
import type { ServiceType, ServiceTypeReq } from "../api/types";

export function useServiceTypes() {
  return useQuery(() => ({
    queryKey: ["service-types", "list"] as const,
    queryFn: () => api.get<{ items: ServiceType[] }>("/service-types"),
    staleTime: 30_000,
  }));
}

export function useCreateServiceType() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (body: ServiceTypeReq) =>
      api.post<{ service_type: ServiceType }>("/service-types", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-types"] }),
  }));
}

export function useUpdateServiceType() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (vars: { id: number; body: ServiceTypeReq }) =>
      api.put<{ service_type: ServiceType }>(`/service-types/${vars.id}`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-types"] }),
  }));
}

export function useDeleteServiceType() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) => api.del(`/service-types/${id}`),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["service-types", "list"] });
      const prev = qc.getQueryData<{ items: ServiceType[] }>(["service-types", "list"]);
      if (prev) {
        qc.setQueryData(["service-types", "list"], { items: prev.items.filter((s) => s.id !== id) });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["service-types", "list"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["service-types", "list"] }),
  }));
}
