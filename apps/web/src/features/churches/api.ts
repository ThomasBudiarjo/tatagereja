import {
  churchInputSchema,
  churchResponseSchema,
  churchWithAccessSchema,
  membershipListSchema,
  membershipSchema,
  myChurchesSchema,
  okSchema,
  transferOwnershipBodySchema,
  updateMembershipRoleBodySchema,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const churchKeys = {
  all: ['churches'] as const,
  mine: () => [...churchKeys.all, 'mine'] as const,
  detail: (id: string) => [...churchKeys.all, 'detail', id] as const,
  members: (id: string) => [...churchKeys.all, 'members', id] as const,
  invitations: (id: string) => [...churchKeys.all, 'invitations', id] as const,
};

export const myChurchesQuery = () =>
  queryOptions({
    queryKey: churchKeys.mine(),
    queryFn: () => request(myChurchesSchema, { url: '/churches' }),
  });

export const churchQuery = (id: string) =>
  queryOptions({
    queryKey: churchKeys.detail(id),
    queryFn: () => request(churchWithAccessSchema, { url: `/churches/${id}` }),
  });

export const membersQuery = (churchId: string) =>
  queryOptions({
    queryKey: churchKeys.members(churchId),
    queryFn: () => request(membershipListSchema, { url: `/churches/${churchId}/members` }),
  });

export function useCreateChurch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof churchInputSchema>) =>
      request(churchResponseSchema, {
        method: 'POST',
        url: '/churches',
        data: churchInputSchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchKeys.all }),
  });
}

export function useUpdateChurch(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof churchInputSchema>) =>
      request(churchResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}`,
        data: churchInputSchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchKeys.all }),
  });
}

export function useDeleteChurch(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}`, data: { password } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchKeys.all }),
  });
}

export function useUpdateMemberRole(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      role,
    }: {
      membershipId: string;
      role: 'administrator' | 'member';
    }) =>
      request(z.object({ membership: membershipSchema }), {
        method: 'PATCH',
        url: `/churches/${churchId}/members/${membershipId}`,
        data: updateMembershipRoleBodySchema.parse({ role }),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchKeys.all }),
  });
}

export function useRemoveMember(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/members/${membershipId}` }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchKeys.all }),
  });
}

export function useLeaveChurch(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request(okSchema, { method: 'POST', url: `/churches/${churchId}/leave` }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchKeys.all }),
  });
}

export function useTransferOwnership(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof transferOwnershipBodySchema>) =>
      request(churchResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/transfer-ownership`,
        data: transferOwnershipBodySchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchKeys.all }),
  });
}
