import {
  accountDeletionBlockersSchema,
  auditLogDetailSchema,
  auditLogFacetsSchema,
  auditLogListSchema,
  authResponseSchema,
  churchBackupSchema,
  churchModulesSchema,
  churchResponseSchema,
  churchInputSchema,
  confirmTransferOwnershipBodySchema,
  customRoleInputSchema,
  customRoleListSchema,
  customRoleResponseSchema,
  deleteAccountBodySchema,
  loginEventListSchema,
  loginResponseSchema,
  loginTwoFactorBodySchema,
  memberDetailSchema,
  memberListSchema,
  membershipResponseSchema,
  okSchema,
  passwordChangeResponseSchema,
  passwordResetLinkSchema,
  personalDataExportSchema,
  recoveryCodesSchema,
  revokeSessionsResponseSchema,
  roleMembersSchema,
  securePasswordChangeBodySchema,
  securityOverviewSchema,
  securityPolicyResponseSchema,
  setMemberRolesBodySchema,
  twoFactorConfirmBodySchema,
  twoFactorDisabledSchema,
  twoFactorEnabledSchema,
  twoFactorSetupSchema,
  twoFactorStatusSchema,
  type AuditLogExportQuery,
  type ChurchModules,
  type ChurchRole,
  type CustomRoleInput,
  type MemberListQuery,
  type MembershipStatus,
  type ModuleId,
} from '@tatagereja/shared';
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import { churchKeys } from '@/features/churches/api';
import { api, request as rawRequest } from '@/lib/api';
import { churchScope } from '@/lib/keys';
import { queryClient as globalClient } from '@/lib/query-client';
import { optimistic } from '@/lib/use-mutation-toast';
import { forgetSession, storeSession, transportFor, useAuth } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { localizeSecurityError } from './errors';

/** Query keys of the module, scoped per church so switching churches never reuses data. */
export const securityKeys = {
  all: (churchId: string) => [...churchScope(churchId), 'admin-security'] as const,
  members: (churchId: string) => [...securityKeys.all(churchId), 'members'] as const,
  memberList: (churchId: string, params: Record<string, unknown>) =>
    [...securityKeys.members(churchId), 'list', params] as const,
  member: (churchId: string, id: string) =>
    [...securityKeys.members(churchId), 'detail', id] as const,
  roles: (churchId: string) => [...securityKeys.all(churchId), 'roles'] as const,
  roleMembers: (churchId: string, id: string) =>
    [...securityKeys.roles(churchId), 'members', id] as const,
  audit: (churchId: string) => [...securityKeys.all(churchId), 'audit'] as const,
  auditList: (churchId: string, params: Record<string, unknown>) =>
    [...securityKeys.audit(churchId), 'list', params] as const,
  auditFacets: (churchId: string) => [...securityKeys.audit(churchId), 'facets'] as const,
  auditEntry: (churchId: string, id: string) =>
    [...securityKeys.audit(churchId), 'entry', id] as const,
  policy: (churchId: string) => [...securityKeys.all(churchId), 'policy'] as const,
  overview: (churchId: string) => [...securityKeys.all(churchId), 'overview'] as const,
  modules: (churchId: string) => [...securityKeys.all(churchId), 'modules'] as const,
};

export const accountKeys = {
  all: ['me'] as const,
  sessions: ['me', 'sessions'] as const,
  twoFactor: ['me', 'security', 'two-factor'] as const,
  loginEvents: (params: Record<string, unknown>) =>
    ['me', 'security', 'login-events', params] as const,
  deletion: ['me', 'security', 'deletion'] as const,
};

/**
 * Members, roles and permissions change what the caller may see everywhere in the church
 * (menus, actions, counts), so their mutations refresh the whole church scope, the church
 * detail (the caller's own access) and the churches list (roles shown there).
 */
export const refreshChurch = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: churchScope(churchId) }),
    client.invalidateQueries({ queryKey: churchKeys.all }),
  ]);

/** `request` with the module's server messages in the interface language. */
const request: typeof rawRequest = (schema, config) =>
  rawRequest(schema, config).catch((error: unknown) => {
    throw localizeSecurityError(error);
  });

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== undefined),
  );

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

export const memberListQuery = (churchId: string, params: Partial<MemberListQuery>) =>
  queryOptions({
    queryKey: securityKeys.memberList(churchId, clean(params)),
    queryFn: () =>
      request(memberListSchema, { url: `/churches/${churchId}/members`, params: clean(params) }),
  });

export const memberDetailQuery = (churchId: string, membershipId: string) =>
  queryOptions({
    queryKey: securityKeys.member(churchId, membershipId),
    queryFn: () =>
      request(memberDetailSchema, { url: `/churches/${churchId}/members/${membershipId}` }),
  });

export function useChangeBaseRole(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: ChurchRole }) =>
      request(membershipResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/members/${membershipId}`,
        data: { role },
      }),
    onSuccess: () => refreshChurch(client, churchId),
  });
}

export function useSetMemberStatus(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, status }: { membershipId: string; status: MembershipStatus }) =>
      request(membershipResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/members/${membershipId}/status`,
        data: { status },
      }),
    onSuccess: () => refreshChurch(client, churchId),
  });
}

export function useRemoveMember(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/members/${membershipId}` }),
    onSuccess: (_data, membershipId) => {
      client.removeQueries({ queryKey: securityKeys.member(churchId, membershipId) });
      return refreshChurch(client, churchId);
    },
  });
}

/** A one-time password reset link for a member; shown once, audited. */
export function useCreatePasswordReset(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      request(passwordResetLinkSchema, {
        method: 'POST',
        url: `/churches/${churchId}/members/${membershipId}/password-reset`,
        data: { identityConfirmed: true },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: securityKeys.audit(churchId) }),
  });
}

export function useSetMemberRoles(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, roleIds }: { membershipId: string; roleIds: string[] }) =>
      request(z.object({ roleIds: z.array(z.string()) }).loose(), {
        method: 'PUT',
        url: `/churches/${churchId}/members/${membershipId}/roles`,
        data: setMemberRolesBodySchema.parse({ roleIds }),
      }),
    onSuccess: () => refreshChurch(client, churchId),
  });
}

export function useTransferOwnership(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof confirmTransferOwnershipBodySchema>) =>
      request(churchResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/transfer-ownership`,
        data: confirmTransferOwnershipBodySchema.parse(body),
      }),
    onSuccess: () => refreshChurch(client, churchId),
  });
}

export function useLeaveChurch(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request(okSchema, { method: 'POST', url: `/churches/${churchId}/leave` }),
    onSuccess: () => {
      client.removeQueries({ queryKey: churchScope(churchId) });
      return client.invalidateQueries({ queryKey: churchKeys.all });
    },
  });
}

export function useDeleteChurch(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}`, data: { password } }),
    onSuccess: () => {
      client.removeQueries({ queryKey: churchScope(churchId) });
      client.removeQueries({ queryKey: churchKeys.detail(churchId) });
      return client.invalidateQueries({ queryKey: churchKeys.mine() });
    },
  });
}

export function useUpdateChurchProfile(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof churchInputSchema>) =>
      request(churchResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}`,
        data: churchInputSchema.parse(body),
      }),
    onSuccess: () => refreshChurch(client, churchId),
  });
}

// ---------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------

export const rolesQuery = (churchId: string) =>
  queryOptions({
    queryKey: securityKeys.roles(churchId),
    queryFn: () => request(customRoleListSchema, { url: `/churches/${churchId}/roles` }),
  });

export const roleMembersQuery = (churchId: string, roleId: string) =>
  queryOptions({
    queryKey: securityKeys.roleMembers(churchId, roleId),
    queryFn: () =>
      request(roleMembersSchema, { url: `/churches/${churchId}/roles/${roleId}/members` }),
  });

export function useSaveRole(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: z.input<typeof customRoleInputSchema> }) =>
      request(customRoleResponseSchema, {
        method: id ? 'PATCH' : 'POST',
        url: id ? `/churches/${churchId}/roles/${id}` : `/churches/${churchId}/roles`,
        data: customRoleInputSchema.parse(body),
      }),
    onSuccess: () => refreshChurch(client, churchId),
  });
}

export function useDeleteRole(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/roles/${id}` }),
    onSuccess: () => refreshChurch(client, churchId),
  });
}

export type { CustomRoleInput };

// ---------------------------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------------------------

export const modulesQuery = (churchId: string) =>
  queryOptions({
    queryKey: securityKeys.modules(churchId),
    queryFn: () => request(churchModulesSchema, { url: `/churches/${churchId}/modules` }),
  });

/** Switches a module optimistically; menus follow once the church detail refreshes. */
export function useToggleModule(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: ModuleId; enabled: boolean }) =>
      request(churchModulesSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/modules`,
        data: { modules: { [id]: enabled } },
      }),
    onMutate: ({ id, enabled }) =>
      optimistic<ChurchModules>(client, securityKeys.modules(churchId), (old) =>
        old
          ? {
              items: old.items.map((item) => (item.id === id ? { ...item, enabled } : item)),
            }
          : old,
      ),
    onError: (_error, _variables, rollback) => rollback?.(),
    onSettled: () => refreshChurch(client, churchId),
  });
}

// ---------------------------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------------------------

export const AUDIT_PAGE_SIZE = 30;

export const auditLogInfiniteQuery = (churchId: string, filters: Partial<AuditLogExportQuery>) =>
  infiniteQueryOptions({
    queryKey: securityKeys.auditList(churchId, clean(filters)),
    queryFn: ({ pageParam }) =>
      request(auditLogListSchema, {
        url: `/churches/${churchId}/audit-logs`,
        params: { ...clean(filters), page: pageParam, limit: AUDIT_PAGE_SIZE },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });

export const auditFacetsQuery = (churchId: string) =>
  queryOptions({
    queryKey: securityKeys.auditFacets(churchId),
    queryFn: () =>
      request(auditLogFacetsSchema, { url: `/churches/${churchId}/audit-logs/facets` }),
    staleTime: 60_000,
  });

export const auditEntryQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: securityKeys.auditEntry(churchId, id),
    queryFn: () => request(auditLogDetailSchema, { url: `/churches/${churchId}/audit-logs/${id}` }),
  });

/** Saves a response as a file the browser downloads. */
export function downloadBlob(data: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

export function useExportAuditLog(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (filters: Partial<AuditLogExportQuery>) => {
      const response = await api.get<string>(`/churches/${churchId}/audit-logs/export`, {
        params: clean(filters),
        responseType: 'text',
      });
      downloadBlob(response.data, `log-audit-${today()}.csv`, 'text/csv;charset=utf-8');
    },
    // The export is itself recorded in the log.
    onSuccess: () => client.invalidateQueries({ queryKey: securityKeys.audit(churchId) }),
  });
}

// ---------------------------------------------------------------------------------------------
// Church security
// ---------------------------------------------------------------------------------------------

export const securityPolicyQuery = (churchId: string) =>
  queryOptions({
    queryKey: securityKeys.policy(churchId),
    queryFn: () =>
      request(securityPolicyResponseSchema, { url: `/churches/${churchId}/security/policy` }),
  });

export const securityOverviewQuery = (churchId: string) =>
  queryOptions({
    queryKey: securityKeys.overview(churchId),
    queryFn: () =>
      request(securityOverviewSchema, { url: `/churches/${churchId}/security/overview` }),
  });

export function useUpdateSecurityPolicy(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (requireTwoFactorForManagers: boolean) =>
      request(
        z.object({ policy: z.object({ requireTwoFactorForManagers: z.boolean() }) }).loose(),
        {
          method: 'PUT',
          url: `/churches/${churchId}/security/policy`,
          data: { requireTwoFactorForManagers },
        },
      ),
    onSuccess: () => refreshChurch(client, churchId),
  });
}

export function useDownloadBackup(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (password: string) => {
      const backup = await request(churchBackupSchema, {
        method: 'POST',
        url: `/churches/${churchId}/security/backup`,
        data: { password },
      });
      const slug = backup.churchName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      downloadBlob(
        JSON.stringify(backup, null, 2),
        `cadangan-${slug || 'gereja'}-${today()}.json`,
        'application/json',
      );
      return backup;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: securityKeys.audit(churchId) }),
  });
}

// ---------------------------------------------------------------------------------------------
// Account security
// ---------------------------------------------------------------------------------------------

export const twoFactorStatusQuery = () =>
  queryOptions({
    queryKey: accountKeys.twoFactor,
    queryFn: () => request(twoFactorStatusSchema, { url: '/auth/two-factor' }),
  });

export const LOGIN_EVENTS_PAGE_SIZE = 20;

export const loginEventsInfiniteQuery = (outcome: 'all' | 'failed') =>
  infiniteQueryOptions({
    queryKey: accountKeys.loginEvents({ outcome }),
    queryFn: ({ pageParam }) =>
      request(loginEventListSchema, {
        url: '/auth/login-events',
        params: { outcome, page: pageParam, limit: LOGIN_EVENTS_PAGE_SIZE },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });

export const deletionBlockersQuery = () =>
  queryOptions({
    queryKey: accountKeys.deletion,
    queryFn: () => request(accountDeletionBlockersSchema, { url: '/auth/account/deletion' }),
  });

/** 2FA changes affect church access (the policy) and the notification inbox. */
const refreshAccount = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: accountKeys.all }),
    client.invalidateQueries({ queryKey: ['church'] }),
    client.invalidateQueries({ queryKey: churchKeys.all }),
    client.invalidateQueries({ queryKey: ['notifications'] }),
  ]);

export function useStartTwoFactorSetup() {
  return useMutation({
    mutationFn: (password: string) =>
      request(twoFactorSetupSchema, {
        method: 'POST',
        url: '/auth/two-factor/setup',
        data: { password },
      }),
  });
}

/** Turning 2FA on or off ends the other sessions and gives this one new credentials. */
export function useEnableTwoFactor() {
  const client = useQueryClient();
  const { serverUrl } = useAuth();
  return useMutation({
    mutationFn: (code: string) =>
      request(twoFactorEnabledSchema, {
        method: 'POST',
        url: '/auth/two-factor/enable',
        data: { code },
      }),
    onSuccess: (response) => {
      storeSession(serverUrl, response.session);
      return refreshAccount(client);
    },
  });
}

export function useDisableTwoFactor() {
  const client = useQueryClient();
  const { serverUrl } = useAuth();
  return useMutation({
    mutationFn: (body: z.input<typeof twoFactorConfirmBodySchema>) =>
      request(twoFactorDisabledSchema, {
        method: 'POST',
        url: '/auth/two-factor/disable',
        data: twoFactorConfirmBodySchema.parse(body),
      }),
    onSuccess: (response) => {
      storeSession(serverUrl, response.session);
      return refreshAccount(client);
    },
  });
}

export function useRegenerateRecoveryCodes() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof twoFactorConfirmBodySchema>) =>
      request(recoveryCodesSchema, {
        method: 'POST',
        url: '/auth/two-factor/recovery-codes',
        data: twoFactorConfirmBodySchema.parse(body),
      }),
    onSuccess: () => refreshAccount(client),
  });
}

/** Every other session ends; this one continues with the rotated credentials. */
export function useSecurePasswordChange() {
  const client = useQueryClient();
  const { serverUrl } = useAuth();
  return useMutation({
    mutationFn: (body: z.input<typeof securePasswordChangeBodySchema>) =>
      request(passwordChangeResponseSchema, {
        method: 'POST',
        url: '/auth/change-password',
        data: securePasswordChangeBodySchema.parse(body),
      }),
    onSuccess: (response) => {
      storeSession(serverUrl, response.session);
      return refreshAccount(client);
    },
  });
}

export function useRevokeOtherSessions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(revokeSessionsResponseSchema, { method: 'DELETE', url: '/auth/sessions' }),
    onSuccess: () => client.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useExportPersonalData() {
  return useMutation({
    mutationFn: async (password: string) => {
      const data = await request(personalDataExportSchema, {
        method: 'POST',
        url: '/auth/export',
        data: { password },
      });
      downloadBlob(JSON.stringify(data, null, 2), `data-saya-${today()}.json`, 'application/json');
      return data;
    },
  });
}

export function useDeleteAccount() {
  const { serverUrl } = useAuth();
  return useMutation({
    mutationFn: (body: z.input<typeof deleteAccountBodySchema>) =>
      request(okSchema, {
        method: 'DELETE',
        url: '/auth/account',
        data: deleteAccountBodySchema.parse(body),
      }),
    onSuccess: () => {
      forgetSession(serverUrl);
      useUiStore.getState().setLastChurchId(null);
      globalClient.clear();
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------------------------

/** `POST /auth/login`: a session, or a challenge for the second step. */
export function useLoginWithChallenge() {
  const { serverUrl } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      request(loginResponseSchema, {
        method: 'POST',
        url: '/auth/login',
        data: { ...body, transport: transportFor(serverUrl) },
      }),
    onSuccess: (response) => {
      if ('token' in response) {
        client.clear();
        storeSession(serverUrl, response);
      }
    },
  });
}

export function useLoginSecondStep() {
  const { serverUrl } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof loginTwoFactorBodySchema>) =>
      request(authResponseSchema, {
        method: 'POST',
        url: '/auth/login/two-factor',
        data: loginTwoFactorBodySchema.parse({ ...body, transport: transportFor(serverUrl) }),
      }),
    onSuccess: (response) => {
      client.clear();
      storeSession(serverUrl, response);
    },
  });
}
