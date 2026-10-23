import {
  bulletinDetailSchema,
  bulletinListSchema,
  bulletinResponseSchema,
  bulletinSourcesSchema,
  okSchema,
  type BulletinInput,
  type BulletinListQuery,
} from '@tatagereja/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { commsKeys, invalidateNotifications } from '@/features/comms/keys';
import { request } from '@/lib/api';

export type BulletinListParams = Partial<
  Pick<BulletinListQuery, 'q' | 'page' | 'limit' | 'status'>
>;

const at = (churchId: string, path = '') => `/churches/${churchId}/bulletins${path}`;

export const bulletinsQuery = (churchId: string, params: BulletinListParams = {}) =>
  queryOptions({
    queryKey: commsKeys.bulletinList(churchId, params),
    queryFn: () => request(bulletinListSchema, { url: at(churchId), params }),
    placeholderData: keepPreviousData,
  });

export const bulletinQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: commsKeys.bulletin(churchId, id),
    queryFn: () => request(bulletinDetailSchema, { url: at(churchId, `/${id}`) }),
  });

export const bulletinSourcesQuery = (churchId: string, issueDate: string) =>
  queryOptions({
    queryKey: commsKeys.bulletinSources(churchId, issueDate),
    queryFn: () =>
      request(bulletinSourcesSchema, { url: at(churchId, '/sources'), params: { issueDate } }),
    placeholderData: keepPreviousData,
  });

const invalidate = (client: ReturnType<typeof useQueryClient>, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: commsKeys.bulletins(churchId) }),
    invalidateNotifications(client),
  ]);

export function useSaveBulletin(churchId: string, id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: BulletinInput) =>
      request(bulletinResponseSchema, {
        method: id ? 'PATCH' : 'POST',
        url: at(churchId, id ? `/${id}` : ''),
        data: body,
      }),
    onSuccess: () => void invalidate(client, churchId),
  });
}

export function usePublishBulletin(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      request(bulletinResponseSchema, {
        method: 'POST',
        url: at(churchId, `/${id}/${publish ? 'publish' : 'unpublish'}`),
      }),
    onSuccess: () => void invalidate(client, churchId),
  });
}

export function useDuplicateBulletin(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(bulletinResponseSchema, { method: 'POST', url: at(churchId, `/${id}/duplicate`) }),
    onSuccess: () => void invalidate(client, churchId),
  });
}

export function useDeleteBulletin(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: at(churchId, `/${id}`) }),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: commsKeys.bulletin(churchId, id) });
      void invalidate(client, churchId);
    },
  });
}
