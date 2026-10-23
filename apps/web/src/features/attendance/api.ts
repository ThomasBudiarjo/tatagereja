import {
  absenceAlertListSchema,
  absenceAlertResponseSchema,
  attendanceHistorySchema,
  attendanceSessionDetailSchema,
  attendanceSessionInputSchema,
  attendanceSessionListSchema,
  attendanceSessionUpdateSchema,
  bulkMarkAttendanceBodySchema,
  headcountSchema,
  myAttendanceHistorySchema,
  okSchema,
  resolveAbsenceAlertBodySchema,
  saveAttendanceRecordsBodySchema,
  type AbsenceQuery,
  type AttendanceListQuery,
  type AttendanceSessionDetail,
  type AttendanceStatus,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';
import { optimistic } from '@/lib/use-mutation-toast';

/*
 * Attendance queries and mutations. Every key lives under `keys.attendance(churchId)`, so one
 * invalidation refreshes sessions, absences and histories; writes also refresh the home
 * dashboard, person pages (their attendance tab) and events (their sessions), and follow-ups
 * refresh the care module and the notification inbox.
 */

export type AttendanceListParams = Partial<
  Pick<AttendanceListQuery, 'q' | 'page' | 'limit' | 'groupId' | 'eventId' | 'mode' | 'sort'>
>;

export type AbsenceParams = Partial<
  Pick<AbsenceQuery, 'threshold' | 'groupId' | 'q'> & { includeResolved: boolean }
>;

const attendanceKeys = {
  absences: (churchId: string, params: AbsenceParams) =>
    [...keys.attendance(churchId), 'absences', params] as const,
  history: (churchId: string, personId: string) =>
    [...keys.attendance(churchId), 'history', personId] as const,
};

/** Drops empty values so they neither reach the URL nor split the cache. */
const clean = <T extends Record<string, unknown>>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== '' && value !== null && value !== false,
    ),
  ) as Partial<T>;

const path = (churchId: string, rest = '') => `/churches/${churchId}/attendance${rest}`;

export const attendanceSessionsQuery = (churchId: string, params: AttendanceListParams = {}) =>
  queryOptions({
    queryKey: keys.attendanceList(churchId, clean(params)),
    queryFn: () =>
      request(attendanceSessionListSchema, {
        url: path(churchId, '/sessions'),
        params: clean(params),
      }),
  });

export const attendanceSessionQuery = (churchId: string, sessionId: string) =>
  queryOptions({
    queryKey: keys.attendanceSession(churchId, sessionId),
    queryFn: () =>
      request(attendanceSessionDetailSchema, { url: path(churchId, `/sessions/${sessionId}`) }),
  });

export const myAttendanceQuery = (churchId: string) =>
  queryOptions({
    queryKey: keys.myAttendance(churchId),
    queryFn: () => request(myAttendanceHistorySchema, { url: path(churchId, '/me') }),
  });

export const personAttendanceQuery = (churchId: string, personId: string) =>
  queryOptions({
    queryKey: attendanceKeys.history(churchId, personId),
    queryFn: () =>
      request(z.object({ history: attendanceHistorySchema }), {
        url: path(churchId, `/people/${personId}`),
      }),
  });

export const absencesQuery = (churchId: string, params: AbsenceParams) =>
  queryOptions({
    queryKey: attendanceKeys.absences(churchId, clean(params)),
    queryFn: () =>
      request(absenceAlertListSchema, { url: path(churchId, '/absences'), params: clean(params) }),
  });

/** Everything an attendance write can change. */
export const invalidateAttendance = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: keys.attendance(churchId) }),
    client.invalidateQueries({ queryKey: keys.dashboard(churchId) }),
    client.invalidateQueries({ queryKey: keys.people(churchId) }),
    client.invalidateQueries({ queryKey: keys.events(churchId) }),
  ]);

/** Stores the fresh session detail every write answers with, then refreshes the rest. */
function useSessionWrite<TVariables>(
  churchId: string,
  mutationFn: (variables: TVariables) => Promise<AttendanceSessionDetail>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      client.setQueryData(keys.attendanceSession(churchId, data.session.id), data);
      void invalidateAttendance(client, churchId);
    },
  });
}

export function useCreateAttendanceSession(churchId: string) {
  return useSessionWrite(churchId, (body: z.input<typeof attendanceSessionInputSchema>) =>
    request(attendanceSessionDetailSchema, {
      method: 'POST',
      url: path(churchId, '/sessions'),
      data: attendanceSessionInputSchema.parse(body),
    }),
  );
}

export function useUpdateAttendanceSession(churchId: string, sessionId: string) {
  return useSessionWrite(churchId, (body: z.input<typeof attendanceSessionUpdateSchema>) =>
    request(attendanceSessionDetailSchema, {
      method: 'PATCH',
      url: path(churchId, `/sessions/${sessionId}`),
      data: attendanceSessionUpdateSchema.parse(body),
    }),
  );
}

export function useSaveHeadcount(churchId: string, sessionId: string) {
  return useSessionWrite(churchId, (body: z.input<typeof headcountSchema>) =>
    request(attendanceSessionDetailSchema, {
      method: 'PUT',
      url: path(churchId, `/sessions/${sessionId}/headcount`),
      data: headcountSchema.parse(body),
    }),
  );
}

export function useDeleteAttendanceSession(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      request(okSchema, { method: 'DELETE', url: path(churchId, `/sessions/${sessionId}`) }),
    onSuccess: (_data, sessionId) => {
      client.removeQueries({ queryKey: keys.attendanceSession(churchId, sessionId) });
      void invalidateAttendance(client, churchId);
    },
  });
}

export type MarkInput = { personId: string; status: AttendanceStatus | null; note: string | null };

/**
 * Saves marks. The roster changes at once (optimistic) and rolls back when the save fails, so
 * tapping through a long sheet never waits for the network.
 */
export function useSaveAttendanceRecords(churchId: string, sessionId: string) {
  const client = useQueryClient();
  const detailKey = keys.attendanceSession(churchId, sessionId);
  return useMutation({
    mutationFn: (body: { records: MarkInput[] }) =>
      request(attendanceSessionDetailSchema, {
        method: 'PUT',
        url: path(churchId, `/sessions/${sessionId}/records`),
        data: saveAttendanceRecordsBodySchema.parse(body),
      }),
    onMutate: (body) =>
      optimistic<AttendanceSessionDetail>(client, detailKey, (old) => {
        if (!old) return old;
        const byId = new Map(body.records.map((record) => [record.personId, record]));
        return {
          ...old,
          records: old.records.map((record) => {
            const next = byId.get(record.id);
            return next ? { ...record, status: next.status, note: next.note } : record;
          }),
        };
      }),
    onError: (_error, _body, rollback) => rollback?.(),
    onSuccess: (data) => client.setQueryData(detailKey, data),
    onSettled: () => void invalidateAttendance(client, churchId),
  });
}

const bulkResultSchema = attendanceSessionDetailSchema.extend({ changed: z.number().int() });

export function useBulkMarkAttendance(churchId: string, sessionId: string) {
  const client = useQueryClient();
  const detailKey = keys.attendanceSession(churchId, sessionId);
  return useMutation({
    mutationFn: (body: z.input<typeof bulkMarkAttendanceBodySchema>) =>
      request(bulkResultSchema, {
        method: 'POST',
        url: path(churchId, `/sessions/${sessionId}/bulk`),
        data: bulkMarkAttendanceBodySchema.parse(body),
      }),
    onMutate: (body) =>
      optimistic<AttendanceSessionDetail>(client, detailKey, (old) =>
        old
          ? {
              ...old,
              records: old.records.map((record) =>
                (body.personIds && !body.personIds.includes(record.id)) ||
                (body.onlyUnmarked && record.status)
                  ? record
                  : { ...record, status: body.status },
              ),
            }
          : old,
      ),
    onError: (_error, _body, rollback) => rollback?.(),
    onSuccess: (data) => {
      const { changed: _changed, ...detail } = data;
      client.setQueryData(detailKey, detail);
    },
    onSettled: () => void invalidateAttendance(client, churchId),
  });
}

export function useResolveAbsence(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      personId,
      ...body
    }: z.input<typeof resolveAbsenceAlertBodySchema> & { personId: string }) =>
      request(absenceAlertResponseSchema, {
        method: 'POST',
        url: path(churchId, `/absences/${personId}`),
        data: resolveAbsenceAlertBodySchema.parse(body),
      }),
    onSuccess: () =>
      Promise.all([
        invalidateAttendance(client, churchId),
        client.invalidateQueries({ queryKey: [...churchScope(churchId), 'care'] }),
        client.invalidateQueries({
          predicate: (query) => query.queryKey.some((part) => part === 'notifications'),
        }),
      ]),
  });
}
