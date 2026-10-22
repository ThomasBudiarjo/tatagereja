import {
  addGroupMembersBodySchema,
  decideGroupJoinRequestBodySchema,
  groupDetailsInputSchema,
  groupDetailsListSchema,
  groupDetailsPatchSchema,
  groupDetailsResponseSchema,
  groupJoinRequestInputSchema,
  groupJoinRequestListSchema,
  groupJoinRequestResponseSchema,
  groupLeaderBodySchema,
  groupPageSchema,
  okSchema,
  type GroupType,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { churchKeys } from '@/features/churches/api';
import { peopleKeys } from '@/features/people/api';
import { request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';
import { invalidateAll } from '@/lib/use-mutation-toast';

export type GroupListParams = {
  q?: string;
  includeInactive?: boolean;
  type?: GroupType;
  mine?: boolean;
};

const joinRequestsKey = (churchId: string) => [...keys.groups(churchId), 'join-requests'] as const;

export const groupsQuery = (churchId: string, params: GroupListParams = {}) =>
  queryOptions({
    queryKey: keys.groupList(churchId, params),
    queryFn: () =>
      request(groupDetailsListSchema, {
        url: `/churches/${churchId}/groups`,
        params: {
          q: params.q || undefined,
          type: params.type || undefined,
          includeInactive: params.includeInactive ? 'true' : 'false',
          mine: params.mine ? 'true' : undefined,
        },
      }),
  });

export const groupQuery = (churchId: string, groupId: string) =>
  queryOptions({
    queryKey: keys.group(churchId, groupId),
    queryFn: () => request(groupPageSchema, { url: `/churches/${churchId}/groups/${groupId}` }),
  });

/** Pending join requests in every group the caller decides on. */
export const joinRequestsQuery = (churchId: string) =>
  queryOptions({
    queryKey: joinRequestsKey(churchId),
    queryFn: () =>
      request(groupJoinRequestListSchema, { url: `/churches/${churchId}/groups/join-requests` }),
  });

/** Groups, rosters on person pages, the directory's group filter and the dashboard. */
const invalidateGroups = (client: QueryClient, churchId: string) =>
  invalidateAll(client, [keys.groups(churchId), keys.people(churchId), keys.dashboard(churchId)]);

export function useCreateGroup(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof groupDetailsInputSchema>) =>
      request(groupDetailsResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/groups`,
        data: groupDetailsInputSchema.parse(body),
      }),
    onSuccess: () => void invalidateGroups(client, churchId),
  });
}

export function useUpdateGroup(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof groupDetailsPatchSchema>) =>
      request(groupDetailsResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/groups/${groupId}`,
        data: groupDetailsPatchSchema.parse(body),
      }),
    onSuccess: () => void invalidateGroups(client, churchId),
  });
}

export function useDeleteGroup(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/groups/${groupId}` }),
    onSuccess: (_data, groupId) => {
      client.removeQueries({ queryKey: keys.group(churchId, groupId) });
      // Events, attendance and announcements of the group are gone too.
      void client.invalidateQueries({ queryKey: churchScope(churchId) });
    },
  });
}

export function useAddGroupMembers(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof addGroupMembersBodySchema>) =>
      request(groupDetailsResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/groups/${groupId}/members`,
        data: addGroupMembersBodySchema.parse(body),
      }),
    onSuccess: () => void invalidateGroups(client, churchId),
  });
}

export function useRemoveGroupMember(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) =>
      request(okSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/groups/${groupId}/members/${personId}`,
      }),
    onSuccess: () => void invalidateGroups(client, churchId),
  });
}

/** Leader changes also change the caller's own access when they appoint themselves. */
const invalidateLeaders = (client: QueryClient, churchId: string) =>
  invalidateAll(client, [
    keys.groups(churchId),
    peopleKeys.me(churchId),
    keys.dashboard(churchId),
    churchKeys.detail(churchId),
  ]);

export function useAddGroupLeader(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof groupLeaderBodySchema>) =>
      request(groupDetailsResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/groups/${groupId}/leaders`,
        data: groupLeaderBodySchema.parse(body),
      }),
    onSuccess: () => void invalidateLeaders(client, churchId),
  });
}

export function useRemoveGroupLeader(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      request(groupDetailsResponseSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/groups/${groupId}/leaders/${userId}`,
      }),
    onSuccess: () => void invalidateLeaders(client, churchId),
  });
}

export function useRequestToJoin(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof groupJoinRequestInputSchema>) =>
      request(groupJoinRequestResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/groups/${groupId}/join-requests`,
        data: groupJoinRequestInputSchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.groups(churchId) }),
  });
}

export function useCancelJoinRequest(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(groupJoinRequestResponseSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/groups/${groupId}/join-requests/mine`,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.groups(churchId) }),
  });
}

export function useLeaveGroup(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(okSchema, {
        method: 'POST',
        url: `/churches/${churchId}/groups/${groupId}/leave`,
      }),
    onSuccess: () => void invalidateGroups(client, churchId),
  });
}

/**
 * Approving or declining removes the request from every list at once, and restores it if the
 * server refuses.
 */
export function useDecideJoinRequest(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      ...body
    }: z.input<typeof decideGroupJoinRequestBodySchema> & { requestId: string }) =>
      request(groupJoinRequestResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/groups/${groupId}/join-requests/${requestId}/decision`,
        data: decideGroupJoinRequestBodySchema.parse(body),
      }),
    onMutate: async ({ requestId }) => {
      const pageKey = groupQuery(churchId, groupId).queryKey;
      const inboxKey = joinRequestsQuery(churchId).queryKey;
      await Promise.all([
        client.cancelQueries({ queryKey: pageKey }),
        client.cancelQueries({ queryKey: inboxKey }),
      ]);
      const page = client.getQueryData(pageKey);
      const inbox = client.getQueryData(inboxKey);
      client.setQueryData(pageKey, (old) =>
        old
          ? {
              ...old,
              joinRequests: old.joinRequests.filter((item) => item.id !== requestId),
              group: {
                ...old.group,
                pendingRequestCount: Math.max(0, old.group.pendingRequestCount - 1),
              },
            }
          : old,
      );
      client.setQueryData(inboxKey, (old) =>
        old ? { items: old.items.filter((item) => item.id !== requestId) } : old,
      );
      return () => {
        client.setQueryData(pageKey, page);
        client.setQueryData(inboxKey, inbox);
      };
    },
    onError: (_error, _variables, rollback) => rollback?.(),
    onSettled: () =>
      void invalidateAll(client, [
        keys.groups(churchId),
        keys.people(churchId),
        peopleKeys.me(churchId),
        keys.dashboard(churchId),
      ]),
  });
}
