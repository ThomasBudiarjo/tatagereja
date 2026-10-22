import { describe, expect, it } from 'bun:test';
import {
  blockoutCovers,
  canManageBlockout,
  canManageServingTeam,
  canRespondToAssignment,
  canScheduleTeam,
  liturgyTotalMinutes,
  localDateOf,
  rankRosterCandidates,
  rosterRespondBodySchema,
  serviceWindow,
  songRecentlyUsed,
  windowsOverlap,
  worshipServiceInputSchema,
  type Permission,
} from '../src';

const access = (permissions: readonly Permission[], personId: string | null = 'p1') => ({
  permissions,
  personId,
});

describe('worship rules', () => {
  it('scopes scheduling and team management to leaders', () => {
    expect(canScheduleTeam(access(['volunteers.schedule']), [], 'team-a')).toBe(true);
    expect(canScheduleTeam(access([]), ['team-a'], 'team-a')).toBe(true);
    expect(canScheduleTeam(access([]), ['team-a'], 'team-b')).toBe(false);
    expect(canManageServingTeam(access(['services.manage']), [], 'team-b')).toBe(true);
    expect(canManageServingTeam(access(['volunteers.schedule']), [], 'team-b')).toBe(false);
    expect(canManageServingTeam(access([]), ['team-b'], 'team-b')).toBe(true);
  });

  it('lets only the volunteer or a scheduler answer an assignment', () => {
    const assignment = { personId: 'p1', teamId: 'team-a' };
    expect(canRespondToAssignment(access([]), [], assignment)).toBe(true);
    expect(canRespondToAssignment(access([], 'p2'), [], assignment)).toBe(false);
    expect(canRespondToAssignment(access([], null), [], assignment)).toBe(false);
    expect(canRespondToAssignment(access([], 'p2'), ['team-a'], assignment)).toBe(true);
    expect(canManageBlockout(access([]), 'p1')).toBe(true);
    expect(canManageBlockout(access([]), 'p2')).toBe(false);
    expect(canManageBlockout(access(['volunteers.schedule'], null), 'p2')).toBe(true);
  });

  it('computes liturgy length, service windows and overlaps', () => {
    expect(
      liturgyTotalMinutes([
        { durationMinutes: 5 },
        { durationMinutes: null },
        { durationMinutes: 30 },
      ]),
    ).toBe(35);
    const morning = serviceWindow({ startsAt: '2026-10-25T00:00:00.000Z', endsAt: null });
    expect(morning.end - morning.start).toBe(120 * 60_000);
    const later = serviceWindow({
      startsAt: '2026-10-25T02:00:00.000Z',
      endsAt: '2026-10-25T03:00:00.000Z',
    });
    expect(windowsOverlap(morning, later)).toBe(false);
    const overlapping = serviceWindow({ startsAt: '2026-10-25T01:30:00.000Z', endsAt: null });
    expect(windowsOverlap(morning, overlapping)).toBe(true);
  });

  it('reads service days in the church time zone', () => {
    // 23:30 UTC on the 24th is already Sunday the 25th in Jakarta.
    expect(localDateOf('2026-10-24T23:30:00.000Z', 'Asia/Jakarta')).toBe('2026-10-25');
    expect(localDateOf('2026-10-24T23:30:00.000Z', 'UTC')).toBe('2026-10-24');
    expect(blockoutCovers({ startDate: '2026-10-20', endDate: '2026-10-25' }, '2026-10-25')).toBe(
      true,
    );
    expect(blockoutCovers({ startDate: '2026-10-20', endDate: '2026-10-25' }, '2026-10-26')).toBe(
      false,
    );
  });

  it('flags songs sung in the last weeks', () => {
    const now = '2026-10-25T00:00:00.000Z';
    expect(songRecentlyUsed('2026-10-11T00:00:00.000Z', now)).toBe(true);
    expect(songRecentlyUsed('2026-09-01T00:00:00.000Z', now)).toBe(false);
    expect(songRecentlyUsed(null, now)).toBe(false);
  });

  it('ranks roster candidates by fairness', () => {
    const person = (
      firstName: string,
      timesServed: number,
      lastServedAt: string | null,
      conflicts: string[] = [],
    ) => ({
      firstName,
      lastName: null,
      timesServed,
      lastServedAt,
      conflicts,
    });
    const ranked = rankRosterCandidates([
      person('Andreas', 3, '2026-10-18T00:00:00.000Z'),
      person('Maria', 1, '2026-10-18T00:00:00.000Z'),
      person('Daniel', 0, null, ['blockout']),
      person('Ruth', 1, '2026-09-20T00:00:00.000Z'),
      person('Ester', 0, null),
    ]);
    expect(ranked.map((item) => item.firstName)).toEqual([
      'Ester',
      'Ruth',
      'Maria',
      'Andreas',
      'Daniel',
    ]);
  });

  it('validates service and reply input', () => {
    const bad = worshipServiceInputSchema.safeParse({
      title: 'Ibadah',
      startsAt: '2026-10-25T09:00:00+07:00',
      endsAt: '2026-10-25T08:00:00+07:00',
    });
    expect(bad.success).toBe(false);
    expect(rosterRespondBodySchema.safeParse({ status: 'declined' }).success).toBe(false);
    expect(rosterRespondBodySchema.safeParse({ status: 'declined', reason: 'Sakit' }).success).toBe(
      true,
    );
  });
});
