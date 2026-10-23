// Zod schemas, enums and labels owned by the insights module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { ATTENDANCE_STATUSES, LIMITS } from '../constants';
import { LOCALES, type LocalizedText } from '../localized';
import { isModuleEnabled, type ModuleId } from '../modules';
import { has, hasAll, isLeaderOfAny, type AccessLike, type Permission } from '../permissions';
import { idSchema, isoDateSchema, isoDateTimeSchema, optionalText } from './common';
import { personSummarySchema } from './person';

export const INSIGHTS_LIMITS = {
  absentStreakMin: 2,
  absentStreakMax: 26,
  absentStreakDefault: 3,
  /** Longest report range, about three years. */
  reportRangeDaysMax: 1100,
  /** Sessions shown in a personal history. */
  historyMax: 100,
  /** Absence alerts returned at once, longest streaks first. */
  absenceListMax: 200,
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

/** Widgets the caller may see in this church: module switched on and permission held. */
export const availableHomeWidgets = (
  access: Pick<AccessLike, 'permissions'>,
  enabledModules: readonly string[],
): HomeWidget[] =>
  HOME_WIDGETS.filter((widget) => {
    const module = HOME_WIDGET_MODULES[widget];
    if (module && !isModuleEnabled(enabledModules, module)) return false;
    if (widget === 'upcoming_events') return has(access, 'events.view');
    if (widget === 'announcements') return has(access, 'announcements.view');
    if (widget === 'birthdays') return has(access, 'people.view');
    return true;
  });

/**
 * The caller's widgets in display order: their saved order first, then the rest in the default
 * order, without hidden ones.
 */
export const orderHomeWidgets = (
  available: readonly HomeWidget[],
  preferences: { hiddenWidgets: readonly HomeWidget[]; widgetOrder: readonly HomeWidget[] },
): HomeWidget[] => {
  const ordered = [
    ...preferences.widgetOrder.filter((widget) => available.includes(widget)),
    ...available.filter((widget) => !preferences.widgetOrder.includes(widget)),
  ];
  return [...new Set(ordered)].filter((widget) => !preferences.hiddenWidgets.includes(widget));
};

export const dashboardPreferencesSchema = z.object({
  hiddenWidgets: z.array(z.enum(HOME_WIDGETS)),
  widgetOrder: z.array(z.enum(HOME_WIDGETS)),
});
export type DashboardPreferences = z.infer<typeof dashboardPreferencesSchema>;

const uniqueWidgets = (items: readonly string[]) => new Set(items).size === items.length;

export const dashboardPreferencesInputSchema = z.object({
  hiddenWidgets: z
    .array(z.enum(HOME_WIDGETS))
    .max(HOME_WIDGETS.length)
    .default([])
    .refine(uniqueWidgets, { message: 'List each widget once' }),
  widgetOrder: z
    .array(z.enum(HOME_WIDGETS))
    .max(HOME_WIDGETS.length)
    .default([])
    .refine(uniqueWidgets, { message: 'List each widget once' }),
});
export type DashboardPreferencesInput = z.infer<typeof dashboardPreferencesInputSchema>;

export const dashboardPreferencesResponseSchema = z.object({
  preferences: dashboardPreferencesSchema,
});

// ---------------------------------------------------------------------------------------------
// Attendance upgrade
// ---------------------------------------------------------------------------------------------

/** Marks everyone on the roster (or the listed people) with one status. */
export const bulkMarkAttendanceBodySchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
  personIds: z.array(idSchema).min(1).max(LIMITS.bulkIdsMax).optional(),
  /** Leaves people who already have a mark alone. */
  onlyUnmarked: z.boolean().default(false),
});
export type BulkMarkAttendanceBody = z.infer<typeof bulkMarkAttendanceBodySchema>;

export const ABSENCE_ALERT_STATUSES = ['open', 'dismissed', 'followed_up'] as const;
export type AbsenceAlertStatus = (typeof ABSENCE_ALERT_STATUSES)[number];

export const ABSENCE_ALERT_STATUS_LABELS: Record<AbsenceAlertStatus, LocalizedText> = {
  open: { en: 'Needs attention', id: 'Perlu perhatian' },
  dismissed: { en: 'Dismissed', id: 'Diabaikan' },
  followed_up: { en: 'Follow-up created', id: 'Sudah ditindaklanjuti' },
};

export const absenceQuerySchema = z.object({
  threshold: z.coerce
    .number()
    .int()
    .min(INSIGHTS_LIMITS.absentStreakMin)
    .max(INSIGHTS_LIMITS.absentStreakMax)
    .default(INSIGHTS_LIMITS.absentStreakDefault),
  groupId: idSchema.optional(),
  includeResolved: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
});
export type AbsenceQuery = z.infer<typeof absenceQuerySchema>;

export const absenceAlertSchema = z.object({
  person: personSummarySchema,
  /** Consecutive sessions marked absent, most recent first (excused marks are skipped). */
  streak: z.number().int().min(1),
  lastPresentAt: isoDateTimeSchema.nullable(),
  lastAbsentAt: isoDateTimeSchema,
  status: z.enum(ABSENCE_ALERT_STATUSES),
  careTaskId: idSchema.nullable(),
  resolvedAt: isoDateTimeSchema.nullable(),
});
export type AbsenceAlert = z.infer<typeof absenceAlertSchema>;

export const absenceAlertListSchema = z.object({
  items: z.array(absenceAlertSchema),
  threshold: z.number().int(),
  /** Whether the caller can turn an alert into a care follow-up (care on, `care.manage`). */
  canFollowUp: z.boolean(),
});
export type AbsenceAlertList = z.infer<typeof absenceAlertListSchema>;

export const resolveAbsenceAlertBodySchema = z
  .object({
    action: z.enum(['dismiss', 'follow_up', 'reopen']),
    /** For `follow_up`: who gets the care task (default: the caller), when it is due, a note. */
    assignedUserId: idSchema.nullable().default(null),
    dueDate: isoDateSchema.nullable().default(null),
    note: optionalText(LIMITS.longTextMax),
  })
  .refine(
    (value) =>
      value.action === 'follow_up' ||
      (value.assignedUserId === null && value.dueDate === null && value.note === null),
    { message: 'Only follow-ups take an assignee, due date or note', path: ['action'] },
  );
export type ResolveAbsenceAlertBody = z.infer<typeof resolveAbsenceAlertBodySchema>;

export const absenceAlertResponseSchema = z.object({ alert: absenceAlertSchema });

/** Who may see and resolve absence alerts: `attendance.view`, or leaders for their groups. */
export const canViewAbsences = (access: AccessLike, groupId?: string | null): boolean =>
  has(access, 'attendance.view') ||
  (groupId ? access.leaderGroupIds.includes(groupId) : access.leaderGroupIds.length > 0);

/** Turning an alert into a care task needs the care module's manage permission. */
export const canFollowUpAbsence = (
  access: Pick<AccessLike, 'permissions'>,
  enabledModules: readonly string[],
): boolean => isModuleEnabled(enabledModules, 'care') && has(access, 'care.manage');

/** Leaders see alerts of people in the groups they lead. */
export const canSeeAbsenceOf = (access: AccessLike, personGroupIds: readonly string[]) =>
  has(access, 'attendance.view') || isLeaderOfAny(access, personGroupIds);

export const attendanceStreakSchema = z.object({
  currentPresentStreak: z.number().int().nonnegative(),
  longestPresentStreak: z.number().int().nonnegative(),
  currentAbsentStreak: z.number().int().nonnegative(),
  /** Present ÷ (present + absent); excused marks do not count. 0 without marks. */
  presentRate: z.number().min(0).max(1),
});
export type AttendanceStreak = z.infer<typeof attendanceStreakSchema>;

type Mark = { status: (typeof ATTENDANCE_STATUSES)[number] };

/**
 * Streaks of a person's marks, newest first. Excused marks neither break nor extend a streak.
 * Shared so the history screen and the API agree.
 */
export const attendanceStreakOf = (marksNewestFirst: readonly Mark[]): AttendanceStreak => {
  const counted = marksNewestFirst.filter((mark) => mark.status !== 'excused');
  let currentPresentStreak = 0;
  let currentAbsentStreak = 0;
  const first = counted[0]?.status;
  for (const mark of counted) {
    if (mark.status !== first) break;
    if (first === 'present') currentPresentStreak += 1;
    else currentAbsentStreak += 1;
  }
  let longestPresentStreak = 0;
  let run = 0;
  for (const mark of counted) {
    run = mark.status === 'present' ? run + 1 : 0;
    longestPresentStreak = Math.max(longestPresentStreak, run);
  }
  const present = counted.filter((mark) => mark.status === 'present').length;
  return {
    currentPresentStreak,
    longestPresentStreak,
    currentAbsentStreak,
    presentRate: counted.length === 0 ? 0 : present / counted.length,
  };
};

export const attendanceHistoryItemSchema = z.object({
  sessionId: idSchema,
  title: z.string(),
  sessionAt: isoDateTimeSchema,
  groupId: idSchema.nullable(),
  groupName: z.string().nullable(),
  status: z.enum(ATTENDANCE_STATUSES),
  note: z.string().nullable(),
});
export type AttendanceHistoryItem = z.infer<typeof attendanceHistoryItemSchema>;

export const attendanceHistorySchema = z.object({
  person: personSummarySchema,
  streak: attendanceStreakSchema,
  counts: z.object({
    present: z.number().int().nonnegative(),
    absent: z.number().int().nonnegative(),
    excused: z.number().int().nonnegative(),
  }),
  /** The last twelve months (`YYYY-MM`), oldest first. */
  months: z.array(
    z.object({
      month: z.string(),
      present: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  ),
  items: z.array(attendanceHistoryItemSchema),
});
export type AttendanceHistory = z.infer<typeof attendanceHistorySchema>;

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

/** Reports the caller may open in this church, in display order. */
export const availableReports = (
  access: Pick<AccessLike, 'permissions'>,
  enabledModules: readonly string[],
): ReportKind[] =>
  REPORT_KINDS.filter((kind) => {
    const module = REPORT_MODULES[kind];
    return canViewReport(access, kind) && (!module || isModuleEnabled(enabledModules, module));
  });

export const REPORT_INTERVALS = ['week', 'month', 'quarter', 'year'] as const;
export type ReportInterval = (typeof REPORT_INTERVALS)[number];

export const REPORT_INTERVAL_LABELS: Record<ReportInterval, LocalizedText> = {
  week: { en: 'Weekly', id: 'Mingguan' },
  month: { en: 'Monthly', id: 'Bulanan' },
  quarter: { en: 'Quarterly', id: 'Triwulan' },
  year: { en: 'Yearly', id: 'Tahunan' },
};

/** The first day of the period `date` falls in; weeks start on Monday. */
export const periodStartOf = (date: string, interval: ReportInterval): string => {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (interval === 'year') return `${date.slice(0, 4)}-01-01`;
  if (interval === 'quarter') {
    const first = Math.floor((month - 1) / 3) * 3 + 1;
    return `${date.slice(0, 4)}-${String(first).padStart(2, '0')}-01`;
  }
  if (interval === 'month') return `${date.slice(0, 7)}-01`;
  const day = new Date(Date.UTC(year, month - 1, Number(date.slice(8, 10))));
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
};

/** Period starts from the one containing `from` to the one containing `to`, inclusive. */
export const reportPeriods = (from: string, to: string, interval: ReportInterval): string[] => {
  const periods: string[] = [];
  let cursor = periodStartOf(from, interval);
  const last = periodStartOf(to, interval);
  while (cursor <= last && periods.length < 2000) {
    periods.push(cursor);
    const date = new Date(`${cursor}T00:00:00Z`);
    if (interval === 'week') date.setUTCDate(date.getUTCDate() + 7);
    else if (interval === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
    else if (interval === 'quarter') date.setUTCMonth(date.getUTCMonth() + 3);
    else date.setUTCFullYear(date.getUTCFullYear() + 1);
    cursor = date.toISOString().slice(0, 10);
  }
  return periods;
};

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

/** Labels of report series, breakdowns and headline numbers, by key. */
export const REPORT_TEXT = {
  new: { en: 'New people', id: 'Jemaat baru' },
  newMembers: { en: 'New members', id: 'Anggota baru' },
  total: { en: 'Total', id: 'Total' },
  status: { en: 'Membership status', id: 'Status keanggotaan' },
  age: { en: 'Age band', id: 'Kelompok usia' },
  gender: { en: 'Gender', id: 'Jenis kelamin' },
  area: { en: 'Area (wilayah/sektor)', id: 'Wilayah / sektor' },
  noArea: { en: 'No area', id: 'Tanpa wilayah' },
  household: { en: 'Households', id: 'Keluarga' },
  inHousehold: { en: 'In a household', id: 'Tercatat dalam keluarga' },
  noHousehold: { en: 'No household', id: 'Belum tercatat dalam keluarga' },
  attendance: { en: 'Attendance', id: 'Kehadiran' },
  sessions: { en: 'Sessions', id: 'Sesi' },
  tracks: { en: 'Average per service or group', id: 'Rata-rata per ibadah atau kelompok' },
  churchWide: { en: 'Church-wide', id: 'Seluruh jemaat' },
  sundaySchool: { en: 'Sunday school', id: 'Sekolah Minggu' },
  headcount: { en: 'Headcount', id: 'Hitungan jumlah' },
  visitors: { en: 'New visitors', id: 'Simpatisan baru' },
  converted: { en: 'Became regular or member', id: 'Menjadi jemaat tetap / anggota' },
  counted: { en: 'Visitors counted at services', id: 'Tamu terhitung di ibadah' },
  stages: { en: 'Follow-up stage', id: 'Tahap tindak lanjut' },
  sources: { en: 'How they found us', id: 'Sumber kedatangan' },
  unknownSource: { en: 'Not recorded', id: 'Tidak dicatat' },
  volunteers: { en: 'Volunteers serving', id: 'Pelayan yang bertugas' },
  assignments: { en: 'Assignments', id: 'Penugasan' },
  declined: { en: 'Declined', id: 'Ditolak' },
  teams: { en: 'Volunteers per team', id: 'Pelayan per tim' },
  offerings: { en: 'Offerings', id: 'Persembahan ibadah' },
  contributions: { en: 'Tithes and gifts', id: 'Perpuluhan & persembahan khusus' },
  funds: { en: 'By fund', id: 'Per kas / dana' },
  categories: { en: 'By category', id: 'Per kategori' },
  noCategory: { en: 'Uncategorised', id: 'Tanpa kategori' },
  period: { en: 'Period', id: 'Periode' },
  value: { en: 'Value', id: 'Nilai' },
  summary: { en: 'Summary', id: 'Ringkasan' },
} as const satisfies Record<string, LocalizedText>;
export type ReportTextKey = keyof typeof REPORT_TEXT;

export const reportQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    interval: z.enum(REPORT_INTERVALS).default('month'),
    groupId: idSchema.optional(),
    format: z.enum(['json', 'csv']).default('json'),
    /** Language of series and category labels (and of the CSV). */
    locale: z.enum(LOCALES).default('id'),
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

export const reportParamsSchema = z.object({
  churchId: idSchema,
  kind: z.enum(REPORT_KINDS),
});

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

/** A categorical split (by status, age band, team, fund). Keys are stable; labels for display. */
export const reportBreakdownSchema = z.object({
  key: z.string(),
  label: z.string(),
  items: z.array(z.object({ key: z.string(), label: z.string(), value: z.number() })),
});
export type ReportBreakdown = z.infer<typeof reportBreakdownSchema>;

export const reportSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  from: isoDateSchema,
  to: isoDateSchema,
  interval: z.enum(REPORT_INTERVALS),
  /** `money` values are integer minor units of the church currency. */
  unit: z.enum(['count', 'money']),
  series: z.array(reportSeriesSchema),
  breakdowns: z.array(reportBreakdownSchema),
  /** Headline numbers ("total", "change", ...). */
  totals: z.record(z.string(), z.number()),
});
export type Report = z.infer<typeof reportSchema>;

/** `GET /attendance/me`: null without a linked person record in the church. */
export const myAttendanceHistorySchema = z.object({ history: attendanceHistorySchema.nullable() });
export type MyAttendanceHistory = z.infer<typeof myAttendanceHistorySchema>;

export const personAttendanceParamsSchema = z.object({ churchId: idSchema, personId: idSchema });
