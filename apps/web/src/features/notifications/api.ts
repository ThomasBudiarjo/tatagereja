import {
  NOTIFICATION_TYPE_DEFINITIONS,
  notificationListSchema,
  notificationPreferenceListSchema,
  notificationResponseSchema,
  okSchema,
  unreadCountSchema,
  type Notification,
  type NotificationList,
  type NotificationPreferenceList,
  type NotificationType,
  type UnreadCount,
} from '@tatagereja/shared';
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { request } from '@/lib/api';
import { optimistic } from '@/lib/use-mutation-toast';
import { commsKeys } from '@/features/comms/keys';

const PAGE_SIZE = 30;
/** The bell polls the unread count once a minute and again when the window regains focus. */
export const UNREAD_POLL_MS = 60_000;

export type InboxParams = { unread?: boolean; churchId?: string };

export const unreadCountQuery = (churchId?: string) =>
  queryOptions({
    queryKey: commsKeys.unreadCount(churchId),
    queryFn: () =>
      request(unreadCountSchema, { url: '/notifications/unread-count', params: { churchId } }),
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

export const inboxQuery = (params: InboxParams) =>
  infiniteQueryOptions({
    queryKey: commsKeys.notificationList({ ...params, infinite: true }),
    queryFn: ({ pageParam }) =>
      request(notificationListSchema, {
        url: '/notifications',
        params: {
          churchId: params.churchId,
          unread: params.unread ? 'true' : undefined,
          page: pageParam,
          limit: PAGE_SIZE,
        },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    refetchOnWindowFocus: true,
  });

/** The newest few, for the bell. */
export const latestQuery = () =>
  queryOptions({
    queryKey: commsKeys.notificationList({ latest: true }),
    queryFn: () => request(notificationListSchema, { url: '/notifications', params: { limit: 8 } }),
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
  });

export const preferencesQuery = () =>
  queryOptions({
    queryKey: commsKeys.preferences(),
    queryFn: () => request(notificationPreferenceListSchema, { url: '/notifications/preferences' }),
  });

type Inbox = InfiniteData<NotificationList, number>;

/** Applies a change to every cached list and count, returning one rollback for all of them. */
async function patchCaches(
  client: QueryClient,
  update: (item: Notification) => Notification,
  countDelta: (old: number) => number,
): Promise<() => void> {
  await client.cancelQueries({ queryKey: commsKeys.notifications() });
  const lists = client.getQueriesData<Inbox | NotificationList>({
    queryKey: [...commsKeys.notifications(), 'list'],
  });
  const counts = client.getQueriesData<UnreadCount>({
    queryKey: [...commsKeys.notifications(), 'unread'],
  });
  for (const [key, data] of lists) {
    if (!data) continue;
    if ('pages' in data) {
      client.setQueryData<Inbox>(key, {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map(update),
          unreadCount: countDelta(page.unreadCount),
        })),
      });
    } else {
      client.setQueryData<NotificationList>(key, {
        ...data,
        items: data.items.map(update),
        unreadCount: countDelta(data.unreadCount),
      });
    }
  }
  for (const [key, data] of counts) {
    if (data) client.setQueryData<UnreadCount>(key, { count: countDelta(data.count) });
  }
  return () => {
    for (const [key, data] of [...lists, ...counts]) client.setQueryData(key, data);
  };
}

/** Marks one notification read or unread at once; the server confirms in the background. */
export function useMarkNotification() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      request(notificationResponseSchema, {
        method: 'PATCH',
        url: `/notifications/${id}`,
        data: { read },
      }),
    onMutate: ({ id, read }) =>
      patchCaches(
        client,
        (item) =>
          item.id === id
            ? { ...item, readAt: read ? (item.readAt ?? new Date().toISOString()) : null }
            : item,
        (old) => Math.max(0, old + (read ? -1 : 1)),
      ),
    onError: (_error, _variables, rollback) => rollback?.(),
    onSettled: () => void client.invalidateQueries({ queryKey: commsKeys.notifications() }),
  });
}

export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (churchId?: string) =>
      request(unreadCountSchema, {
        method: 'PATCH',
        url: '/notifications',
        data: { read: true, churchId },
      }),
    onMutate: () =>
      patchCaches(
        client,
        (item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }),
        () => 0,
      ),
    onError: (_error, _variables, rollback) => rollback?.(),
    onSettled: () => void client.invalidateQueries({ queryKey: commsKeys.notifications() }),
  });
}

export type PreferenceChange = { type: NotificationType; inApp: boolean };

export function useUpdatePreference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ type, inApp }: PreferenceChange) =>
      request(okSchema, {
        method: 'PUT',
        url: '/notifications/preferences',
        data: { items: [{ type, inApp, email: false }] },
      }),
    onMutate: ({ type, inApp }) =>
      optimistic<NotificationPreferenceList>(client, commsKeys.preferences(), (old) =>
        old
          ? { items: old.items.map((item) => (item.type === type ? { ...item, inApp } : item)) }
          : old,
      ),
    onError: (_error, _variables, rollback) => rollback?.(),
    onSettled: () => void client.invalidateQueries({ queryKey: commsKeys.preferences() }),
  });
}

/** The module and labels of a stored type; unknown types (from newer servers) get none. */
export const notificationDefinition = (type: string) =>
  NOTIFICATION_TYPE_DEFINITIONS.find((definition) => definition.type === type);
