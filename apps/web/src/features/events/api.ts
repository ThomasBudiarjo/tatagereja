import {
  eventCheckInListSchema,
  eventCheckInResultSchema,
  eventDeleteResultSchema,
  type eventDetailsInputSchema,
  eventDetailsListSchema,
  eventDetailsResponseSchema,
  eventFullDetailSchema,
  eventRegistrationListSchema,
  eventRegistrationResponseSchema,
  type eventSeriesInputSchema,
  eventSeriesResponseSchema,
  okSchema,
  type EventCheckInList,
  type EventDetailsListQuery,
  type EventEditScope,
  type EventFullDetail,
  type ParticipantStatus,
} from '@tatagereja/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { commsKeys, invalidateEvents } from '@/features/comms/keys';
import { request } from '@/lib/api';
import { keys } from '@/lib/keys';
import { optimistic } from '@/lib/use-mutation-toast';

export type EventListParams = Partial<
  Pick<EventDetailsListQuery, 'q' | 'page' | 'limit' | 'scope' | 'groupId'>
> & { mine?: boolean };

const at = (churchId: string, path = '') => `/churches/${churchId}/events${path}`;

export const eventsQuery = (churchId: string, params: EventListParams = {}) =>
  queryOptions({
    queryKey: keys.eventList(churchId, params),
    queryFn: () =>
      request(eventDetailsListSchema, {
        url: at(churchId),
        params: { ...params, mine: params.mine ? 'true' : undefined },
      }),
    placeholderData: keepPreviousData,
  });

export const eventQuery = (churchId: string, eventId: string) =>
  queryOptions({
    queryKey: keys.event(churchId, eventId),
    queryFn: () => request(eventFullDetailSchema, { url: at(churchId, `/${eventId}`) }),
  });

export const registrationsQuery = (churchId: string, eventId: string) =>
  queryOptions({
    queryKey: commsKeys.registrations(churchId, eventId),
    queryFn: () =>
      request(eventRegistrationListSchema, { url: at(churchId, `/${eventId}/registrations`) }),
  });

export const checkInQuery = (churchId: string, eventId: string) =>
  queryOptions({
    queryKey: commsKeys.checkIn(churchId, eventId),
    queryFn: () => request(eventCheckInListSchema, { url: at(churchId, `/${eventId}/check-in`) }),
    refetchInterval: 30_000,
  });

export type EventFormInput = z.input<typeof eventDetailsInputSchema>;
export type SeriesFormInput = z.input<typeof eventSeriesInputSchema>;

export function useCreateEvent(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: EventFormInput) =>
      request(eventDetailsResponseSchema, { method: 'POST', url: at(churchId), data: body }),
    onSuccess: () => void invalidateEvents(client, churchId),
  });
}

export function useCreateSeries(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SeriesFormInput) =>
      request(eventSeriesResponseSchema, {
        method: 'POST',
        url: at(churchId, '/series'),
        data: body,
      }),
    onSuccess: () => void invalidateEvents(client, churchId),
  });
}

export function useUpdateEvent(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, scope }: { body: EventFormInput; scope: EventEditScope }) =>
      request(eventDetailsResponseSchema, {
        method: 'PATCH',
        url: at(churchId, `/${eventId}`),
        params: { scope },
        data: body,
      }),
    onSuccess: () => void invalidateEvents(client, churchId),
  });
}

export function useDeleteEvent(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: EventEditScope }) =>
      request(eventDeleteResultSchema, {
        method: 'DELETE',
        url: at(churchId, `/${id}`),
        params: { scope },
      }),
    onSuccess: (_data, { id }) => {
      client.removeQueries({ queryKey: keys.event(churchId, id) });
      void invalidateEvents(client, churchId);
    },
  });
}

export function useCancelEvent(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ cancel, reason }: { cancel: boolean; reason?: string }) =>
      request(eventDetailsResponseSchema, {
        method: 'POST',
        url: at(churchId, `/${eventId}/${cancel ? 'cancel' : 'restore'}`),
        data: cancel ? { reason: reason || null } : undefined,
      }),
    onSuccess: () => void invalidateEvents(client, churchId),
  });
}

/** RSVP of the caller, updated at once and rolled back if refused. */
export function useRsvp(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, status }: { personId: string; status: ParticipantStatus }) =>
      request(eventDetailsResponseSchema, {
        method: 'PATCH',
        url: at(churchId, `/${eventId}/participants/${personId}`),
        data: { status },
      }),
    onMutate: ({ status }) =>
      optimistic<EventFullDetail>(client, keys.event(churchId, eventId), (old) => {
        if (!old) return old;
        const wasGoing = old.event.myRsvp === 'going';
        const goingCount = old.event.goingCount + (status === 'going' ? 1 : 0) - (wasGoing ? 1 : 0);
        return { ...old, event: { ...old.event, myRsvp: status, goingCount } };
      }),
    onError: (_error, _variables, rollback) => rollback?.(),
    onSettled: () => void invalidateEvents(client, churchId),
  });
}

export function useAddParticipants(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (personIds: string[]) =>
      request(eventDetailsResponseSchema, {
        method: 'POST',
        url: at(churchId, `/${eventId}/participants`),
        data: { personIds, status: 'invited' },
      }),
    onSuccess: () => void invalidateEvents(client, churchId),
  });
}

export function useRemoveParticipant(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) =>
      request(eventDetailsResponseSchema, {
        method: 'DELETE',
        url: at(churchId, `/${eventId}/participants/${personId}`),
      }),
    onSuccess: () => void invalidateEvents(client, churchId),
  });
}

export function useRegister(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { personId?: string; partySize: number; note?: string | null }) =>
      request(eventRegistrationResponseSchema, {
        method: 'POST',
        url: at(churchId, `/${eventId}/registrations`),
        data: body,
      }),
    onSuccess: () => void invalidateEvents(client, churchId),
  });
}

export function useCancelRegistration(churchId: string, eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      request(eventRegistrationResponseSchema, {
        method: 'POST',
        url: at(churchId, `/${eventId}/registrations/${registrationId}/cancel`),
      }),
    onSuccess: () => void invalidateEvents(client, churchId),
  });
}

/** Marks people present at once on the check-in list; the server records attendance. */
export function useCheckIn(churchId: string, eventId: string) {
  const client = useQueryClient();
  const key = commsKeys.checkIn(churchId, eventId);
  return useMutation({
    mutationFn: ({ personIds, self = false }: { personIds: string[]; self?: boolean }) =>
      request(eventCheckInResultSchema, {
        method: 'POST',
        url: at(churchId, `/${eventId}/check-in${self ? '/me' : ''}`),
        data: { personIds },
      }),
    onMutate: ({ personIds }) =>
      optimistic<EventCheckInList>(client, key, (old) => {
        if (!old) return old;
        const now = new Date().toISOString();
        const items = old.items.map((item) =>
          personIds.includes(item.person.id)
            ? { ...item, checkedInAt: item.checkedInAt ?? now }
            : item,
        );
        return { ...old, items, checkedInCount: items.filter((item) => item.checkedInAt).length };
      }),
    onError: (_error, _variables, rollback) => rollback?.(),
    onSettled: () => void invalidateEvents(client, churchId),
  });
}

export function useUndoCheckIn(churchId: string, eventId: string) {
  const client = useQueryClient();
  const key = commsKeys.checkIn(churchId, eventId);
  return useMutation({
    mutationFn: (personId: string) =>
      request(okSchema, {
        method: 'DELETE',
        url: at(churchId, `/${eventId}/check-in/${personId}`),
      }),
    onMutate: (personId) =>
      optimistic<EventCheckInList>(client, key, (old) => {
        if (!old) return old;
        const items = old.items.map((item) =>
          item.person.id === personId ? { ...item, checkedInAt: null } : item,
        );
        return { ...old, items, checkedInCount: items.filter((item) => item.checkedInAt).length };
      }),
    onError: (_error, _variables, rollback) => rollback?.(),
    onSettled: () => void invalidateEvents(client, churchId),
  });
}
