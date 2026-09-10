import {
  announcementDetailSchema,
  announcementInputSchema,
  announcementListSchema,
  announcementResponseSchema,
  okSchema,
  type AnnouncementListQuery,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { request } from '@/lib/api';
import { keys } from '@/lib/keys';

export type AnnouncementListParams = Partial<
  Pick<AnnouncementListQuery, 'q' | 'page' | 'limit' | 'status' | 'groupId'>
>;

export const announcementsQuery = (churchId: string, params: AnnouncementListParams = {}) =>
  queryOptions({
    queryKey: keys.announcementList(churchId, params),
    queryFn: () =>
      request(announcementListSchema, { url: `/churches/${churchId}/announcements`, params }),
  });

export const announcementQuery = (churchId: string, announcementId: string) =>
  queryOptions({
    queryKey: keys.announcement(churchId, announcementId),
    queryFn: () =>
      request(announcementDetailSchema, {
        url: `/churches/${churchId}/announcements/${announcementId}`,
      }),
  });

const invalidate = (churchId: string) => ({ queryKey: keys.announcements(churchId) });

export function useCreateAnnouncement(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof announcementInputSchema>) =>
      request(announcementResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/announcements`,
        data: announcementInputSchema.parse(body),
      }),
    onSuccess: () => {
      void client.invalidateQueries(invalidate(churchId));
      void client.invalidateQueries({ queryKey: keys.dashboard(churchId) });
    },
  });
}

export function useUpdateAnnouncement(churchId: string, announcementId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof announcementInputSchema>) =>
      request(announcementResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/announcements/${announcementId}`,
        data: announcementInputSchema.parse(body),
      }),
    onSuccess: () => {
      void client.invalidateQueries(invalidate(churchId));
      void client.invalidateQueries({ queryKey: keys.dashboard(churchId) });
    },
  });
}

export function useDeleteAnnouncement(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: string) =>
      request(okSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/announcements/${announcementId}`,
      }),
    onSuccess: () => {
      void client.invalidateQueries(invalidate(churchId));
      void client.invalidateQueries({ queryKey: keys.dashboard(churchId) });
    },
  });
}
