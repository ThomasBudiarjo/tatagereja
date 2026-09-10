import {
  acceptInvitationResponseSchema,
  createInvitationBodySchema,
  invitationListSchema,
  invitationResponseSchema,
  okSchema,
  publicInvitationSchema,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { request } from '@/lib/api';
import { churchKeys } from '@/features/churches/api';
import { useUiStore } from '@/stores/ui';

export const publicInvitationQuery = (token: string) =>
  queryOptions({
    queryKey: ['invitation', token],
    queryFn: () =>
      request(publicInvitationSchema, { url: `/invitations/${encodeURIComponent(token)}` }),
    retry: false,
  });

export const invitationsQuery = (churchId: string) =>
  queryOptions({
    queryKey: churchKeys.invitations(churchId),
    queryFn: () => request(invitationListSchema, { url: `/churches/${churchId}/invitations` }),
  });

export function useAcceptInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      request(acceptInvitationResponseSchema, {
        method: 'POST',
        url: `/invitations/${encodeURIComponent(token)}/accept`,
      }),
    onSuccess: (result) => {
      useUiStore.getState().setLastChurchId(result.churchId);
      void client.invalidateQueries({ queryKey: churchKeys.all });
    },
  });
}

export function useCreateInvitation(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createInvitationBodySchema>) =>
      request(invitationResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/invitations`,
        data: createInvitationBodySchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchKeys.invitations(churchId) }),
  });
}

export function useRevokeInvitation(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/invitations/${id}` }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchKeys.invitations(churchId) }),
  });
}
