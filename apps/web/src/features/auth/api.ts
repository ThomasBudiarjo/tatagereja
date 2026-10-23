import {
  authResponseSchema,
  completePasswordResetBodySchema,
  passwordResetPreviewSchema,
  recoveryPasswordResetBodySchema,
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
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { localizeSecurityError } from '@/features/admin-security/errors';
import { api, probeServer, request as rawRequest } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { forgetSession, storeSession, transportFor, useAuth, useAuthStore } from '@/stores/auth';
import { hostLabel } from '@/lib/utils';
import {
  DEFAULT_SERVER_NAME,
  isDefaultServer,
  useServerStore,
  type KnownServer,
} from '@/stores/server';
import { useUiStore } from '@/stores/ui';

/** Account answers (password rules, reset links) in the interface language. */
const request: typeof rawRequest = (schema, config) =>
  rawRequest(schema, config).catch((error: unknown) => {
    throw localizeSecurityError(error);
  });

export const metaQuery = (serverUrl: string) =>
  queryOptions({
    queryKey: ['meta', serverUrl],
    queryFn: () => probeServer(serverUrl, serverMetaSchema),
    staleTime: 5 * 60_000,
  });

/**
 * The name people know a server by. A self-hosted server that serves this app is the default
 * one, so its own `SERVER_NAME` is shown rather than the hosted service's name, unless the build
 * names the default server explicitly.
 */
export function useServerName(serverUrl: string): string {
  const known = useServerStore((state) => state.servers[serverUrl]?.name);
  const ask = !known && !import.meta.env.VITE_DEFAULT_SERVER_NAME && isDefaultServer(serverUrl);
  const meta = useQuery({ ...metaQuery(serverUrl), enabled: ask, retry: false });
  if (known) return known;
  if (!isDefaultServer(serverUrl)) return hostLabel(serverUrl);
  return (ask ? meta.data?.name : null) ?? DEFAULT_SERVER_NAME;
}

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
  storeSession(serverUrl, response);
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
        data: loginBodySchema.parse({ ...body, transport: transportFor(serverUrl) }),
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
        data: registerBodySchema.parse({ ...body, transport: transportFor(serverUrl) }),
      }),
    onSuccess: (response) => {
      client.clear();
      storeAuth(serverUrl, response);
    },
  });
}

/**
 * Signs out: the server ends the session (and clears the cookie), then the credentials in
 * memory, the stored session, everything cached and the remembered church are forgotten here
 * and in every other tab. `everywhere` ends every session of the account.
 */
function useSignOut(path: '/auth/logout' | '/auth/logout/everywhere') {
  const { serverUrl } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await api.post(path);
      } catch {
        // The local session is cleared regardless of the server response.
      }
      return true as const;
    },
    onSettled: () => {
      forgetSession(serverUrl);
      useUiStore.getState().setLastChurchId(null);
      client.clear();
    },
  });
}

export const useLogout = () => useSignOut('/auth/logout');
export const useSignOutEverywhere = () => useSignOut('/auth/logout/everywhere');

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

export const passwordResetQuery = (token: string) =>
  queryOptions({
    queryKey: ['password-reset', token],
    queryFn: () =>
      request(passwordResetPreviewSchema, {
        url: `/auth/password-reset/${encodeURIComponent(token)}`,
      }),
    retry: false,
    staleTime: Infinity,
  });

/** Uses an administrator's reset link; every session of the account ends. */
export function useCompletePasswordReset() {
  return useMutation({
    mutationFn: (body: z.input<typeof completePasswordResetBodySchema>) =>
      request(okSchema, {
        method: 'POST',
        url: '/auth/password-reset',
        data: completePasswordResetBodySchema.parse(body),
      }),
  });
}

/** Self-service reset with a recovery code (accounts with two-step verification). */
export function useRecoveryPasswordReset() {
  return useMutation({
    mutationFn: (body: z.input<typeof recoveryPasswordResetBodySchema>) =>
      request(okSchema, {
        method: 'POST',
        url: '/auth/password-reset/recovery',
        data: recoveryPasswordResetBodySchema.parse(body),
      }),
  });
}
