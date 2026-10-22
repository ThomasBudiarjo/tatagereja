import { describe, expect, it } from 'bun:test';
import {
  BASE_ROLE_PERMISSIONS,
  ageOn,
  announcementStateOf,
  applyPersonPrivacy,
  bookingOccurrences,
  canApproveExpense,
  canReadCareCase,
  canVerifyOfferingBatch,
  canViewPrayerRequest,
  daysUntilAnniversary,
  denominationTotal,
  facilityBookingInputSchema,
  formatRecordNumber,
  holdsManagementPermission,
  isRatioExceeded,
  lockoutDelayMinutes,
  offeringBatchInputSchema,
  passwordStrength,
  recordStatusEffect,
  registryRecordInputSchema,
  securityCodeSchema,
  totpCodeSchema,
  type AccessLike,
  type Permission,
} from '../src';

const access = (permissions: readonly Permission[], userId = 'u1'): AccessLike => ({
  userId,
  role: 'member',
  leaderGroupIds: [],
  personId: 'p1',
  permissions,
});

describe('admin-security helpers', () => {
  it('rates passwords and locks accounts progressively', () => {
    expect(passwordStrength('password123').strength).toBe('very_weak');
    expect(passwordStrength('Kasih-Setia 2026!').strength).toBe('strong');
    expect(lockoutDelayMinutes(4)).toBe(0);
    expect(lockoutDelayMinutes(5)).toBe(1);
    expect(lockoutDelayMinutes(7)).toBe(4);
    expect(lockoutDelayMinutes(50)).toBe(60);
    expect(totpCodeSchema.parse('123 456')).toBe('123456');
    expect(totpCodeSchema.safeParse('12345a').success).toBe(false);
  });

  it('applies the 2FA policy only to members with management permissions', () => {
    expect(holdsManagementPermission(access(BASE_ROLE_PERMISSIONS.member))).toBe(false);
    expect(
      holdsManagementPermission(access([...BASE_ROLE_PERMISSIONS.member, 'finance.view'])),
    ).toBe(true);
  });
});

describe('people helpers', () => {
  it('computes ages and anniversaries', () => {
    expect(ageOn('1990-10-25', '2026-10-22')).toBe(35);
    expect(daysUntilAnniversary('1990-10-25', '2026-10-22')).toBe(3);
    expect(daysUntilAnniversary('1990-10-01', '2026-10-22')).toBe(344);
  });

  it('hides private contact fields unless the caller may see them', () => {
    const person = {
      id: 'p2',
      userId: 'u2',
      phone: '0812',
      email: 'a@b.co',
      address: 'Jl. Damai',
      birthDate: '2000-01-01',
    };
    const privacy = { showPhone: false, showEmail: true, showAddress: false, showBirthday: true };
    expect(applyPersonPrivacy(access([]), person, privacy)).toMatchObject({
      phone: null,
      email: 'a@b.co',
      address: null,
    });
    expect(applyPersonPrivacy(access(['people.private.view']), person, privacy).phone).toBe('0812');
    expect(applyPersonPrivacy(access([], 'u2'), person, privacy).phone).toBe('0812');
  });
});

describe('comms helpers', () => {
  it('derives the announcement state', () => {
    const now = Date.parse('2026-10-22T00:00:00Z');
    const base = { status: 'published' as const, publishAt: null, expiresAt: null };
    expect(announcementStateOf({ ...base, status: 'draft' }, now)).toBe('draft');
    expect(announcementStateOf({ ...base, publishAt: '2026-10-23T00:00:00Z' }, now)).toBe(
      'scheduled',
    );
    expect(announcementStateOf({ ...base, expiresAt: '2026-10-21T00:00:00Z' }, now)).toBe(
      'expired',
    );
    expect(announcementStateOf(base, now)).toBe('published');
  });
});

describe('care rules', () => {
  it('keeps confidential cases away from administrators without care.confidential', () => {
    const confidential = { confidentiality: 'confidential' as const };
    expect(canReadCareCase(access(['care.view', 'care.manage']), confidential, [])).toBe(false);
    expect(canReadCareCase(access(['care.confidential']), confidential, [])).toBe(true);
    expect(canReadCareCase(access([]), confidential, ['u1'])).toBe(true);
    expect(canReadCareCase(access(['care.view']), { confidentiality: 'normal' }, [])).toBe(true);
  });

  it('shows prayer requests by visibility and moderation', () => {
    const request = {
      submittedBy: 'u9',
      visibility: 'church' as const,
      moderationStatus: 'pending' as const,
    };
    expect(canViewPrayerRequest(access([]), request)).toBe(false);
    expect(canViewPrayerRequest(access(['prayer.moderate']), request)).toBe(true);
    expect(canViewPrayerRequest(access([]), { ...request, moderationStatus: 'approved' })).toBe(
      true,
    );
    expect(canViewPrayerRequest(access(['care.view']), { ...request, visibility: 'pastors' })).toBe(
      false,
    );
  });
});

describe('records helpers', () => {
  it('numbers records and describes membership side effects', () => {
    expect(formatRecordNumber('B/{YYYY}/{NNN}', { type: 'baptism', year: 2026, sequence: 7 })).toBe(
      'B/2026/007',
    );
    expect(formatRecordNumber('{TYPE}-{YY}-{N}', { type: 'sidi', year: 2026, sequence: 12 })).toBe(
      'S-26-12',
    );
    expect(recordStatusEffect('death', null, 'member')).toBe('inactive');
    expect(recordStatusEffect('transfer_in', null, 'visitor')).toBe('member');
    expect(recordStatusEffect('baptism', 'infant', 'visitor')).toBe('regular');
    expect(recordStatusEffect('baptism', 'adult', 'member')).toBeNull();
  });

  it('requires two spouses for a marriage', () => {
    const base = { type: 'marriage', date: '2026-10-22' };
    expect(
      registryRecordInputSchema.safeParse({ ...base, people: [{ name: 'A', role: 'spouse' }] })
        .success,
    ).toBe(false);
    expect(
      registryRecordInputSchema.safeParse({
        ...base,
        people: [
          { name: 'A', role: 'spouse' },
          { name: 'B', role: 'spouse' },
          { name: 'C', role: 'witness' },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('finance rules', () => {
  it('enforces segregation of duties', () => {
    expect(canApproveExpense(access(['finance.approve']), { requestedBy: 'u1' })).toBe(false);
    expect(canApproveExpense(access(['finance.approve']), { requestedBy: 'u2' })).toBe(true);
    const batch = { counter1UserId: 'u1', counter2UserId: 'u2', createdBy: 'u1' };
    expect(canVerifyOfferingBatch(access(['finance.approve']), batch)).toBe(false);
    expect(canVerifyOfferingBatch(access(['finance.approve'], 'u3'), batch)).toBe(true);
  });

  it('checks counted denominations and two counters', () => {
    expect(denominationTotal({ '100000': 3, '5000': 2 })).toBe(310_000);
    const line = {
      fundId: crypto.randomUUID(),
      amount: 300_000,
      denominations: { '100000': 3 },
    };
    const batch = {
      serviceDate: '2026-10-18',
      accountId: crypto.randomUUID(),
      lines: [line],
      counter1Name: 'Budi',
    };
    expect(offeringBatchInputSchema.safeParse(batch).success).toBe(false);
    expect(offeringBatchInputSchema.safeParse({ ...batch, counter2Name: 'Sari' }).success).toBe(
      true,
    );
    expect(
      offeringBatchInputSchema.safeParse({
        ...batch,
        counter2Name: 'Sari',
        lines: [{ ...line, amount: 250_000 }],
      }).success,
    ).toBe(false);
  });
});

describe('facilities helpers', () => {
  it('expands weekly bookings and validates the range', () => {
    const occurrences = bookingOccurrences(
      {
        startsAt: '2026-10-01T10:00:00.000Z',
        endsAt: '2026-10-01T12:00:00.000Z',
        recurrence: 'weekly',
        recurrenceUntil: '2026-10-22',
      },
      '2026-10-05T00:00:00.000Z',
      '2026-12-01T00:00:00.000Z',
      ['2026-10-15'],
    );
    expect(occurrences.map((item) => item.startsAt.slice(0, 10))).toEqual([
      '2026-10-08',
      '2026-10-22',
    ]);
    expect(
      facilityBookingInputSchema.safeParse({
        resourceId: crypto.randomUUID(),
        title: 'Latihan',
        startsAt: '2026-10-01T10:00:00Z',
        endsAt: '2026-10-01T12:00:00Z',
        recurrence: 'weekly',
      }).success,
    ).toBe(false);
  });
});

describe('checkin helpers', () => {
  it('normalises security codes and warns about ratios', () => {
    expect(securityCodeSchema.parse(' ab2c ')).toBe('AB2C');
    expect(securityCodeSchema.safeParse('AB0C').success).toBe(false);
    expect(isRatioExceeded(9, 1, 8)).toBe(true);
    expect(isRatioExceeded(8, 1, 8)).toBe(false);
    expect(isRatioExceeded(3, 0, 8)).toBe(true);
    expect(isRatioExceeded(3, 0, null)).toBe(false);
  });
});
