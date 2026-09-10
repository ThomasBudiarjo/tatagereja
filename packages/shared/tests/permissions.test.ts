import { describe, expect, it } from 'bun:test';
import { can, isAdmin, manageableGroupIds, type AccessLike } from '../src/permissions';

const owner: AccessLike = {
  userId: 'u-owner',
  role: 'owner',
  leaderGroupIds: [],
  personId: 'p-owner',
};
const admin: AccessLike = {
  userId: 'u-admin',
  role: 'administrator',
  leaderGroupIds: [],
  personId: null,
};
const leader: AccessLike = {
  userId: 'u-leader',
  role: 'member',
  leaderGroupIds: ['g1'],
  personId: 'p-leader',
};
const member: AccessLike = {
  userId: 'u-member',
  role: 'member',
  leaderGroupIds: [],
  personId: 'p-member',
};

describe('permission matrix', () => {
  it('identifies administrative roles', () => {
    expect(isAdmin(owner)).toBe(true);
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(leader)).toBe(false);
  });

  it('restricts church management to administrators and the owner', () => {
    expect(can.editChurch(admin)).toBe(true);
    expect(can.editChurch(member)).toBe(false);
    expect(can.deleteChurch(owner)).toBe(true);
    expect(can.deleteChurch(admin)).toBe(false);
    expect(can.transferOwnership(owner)).toBe(true);
    expect(can.transferOwnership(admin)).toBe(false);
    expect(can.leaveChurch(owner)).toBe(false);
    expect(can.leaveChurch(member)).toBe(true);
    expect(can.createInvitations(admin)).toBe(true);
    expect(can.createInvitations(leader)).toBe(false);
  });

  it('protects the owner and the caller from role changes', () => {
    expect(can.changeMemberRole(admin, { role: 'member', userId: 'u-x' })).toBe(true);
    expect(can.changeMemberRole(admin, { role: 'owner', userId: 'u-owner' })).toBe(false);
    expect(can.changeMemberRole(admin, { role: 'administrator', userId: 'u-admin' })).toBe(false);
    expect(can.removeMember(member, { role: 'member', userId: 'u-x' })).toBe(false);
  });

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
    expect(can.deletePerson(leader)).toBe(false);
  });

  it('keeps private details to administrators and the person', () => {
    expect(can.viewPrivateDetails(admin, { id: 'p-x', userId: null })).toBe(true);
    expect(can.viewPrivateDetails(leader, { id: 'p-x', userId: null })).toBe(false);
    expect(can.viewPrivateDetails(member, { id: 'p-member', userId: null })).toBe(true);
    expect(can.editPrivateDetails(member, { id: 'p-x', userId: 'u-member' })).toBe(true);
  });

  it('scopes group, event, attendance and announcement management to leaders', () => {
    expect(can.createGroup(leader)).toBe(false);
    expect(can.manageGroup(leader, 'g1')).toBe(true);
    expect(can.manageGroup(leader, 'g2')).toBe(false);
    expect(can.manageGroup(admin, 'g2')).toBe(true);
    expect(can.assignGroupLeaders(leader)).toBe(false);

    expect(can.createEvent(leader, 'g1')).toBe(true);
    expect(can.createEvent(leader, null)).toBe(false);
    expect(can.createEvent(admin, null)).toBe(true);
    expect(can.manageEvent(leader, { groupId: 'g2' })).toBe(false);

    expect(can.recordAttendance(leader, { groupId: 'g1' })).toBe(true);
    expect(can.recordAttendance(leader, { groupId: null })).toBe(false);
    expect(can.viewAttendanceOverview(member)).toBe(false);
    expect(can.viewAttendanceOverview(leader)).toBe(true);

    expect(can.createAnnouncement(leader, 'g1')).toBe(true);
    expect(can.createAnnouncement(leader, null)).toBe(false);
    expect(can.manageAnnouncement(admin, { groupId: 'g9' })).toBe(true);
  });

  it('lists the groups a caller may manage content for', () => {
    expect(manageableGroupIds(admin, ['g1', 'g2'])).toEqual(['g1', 'g2']);
    expect(manageableGroupIds(leader, ['g1', 'g2'])).toEqual(['g1']);
    expect(manageableGroupIds(member, ['g1', 'g2'])).toEqual([]);
  });
});
