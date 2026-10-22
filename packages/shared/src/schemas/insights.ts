// Zod schemas, enums and labels owned by the insights module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { ATTENDANCE_STATUSES, LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import type { ModuleId } from '../modules';
import { hasAll, type AccessLike, type Permission } from '../permissions';
import { attendanceSessionInputSchema } from './attendance';
import { idSchema, isoDateSchema, isoDateTimeSchema } from './common';
import { personSummarySchema } from './person';

export const INSIGHTS_LIMITS = {
  headcountMax: 100_000,
  absentStreakMin: 2,
  absentStreakMax: 26,
  absentStreakDefault: 3,
  /** Longest report range, about three years. */
  reportRangeDaysMax: 1100,
} as const;

// ---------------------------------------------------------------------------------------------
// Personalised home
// ---------------------------------------------------------------------------------------------

export const HOME_WIDGETS = [
  'quick_actions',
  'my_schedule',
  'my_tasks',
  'my_kids',
  'upcoming_events',
  'announcements',
  'birthdays',
  'notifications',
  'attendance_summary',
] as const;
export type HomeWidget = (typeof HOME_WIDGETS)[number];

export const HOME_WIDGET_LABELS: Record<HomeWidget, LocalizedText> = {
  quick_actions: { en: 'Quick actions', id: 'Aksi cepat' },
  my_schedule: { en: 'My serving schedule', id: 'Jadwal pelayanan saya' },
  my_tasks: { en: 'My follow-up tasks', id: 'Tugas tindak lanjut saya' },
  my_kids: { en: 'My children checked in', id: 'Anak saya yang sedang check-in' },
  upcoming_events: { en: 'Upcoming events', id: 'Kegiatan mendatang' },
  announcements: { en: 'Announcements', id: 'Pengumuman' },
  birthdays: { en: 'Birthdays & anniversaries', id: 'Ulang tahun & pernikahan' },
  notifications: { en: 'Notifications', id: 'Pemberitahuan' },
  attendance_summary: { en: 'Attendance', id: 'Kehadiran' },
};

/** The optional module a widget needs; null means it is always available. */
export const HOME_WIDGET_MODULES: Record<HomeWidget, ModuleId | null> = {
  quick_actions: null,
  my_schedule: 'worship',
  my_tasks: 'care',
  my_kids: 'checkin',
  upcoming_events: null,
  announcements: null,
  birthdays: null,
  notifications: null,
  attendance_summary: null,
};

export const dashboardPreferencesSchema = z.object({
  hiddenWidgets: z.array(z.enum(HOME_WIDGETS)),
  widgetOrder: z.array(z.enum(HOME_WIDGETS)),
});
export type DashboardPreferences = z.infer<typeof dashboardPreferencesSchema>;

export const dashboardPreferencesInputSchema = z.object({
  hiddenWidgets: z.array(z.enum(HOME_WIDGETS)).max(HOME_WIDGETS.length).default([]),
  widgetOrder: z.array(z.enum(HOME_WIDGETS)).max(HOME_WIDGETS.length).default([]),
});
export type DashboardPreferencesInput = z.infer<typeof dashboardPreferencesInputSchema>;

export const celebrationSchema = z.object({
  kind: z.enum(['birthday', 'anniversary']),
  person: personSummarySchema,
  date: isoDateSchema,
  /** Age reached or years married, when known. */
  years: z.number().int().nullable(),
  daysAway: z.number().int().nonnegative(),
});
export type Celebration = z.infer<typeof celebrationSchema>;

// ---------------------------------------------------------------------------------------------
// Attendance upgrade
// ---------------------------------------------------------------------------------------------

export const ATTENDANCE_MODES = ['roster', 'headcount'] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const ATTENDANCE_MODE_LABELS: Record<AttendanceMode, LocalizedText> = {
  roster: { en: 'Name by name', id: 'Per nama' },
  headcount: { en: 'Headcount only', id: 'Hitung jumlah saja' },
};

const headcountValue = z.number().int().min(0).max(INSIGHTS_LIMITS.headcountMax);

export const headcountSchema = z.object({
  men: headcountValue.default(0),
  women: headcountValue.default(0),
  children: headcountValue.default(0),
  visitors: headcountValue.default(0),
});
export type Headcount = z.infer<typeof headcountSchema>;

export const headcountTotal = (headcount: Headcount): number =>
  headcount.men + headcount.women + headcount.children + headcount.visitors;

export const attendanceSessionDetailsInputSchema = attendanceSessionInputSchema
  .extend({
    mode: z.enum(ATTENDANCE_MODES).default('roster'),
    headcount: headcountSchema.nullable().default(null),
  })
  .refine((value) => value.mode !== 'headcount' || value.headcount !== null, {
    message: 'Enter the counts',
    path: ['headcount'],
  });
export type AttendanceSessionDetailsInput = z.infer<typeof attendanceSessionDetailsInputSchema>;

/** Marks everyone (or the listed people) with one status; existing marks are overwritten. */
export const bulkMarkAttendanceBodySchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
  personIds: z.array(idSchema).max(LIMITS.bulkIdsMax).optional(),
});
export type BulkMarkAttendanceBody = z.infer<typeof bulkMarkAttendanceBodySchema>;

export const ABSENCE_ALERT_STATUSES = ['open', 'dismissed', 'followed_up'] as const;
export type AbsenceAlertStatus = (typeof ABSENCE_ALERT_STATUSES)[number];

export const absenceQuerySchema = z.object({
  threshold: z.coerce
    .number()
    .int()
    .min(INSIGHTS_LIMITS.absentStreakMin)
    .max(INSIGHTS_LIMITS.absentStreakMax)
    .default(INSIGHTS_LIMITS.absentStreakDefault),
  groupId: idSchema.optional(),
  includeDismissed: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type AbsenceQuery = z.infer<typeof absenceQuerySchema>;

export const absenceAlertSchema = z.object({
  person: personSummarySchema,
  streak: z.number().int().min(1),
  lastPresentAt: isoDateTimeSchema.nullable(),
  status: z.enum(ABSENCE_ALERT_STATUSES),
  careTaskId: idSchema.nullable(),
});
export type AbsenceAlert = z.infer<typeof absenceAlertSchema>;

export const absenceAlertListSchema = z.object({ items: z.array(absenceAlertSchema) });

export const resolveAbsenceAlertBodySchema = z.object({
  action: z.enum(['dismiss', 'follow_up']),
  /** For `follow_up`: who gets the care task, and when it is due. */
  assignedUserId: idSchema.nullable().default(null),
  dueDate: isoDateSchema.nullable().default(null),
});
export type ResolveAbsenceAlertBody = z.infer<typeof resolveAbsenceAlertBodySchema>;

export const attendanceStreakSchema = z.object({
  currentPresentStreak: z.number().int().nonnegative(),
  longestPresentStreak: z.number().int().nonnegative(),
  currentAbsentStreak: z.number().int().nonnegative(),
  presentRate: z.number().min(0).max(1),
});
export type AttendanceStreak = z.infer<typeof attendanceStreakSchema>;

// ---------------------------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------------------------

export const REPORT_KINDS = [
  'membership_growth',
  'status_breakdown',
  'demographics',
  'attendance_trend',
  'visitor_conversion',
  'volunteer_engagement',
  'giving_trend',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_LABELS: Record<ReportKind, LocalizedText> = {
  membership_growth: { en: 'Membership growth', id: 'Pertumbuhan jemaat' },
  status_breakdown: { en: 'Membership status', id: 'Status keanggotaan' },
  demographics: { en: 'Demographics', id: 'Demografi' },
  attendance_trend: { en: 'Attendance trend', id: 'Tren kehadiran' },
  visitor_conversion: { en: 'New visitors', id: 'Simpatisan baru' },
  volunteer_engagement: { en: 'Volunteer engagement', id: 'Keterlibatan pelayan' },
  giving_trend: { en: 'Giving trend', id: 'Tren persembahan' },
};

/** Every permission a report needs, on top of `reports.view`. */
export const REPORT_PERMISSIONS: Record<ReportKind, readonly Permission[]> = {
  membership_growth: ['reports.view'],
  status_breakdown: ['reports.view'],
  demographics: ['reports.view'],
  attendance_trend: ['reports.view', 'attendance.view'],
  visitor_conversion: ['reports.view'],
  volunteer_engagement: ['reports.view', 'services.view'],
  giving_trend: ['reports.view', 'finance.reports'],
};

/** The optional module a report reads from; null when it only uses core tables. */
export const REPORT_MODULES: Record<ReportKind, ModuleId | null> = {
  membership_growth: null,
  status_breakdown: null,
  demographics: null,
  attendance_trend: null,
  visitor_conversion: null,
  volunteer_engagement: 'worship',
  giving_trend: 'finance',
};

export const canViewReport = (access: Pick<AccessLike, 'permissions'>, kind: ReportKind) =>
  hasAll(access, REPORT_PERMISSIONS[kind]);

export const REPORT_INTERVALS = ['week', 'month', 'quarter', 'year'] as const;
export type ReportInterval = (typeof REPORT_INTERVALS)[number];

export const AGE_BANDS = ['0-12', '13-17', '18-25', '26-40', '41-60', '61+', 'unknown'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const AGE_BAND_LABELS: Record<AgeBand, LocalizedText> = {
  '0-12': { en: 'Children (0–12)', id: 'Anak (0–12)' },
  '13-17': { en: 'Teens (13–17)', id: 'Remaja (13–17)' },
  '18-25': { en: 'Youth (18–25)', id: 'Pemuda (18–25)' },
  '26-40': { en: 'Adults (26–40)', id: 'Dewasa muda (26–40)' },
  '41-60': { en: 'Adults (41–60)', id: 'Dewasa (41–60)' },
  '61+': { en: 'Seniors (61+)', id: 'Lansia (61+)' },
  unknown: { en: 'Unknown', id: 'Tidak diketahui' },
};

export const ageBandOf = (age: number | null): AgeBand => {
  if (age === null || age < 0) return 'unknown';
  if (age <= 12) return '0-12';
  if (age <= 17) return '13-17';
  if (age <= 25) return '18-25';
  if (age <= 40) return '26-40';
  if (age <= 60) return '41-60';
  return '61+';
};

export const reportQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    interval: z.enum(REPORT_INTERVALS).default('month'),
    groupId: idSchema.optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .refine((value) => value.to >= value.from, {
    message: 'The end date must be on or after the start date',
    path: ['to'],
  })
  .refine(
    (value) =>
      (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <=
      INSIGHTS_LIMITS.reportRangeDaysMax,
    { message: 'Choose a shorter range', path: ['to'] },
  );
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const reportPointSchema = z.object({
  /** Period start (YYYY-MM-DD) for trends, or the category key for breakdowns. */
  x: z.string(),
  y: z.number(),
});

export const reportSeriesSchema = z.object({
  key: z.string(),
  label: z.string(),
  points: z.array(reportPointSchema),
});
export type ReportSeries = z.infer<typeof reportSeriesSchema>;

export const reportSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  from: isoDateSchema,
  to: isoDateSchema,
  interval: z.enum(REPORT_INTERVALS),
  series: z.array(reportSeriesSchema),
  /** Headline numbers ("total", "change", ...). */
  totals: z.record(z.string(), z.number()),
});
export type Report = z.infer<typeof reportSchema>;
