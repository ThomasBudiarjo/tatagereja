import { can, has } from '@tatagereja/shared';
import { ChartColumnIncreasing, ClipboardCheck, Home } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

const viewReports: AccessRule = { anyOf: ['reports.view'] };
const viewSessions: AccessRule = { check: ({ access }) => can.viewAttendanceOverview(access) };
/** Recorders and group leaders take attendance; everyone sees their own history. */
const takeAttendance: AccessRule = {
  check: ({ access }) => has(access, 'attendance.record') || access.leaderGroupIds.length > 0,
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
    },
    {
      path: 'attendance',
      lazy: lazyPage(() => import('@/features/attendance/attendance-page'), 'AttendancePage'),
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
      keywords: ['kehadiran', 'absensi', 'presensi', 'attendance'],
    },
    {
      id: 'reports',
      to: 'reports',
      labelKey: 'insights.reports',
      descriptionKey: 'insights.reportsDescription',
      icon: ChartColumnIncreasing,
      section: 'admin',
      order: 30,
      access: viewReports,
      keywords: ['laporan', 'statistik', 'reports', 'statistics'],
    },
  ],
  quickActions: [
    {
      id: 'take-attendance',
      to: 'attendance',
      labelKey: 'insights.takeAttendance',
      icon: ClipboardCheck,
      order: 40,
      access: takeAttendance,
    },
  ],
});
