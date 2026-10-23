import { describe, expect, it } from 'bun:test';
import {
  BASE_ROLE_PERMISSIONS,
  attendanceSessionInputSchema,
  attendanceStreakOf,
  availableHomeWidgets,
  availableReports,
  canFollowUpAbsence,
  canViewAbsences,
  headcountTotal,
  orderHomeWidgets,
  periodStartOf,
  reportPeriods,
  reportQuerySchema,
  resolveAbsenceAlertBodySchema,
  type Permission,
} from '../src';

const access = (permissions: Permission[], leaderGroupIds: string[] = []) => ({
  userId: 'u1',
  role: 'member' as const,
  leaderGroupIds,
  personId: 'p1',
  permissions,
});

describe('insights rules', () => {
  it('computes streaks newest first, skipping excused marks', () => {
    const marks = ['absent', 'excused', 'absent', 'present', 'present', 'absent', 'present'].map(
      (status) => ({ status: status as 'present' | 'absent' | 'excused' }),
    );
    expect(attendanceStreakOf(marks)).toEqual({
      currentPresentStreak: 0,
      longestPresentStreak: 2,
      currentAbsentStreak: 2,
      presentRate: 0.5,
    });
    expect(attendanceStreakOf([])).toEqual({
      currentPresentStreak: 0,
      longestPresentStreak: 0,
      currentAbsentStreak: 0,
      presentRate: 0,
    });
  });

  it('buckets dates into Monday weeks, months, quarters and years', () => {
    expect(periodStartOf('2026-01-11', 'week')).toBe('2026-01-05');
    expect(periodStartOf('2026-01-05', 'week')).toBe('2026-01-05');
    expect(periodStartOf('2026-08-19', 'month')).toBe('2026-08-01');
    expect(periodStartOf('2026-08-19', 'quarter')).toBe('2026-07-01');
    expect(periodStartOf('2026-08-19', 'year')).toBe('2026-01-01');
    expect(reportPeriods('2026-01-15', '2026-04-02', 'month')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ]);
    expect(reportPeriods('2025-12-30', '2026-01-06', 'week')).toEqual(['2025-12-29', '2026-01-05']);
  });

  it('validates report ranges', () => {
    expect(reportQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(
      true,
    );
    expect(reportQuerySchema.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success).toBe(
      false,
    );
    expect(reportQuerySchema.safeParse({ from: '2020-01-01', to: '2026-01-01' }).success).toBe(
      false,
    );
  });

  it('offers reports by permission and module', () => {
    const everything = ['worship', 'finance'];
    expect(availableReports(access(['reports.view']), everything)).not.toContain('giving_trend');
    expect(availableReports(access(['reports.view']), everything)).not.toContain(
      'attendance_trend',
    );
    expect(availableReports(access(['reports.view', 'finance.reports']), everything)).toContain(
      'giving_trend',
    );
    expect(availableReports(access(['reports.view', 'finance.reports']), [])).not.toContain(
      'giving_trend',
    );
    expect(availableReports(access(['attendance.view']), everything)).toEqual([]);
  });

  it('orders home widgets and drops unavailable or hidden ones', () => {
    const available = availableHomeWidgets(access([...BASE_ROLE_PERMISSIONS.member]), []);
    expect(available).not.toContain('my_schedule');
    expect(available).toContain('announcements');
    const ordered = orderHomeWidgets(available, {
      hiddenWidgets: ['notifications'],
      widgetOrder: ['birthdays', 'my_kids'],
    });
    expect(ordered[0]).toBe('birthdays');
    expect(ordered).not.toContain('notifications');
    expect(ordered).not.toContain('my_kids');
    expect(new Set(ordered).size).toBe(ordered.length);
  });

  it('decides who sees and follows up absences', () => {
    expect(canViewAbsences(access(['attendance.view']))).toBe(true);
    expect(canViewAbsences(access([], ['g1']))).toBe(true);
    expect(canViewAbsences(access([], ['g1']), 'g2')).toBe(false);
    expect(canViewAbsences(access(['attendance.record']))).toBe(false);
    expect(canFollowUpAbsence(access(['care.manage']), ['care'])).toBe(true);
    expect(canFollowUpAbsence(access(['care.manage']), [])).toBe(false);
    expect(
      resolveAbsenceAlertBodySchema.safeParse({ action: 'dismiss', dueDate: '2026-01-01' }).success,
    ).toBe(false);
  });

  it('keeps counts on headcount sessions only', () => {
    const base = { title: 'Ibadah', sessionAt: '2026-01-01T02:00:00.000Z' };
    const counts = { men: 1, women: 2, children: 3, visitors: 4 };
    expect(headcountTotal(counts)).toBe(10);
    expect(attendanceSessionInputSchema.safeParse({ ...base, headcount: counts }).success).toBe(
      false,
    );
    expect(
      attendanceSessionInputSchema.safeParse({ ...base, mode: 'headcount', headcount: counts })
        .success,
    ).toBe(true);
  });
});
