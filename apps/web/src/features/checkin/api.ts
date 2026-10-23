import {
  authorizedPickupInputSchema,
  authorizedPickupResponseSchema,
  checkInBodySchema,
  checkInResultSchema,
  checkinChildDetailSchema,
  checkinChildListSchema,
  checkinChildResponseSchema,
  checkinClassInputSchema,
  checkinClassListSchema,
  checkinClassResponseSchema,
  checkinDetailSchema,
  checkinHouseholdListSchema,
  checkinLabelListSchema,
  checkinListSchema,
  checkinMeSchema,
  checkinOverviewSchema,
  checkinResponseSchema,
  checkinSessionDetailSchema,
  checkinSessionInputSchema,
  checkinSessionListSchema,
  checkinSessionResponseSchema,
  checkinSettingsResponseSchema,
  checkinSettingsSchema,
  checkOutBodySchema,
  classRosterSchema,
  childAlertInputSchema,
  childAlertResponseSchema,
  childAttendanceSchema,
  childProfileInputSchema,
  newCheckinChildInputSchema,
  okSchema,
  overrideCheckOutBodySchema,
  setClassTeachersBodySchema,
  type CheckinChildDetail,
  type CheckinChildListQuery,
  type CheckinListQuery,
  type CheckinSessionListQuery,
  type ChildAlert,
} from '@tatagereja/shared';
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';
import { optimistic } from '@/lib/use-mutation-toast';

/** Query keys of the checkin module, all below `['church', id, 'checkin']`. */
export const checkinKeys = {
  all: (churchId: string) => [...churchScope(churchId), 'checkin'] as const,
  overview: (churchId: string) => [...checkinKeys.all(churchId), 'overview'] as const,
  me: (churchId: string) => [...checkinKeys.all(churchId), 'me'] as const,
  settings: (churchId: string) => [...checkinKeys.all(churchId), 'settings'] as const,
  classes: (churchId: string, includeInactive = true) =>
    [...checkinKeys.all(churchId), 'classes', { includeInactive }] as const,
  sessions: (churchId: string) => [...checkinKeys.all(churchId), 'sessions'] as const,
  sessionList: (churchId: string, params: Record<string, unknown>) =>
    [...checkinKeys.sessions(churchId), 'list', params] as const,
  session: (churchId: string, id: string) =>
    [...checkinKeys.sessions(churchId), 'detail', id] as const,
  sessionCheckins: (churchId: string, id: string, params: Record<string, unknown>) =>
    [...checkinKeys.sessions(churchId), 'checkins', id, params] as const,
  roster: (churchId: string, sessionId: string, classId: string) =>
    [...checkinKeys.sessions(churchId), 'roster', sessionId, classId] as const,
  checkin: (churchId: string, id: string) => [...checkinKeys.all(churchId), 'checkin', id] as const,
  labels: (churchId: string, ids: readonly string[]) =>
    [...checkinKeys.all(churchId), 'labels', ids.join(',')] as const,
  households: (churchId: string, q: string, sessionId: string | null) =>
    [...checkinKeys.all(churchId), 'households', q, sessionId] as const,
  children: (churchId: string) => [...checkinKeys.all(churchId), 'children'] as const,
  childList: (churchId: string, params: Record<string, unknown>) =>
    [...checkinKeys.children(churchId), 'list', params] as const,
  child: (churchId: string, id: string) =>
    [...checkinKeys.children(churchId), 'detail', id] as const,
  childAttendance: (churchId: string, id: string, page: number) =>
    [...checkinKeys.children(churchId), 'attendance', id, page] as const,
};

/**
 * Check-in data is closely linked (a check-in moves the overview, the session counts, the
 * roster, the guardian's card and the child's history), so writes refresh the whole module and
 * the home dashboard. Only mounted queries refetch.
 */
export const invalidateCheckin = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: checkinKeys.all(churchId) }),
    client.invalidateQueries({ queryKey: keys.dashboard(churchId) }),
  ]);

const at = (churchId: string, path = '') => `/churches/${churchId}/checkin${path}`;

/** Live screens refresh on their own while volunteers keep them open. */
export const LIVE_REFRESH_MS = 15_000;

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export const overviewQuery = (churchId: string) =>
  queryOptions({
    queryKey: checkinKeys.overview(churchId),
    queryFn: () => request(checkinOverviewSchema, { url: at(churchId, '/overview') }),
    refetchInterval: LIVE_REFRESH_MS * 2,
  });

export const checkinMeQuery = (churchId: string) =>
  queryOptions({
    queryKey: checkinKeys.me(churchId),
    queryFn: () => request(checkinMeSchema, { url: at(churchId, '/me') }),
    refetchInterval: LIVE_REFRESH_MS * 2,
  });

export const settingsQuery = (churchId: string) =>
  queryOptions({
    queryKey: checkinKeys.settings(churchId),
    queryFn: () => request(checkinSettingsResponseSchema, { url: at(churchId, '/settings') }),
    staleTime: 5 * 60_000,
  });

export const classesQuery = (churchId: string, includeInactive = true) =>
  queryOptions({
    queryKey: checkinKeys.classes(churchId, includeInactive),
    queryFn: () =>
      request(checkinClassListSchema, {
        url: at(churchId, '/classes'),
        params: { includeInactive: includeInactive ? 'true' : undefined },
      }),
    staleTime: 60_000,
  });

export type SessionListParams = Partial<CheckinSessionListQuery>;

export const sessionsQuery = (churchId: string, params: SessionListParams = {}) =>
  queryOptions({
    queryKey: checkinKeys.sessionList(churchId, params),
    queryFn: () => request(checkinSessionListSchema, { url: at(churchId, '/sessions'), params }),
    placeholderData: keepPreviousData,
  });

export const sessionQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: checkinKeys.session(churchId, id),
    queryFn: () => request(checkinSessionDetailSchema, { url: at(churchId, `/sessions/${id}`) }),
    refetchInterval: LIVE_REFRESH_MS,
  });

export type SessionCheckinParams = Partial<CheckinListQuery>;

export const sessionCheckinsQuery = (
  churchId: string,
  id: string,
  params: SessionCheckinParams = {},
) =>
  queryOptions({
    queryKey: checkinKeys.sessionCheckins(churchId, id, params),
    queryFn: () =>
      request(checkinListSchema, { url: at(churchId, `/sessions/${id}/checkins`), params }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });

export const rosterQuery = (churchId: string, sessionId: string, classId: string) =>
  queryOptions({
    queryKey: checkinKeys.roster(churchId, sessionId, classId),
    queryFn: () =>
      request(classRosterSchema, {
        url: at(churchId, `/sessions/${sessionId}/classes/${classId}/roster`),
      }),
    refetchInterval: LIVE_REFRESH_MS,
  });

export const checkinQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: checkinKeys.checkin(churchId, id),
    queryFn: () => request(checkinDetailSchema, { url: at(churchId, `/checkins/${id}`) }),
  });

/**
 * Labels carry the security codes. Loading them marks the check-ins as printed (and audits a
 * reprint), so the result is kept for the page's lifetime instead of being refetched.
 */
export const labelsQuery = (churchId: string, ids: readonly string[]) =>
  queryOptions({
    queryKey: checkinKeys.labels(churchId, ids),
    queryFn: () =>
      request(checkinLabelListSchema, {
        method: 'POST',
        url: at(churchId, '/checkins/labels'),
        data: { ids },
      }),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

export const householdsQuery = (churchId: string, q: string, sessionId: string | null) =>
  queryOptions({
    queryKey: checkinKeys.households(churchId, q, sessionId),
    queryFn: () =>
      request(checkinHouseholdListSchema, {
        url: at(churchId, '/households'),
        params: { q, sessionId: sessionId ?? undefined },
      }),
    placeholderData: keepPreviousData,
  });

export type ChildListParams = Partial<CheckinChildListQuery>;

export const childrenQuery = (churchId: string, params: ChildListParams = {}) =>
  queryOptions({
    queryKey: checkinKeys.childList(churchId, params),
    queryFn: () =>
      request(checkinChildListSchema, {
        url: at(churchId, '/children'),
        params: { ...params, alerts: params.alerts ? 'true' : undefined },
      }),
    placeholderData: keepPreviousData,
  });

export const childQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: checkinKeys.child(churchId, id),
    queryFn: () => request(checkinChildDetailSchema, { url: at(churchId, `/children/${id}`) }),
  });

export const childAttendanceQuery = (churchId: string, id: string, page = 1) =>
  queryOptions({
    queryKey: checkinKeys.childAttendance(churchId, id, page),
    queryFn: () =>
      request(childAttendanceSchema, {
        url: at(churchId, `/children/${id}/attendance`),
        params: { page, limit: 10 },
      }),
    placeholderData: keepPreviousData,
  });

// ---------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------

/** A mutation that refreshes the checkin module (and `extra` keys) when it succeeds. */
function useCheckinMutation<TVariables, TData>(
  churchId: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
  extra: (churchId: string) => readonly (readonly unknown[])[] = () => [],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        invalidateCheckin(client, churchId),
        ...extra(churchId).map((queryKey) => client.invalidateQueries({ queryKey })),
      ]),
  });
}

export const useSaveSettings = (churchId: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof checkinSettingsSchema>) =>
    request(checkinSettingsResponseSchema, {
      method: 'PUT',
      url: at(churchId, '/settings'),
      data: checkinSettingsSchema.parse(body),
    }),
  );

export const useSaveClass = (churchId: string, id?: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof checkinClassInputSchema>) =>
    request(checkinClassResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: at(churchId, id ? `/classes/${id}` : '/classes'),
      data: checkinClassInputSchema.parse(body),
    }),
  );

const defaultsResultSchema = checkinClassListSchema.extend({ created: z.number().int() });

export const useCreateDefaultClasses = (churchId: string) =>
  useCheckinMutation(churchId, () =>
    request(defaultsResultSchema, { method: 'POST', url: at(churchId, '/classes/defaults') }),
  );

export const useDeleteClass = (churchId: string) =>
  useCheckinMutation(churchId, (id: string) =>
    request(okSchema, { method: 'DELETE', url: at(churchId, `/classes/${id}`) }),
  );

const teachersResultSchema = checkinClassResponseSchema.extend({ added: z.array(z.string()) });

export const useSetTeachers = (churchId: string, classId: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof setClassTeachersBodySchema>) =>
    request(teachersResultSchema, {
      method: 'PUT',
      url: at(churchId, `/classes/${classId}/teachers`),
      data: setClassTeachersBodySchema.parse(body),
    }),
  );

export const useSaveSession = (churchId: string, id?: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof checkinSessionInputSchema>) =>
    request(checkinSessionResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: at(churchId, id ? `/sessions/${id}` : '/sessions'),
      data: checkinSessionInputSchema.parse(body),
    }),
  );

/** Closing copies the children into attendance, so attendance screens refresh too. */
export const useSetSessionOpen = (churchId: string, id: string) =>
  useCheckinMutation(
    churchId,
    (open: boolean) =>
      request(checkinSessionResponseSchema, {
        method: 'POST',
        url: at(churchId, `/sessions/${id}/${open ? 'reopen' : 'close'}`),
      }),
    (church) => [keys.attendance(church)],
  );

export const useDeleteSession = (churchId: string) =>
  useCheckinMutation(churchId, (id: string) =>
    request(okSchema, { method: 'DELETE', url: at(churchId, `/sessions/${id}`) }),
  );

export const useCheckIn = (churchId: string, sessionId: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof checkInBodySchema>) =>
    request(checkInResultSchema, {
      method: 'POST',
      url: at(churchId, `/sessions/${sessionId}/checkins`),
      data: checkInBodySchema.parse(body),
    }),
  );

export const useCheckOut = (churchId: string, id: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof checkOutBodySchema>) =>
    request(checkinResponseSchema, {
      method: 'POST',
      url: at(churchId, `/checkins/${id}/checkout`),
      data: checkOutBodySchema.parse(body),
    }),
  );

export const useOverrideCheckOut = (churchId: string, id: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof overrideCheckOutBodySchema>) =>
    request(checkinResponseSchema, {
      method: 'POST',
      url: at(churchId, `/checkins/${id}/override`),
      data: overrideCheckOutBodySchema.parse(body),
    }),
  );

export const useDeleteCheckin = (churchId: string) =>
  useCheckinMutation(churchId, (id: string) =>
    request(okSchema, { method: 'DELETE', url: at(churchId, `/checkins/${id}`) }),
  );

/** A first-time child is a new person in the directory too. */
export const useRegisterChild = (churchId: string) =>
  useCheckinMutation(
    churchId,
    (body: z.input<typeof newCheckinChildInputSchema>) =>
      request(checkinChildResponseSchema, {
        method: 'POST',
        url: at(churchId, '/children'),
        data: newCheckinChildInputSchema.parse(body),
      }),
    (church) => [keys.people(church)],
  );

export const useSetChildProfile = (churchId: string, personId: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof childProfileInputSchema>) =>
    request(checkinChildResponseSchema, {
      method: 'PUT',
      url: at(churchId, `/children/${personId}/profile`),
      data: childProfileInputSchema.parse(body),
    }),
  );

export const useSaveAlert = (churchId: string, personId: string, id?: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof childAlertInputSchema>) =>
    request(childAlertResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: at(churchId, `/children/${personId}/alerts${id ? `/${id}` : ''}`),
      data: childAlertInputSchema.parse(body),
    }),
  );

/** Switching an alert on or off feels instant on the child page; it rolls back on error. */
export const useToggleAlert = (churchId: string, personId: string) => {
  const client = useQueryClient();
  const detailKey = checkinKeys.child(churchId, personId);
  return useMutation({
    mutationFn: (alert: ChildAlert) =>
      request(childAlertResponseSchema, {
        method: 'PATCH',
        url: at(churchId, `/children/${personId}/alerts/${alert.id}`),
        data: {
          kind: alert.kind,
          severity: alert.severity,
          description: alert.description,
          isActive: !alert.isActive,
        },
      }),
    onMutate: (alert) =>
      optimistic<CheckinChildDetail>(client, detailKey, (old) =>
        old
          ? {
              ...old,
              alerts: old.alerts.map((item) =>
                item.id === alert.id ? { ...item, isActive: !alert.isActive } : item,
              ),
            }
          : old,
      ),
    onError: (_error, _alert, rollback) => rollback?.(),
    onSettled: () => invalidateCheckin(client, churchId),
  });
};

export const useDeleteAlert = (churchId: string, personId: string) =>
  useCheckinMutation(churchId, (id: string) =>
    request(okSchema, {
      method: 'DELETE',
      url: at(churchId, `/children/${personId}/alerts/${id}`),
    }),
  );

export const useSavePickup = (churchId: string, personId: string, id?: string) =>
  useCheckinMutation(churchId, (body: z.input<typeof authorizedPickupInputSchema>) =>
    request(authorizedPickupResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: at(churchId, `/children/${personId}/pickups${id ? `/${id}` : ''}`),
      data: authorizedPickupInputSchema.parse(body),
    }),
  );

export const useDeletePickup = (churchId: string, personId: string) =>
  useCheckinMutation(churchId, (id: string) =>
    request(okSchema, {
      method: 'DELETE',
      url: at(churchId, `/children/${personId}/pickups/${id}`),
    }),
  );
