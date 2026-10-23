import { describe, expect, it } from 'bun:test';
import {
  BASE_ROLE_PERMISSIONS,
  GRANTABLE_PERMISSIONS,
  MODULES,
  OWNER_ONLY_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  PERMISSIONS,
  ROLE_TEMPLATES,
  ROLE_TEMPLATE_KEYS,
  can,
  canGrant,
  canGrantBaseRole,
  effectivePermissions,
  has,
  isAdmin,
  isModuleEnabled,
  isPermission,
  manageableGroupIds,
  normalizePermissions,
  templatePermissions,
  type AccessLike,
  type ChurchRole,
  type Permission,
} from '../src';

const accessFor = (
  role: ChurchRole,
  extras: Partial<Omit<AccessLike, 'role'>> & { custom?: Permission[][] } = {},
): AccessLike => ({
  userId: extras.userId ?? `u-${role}`,
  role,
  leaderGroupIds: extras.leaderGroupIds ?? [],
  personId: extras.personId === undefined ? `p-${role}` : extras.personId,
  permissions: effectivePermissions(role, extras.custom ?? []),
});

const owner = accessFor('owner', { userId: 'u-owner', personId: 'p-owner' });
const admin = accessFor('administrator', { userId: 'u-admin', personId: null });
const leader = accessFor('member', {
  userId: 'u-leader',
  personId: 'p-leader',
  leaderGroupIds: ['g1'],
});
const member = accessFor('member', { userId: 'u-member', personId: 'p-member' });

describe('permission catalog', () => {
  it('has unique, well-formed keys with labels and descriptions in both languages', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const definition of PERMISSION_DEFINITIONS) {
      expect(definition.key).toMatch(/^[a-z]+(\.[a-z]+)+$/);
      expect(MODULES.some((module) => module.id === definition.module)).toBe(true);
      for (const text of [definition.label, definition.description]) {
        expect(text.en.length).toBeGreaterThan(0);
        expect(text.id.length).toBeGreaterThan(0);
      }
    }
  });

  it('covers the keys every module relies on', () => {
    const required = [
      'church.edit',
      'church.delete',
      'church.transfer',
      'members.view',
      'members.manage',
      'roles.manage',
      'invitations.manage',
      'settings.manage',
      'audit.view',
      'people.view',
      'people.create',
      'people.edit',
      'people.delete',
      'people.private.view',
      'people.private.edit',
      'people.link',
      'people.export',
      'people.merge',
      'households.manage',
      'areas.manage',
      'groups.create',
      'groups.manage',
      'groups.delete',
      'groups.leaders.assign',
      'events.manage',
      'attendance.view',
      'attendance.record',
      'announcements.manage',
      'notifications.broadcast',
      'bulletin.manage',
      'records.view',
      'records.manage',
      'care.view',
      'care.manage',
      'care.confidential',
      'prayer.moderate',
      'finance.view',
      'finance.record',
      'finance.approve',
      'finance.manage',
      'finance.reports',
      'services.view',
      'services.manage',
      'volunteers.schedule',
      'facilities.view',
      'facilities.book',
      'facilities.manage',
      'inventory.manage',
      'checkin.operate',
      'checkin.manage',
      'reports.view',
    ];
    for (const key of required) expect(isPermission(key)).toBe(true);
    expect(isPermission('nope.nothing')).toBe(false);
  });

  it('keeps the Permission type exact', () => {
    // @ts-expect-error unknown keys are not permissions
    const unknown: Permission = 'finance.steal';
    expect(isPermission(unknown)).toBe(false);
  });

  it('groups every permission under exactly one module, in module order', () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((p) => p.key));
    expect(grouped.sort()).toEqual([...PERMISSIONS].sort());
    const order = MODULES.map((module) => module.id);
    const groupOrder = PERMISSION_GROUPS.map((group) => order.indexOf(group.module));
    expect(groupOrder).toEqual([...groupOrder].sort((a, b) => a - b));
  });

  it('normalizes stored permission lists', () => {
    expect(normalizePermissions(['finance.view', 'bogus', 'church.edit', 'finance.view'])).toEqual([
      'church.edit',
      'finance.view',
    ]);
  });
});

describe('built-in roles', () => {
  it('gives the owner everything', () => {
    expect([...BASE_ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('gives administrators everything except owner-only and confidential care', () => {
    for (const key of PERMISSIONS) {
      const expected = !OWNER_ONLY_PERMISSIONS.includes(key) && key !== 'care.confidential';
      expect(BASE_ROLE_PERMISSIONS.administrator.includes(key)).toBe(expected);
    }
    expect(OWNER_ONLY_PERMISSIONS).toEqual(
      expect.arrayContaining(['church.delete', 'church.transfer']),
    );
  });

  it('gives members basic viewing and requests only', () => {
    expect([...BASE_ROLE_PERMISSIONS.member].sort()).toEqual(
      (
        [
          'announcements.view',
          'bulletin.view',
          'events.view',
          'facilities.book',
          'facilities.view',
          'groups.view',
          'people.view',
          'prayer.submit',
          'services.view',
        ] as Permission[]
      ).sort(),
    );
  });

  it('matches the role matrix for owner, administrator, leader and member', () => {
    const matrix: [keyof typeof can, (a: AccessLike) => boolean, boolean[]][] = [
      ['editChurch', can.editChurch, [true, true, false, false]],
      ['deleteChurch', can.deleteChurch, [true, false, false, false]],
      ['transferOwnership', can.transferOwnership, [true, false, false, false]],
      ['viewMembers', can.viewMembers, [true, true, false, false]],
      ['manageRoles', can.manageRoles, [true, true, false, false]],
      ['createInvitations', can.createInvitations, [true, true, false, false]],
      ['manageSettings', can.manageSettings, [true, true, false, false]],
      ['viewAuditLog', can.viewAuditLog, [true, true, false, false]],
      ['viewDirectory', can.viewDirectory, [true, true, true, true]],
      ['createPerson', can.createPerson, [true, true, false, false]],
      ['deletePerson', can.deletePerson, [true, true, false, false]],
      ['linkPersonUser', can.linkPersonUser, [true, true, false, false]],
      ['createGroup', can.createGroup, [true, true, false, false]],
      ['assignGroupLeaders', can.assignGroupLeaders, [true, true, false, false]],
      ['viewAttendanceOverview', can.viewAttendanceOverview, [true, true, true, false]],
      ['createAnyEvent', can.createAnyEvent, [true, true, true, false]],
      ['createAnyAnnouncement', can.createAnyAnnouncement, [true, true, true, false]],
      ['leaveChurch', can.leaveChurch, [false, true, true, true]],
    ];
    for (const [name, rule, expected] of matrix) {
      const actual = [owner, admin, leader, member].map((access) => rule(access));
      expect({ name, actual }).toEqual({ name, actual: expected });
    }
  });
});

describe('member and role management', () => {
  it('protects the owner and the caller from role changes', () => {
    expect(can.changeMemberRole(admin, { role: 'member', userId: 'u-x' })).toBe(true);
    expect(can.changeMemberRole(admin, { role: 'owner', userId: 'u-owner' })).toBe(false);
    expect(can.changeMemberRole(admin, { role: 'administrator', userId: 'u-admin' })).toBe(false);
    expect(can.changeMemberRole(owner, { role: 'owner', userId: 'u-owner' })).toBe(false);
    expect(can.removeMember(member, { role: 'member', userId: 'u-x' })).toBe(false);
    expect(can.suspendMember(admin, { role: 'member', userId: 'u-x' })).toBe(true);
  });

  it('stops a custom member manager from creating or touching administrators', () => {
    const manager = accessFor('member', { custom: [['members.manage', 'members.view']] });
    expect(can.removeMember(manager, { role: 'member', userId: 'u-x' })).toBe(true);
    expect(can.changeMemberRole(manager, { role: 'member', userId: 'u-x' }, 'member')).toBe(true);
    expect(can.changeMemberRole(manager, { role: 'member', userId: 'u-x' }, 'administrator')).toBe(
      false,
    );
    expect(can.removeMember(manager, { role: 'administrator', userId: 'u-y' })).toBe(false);
    expect(can.suspendMember(manager, { role: 'administrator', userId: 'u-y' })).toBe(false);
  });

  it('stops anyone from acting on a member who holds more than they do', () => {
    const counsellor = effectivePermissions('member', [['care.view', 'care.confidential']]);
    const target = { role: 'member' as const, userId: 'u-x', permissions: counsellor };
    expect(can.removeMember(admin, target)).toBe(false);
    expect(can.suspendMember(admin, target)).toBe(false);
    expect(can.changeMemberRole(admin, target, 'administrator')).toBe(false);
    expect(can.removeMember(owner, target)).toBe(true);
    expect(
      can.removeMember(admin, { ...target, permissions: effectivePermissions('member') }),
    ).toBe(true);
  });

  it('lets member managers make reset links only for members they could manage', () => {
    expect(can.resetMemberPassword(admin, { role: 'member', userId: 'u-x' })).toBe(true);
    expect(can.resetMemberPassword(admin, { role: 'owner', userId: 'u-owner' })).toBe(false);
    expect(can.resetMemberPassword(admin, { role: 'administrator', userId: 'u-admin' })).toBe(
      false,
    );
    expect(can.resetMemberPassword(member, { role: 'member', userId: 'u-x' })).toBe(false);
    const counsellor = effectivePermissions('member', [['care.confidential']]);
    expect(
      can.resetMemberPassword(admin, { role: 'member', userId: 'u-x', permissions: counsellor }),
    ).toBe(false);
    expect(
      can.resetMemberPassword(owner, { role: 'member', userId: 'u-x', permissions: counsellor }),
    ).toBe(true);
  });

  it('lets only administrators invite administrators', () => {
    const inviter = accessFor('member', { custom: [['invitations.manage']] });
    expect(can.inviteWithRole(inviter, 'member')).toBe(true);
    expect(can.inviteWithRole(inviter, 'administrator')).toBe(false);
    expect(can.inviteWithRole(admin, 'administrator')).toBe(true);
    expect(can.inviteWithRole(member, 'member')).toBe(false);
  });

  it('prevents granting permissions the caller does not hold', () => {
    expect(canGrant(owner, ['finance.manage', 'care.confidential'])).toBe(true);
    expect(canGrant(admin, ['finance.manage'])).toBe(true);
    expect(canGrant(admin, ['care.confidential'])).toBe(false);
    expect(canGrant(owner, ['church.delete'])).toBe(false);
    const treasurer = accessFor('member', { custom: [['roles.manage', 'finance.view']] });
    expect(canGrant(treasurer, ['finance.view'])).toBe(true);
    expect(canGrant(treasurer, ['finance.view', 'finance.approve'])).toBe(false);
    expect(can.editCustomRole(treasurer, ['finance.view'])).toBe(true);
    expect(can.editCustomRole(treasurer, ['finance.manage'])).toBe(false);
    expect(can.editCustomRole(member, [])).toBe(false);
    expect(canGrantBaseRole(owner, 'owner')).toBe(false);
    expect(canGrantBaseRole(admin, 'administrator')).toBe(true);
    expect(canGrantBaseRole(treasurer, 'administrator')).toBe(false);
  });

  it('never assigns custom roles to the owner', () => {
    expect(can.assignCustomRole(admin, { role: 'member', userId: 'u-x' }, ['finance.view'])).toBe(
      true,
    );
    expect(can.assignCustomRole(admin, { role: 'owner', userId: 'u-owner' }, [])).toBe(false);
    expect(
      can.assignCustomRole(admin, { role: 'member', userId: 'u-x' }, ['care.confidential']),
    ).toBe(false);
  });
});

describe('custom roles', () => {
  it('adds custom role permissions to the base role', () => {
    const treasurer = accessFor('member', { custom: [templatePermissions('treasurer')] });
    expect(has(treasurer, 'finance.approve')).toBe(true);
    expect(has(treasurer, 'people.view')).toBe(true);
    expect(has(treasurer, 'people.delete')).toBe(false);
    expect(isAdmin(treasurer)).toBe(false);
  });

  it('combines several custom roles', () => {
    const both = accessFor('member', { custom: [['people.create'], ['attendance.record']] });
    expect(can.createPerson(both)).toBe(true);
    expect(can.recordAttendance(both, { groupId: null })).toBe(true);
    expect(can.viewAllAttendance(both)).toBe(true);
    expect(can.deletePerson(both)).toBe(false);
  });

  it('ignores owner-only and unknown keys stored in a custom role', () => {
    const sneaky = effectivePermissions('administrator', [['church.delete', 'made.up']]);
    expect(sneaky.includes('church.delete')).toBe(false);
    expect(GRANTABLE_PERMISSIONS.includes('church.delete')).toBe(false);
  });

  it('lets a custom role grant confidential care to an administrator', () => {
    const pastorAdmin = accessFor('administrator', { custom: [templatePermissions('pastor')] });
    expect(has(pastorAdmin, 'care.confidential')).toBe(true);
    expect(has(admin, 'care.confidential')).toBe(false);
  });

  it('seeds sensible templates', () => {
    expect(ROLE_TEMPLATES.map((template) => template.key)).toEqual([...ROLE_TEMPLATE_KEYS]);
    for (const key of ROLE_TEMPLATE_KEYS) {
      const permissions = templatePermissions(key);
      expect(permissions.length).toBeGreaterThan(0);
      for (const permission of permissions)
        expect(OWNER_ONLY_PERMISSIONS.includes(permission)).toBe(false);
    }
    expect(templatePermissions('pastor')).toContain('care.confidential');
    expect(templatePermissions('treasurer')).toEqual(
      expect.arrayContaining([
        'finance.view',
        'finance.record',
        'finance.approve',
        'finance.manage',
        'finance.reports',
      ]),
    );
    expect(templatePermissions('treasurer')).not.toContain('people.delete');
    expect(templatePermissions('kids_teacher')).toContain('checkin.operate');
    expect(templatePermissions('secretary')).toContain('records.manage');
    expect(templatePermissions('ministry_coordinator')).toContain('volunteers.schedule');
    expect(templatePermissions('elder')).toContain('care.view');
  });
});

describe('people rules', () => {
  it('lets everyone view the directory but limits editing', () => {
    const stranger = { id: 'p-x', userId: null };
    expect(can.viewDirectory(member)).toBe(true);
    expect(can.createPerson(admin)).toBe(true);
    expect(can.createPerson(leader)).toBe(false);
    expect(can.editPerson(admin, stranger, [])).toBe(true);
    expect(can.editPerson(member, stranger, [])).toBe(false);
    expect(can.editPerson(member, { id: 'p-member', userId: null }, [])).toBe(true);
    expect(can.editPerson(member, { id: 'p-x', userId: 'u-member' }, [])).toBe(true);
    expect(can.editPerson(leader, stranger, ['g1'])).toBe(true);
    expect(can.editPerson(leader, stranger, ['g2'])).toBe(false);
    expect(can.editPersonAdminFields(leader)).toBe(false);
    expect(can.editPersonAdminFields(admin)).toBe(true);
    expect(can.deletePerson(leader)).toBe(false);
  });

  it('keeps private details to permitted people and the person themself', () => {
    expect(can.viewPrivateDetails(admin, { id: 'p-x', userId: null })).toBe(true);
    expect(can.viewPrivateDetails(leader, { id: 'p-x', userId: null })).toBe(false);
    expect(can.viewPrivateDetails(member, { id: 'p-member', userId: null })).toBe(true);
    expect(can.editPrivateDetails(member, { id: 'p-x', userId: 'u-member' })).toBe(true);
    const elder = accessFor('member', { custom: [templatePermissions('elder')] });
    expect(can.viewPrivateDetails(elder, { id: 'p-x', userId: null })).toBe(true);
    expect(can.editPrivateDetails(elder, { id: 'p-x', userId: null })).toBe(false);
  });

  it('shows personal attendance to the person, their leaders and attendance viewers', () => {
    const stranger = { id: 'p-x', userId: null };
    expect(can.viewPersonAttendance(admin, stranger, [])).toBe(true);
    expect(can.viewPersonAttendance(leader, stranger, ['g1'])).toBe(true);
    expect(can.viewPersonAttendance(leader, stranger, ['g2'])).toBe(false);
    expect(can.viewPersonAttendance(member, { id: 'p-member', userId: null }, [])).toBe(true);
    expect(can.viewPersonAttendance(member, stranger, [])).toBe(false);
  });
});

describe('leader scope', () => {
  it('scopes group, event, attendance and announcement management to leaders', () => {
    expect(can.createGroup(leader)).toBe(false);
    expect(can.manageGroup(leader, 'g1')).toBe(true);
    expect(can.manageGroup(leader, 'g2')).toBe(false);
    expect(can.manageGroup(admin, 'g2')).toBe(true);
    expect(can.assignGroupLeaders(leader)).toBe(false);
    expect(can.deleteGroup(leader)).toBe(false);

    expect(can.createEvent(leader, 'g1')).toBe(true);
    expect(can.createEvent(leader, null)).toBe(false);
    expect(can.createEvent(admin, null)).toBe(true);
    expect(can.manageEvent(leader, { groupId: 'g2' })).toBe(false);

    expect(can.recordAttendance(leader, { groupId: 'g1' })).toBe(true);
    expect(can.recordAttendance(leader, { groupId: null })).toBe(false);
    expect(can.viewAttendanceSession(leader, { groupId: 'g2' })).toBe(false);
    expect(can.viewAllAttendance(leader)).toBe(false);
    expect(can.viewAttendanceOverview(member)).toBe(false);
    expect(can.viewAttendanceOverview(leader)).toBe(true);

    expect(can.createAnnouncement(leader, 'g1')).toBe(true);
    expect(can.createAnnouncement(leader, null)).toBe(false);
    expect(can.manageAnnouncement(admin, { groupId: 'g9' })).toBe(true);
    expect(can.viewAllAnnouncementDrafts(leader)).toBe(false);
  });

  it('lets a coordinator role manage every group without being a leader', () => {
    const coordinator = accessFor('member', {
      custom: [templatePermissions('ministry_coordinator')],
    });
    expect(can.manageGroup(coordinator, 'g7')).toBe(true);
    expect(can.createEvent(coordinator, null)).toBe(true);
    expect(can.createAnnouncement(coordinator, null)).toBe(false);
  });

  it('lists the groups a caller may manage content for', () => {
    expect(manageableGroupIds(admin, ['g1', 'g2'])).toEqual(['g1', 'g2']);
    expect(manageableGroupIds(leader, ['g1', 'g2'])).toEqual(['g1']);
    expect(manageableGroupIds(member, ['g1', 'g2'])).toEqual([]);
    const eventsOnly = accessFor('member', { custom: [['events.manage']] });
    expect(manageableGroupIds(eventsOnly, ['g1', 'g2'], 'events.manage')).toEqual(['g1', 'g2']);
    expect(manageableGroupIds(eventsOnly, ['g1', 'g2'], 'announcements.manage')).toEqual([]);
  });
});

describe('modules', () => {
  it('keeps required modules on and optional ones as configured', () => {
    expect(isModuleEnabled([], 'core')).toBe(true);
    expect(isModuleEnabled([], 'people')).toBe(true);
    expect(isModuleEnabled([], 'finance')).toBe(false);
    expect(isModuleEnabled(['finance'], 'finance')).toBe(true);
  });
});
