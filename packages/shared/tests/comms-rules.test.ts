import { describe, expect, it } from 'bun:test';
import {
  announcementDetailsInputSchema,
  calendarQuerySchema,
  calendarSourcesFor,
  canCheckInEvent,
  canSeeBulletinFinance,
  churchDateOf,
  defaultBulletinSections,
  isInAnnouncementAudience,
  isRegistrationOpen,
  isSelfCheckInOpen,
  markdownExcerpt,
  placesTaken,
  seriesOccurrenceStarts,
  type AccessLike,
  type Permission,
} from '../src';

const access = (
  permissions: readonly Permission[],
  extra: Partial<AccessLike & { roleIds: string[] }> = {},
): AccessLike & { roleIds: string[] } => ({
  userId: 'u1',
  role: 'member',
  leaderGroupIds: [],
  personId: 'p1',
  permissions,
  roleIds: [],
  ...extra,
});

describe('recurring series', () => {
  it('keeps the church-local time and skips short months', () => {
    // 18:00 WIB on a Wednesday.
    expect(
      seriesOccurrenceStarts(
        { startsAt: '2026-11-04T11:00:00.000Z', frequency: 'weekly', untilDate: '2026-11-25' },
        'Asia/Jakarta',
      ),
    ).toEqual([
      '2026-11-04T11:00:00.000Z',
      '2026-11-11T11:00:00.000Z',
      '2026-11-18T11:00:00.000Z',
      '2026-11-25T11:00:00.000Z',
    ]);
    // 06:00 WIB on 1 December is still 30 November in UTC: the local date decides.
    expect(
      seriesOccurrenceStarts(
        { startsAt: '2026-11-30T23:00:00.000Z', frequency: 'monthly', untilDate: '2027-02-01' },
        'Asia/Jakarta',
      ),
    ).toEqual(['2026-11-30T23:00:00.000Z', '2026-12-31T23:00:00.000Z', '2027-01-31T23:00:00.000Z']);
    expect(
      seriesOccurrenceStarts(
        { startsAt: '2027-01-31T02:00:00.000Z', frequency: 'monthly', untilDate: '2027-05-31' },
        'Asia/Jakarta',
      ).map((start) => churchDateOf(start, 'Asia/Jakarta')),
    ).toEqual(['2027-01-31', '2027-03-31', '2027-05-31']);
    expect(
      seriesOccurrenceStarts(
        { startsAt: '2026-11-04T11:00:00.000Z', frequency: 'biweekly', untilDate: '2026-12-02' },
        'Asia/Jakarta',
      ),
    ).toHaveLength(3);
  });

  it('follows daylight saving in zones that have it', () => {
    const starts = seriesOccurrenceStarts(
      { startsAt: '2026-10-21T16:00:00.000Z', frequency: 'weekly', untilDate: '2026-11-04' },
      'Europe/Amsterdam',
    );
    // 18:00 local before and after the clocks go back on 25 October.
    expect(starts).toEqual([
      '2026-10-21T16:00:00.000Z',
      '2026-10-28T17:00:00.000Z',
      '2026-11-04T17:00:00.000Z',
    ]);
  });
});

describe('announcement rules', () => {
  it('derives the audience from the older form', () => {
    const group = announcementDetailsInputSchema.parse({
      title: 'Latihan',
      body: 'Sabtu',
      groupId: '7c1f0e9e-6b55-4a59-9a0c-8d3c7b0f1a2b',
    });
    expect(group.audience).toBe('group');
    const church = announcementDetailsInputSchema.parse({
      title: 'Ibadah',
      body: 'Minggu',
      audience: 'church',
      groupId: '7c1f0e9e-6b55-4a59-9a0c-8d3c7b0f1a2b',
      roleIds: ['7c1f0e9e-6b55-4a59-9a0c-8d3c7b0f1a2b'],
    });
    expect(church.groupId).toBeNull();
    expect(church.roleIds).toEqual([]);
  });

  it('matches the audience', () => {
    const group = { audience: 'group' as const, groupId: 'g1', roleIds: [] };
    expect(isInAnnouncementAudience(access([]), group, [])).toBe(false);
    expect(isInAnnouncementAudience(access([]), group, ['g1'])).toBe(true);
    expect(isInAnnouncementAudience(access([], { leaderGroupIds: ['g1'] }), group, [])).toBe(true);
    const roles = { audience: 'roles' as const, groupId: null, roleIds: ['r1'] };
    expect(isInAnnouncementAudience(access([]), roles, [])).toBe(false);
    expect(isInAnnouncementAudience(access([], { roleIds: ['r1'] }), roles, [])).toBe(true);
  });

  it('writes plain excerpts', () => {
    expect(markdownExcerpt('**Penting:** baca [di sini](https://x.id)\n\n- satu\n- dua')).toBe(
      'Penting: baca di sini satu dua',
    );
    expect(markdownExcerpt('a'.repeat(50), 10)).toBe('aaaaaaaaa…');
  });
});

describe('registration and check-in rules', () => {
  const now = Date.parse('2026-11-01T10:00:00Z');
  const event = {
    registrationRequired: true,
    registrationClosesAt: null,
    cancelledAt: null,
    startsAt: '2026-11-02T10:00:00Z',
    endsAt: null,
    checkInEnabled: true,
  };

  it('opens and closes registration', () => {
    expect(isRegistrationOpen(event, now)).toBe(true);
    expect(
      isRegistrationOpen({ ...event, registrationClosesAt: '2026-11-01T09:00:00Z' }, now),
    ).toBe(false);
    expect(isRegistrationOpen({ ...event, cancelledAt: '2026-11-01T00:00:00Z' }, now)).toBe(false);
    expect(isRegistrationOpen({ ...event, startsAt: '2026-11-01T09:00:00Z' }, now)).toBe(false);
    expect(isRegistrationOpen({ ...event, registrationRequired: false }, now)).toBe(false);
    expect(
      placesTaken([
        { status: 'registered', partySize: 2 },
        { status: 'waitlisted', partySize: 3 },
        { status: 'cancelled', partySize: 1 },
      ]),
    ).toBe(2);
  });

  it('opens self check-in two hours before the start', () => {
    expect(isSelfCheckInOpen(event, Date.parse('2026-11-02T07:59:00Z'))).toBe(false);
    expect(isSelfCheckInOpen(event, Date.parse('2026-11-02T08:00:00Z'))).toBe(true);
    expect(isSelfCheckInOpen(event, Date.parse('2026-11-02T21:59:00Z'))).toBe(true);
    expect(isSelfCheckInOpen(event, Date.parse('2026-11-02T22:01:00Z'))).toBe(false);
    expect(
      isSelfCheckInOpen({ ...event, checkInEnabled: false }, Date.parse('2026-11-02T10:00:00Z')),
    ).toBe(false);
  });

  it('lets recorders, event managers and the group leader check people in', () => {
    expect(canCheckInEvent(access([]), { groupId: 'g1' })).toBe(false);
    expect(canCheckInEvent(access(['attendance.record']), { groupId: null })).toBe(true);
    expect(canCheckInEvent(access(['events.manage']), { groupId: null })).toBe(true);
    expect(canCheckInEvent(access([], { leaderGroupIds: ['g1'] }), { groupId: 'g1' })).toBe(true);
  });
});

describe('calendar and bulletin rules', () => {
  it('offers the sources a person may see', () => {
    const all = ['worship', 'facilities', 'finance'];
    expect(
      calendarSourcesFor(
        access(['events.view', 'services.view', 'facilities.view', 'people.view']),
        all,
      ),
    ).toEqual(['events', 'services', 'bookings', 'birthdays']);
    expect(calendarSourcesFor(access(['events.view', 'services.view']), [])).toEqual(['events']);
    expect(calendarSourcesFor(access([]), all)).toEqual([]);
  });

  it('parses the calendar query', () => {
    const parsed = calendarQuerySchema.parse({
      from: '2026-11-01T00:00:00Z',
      to: '2026-12-01T00:00:00Z',
      sources: 'events,birthdays,unknown,events',
    });
    expect(parsed.sources).toEqual(['events', 'birthdays']);
    expect(
      calendarQuerySchema.parse({ from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' })
        .sources,
    ).toEqual(['events', 'services', 'bookings']);
    expect(
      calendarQuerySchema.safeParse({ from: '2026-11-01T00:00:00Z', to: '2027-11-01T00:00:00Z' })
        .success,
    ).toBe(false);
  });

  it('keeps the offering summary for finance.reports with finance on', () => {
    expect(canSeeBulletinFinance(access(['finance.reports']), ['finance'])).toBe(true);
    expect(canSeeBulletinFinance(access(['finance.reports']), [])).toBe(false);
    expect(canSeeBulletinFinance(access(['bulletin.manage']), ['finance'])).toBe(false);
    expect(defaultBulletinSections('id').map((section) => section.title)).toContain(
      'Jadwal pelayanan',
    );
  });
});
