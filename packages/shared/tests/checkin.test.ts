import { describe, expect, it } from 'bun:test';
import {
  canEditChildCare,
  canManageCheckin,
  canOperateCheckin,
  checkInBodySchema,
  checkinClassInputSchema,
  childAge,
  dayBefore,
  highestSeverity,
  isSelfCheckInDate,
  kioskSearchQuerySchema,
  phoneLast4,
  suggestClass,
} from '../src';

const classes = [
  { id: 'balita', minAge: 0, maxAge: 3, isActive: true, sortOrder: 10 },
  { id: 'kecil', minAge: 4, maxAge: 6, isActive: true, sortOrder: 20 },
  { id: 'lama', minAge: 4, maxAge: 6, isActive: false, sortOrder: 5 },
  { id: 'remaja', minAge: 13, maxAge: null, isActive: true, sortOrder: 50 },
  { id: 'umum', minAge: null, maxAge: null, isActive: true, sortOrder: 1 },
];

describe('kids check-in rules', () => {
  it('suggests the usual class first, then the first active class for the age', () => {
    expect(suggestClass(classes, 5, null)?.id).toBe('kecil');
    expect(suggestClass(classes, 2, 'remaja')?.id).toBe('remaja');
    // An inactive usual class falls back to the age ranges.
    expect(suggestClass(classes, 5, 'lama')?.id).toBe('kecil');
    expect(suggestClass(classes, 17, null)?.id).toBe('remaja');
    // A class without any age range is never suggested by age.
    expect(suggestClass(classes, 9, null)).toBeNull();
    expect(suggestClass(classes, null, null)).toBeNull();
  });

  it('computes ages, phone suffixes and the worst alert', () => {
    expect(childAge('2020-06-15', '2026-06-14')).toBe(5);
    expect(childAge('2020-06-15', '2026-06-15')).toBe(6);
    expect(childAge(null, '2026-06-15')).toBeNull();
    expect(phoneLast4('+62 812-3456-7788')).toBe('7788');
    expect(phoneLast4('123')).toBeNull();
    expect(phoneLast4(null)).toBeNull();
    expect(
      highestSeverity([
        { severity: 'info', isActive: true },
        { severity: 'critical', isActive: false },
        { severity: 'warning', isActive: true },
      ]),
    ).toBe('warning');
    expect(highestSeverity([])).toBeNull();
  });

  it('decides who operates, manages and edits a child', () => {
    const teacher = { permissions: ['checkin.operate'] as const };
    const coordinator = { permissions: ['checkin.manage'] as const };
    const member = { permissions: [] as const };
    expect(canOperateCheckin(teacher)).toBe(true);
    expect(canOperateCheckin(coordinator)).toBe(true);
    expect(canOperateCheckin(member)).toBe(false);
    expect(canManageCheckin(teacher)).toBe(false);
    expect(canEditChildCare(teacher, { isGuardian: false })).toBe(false);
    expect(canEditChildCare(member, { isGuardian: true })).toBe(true);
    expect(canEditChildCare(coordinator, { isGuardian: false })).toBe(true);
  });

  it('validates kiosk searches, check-ins and classes', () => {
    expect(kioskSearchQuerySchema.parse({ q: '7788' }).phoneLast4).toBe('7788');
    expect(kioskSearchQuerySchema.parse({ q: 'Simanjuntak' }).phoneLast4).toBeNull();
    expect(kioskSearchQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    const id = '7d3c1c2e-8f8a-4a4b-9a43-1c0d2f7b9e10';
    expect(checkInBodySchema.parse({ children: [{ personId: id }] }).method).toBe('staff');
    expect(
      checkInBodySchema.safeParse({ children: [{ personId: id }, { personId: id }] }).success,
    ).toBe(false);
    expect(checkinClassInputSchema.safeParse({ name: 'Kelas', minAge: 7, maxAge: 4 }).success).toBe(
      false,
    );
  });
});

describe('self check-in dates', () => {
  it('takes the day before across months and leap days', () => {
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
  });

  it('accepts only sessions of today and yesterday', () => {
    expect(isSelfCheckInDate('2026-10-25', '2026-10-25')).toBe(true);
    expect(isSelfCheckInDate('2026-10-24', '2026-10-25')).toBe(true);
    expect(isSelfCheckInDate('2026-10-23', '2026-10-25')).toBe(false);
    expect(isSelfCheckInDate('2026-10-26', '2026-10-25')).toBe(false);
  });
});
