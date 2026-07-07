import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as v from "valibot";
import { apiFetch } from "./api";
import {
  AssignResponseSchema,
  PelayananTypeSchema,
  RoleSchema,
  ServiceSchema,
  StatusSchema,
  type AssignInput,
  type RoleInput,
  type ServiceInput,
} from "./schemas";

// Reference data changes rarely; cache it for the session.
export const pelayananTypesQueryOptions = queryOptions({
  queryKey: ["pelayanan-types"],
  queryFn: ({ signal }) => apiFetch("/api/pelayanan-types", v.array(PelayananTypeSchema), { signal }),
  staleTime: 5 * 60_000,
});

export function usePelayananTypes() {
  return useQuery(pelayananTypesQueryOptions);
}

export const rolesQueryOptions = queryOptions({
  queryKey: ["roles"],
  queryFn: ({ signal }) => apiFetch("/api/roles", v.array(RoleSchema), { signal }),
  staleTime: 5 * 60_000,
});

export function useRoles() {
  return useQuery(rolesQueryOptions);
}

export function servicesQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: ["services", { from, to }],
    queryFn: ({ signal }) =>
      apiFetch(`/api/services?from=${from}&to=${to}`, v.array(ServiceSchema), { signal }),
  });
}

export function useServices(from: string, to: string) {
  return useQuery(servicesQueryOptions(from, to));
}

export function serviceQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["services", id],
    queryFn: ({ signal }) => apiFetch(`/api/services/${id}`, ServiceSchema, { signal }),
  });
}

export function useService(id: string) {
  return useQuery(serviceQueryOptions(id));
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceInput) =>
      apiFetch("/api/services", ServiceSchema, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServiceInput }) =>
      apiFetch(`/api/services/${id}`, ServiceSchema, { method: "PUT", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/services/${id}`, StatusSchema, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useAssign(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignInput) =>
      apiFetch(`/api/services/${serviceId}/assignments`, AssignResponseSchema, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useUnassign(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      apiFetch(`/api/services/${serviceId}/assignments/${assignmentId}`, StatusSchema, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RoleInput) =>
      apiFetch("/api/roles", RoleSchema, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: rolesQueryOptions.queryKey }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, input }: { code: string; input: Omit<RoleInput, "code"> }) =>
      apiFetch(`/api/roles/${code}`, RoleSchema, { method: "PUT", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rolesQueryOptions.queryKey });
      void qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch(`/api/roles/${code}`, StatusSchema, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: rolesQueryOptions.queryKey }),
  });
}
