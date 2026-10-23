import { describe, expect, it } from 'bun:test';
import {
  bookingAvailabilityBodySchema,
  bookingOccurrences,
  canCancelBooking,
  canEditBooking,
  canManageInventory,
  canRequestBooking,
  canSeeBookingNotes,
  canViewFacilities,
  canViewInventory,
  checkOutAssetBodySchema,
  facilityBookingInputSchema,
  facilityScheduleQuerySchema,
  formatAssetCode,
  isLoanOverdue,
  latestRecurrenceUntil,
  occurrenceDateOf,
  type Permission,
} from '../src';

const access = (permissions: Permission[], userId = 'u1') => ({ permissions, userId });

describe('facilities access rules', () => {
  it('separates viewing, booking and managing', () => {
    expect(canViewFacilities(access(['facilities.book']))).toBe(true);
    expect(canViewFacilities(access(['inventory.view']))).toBe(false);
    expect(canRequestBooking(access(['facilities.view']))).toBe(false);
    expect(canRequestBooking(access(['facilities.manage']))).toBe(true);
    expect(canViewInventory(access(['inventory.manage']))).toBe(true);
    expect(canManageInventory(access(['inventory.view']))).toBe(false);
  });

  it('lets requesters cancel and edit only their own live bookings', () => {
    const own = { requestedBy: 'u1', status: 'approved' as const };
    const other = { requestedBy: 'u2', status: 'pending' as const };
    expect(canCancelBooking(access(['facilities.book']), own)).toBe(true);
    expect(canCancelBooking(access(['facilities.book']), other)).toBe(false);
    expect(canCancelBooking(access(['facilities.view']), own)).toBe(false);
    expect(canCancelBooking(access(['facilities.manage']), other)).toBe(true);
    expect(canEditBooking(access(['facilities.book']), own)).toBe(true);
    expect(canEditBooking(access(['facilities.manage']), { ...other, status: 'rejected' })).toBe(
      false,
    );
    expect(canSeeBookingNotes(access(['facilities.book']), other)).toBe(false);
    expect(canSeeBookingNotes(access(['facilities.manage']), other)).toBe(true);
  });
});

describe('facilities helpers', () => {
  it('formats asset codes and overdue loans', () => {
    expect(formatAssetCode(42)).toBe('INV-0042');
    expect(formatAssetCode(12345)).toBe('INV-12345');
    expect(isLoanOverdue({ dueDate: '2026-10-01', returnedAt: null }, '2026-10-02')).toBe(true);
    expect(isLoanOverdue({ dueDate: '2026-10-02', returnedAt: null }, '2026-10-02')).toBe(false);
    expect(
      isLoanOverdue({ dueDate: '2026-10-01', returnedAt: '2026-10-05T00:00:00Z' }, '2026-10-09'),
    ).toBe(false);
    expect(isLoanOverdue({ dueDate: null, returnedAt: null }, '2026-10-09')).toBe(false);
  });

  it('keys occurrences by their UTC start date', () => {
    expect(occurrenceDateOf('2026-10-25T06:00:00+07:00')).toBe('2026-10-24');
    expect(latestRecurrenceUntil('2026-01-01T10:00:00Z')).toBe('2027-12-30');
  });

  it('expands one-off bookings only once and clips to the window', () => {
    const single = {
      startsAt: '2026-10-01T10:00:00.000Z',
      endsAt: '2026-10-01T12:00:00.000Z',
      recurrence: 'none' as const,
      recurrenceUntil: null,
    };
    expect(bookingOccurrences(single, '2026-10-01T11:00:00Z', '2026-10-02T00:00:00Z')).toHaveLength(
      1,
    );
    expect(bookingOccurrences(single, '2026-10-01T12:00:00Z', '2026-10-02T00:00:00Z')).toEqual([]);
  });
});

describe('facilities schemas', () => {
  const booking = {
    resourceId: crypto.randomUUID(),
    title: 'Latihan Paduan Suara',
    startsAt: '2026-11-01T10:00:00Z',
    endsAt: '2026-11-01T12:00:00Z',
  };

  it('checks times and weekly limits', () => {
    expect(facilityBookingInputSchema.safeParse(booking).success).toBe(true);
    expect(
      facilityBookingInputSchema.safeParse({ ...booking, endsAt: '2026-11-09T12:00:00Z' }).success,
    ).toBe(false);
    const tooLong = facilityBookingInputSchema.safeParse({
      ...booking,
      recurrence: 'weekly',
      recurrenceUntil: '2029-01-01',
    });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]?.path).toEqual(['recurrenceUntil']);
    expect(
      bookingAvailabilityBodySchema.safeParse({
        ...booking,
        recurrence: 'weekly',
        recurrenceUntil: '2026-12-31',
      }).success,
    ).toBe(true);
  });

  it('bounds the schedule window', () => {
    expect(
      facilityScheduleQuerySchema.safeParse({
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-08T00:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      facilityScheduleQuerySchema.safeParse({
        from: '2026-11-01T00:00:00Z',
        to: '2027-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('needs a borrower for a loan', () => {
    expect(checkOutAssetBodySchema.safeParse({}).success).toBe(false);
    expect(checkOutAssetBodySchema.safeParse({ borrowerName: 'Panitia Natal' }).success).toBe(true);
  });
});
