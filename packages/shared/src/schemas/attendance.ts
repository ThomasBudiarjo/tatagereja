import { z } from 'zod';
import { ATTENDANCE_STATUSES, LIMITS, type AttendanceStatus } from '../constants';
import type { LocalizedText } from '../localized';
import {
  idSchema,
  isoDateTimeSchema,
  optionalText,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';
import { personSummarySchema } from './person';

export const ATTENDANCE_STATUS_TEXT: Record<AttendanceStatus, LocalizedText> = {
  present: { en: 'Present', id: 'Hadir' },
  absent: { en: 'Absent', id: 'Tidak hadir' },
  excused: { en: 'Excused', id: 'Izin' },
};

/** `roster` marks people one by one; `headcount` only stores counts (large services). */
export const ATTENDANCE_MODES = ['roster', 'headcount'] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const ATTENDANCE_MODE_LABELS: Record<AttendanceMode, LocalizedText> = {
  roster: { en: 'Name by name', id: 'Per nama' },
  headcount: { en: 'Headcount only', id: 'Hitung jumlah saja' },
};

/** Largest count one headcount category accepts. */
export const HEADCOUNT_MAX = 100_000;

const headcountValue = z.number().int().min(0).max(HEADCOUNT_MAX);

export const HEADCOUNT_CATEGORIES = ['men', 'women', 'children', 'visitors'] as const;
export type HeadcountCategory = (typeof HEADCOUNT_CATEGORIES)[number];

export const HEADCOUNT_LABELS: Record<HeadcountCategory, LocalizedText> = {
  men: { en: 'Men', id: 'Pria' },
  women: { en: 'Women', id: 'Wanita' },
  children: { en: 'Children', id: 'Anak-anak' },
  visitors: { en: 'Visitors', id: 'Tamu / simpatisan' },
};

export const headcountSchema = z.object({
  men: headcountValue.default(0),
  women: headcountValue.default(0),
  children: headcountValue.default(0),
  visitors: headcountValue.default(0),
});
export type Headcount = z.infer<typeof headcountSchema>;

export const headcountTotal = (headcount: Headcount): number =>
  headcount.men + headcount.women + headcount.children + headcount.visitors;

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

/**
 * A session as the attendance screens show it: the base shape plus how it is counted.
 * `attendeeCount` is the present count for roster sessions and the headcount total otherwise.
 */
export const attendanceSessionViewSchema = attendanceSessionSchema.extend({
  mode: z.enum(ATTENDANCE_MODES),
  headcount: headcountSchema.nullable(),
  attendeeCount: z.number().int().nonnegative(),
});
export type AttendanceSessionView = z.infer<typeof attendanceSessionViewSchema>;

const titleSchema = requiredText(2, LIMITS.nameMax);
const notesSchema = optionalText(LIMITS.longTextMax);

export const attendanceSessionInputSchema = z
  .object({
    title: titleSchema,
    eventId: idSchema.nullable().default(null),
    groupId: idSchema.nullable().default(null),
    sessionAt: isoDateTimeSchema,
    notes: notesSchema,
    mode: z.enum(ATTENDANCE_MODES).default('roster'),
    /** Starting counts of a headcount session; roster sessions store none. */
    headcount: headcountSchema.nullable().default(null),
  })
  .refine((value) => value.mode === 'headcount' || value.headcount === null, {
    message: 'Only headcount sessions store counts',
    path: ['headcount'],
  });
export type AttendanceSessionInput = z.infer<typeof attendanceSessionInputSchema>;

/** The mode is fixed at creation; counts change through the headcount route. */
export const attendanceSessionUpdateSchema = z.object({
  title: titleSchema,
  sessionAt: isoDateTimeSchema,
  notes: notesSchema,
});
export type AttendanceSessionUpdate = z.infer<typeof attendanceSessionUpdateSchema>;

export const ATTENDANCE_SESSION_SORTS = ['recent', 'oldest', 'title'] as const;
export type AttendanceSessionSort = (typeof ATTENDANCE_SESSION_SORTS)[number];

export const attendanceListQuerySchema = paginationQuerySchema.extend({
  groupId: idSchema.optional(),
  eventId: idSchema.optional(),
  mode: z.enum(ATTENDANCE_MODES).optional(),
  sort: z.enum(ATTENDANCE_SESSION_SORTS).default('recent'),
});
export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;

export const attendanceSessionListSchema = paginatedSchema(attendanceSessionViewSchema);
export type AttendanceSessionList = z.infer<typeof attendanceSessionListSchema>;

export const attendanceRecordSchema = personSummarySchema.extend({
  status: z.enum(ATTENDANCE_STATUSES).nullable(),
  note: z.string().nullable(),
  recordedAt: isoDateTimeSchema.nullable(),
});
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;

export const attendanceSessionDetailSchema = z.object({
  session: attendanceSessionViewSchema,
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
  records: z.array(attendanceRecordInputSchema).min(1).max(LIMITS.bulkIdsMax),
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

export const attendanceSessionResponseSchema = z.object({ session: attendanceSessionViewSchema });
