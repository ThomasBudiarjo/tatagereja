import {
  authResponseSchema,
  changePasswordBodySchema,
  loginBodySchema,
  meResponseSchema,
  okSchema,
  registerBodySchema,
  serverMetaSchema,
  sessionListSchema,
  updateProfileBodySchema,
  type AuthResponse,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api, probeServer, request } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { useAuthStore, useAuth } from '@/stores/auth';
import { useServerStore, type KnownServer } from '@/stores/server';
import { useUiStore } from '@/stores/ui';

export const metaQuery = (serverUrl: string) =>
  queryOptions({
    queryKey: ['meta', serverUrl],
    queryFn: () => probeServer(serverUrl, serverMetaSchema),
    staleTime: 5 * 60_000,
  });

export async function probeAndRemember(serverUrl: string): Promise<KnownServer> {
  const meta = await queryClient.fetchQuery(metaQuery(serverUrl));
  const server: KnownServer = {
    url: serverUrl,
    name: meta.name,
    registrationMode: meta.registrationMode,
    turnstileSiteKey: meta.turnstileSiteKey,
    version: meta.version,
    checkedAt: new Date().toISOString(),
  };
  useServerStore.getState().rememberServer(server);
  return server;
}

export const meQuery = () =>
  queryOptions({
    queryKey: ['me'],
    queryFn: () => request(meResponseSchema, { url: '/auth/me' }),
  });

export const sessionsQuery = () =>
  queryOptions({
    queryKey: ['me', 'sessions'],
    queryFn: () => request(sessionListSchema, { url: '/auth/sessions' }),
  });

function storeAuth(serverUrl: string, response: AuthResponse) {
  useAuthStore.getState().setSession(serverUrl, {
    token: response.token,
    expiresAt: response.expiresAt,
    user: response.user,
  });
  // Remembering the church makes the post-auth redirect land on it even when the
  // guard for authenticated users redirects first.
  if (response.joinedChurchId) useUiStore.getState().setLastChurchId(response.joinedChurchId);
}

export function useLogin() {
  const { serverUrl } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof loginBodySchema>) =>
      request(authResponseSchema, {
        method: 'POST',
        url: '/auth/login',
        data: loginBodySchema.parse(body),
      }),
    onSuccess: (response) => {
      client.clear();
      storeAuth(serverUrl, response);
    },
  });
}

export function useRegister() {
  const { serverUrl } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof registerBodySchema>) =>
      request(authResponseSchema, {
        method: 'POST',
        url: '/auth/register',
        data: registerBodySchema.parse(body),
      }),
    onSuccess: (response) => {
      client.clear();
      storeAuth(serverUrl, response);
    },
  });
}

export function useLogout() {
  const { serverUrl } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await api.post('/auth/logout');
      } catch {
        // The local session is cleared regardless of the server response.
      }
    },
    onSettled: () => {
      useAuthStore.getState().clearSession(serverUrl);
      useUiStore.getState().setLastChurchId(null);
      client.clear();
    },
  });
}

export function useUpdateProfile() {
  const { serverUrl } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof updateProfileBodySchema>) =>
      request(meResponseSchema, {
        method: 'PATCH',
        url: '/auth/me',
        data: updateProfileBodySchema.parse(body),
      }),
    onSuccess: (response) => {
      useAuthStore.getState().setUser(serverUrl, response.user);
      void client.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useChangePassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof changePasswordBodySchema>) =>
      request(okSchema, {
        method: 'POST',
        url: '/auth/change-password',
        data: changePasswordBodySchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['me', 'sessions'] }),
  });
}

export function useRevokeSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: `/auth/sessions/${id}` }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['me', 'sessions'] }),
  });
}
