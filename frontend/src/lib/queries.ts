import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { StatusSchema, UserSchema, type LoginInput, type RegisterInput } from "./schemas";

// meQueryOptions loads the current user. retry:false so a 401 resolves quickly
// to "logged out" instead of retrying.
export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: ({ signal }) => apiFetch("/api/me", UserSchema, { signal }),
  retry: false,
  staleTime: 30_000,
});

export function useMe() {
  return useQuery(meQueryOptions);
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiFetch("/api/auth/login", UserSchema, { method: "POST", body: input }),
    onSuccess: (user) => {
      qc.setQueryData(meQueryOptions.queryKey, user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiFetch("/api/auth/register", UserSchema, { method: "POST", body: input }),
    onSuccess: (user) => {
      qc.setQueryData(meQueryOptions.queryKey, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", StatusSchema, { method: "POST" }),
    onSuccess: () => {
      qc.clear();
    },
  });
}
