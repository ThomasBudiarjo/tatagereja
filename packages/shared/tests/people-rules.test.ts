import { describe, expect, it } from 'bun:test';
import {
  callName,
  canEditPersonPrivacy,
  canEditPersonProfile,
  canRequestToJoinGroup,
  canSeeGroup,
  groupDetailsPatchSchema,
  normalizeImportDate,
  normalizeImportRow,
  normalizeName,
  normalizePhone,
  peopleAgeBandOf,
  personImportRowSchema,
  type AccessLike,
  type Permission,
} from '../src';

const access = (
  permissions: readonly Permission[],
  extra: Partial<AccessLike> = {},
): AccessLike => ({
  userId: 'u1',
  role: 'member',
  leaderGroupIds: [],
  personId: 'p1',
  permissions,
  ...extra,
});

const person = { id: 'p2', userId: null };
const scope = { groupIds: ['g1'], coordinatedAreaIds: [], areaId: 'a1' };

describe('people rules', () => {
  it('scopes profile edits to editors, the person, their leaders and area coordinators', () => {
    expect(canEditPersonProfile(access([]), person, scope)).toBe(false);
    expect(canEditPersonProfile(access(['people.edit']), person, scope)).toBe(true);
    expect(canEditPersonProfile(access([]), { id: 'p1', userId: null }, scope)).toBe(true);
    expect(canEditPersonProfile(access([], { leaderGroupIds: ['g1'] }), person, scope)).toBe(true);
    expect(canEditPersonProfile(access([]), person, { ...scope, coordinatedAreaIds: ['a1'] })).toBe(
      true,
    );
    expect(canEditPersonProfile(access([]), person, { ...scope, coordinatedAreaIds: ['a2'] })).toBe(
      false,
    );
  });

  it('keeps scoped editors off people whose account holds more than they do', () => {
    const leader = access(['people.view'], { leaderGroupIds: ['g1'] });
    const linked = { id: 'p2', userId: 'u2' };
    const peer = { ...scope, linkedPermissions: ['people.view'] as Permission[] };
    const pastor = {
      ...scope,
      linkedPermissions: ['people.view', 'care.confidential'] as Permission[],
    };
    expect(canEditPersonProfile(leader, linked, peer)).toBe(true);
    expect(canEditPersonProfile(leader, linked, pastor)).toBe(false);
    expect(canEditPersonProfile(access(['people.edit']), linked, pastor)).toBe(true);
    expect(canEditPersonProfile(access([], { userId: 'u2' }), linked, pastor)).toBe(true);
  });

  it('lets people and private editors change directory privacy', () => {
    expect(canEditPersonPrivacy(access([]), person)).toBe(false);
    expect(canEditPersonPrivacy(access(['people.private.edit']), person)).toBe(true);
    expect(canEditPersonPrivacy(access([]), { id: 'p9', userId: 'u1' })).toBe(true);
  });

  it('hides private groups and only allows requests to open public groups', () => {
    const group = { id: 'g1', visibility: 'private' as const };
    expect(canSeeGroup(access(['groups.view']), group, false)).toBe(false);
    expect(canSeeGroup(access(['groups.view']), group, true)).toBe(true);
    expect(canSeeGroup(access(['groups.manage']), group, false)).toBe(true);
    expect(canSeeGroup(access([], { leaderGroupIds: ['g1'] }), group, false)).toBe(true);

    const open = { visibility: 'public' as const, joinPolicy: 'request' as const, isActive: true };
    expect(canRequestToJoinGroup(access(['groups.view']), open, 'none')).toBe(true);
    expect(canRequestToJoinGroup(access(['groups.view']), open, 'pending')).toBe(false);
    expect(canRequestToJoinGroup(access(['groups.view'], { personId: null }), open, 'none')).toBe(
      false,
    );
    expect(
      canRequestToJoinGroup(access(['groups.view']), { ...open, joinPolicy: 'closed' }, 'none'),
    ).toBe(false);
  });

  it('only changes the group fields that are sent', () => {
    expect(groupDetailsPatchSchema.parse({ location: 'Aula' })).toEqual({ location: 'Aula' });
    expect(groupDetailsPatchSchema.safeParse({ meetingTime: '7:00' }).success).toBe(false);
  });
});

describe('import helpers', () => {
  it('understands Indonesian values and day-first dates', () => {
    expect(normalizeImportDate('17/08/1945')).toBe('1945-08-17');
    expect(normalizeImportDate('1-2-2000')).toBe('2000-02-01');
    expect(normalizeImportDate('2000/2/1')).toBe('2000-02-01');
    const row = normalizeImportRow({
      firstName: ' Ruth ',
      gender: 'P',
      membershipStatus: 'Simpatisan',
      relationship: 'Istri',
      birthDate: '05/06/1990',
      tags: 'Pemuda, Paduan Suara',
      'field:pekerjaan': 'Guru',
      email: '',
    });
    expect(row).toEqual({
      firstName: 'Ruth',
      gender: 'female',
      membershipStatus: 'visitor',
      relationship: 'spouse',
      birthDate: '1990-06-05',
      tags: ['Pemuda', 'Paduan Suara'],
      customFields: { pekerjaan: 'Guru' },
    });
    expect(personImportRowSchema.safeParse(row).success).toBe(true);
  });

  it('compares names and phone numbers loosely', () => {
    expect(normalizePhone('+62 812-3456-789')).toBe(normalizePhone('0812 3456 789'));
    expect(normalizePhone('123')).toBeNull();
    expect(normalizeName({ firstName: 'Élisabet', lastName: 'Hutapea ' })).toBe('elisabet hutapea');
  });

  it('groups ages into bands', () => {
    expect(peopleAgeBandOf('2020-01-01', '2026-10-22')).toBe('0-12');
    expect(peopleAgeBandOf('1990-01-01', '2026-10-22')).toBe('31-50');
    expect(peopleAgeBandOf(null, '2026-10-22')).toBe('unknown');
  });
});

describe('callName', () => {
  it('greets by the first name, skipping church and courtesy titles', () => {
    expect(callName('Maria Simanjuntak')).toBe('Maria');
    expect(callName('Pdt. Imanuel Pakpahan')).toBe('Imanuel');
    expect(callName('Pnt. Bonar Sitompul')).toBe('Bonar');
    expect(callName('Dkn. Ruth Siregar')).toBe('Ruth');
    expect(callName('  Ibu Sri Wibowo ')).toBe('Sri');
    expect(callName('Pdt.')).toBe('Pdt.');
  });
});
