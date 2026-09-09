import {
  eventDetailSchema,
  eventInputSchema,
  eventListSchema,
  eventResponseSchema,
  okSchema,
  setParticipantsBodySchema,
  updateParticipantBodySchema,
  type EventListQuery,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { request } from '@/lib/api';
import { keys } from '@/lib/keys';

export type EventListParams = Partial<
  Pick<EventListQuery, 'q' | 'page' | 'limit' | 'scope' | 'groupId'>
>;

export const eventsQuery = (churchId: string, params: EventListParams = {}) =>
  queryOptions({
    queryKey: keys.eventList(churchId, params),
    queryFn: () => request(eventListSchema, { url: `/churches/${churchId}/events`, params }),
  });

export const eventQuery = (churchId: string, eventId: string) =>
  queryOptions({
    queryKey: keys.event(churchId, eventId),
    queryFn: () => request(eventDetailSchema, { url: `/churches/${churchId}/events/${eventId}` }),
  });

const invalidate = (churchId: string) => ({ queryKey: keys.events(churchId) });

export function useCreateEvent(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof eventInputSchema>) =>
      request(eventResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/events`,
        data: eventInputSchema.parse(body),
      }),
    onSuccess: () => {
      void client.invalidateQueries(invalidate(churchId));
      void client.invalidateQueries({ queryKey: keys.dashboard(churchId) });
    },
  });
}

export function useUpdateEvent(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof eventInputSchema>) =>
      request(eventResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/events/${eventId}`,
        data: eventInputSchema.parse(body),
      }),
    onSuccess: () => {
      void client.invalidateQueries(invalidate(churchId));
      void client.invalidateQueries({ queryKey: keys.dashboard(churchId) });
    },
  });
}

export function useDeleteEvent(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/events/${eventId}` }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['church', churchId] }),
  });
}

export function useAddParticipants(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof setParticipantsBodySchema>) =>
      request(eventResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/events/${eventId}/participants`,
        data: setParticipantsBodySchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries(invalidate(churchId)),
  });
}

export function useUpdateParticipant(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      personId,
      status,
    }: {
      personId: string;
      status: z.input<typeof updateParticipantBodySchema>['status'];
    }) =>
      request(eventResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/events/${eventId}/participants/${personId}`,
        data: updateParticipantBodySchema.parse({ status }),
      }),
    onSuccess: () => void client.invalidateQueries(invalidate(churchId)),
  });
}

export function useRemoveParticipant(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) =>
      request(eventResponseSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/events/${eventId}/participants/${personId}`,
      }),
    onSuccess: () => void client.invalidateQueries(invalidate(churchId)),
  });
}
