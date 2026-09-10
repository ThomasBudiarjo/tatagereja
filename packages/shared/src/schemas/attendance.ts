import { z } from 'zod';
import { ATTENDANCE_STATUSES, LIMITS } from '../constants';
import {
  idSchema,
  isoDateTimeSchema,
  optionalText,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';
import { personSummarySchema } from './person';

export const attendanceSessionSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  eventId: idSchema.nullable(),
  eventTitle: z.string().nullable(),
  groupId: idSchema.nullable(),
  groupName: z.string().nullable(),
  title: z.string(),
  sessionAt: isoDateTimeSchema,
  notes: z.string().nullable(),
  presentCount: z.number().int().nonnegative(),
  absentCount: z.number().int().nonnegative(),
  excusedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  createdBy: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type AttendanceSession = z.infer<typeof attendanceSessionSchema>;

export const attendanceSessionInputSchema = z.object({
  title: requiredText(2, LIMITS.nameMax),
  eventId: idSchema.nullable().default(null),
  groupId: idSchema.nullable().default(null),
  sessionAt: isoDateTimeSchema,
  notes: optionalText(LIMITS.longTextMax),
});
export type AttendanceSessionInput = z.infer<typeof attendanceSessionInputSchema>;

export const attendanceSessionUpdateSchema = attendanceSessionInputSchema.pick({
  title: true,
  sessionAt: true,
  notes: true,
});
export type AttendanceSessionUpdate = z.infer<typeof attendanceSessionUpdateSchema>;

export const attendanceListQuerySchema = paginationQuerySchema.extend({
  groupId: idSchema.optional(),
  eventId: idSchema.optional(),
});
export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;

export const attendanceSessionListSchema = paginatedSchema(attendanceSessionSchema);
export type AttendanceSessionList = z.infer<typeof attendanceSessionListSchema>;

export const attendanceRecordSchema = personSummarySchema.extend({
  status: z.enum(ATTENDANCE_STATUSES).nullable(),
  note: z.string().nullable(),
  recordedAt: isoDateTimeSchema.nullable(),
});
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;

export const attendanceSessionDetailSchema = z.object({
  session: attendanceSessionSchema,
  records: z.array(attendanceRecordSchema),
  canManage: z.boolean(),
});
export type AttendanceSessionDetail = z.infer<typeof attendanceSessionDetailSchema>;

export const attendanceRecordInputSchema = z.object({
  personId: idSchema,
  status: z.enum(ATTENDANCE_STATUSES).nullable(),
  note: optionalText(LIMITS.shortTextMax),
});
export type AttendanceRecordInput = z.infer<typeof attendanceRecordInputSchema>;

export const saveAttendanceRecordsBodySchema = z.object({
  records: z.array(attendanceRecordInputSchema).min(1).max(1000),
});
export type SaveAttendanceRecordsBody = z.infer<typeof saveAttendanceRecordsBodySchema>;

export const myAttendanceSchema = z.object({
  items: z.array(
    z.object({
      sessionId: idSchema,
      title: z.string(),
      sessionAt: isoDateTimeSchema,
      groupName: z.string().nullable(),
      status: z.enum(ATTENDANCE_STATUSES),
    }),
  ),
});
export type MyAttendance = z.infer<typeof myAttendanceSchema>;

export const attendanceSessionResponseSchema = z.object({ session: attendanceSessionSchema });
