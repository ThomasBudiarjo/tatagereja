import { availableReports, can, canViewAbsences, has } from '@tatagereja/shared';
import {
  BellRing,
  CalendarCheck2,
  ChartColumnIncreasing,
  ClipboardCheck,
  ClipboardPlus,
  Home,
} from 'lucide-react';
import { defineModule, lazyPage, type AccessRule, type RoutePrefetch } from '@/lib/modules';

const viewReports: AccessRule = { anyOf: ['reports.view'] };
const viewSessions: AccessRule = { check: ({ access }) => can.viewAttendanceOverview(access) };
const viewAbsences: AccessRule = { check: ({ access }) => canViewAbsences(access) };
/** Recorders and group leaders take attendance; everyone sees their own history. */
const takeAttendance: AccessRule = {
  check: ({ access }) => has(access, 'attendance.record') || access.leaderGroupIds.length > 0,
};
/** Reports appear only when at least one report is open to the caller in this church. */
const anyReport: AccessRule = {
  anyOf: ['reports.view'],
  check: ({ access, church }) => availableReports(access, church.enabledModules).length > 0,
};

/** The church home as it opens: the dashboard. */
const prefetchHome: RoutePrefetch = async ({ churchId, client }) => {
  const { dashboardQuery } = await import('@/features/dashboard/api');
  void client.prefetchQuery(dashboardQuery(churchId));
};

export const insightsModule = defineModule({
  id: 'insights',
  icon: ChartColumnIncreasing,
  accent: 'teal',
  labelKey: 'insights.reports',
  descriptionKey: 'insights.reportsDescription',
  section: 'main',
  routes: [
    {
      index: true,
      lazy: lazyPage(() => import('@/features/dashboard/home-page'), 'HomePage'),
      handle: { prefetch: prefetchHome },
    },
    {
      path: 'attendance',
      lazy: lazyPage(() => import('@/features/attendance/attendance-page'), 'AttendancePage'),
    },
    {
      path: 'attendance/me',
      lazy: lazyPage(() => import('@/features/attendance/history-page'), 'MyAttendancePage'),
    },
    {
      path: 'attendance/absences',
      lazy: lazyPage(() => import('@/features/attendance/absences-page'), 'AbsencesPage'),
      handle: { access: viewAbsences },
    },
    {
      // The API decides: the person themselves, leaders of their groups and `attendance.view`.
      path: 'attendance/people/:personId',
      lazy: lazyPage(() => import('@/features/attendance/history-page'), 'PersonAttendancePage'),
    },
    {
      path: 'attendance/:id',
      lazy: lazyPage(
        () => import('@/features/attendance/attendance-session-page'),
        'AttendanceSessionPage',
      ),
      handle: { access: viewSessions },
    },
    {
      path: 'reports',
      lazy: lazyPage(() => import('./reports-page'), 'ReportsPage'),
      handle: { access: viewReports },
    },
  ],
  nav: [
    {
      id: 'home',
      to: '',
      end: true,
      labelKey: 'common.home',
      descriptionKey: 'insights.homeDescription',
      icon: Home,
      tone: 'brand',
      order: 0,
      mobileTab: 'home',
      keywords: ['beranda', 'dashboard', 'home'],
    },
    {
      id: 'attendance',
      to: 'attendance',
      labelKey: 'insights.attendance',
      descriptionKey: 'insights.attendanceDescription',
      icon: ClipboardCheck,
      order: 50,
      keywords: ['kehadiran', 'absensi', 'presensi', 'attendance', 'headcount', 'hitung jemaat'],
    },
    {
      id: 'reports',
      to: 'reports',
      labelKey: 'insights.reports',
      descriptionKey: 'insights.reportsDescription',
      icon: ChartColumnIncreasing,
      section: 'admin',
      order: 30,
      access: anyReport,
      keywords: ['laporan', 'statistik', 'reports', 'statistics', 'pertumbuhan', 'demografi'],
    },
  ],
  quickActions: [
    {
      id: 'take-attendance',
      to: 'attendance?new=1',
      labelKey: 'insights.takeAttendance',
      icon: ClipboardPlus,
      order: 40,
      access: takeAttendance,
    },
    {
      id: 'absence-alerts',
      to: 'attendance/absences',
      labelKey: 'insights.absenceAlerts',
      icon: BellRing,
      tone: 'rose',
      order: 45,
      access: viewAbsences,
    },
    {
      id: 'reports',
      to: 'reports',
      labelKey: 'insights.reports',
      icon: ChartColumnIncreasing,
      order: 90,
      access: anyReport,
    },
  ],
  commands: [
    {
      id: 'new-attendance-session',
      to: 'attendance?new=1',
      labelKey: 'insights.newSession',
      icon: ClipboardPlus,
      keywords: ['sesi', 'absen', 'presensi', 'session'],
      access: takeAttendance,
    },
    {
      id: 'absence-alerts',
      to: 'attendance/absences',
      labelKey: 'insights.absenceAlerts',
      icon: BellRing,
      keywords: ['tidak hadir', 'absen', 'perkunjungan', 'absent', 'missing'],
      access: viewAbsences,
    },
    {
      id: 'my-attendance',
      to: 'attendance/me',
      labelKey: 'insights.myAttendance',
      icon: CalendarCheck2,
      keywords: ['kehadiran saya', 'riwayat', 'history'],
    },
  ],
});
