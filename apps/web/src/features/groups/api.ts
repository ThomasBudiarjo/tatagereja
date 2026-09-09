import {
  addGroupMembersBodySchema,
  groupDetailSchema,
  groupInputSchema,
  groupListSchema,
  groupLeaderBodySchema,
  groupResponseSchema,
  okSchema,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { request } from '@/lib/api';
import { keys } from '@/lib/keys';

export type GroupListParams = { q?: string; includeInactive?: boolean };

export const groupsQuery = (churchId: string, params: GroupListParams = {}) =>
  queryOptions({
    queryKey: keys.groupList(churchId, params),
    queryFn: () =>
      request(groupListSchema, {
        url: `/churches/${churchId}/groups`,
        params: { q: params.q, includeInactive: params.includeInactive ? 'true' : 'false' },
      }),
  });

export const groupQuery = (churchId: string, groupId: string) =>
  queryOptions({
    queryKey: keys.group(churchId, groupId),
    queryFn: () => request(groupDetailSchema, { url: `/churches/${churchId}/groups/${groupId}` }),
  });

const invalidateGroups = (churchId: string) => ({ queryKey: keys.groups(churchId) });

export function useCreateGroup(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof groupInputSchema>) =>
      request(groupResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/groups`,
        data: groupInputSchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries(invalidateGroups(churchId)),
  });
}

export function useUpdateGroup(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof groupInputSchema>) =>
      request(groupResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/groups/${groupId}`,
        data: groupInputSchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries(invalidateGroups(churchId)),
  });
}

export function useDeleteGroup(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/groups/${groupId}` }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['church', churchId] }),
  });
}

export function useAddGroupMembers(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof addGroupMembersBodySchema>) =>
      request(groupResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/groups/${groupId}/members`,
        data: addGroupMembersBodySchema.parse(body),
      }),
    onSuccess: () => {
      void client.invalidateQueries(invalidateGroups(churchId));
      void client.invalidateQueries({ queryKey: keys.people(churchId) });
    },
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
    onSuccess: () => {
      void client.invalidateQueries(invalidateGroups(churchId));
      void client.invalidateQueries({ queryKey: keys.people(churchId) });
    },
  });
}

export function useAddGroupLeader(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof groupLeaderBodySchema>) =>
      request(groupResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/groups/${groupId}/leaders`,
        data: groupLeaderBodySchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['church', churchId] }),
  });
}

export function useRemoveGroupLeader(churchId: string, groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      request(groupResponseSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/groups/${groupId}/leaders/${userId}`,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['church', churchId] }),
  });
}
