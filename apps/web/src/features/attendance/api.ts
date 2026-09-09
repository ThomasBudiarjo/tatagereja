import {
  attendanceSessionDetailSchema,
  attendanceSessionInputSchema,
  attendanceSessionListSchema,
  attendanceSessionUpdateSchema,
  myAttendanceSchema,
  okSchema,
  saveAttendanceRecordsBodySchema,
  type AttendanceListQuery,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { request } from '@/lib/api';
import { keys } from '@/lib/keys';

export type AttendanceListParams = Partial<
  Pick<AttendanceListQuery, 'q' | 'page' | 'limit' | 'groupId' | 'eventId'>
>;

export const attendanceSessionsQuery = (churchId: string, params: AttendanceListParams = {}) =>
  queryOptions({
    queryKey: keys.attendanceList(churchId, params),
    queryFn: () =>
      request(attendanceSessionListSchema, {
        url: `/churches/${churchId}/attendance/sessions`,
        params,
      }),
  });

export const attendanceSessionQuery = (churchId: string, sessionId: string) =>
  queryOptions({
    queryKey: keys.attendanceSession(churchId, sessionId),
    queryFn: () =>
      request(attendanceSessionDetailSchema, {
        url: `/churches/${churchId}/attendance/sessions/${sessionId}`,
      }),
  });

export const myAttendanceQuery = (churchId: string) =>
  queryOptions({
    queryKey: keys.myAttendance(churchId),
    queryFn: () => request(myAttendanceSchema, { url: `/churches/${churchId}/attendance/me` }),
  });

const invalidate = (churchId: string) => ({ queryKey: keys.attendance(churchId) });

export function useCreateAttendanceSession(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof attendanceSessionInputSchema>) =>
      request(attendanceSessionDetailSchema, {
        method: 'POST',
        url: `/churches/${churchId}/attendance/sessions`,
        data: attendanceSessionInputSchema.parse(body),
      }),
    onSuccess: () => {
      void client.invalidateQueries(invalidate(churchId));
      void client.invalidateQueries({ queryKey: keys.events(churchId) });
    },
  });
}

export function useUpdateAttendanceSession(churchId: string, sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof attendanceSessionUpdateSchema>) =>
      request(attendanceSessionDetailSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/attendance/sessions/${sessionId}`,
        data: attendanceSessionUpdateSchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries(invalidate(churchId)),
  });
}

export function useDeleteAttendanceSession(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      request(okSchema, {
        method: 'DELETE',
        url: `/churches/${churchId}/attendance/sessions/${sessionId}`,
      }),
    onSuccess: () => {
      void client.invalidateQueries(invalidate(churchId));
      void client.invalidateQueries({ queryKey: keys.events(churchId) });
    },
  });
}

export function useSaveAttendanceRecords(churchId: string, sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof saveAttendanceRecordsBodySchema>) =>
      request(attendanceSessionDetailSchema, {
        method: 'PUT',
        url: `/churches/${churchId}/attendance/sessions/${sessionId}/records`,
        data: saveAttendanceRecordsBodySchema.parse(body),
      }),
    onSuccess: () => {
      void client.invalidateQueries(invalidate(churchId));
      void client.invalidateQueries({ queryKey: keys.people(churchId) });
    },
  });
}
