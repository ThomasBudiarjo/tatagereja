import {
  calendarFeedListSchema,
  calendarResponseSchema,
  createdCalendarFeedSchema,
  okSchema,
  type CalendarSource,
  type CreateCalendarFeedBody,
} from '@tatagereja/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { commsKeys } from '@/features/comms/keys';
import { request } from '@/lib/api';

export type CalendarParams = {
  from: string;
  to: string;
  sources: readonly CalendarSource[];
  groupId?: string;
};

export const calendarQuery = (churchId: string, params: CalendarParams) =>
  queryOptions({
    queryKey: commsKeys.calendarRange(churchId, { ...params, sources: params.sources.join(',') }),
    queryFn: () =>
      request(calendarResponseSchema, {
        url: `/churches/${churchId}/calendar`,
        params: {
          from: params.from,
          to: params.to,
          sources: params.sources.join(','),
          groupId: params.groupId || undefined,
        },
      }),
    placeholderData: keepPreviousData,
  });

export const feedsQuery = (churchId: string) =>
  queryOptions({
    queryKey: commsKeys.feeds(churchId),
    queryFn: () => request(calendarFeedListSchema, { url: `/churches/${churchId}/calendar/feeds` }),
  });

export function useCreateFeed(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CreateCalendarFeedBody>) =>
      request(createdCalendarFeedSchema, {
        method: 'POST',
        url: `/churches/${churchId}/calendar/feeds`,
        data: body,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: commsKeys.feeds(churchId) }),
  });
}

export function useRevokeFeed(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/calendar/feeds/${id}` }),
    onSuccess: () => void client.invalidateQueries({ queryKey: commsKeys.feeds(churchId) }),
  });
}
