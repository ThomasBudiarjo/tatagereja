import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as v from "valibot";
import { apiFetch } from "./api";
import { PersonSchema, StatusSchema, type PersonInput } from "./schemas";

export const personsQueryOptions = queryOptions({
  queryKey: ["persons"],
  queryFn: ({ signal }) => apiFetch("/api/persons", v.array(PersonSchema), { signal }),
});

export function usePersons() {
  return useQuery(personsQueryOptions);
}

export function useCreatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PersonInput) =>
      apiFetch("/api/persons", PersonSchema, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: personsQueryOptions.queryKey }),
  });
}

export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PersonInput }) =>
      apiFetch(`/api/persons/${id}`, PersonSchema, { method: "PUT", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: personsQueryOptions.queryKey }),
  });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/persons/${id}`, StatusSchema, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: personsQueryOptions.queryKey });
      // Cascaded assignment deletes may change rosters.
      void qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}
