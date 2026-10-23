import {
  announcementAudienceOptionsSchema,
  type announcementDetailsInputSchema,
  announcementDetailsListSchema,
  announcementDetailsResponseSchema,
  announcementFullDetailSchema,
  announcementReadersSchema,
  okSchema,
  type AnnouncementDetailsList,
  type AnnouncementDetailsListQuery,
  type AnnouncementFullDetail,
} from '@tatagereja/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { commsKeys, invalidateAnnouncements } from '@/features/comms/keys';
import { request } from '@/lib/api';
import { keys } from '@/lib/keys';
import { optimistic } from '@/lib/use-mutation-toast';

export type AnnouncementListParams = Partial<
  Pick<
    AnnouncementDetailsListQuery,
    'q' | 'page' | 'limit' | 'status' | 'state' | 'groupId' | 'audience'
  >
>;

const at = (churchId: string, path = '') => `/churches/${churchId}/announcements${path}`;

export const announcementsQuery = (churchId: string, params: AnnouncementListParams = {}) =>
  queryOptions({
    queryKey: keys.announcementList(churchId, params),
    queryFn: () => request(announcementDetailsListSchema, { url: at(churchId), params }),
    placeholderData: keepPreviousData,
  });

export const announcementQuery = (churchId: string, announcementId: string) =>
  queryOptions({
    queryKey: keys.announcement(churchId, announcementId),
    queryFn: () =>
      request(announcementFullDetailSchema, { url: at(churchId, `/${announcementId}`) }),
  });

export const audienceOptionsQuery = (churchId: string) =>
  queryOptions({
    queryKey: commsKeys.audienceOptions(churchId),
    queryFn: () =>
      request(announcementAudienceOptionsSchema, { url: at(churchId, '/audience-options') }),
    staleTime: 5 * 60_000,
  });

export const readersQuery = (churchId: string, announcementId: string) =>
  queryOptions({
    queryKey: commsKeys.readers(churchId, announcementId),
    queryFn: () =>
      request(announcementReadersSchema, { url: at(churchId, `/${announcementId}/readers`) }),
  });

export type AnnouncementFormInput = z.input<typeof announcementDetailsInputSchema>;

/** Creates, or updates when an id is given. */
export function useSaveAnnouncement(churchId: string, announcementId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AnnouncementFormInput) =>
      request(announcementDetailsResponseSchema, {
        method: announcementId ? 'PATCH' : 'POST',
        url: at(churchId, announcementId ? `/${announcementId}` : ''),
        data: body,
      }),
    onSuccess: () => void invalidateAnnouncements(client, churchId),
  });
}

export function useDeleteAnnouncement(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: string) =>
      request(okSchema, { method: 'DELETE', url: at(churchId, `/${announcementId}`) }),
    onSuccess: (_data, announcementId) => {
      client.removeQueries({ queryKey: keys.announcement(churchId, announcementId) });
      void invalidateAnnouncements(client, churchId);
    },
  });
}

/** Pins at once in the open detail and every cached list; rolls back if refused. */
export function usePinAnnouncement(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      request(announcementDetailsResponseSchema, {
        method: 'PUT',
        url: at(churchId, `/${id}/pin`),
        data: { pinned },
      }),
    onMutate: async ({ id, pinned }) => {
      const detail = await optimistic<AnnouncementFullDetail>(
        client,
        keys.announcement(churchId, id),
        (old) => old && { ...old, announcement: { ...old.announcement, pinned } },
      );
      const lists = client.getQueriesData<AnnouncementDetailsList>({
        queryKey: [...keys.announcements(churchId), 'list'],
      });
      for (const [key, data] of lists) {
        if (!data) continue;
        client.setQueryData<AnnouncementDetailsList>(key, {
          ...data,
          items: data.items.map((item) => (item.id === id ? { ...item, pinned } : item)),
        });
      }
      return () => {
        detail();
        for (const [key, data] of lists) client.setQueryData(key, data);
      };
    },
    onError: (_error, _variables, rollback) => rollback?.(),
    onSettled: () => void invalidateAnnouncements(client, churchId),
  });
}

/** Records that the caller opened the announcement ("seen by"). */
export function useMarkAnnouncementRead(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(announcementDetailsResponseSchema, {
        method: 'POST',
        url: at(churchId, `/${id}/read`),
      }),
    onSuccess: (data) => {
      client.setQueryData<AnnouncementFullDetail>(
        keys.announcement(churchId, data.announcement.id),
        (old) => old && { ...old, announcement: { ...old.announcement, readByMe: true } },
      );
      void client.invalidateQueries({ queryKey: [...keys.announcements(churchId), 'list'] });
    },
  });
}
