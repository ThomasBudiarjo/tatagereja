import {
  dashboardPreferencesInputSchema,
  dashboardPreferencesResponseSchema,
  dashboardSchema,
  orderHomeWidgets,
  type Dashboard,
  type DashboardPreferencesInput,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { getErrorMessage, request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';
import { optimistic } from '@/lib/use-mutation-toast';

/*
 * The personalised home. One query feeds every widget; the actions taken from the home screen
 * (marking a notification read, ticking a task off, saving the layout) update it at once and
 * refresh the module that owns the data. They are quick taps, often several in a row, so each
 * one runs (none is dropped while another is pending), a failure is undone and reported here,
 * and the refresh waits for the last write so it never overwrites one still in flight.
 */

const homeWriteKey = (churchId: string) => [...keys.dashboard(churchId), 'write'] as const;

/** Refreshes after the last pending home write has settled. */
const refreshWhenIdle = (client: QueryClient, churchId: string, refresh: () => Promise<unknown>) =>
  client.isMutating({ mutationKey: homeWriteKey(churchId) }) > 1 ? undefined : refresh();

const rollBack = (error: unknown, rollback: (() => void) | undefined) => {
  rollback?.();
  toast.error(getErrorMessage(error));
};

export const dashboardQuery = (churchId: string) =>
  queryOptions({
    queryKey: keys.dashboard(churchId),
    queryFn: () => request(dashboardSchema, { url: `/churches/${churchId}/dashboard` }),
  });

const refreshNotifications = (client: QueryClient) =>
  client.invalidateQueries({
    predicate: (query) => query.queryKey.some((part) => part === 'notifications'),
  });

export function useSaveDashboardPreferences(churchId: string) {
  const client = useQueryClient();
  const key = keys.dashboard(churchId);
  return useMutation({
    mutationKey: homeWriteKey(churchId),
    mutationFn: (body: DashboardPreferencesInput) =>
      request(dashboardPreferencesResponseSchema, {
        method: 'PUT',
        url: `/churches/${churchId}/dashboard/preferences`,
        data: dashboardPreferencesInputSchema.parse(body),
      }),
    onMutate: (body) =>
      optimistic<Dashboard>(client, key, (old) =>
        old
          ? {
              ...old,
              preferences: body,
              widgets: orderHomeWidgets(old.availableWidgets, body),
            }
          : old,
      ),
    onError: (error, _body, rollback) => rollBack(error, rollback),
    onSettled: () =>
      refreshWhenIdle(client, churchId, () => client.invalidateQueries({ queryKey: key })),
  });
}

/** Marks one notification read (or all of this church's with `id: null`). */
export function useMarkNotificationRead(churchId: string) {
  const client = useQueryClient();
  const key = keys.dashboard(churchId);
  return useMutation({
    mutationKey: homeWriteKey(churchId),
    mutationFn: ({ id }: { id: string | null }) =>
      id
        ? request(z.unknown(), {
            method: 'PATCH',
            url: `/notifications/${id}`,
            data: { read: true },
          })
        : request(z.unknown(), { method: 'PATCH', url: '/notifications', data: { churchId } }),
    onMutate: ({ id }) =>
      optimistic<Dashboard>(client, key, (old) => {
        if (!old) return old;
        const items = id ? old.notifications.items.filter((item) => item.id !== id) : [];
        const removed = old.notifications.items.length - items.length;
        return {
          ...old,
          notifications: {
            items,
            unreadCount: id ? Math.max(0, old.notifications.unreadCount - removed) : 0,
          },
        };
      }),
    onError: (error, _body, rollback) => rollBack(error, rollback),
    onSettled: () =>
      refreshWhenIdle(client, churchId, () =>
        Promise.all([client.invalidateQueries({ queryKey: key }), refreshNotifications(client)]),
      ),
  });
}

/** Ticks one of my care tasks off from the home screen. */
export function useCompleteMyTask(churchId: string) {
  const client = useQueryClient();
  const key = keys.dashboard(churchId);
  return useMutation({
    mutationKey: homeWriteKey(churchId),
    mutationFn: ({ id }: { id: string }) =>
      request(z.unknown(), {
        method: 'PATCH',
        url: `/churches/${churchId}/care/tasks/${id}/status`,
        data: { status: 'done' },
      }),
    onMutate: ({ id }) =>
      optimistic<Dashboard>(client, key, (old) => {
        if (!old?.myTasks) return old;
        const task = old.myTasks.items.find((item) => item.id === id);
        return {
          ...old,
          myTasks: {
            items: old.myTasks.items.filter((item) => item.id !== id),
            openCount: Math.max(0, old.myTasks.openCount - 1),
            overdueCount: Math.max(0, old.myTasks.overdueCount - (task?.isOverdue ? 1 : 0)),
          },
        };
      }),
    onError: (error, _body, rollback) => rollBack(error, rollback),
    onSettled: () =>
      refreshWhenIdle(client, churchId, () =>
        Promise.all([
          client.invalidateQueries({ queryKey: key }),
          client.invalidateQueries({ queryKey: [...churchScope(churchId), 'care'] }),
        ]),
      ),
  });
}
