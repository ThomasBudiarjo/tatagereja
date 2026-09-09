import type { ChurchRole } from './constants';

/** Minimal description of a caller inside a church. */
export type AccessLike = {
  userId: string;
  role: ChurchRole;
  leaderGroupIds: readonly string[];
  personId: string | null;
};

export const isAdminRole = (role: ChurchRole): boolean =>
  role === 'owner' || role === 'administrator';

export const isAdmin = (access: AccessLike): boolean => isAdminRole(access.role);

export const isLeaderOf = (access: AccessLike, groupId: string | null | undefined): boolean =>
  !!groupId && access.leaderGroupIds.includes(groupId);

export const isLeaderOfAny = (access: AccessLike, groupIds: readonly string[]): boolean =>
  groupIds.some((groupId) => access.leaderGroupIds.includes(groupId));

/**
 * Permission matrix. Every rule is a pure function so the API can enforce it and
 * the UI can hide unavailable actions with the same logic.
 */
export const can = {
  viewChurch: (_access: AccessLike): boolean => true,
  editChurch: (access: AccessLike): boolean => isAdmin(access),
  deleteChurch: (access: AccessLike): boolean => access.role === 'owner',
  transferOwnership: (access: AccessLike): boolean => access.role === 'owner',
  manageMembers: (access: AccessLike): boolean => isAdmin(access),
  changeMemberRole: (access: AccessLike, target: { role: ChurchRole; userId: string }): boolean =>
    isAdmin(access) && target.role !== 'owner' && target.userId !== access.userId,
  removeMember: (access: AccessLike, target: { role: ChurchRole; userId: string }): boolean =>
    isAdmin(access) && target.role !== 'owner' && target.userId !== access.userId,
  leaveChurch: (access: AccessLike): boolean => access.role !== 'owner',
  createInvitations: (access: AccessLike): boolean => isAdmin(access),

  viewDirectory: (_access: AccessLike): boolean => true,
  createPerson: (access: AccessLike): boolean => isAdmin(access),
  editPerson: (
    access: AccessLike,
    person: { id: string; userId: string | null },
    personGroupIds: readonly string[],
  ): boolean =>
    isAdmin(access) ||
    person.userId === access.userId ||
    person.id === access.personId ||
    isLeaderOfAny(access, personGroupIds),
  deletePerson: (access: AccessLike): boolean => isAdmin(access),
  linkPersonUser: (access: AccessLike): boolean => isAdmin(access),
  viewPrivateDetails: (
    access: AccessLike,
    person: { id: string; userId: string | null },
  ): boolean => isAdmin(access) || person.userId === access.userId || person.id === access.personId,
  editPrivateDetails: (
    access: AccessLike,
    person: { id: string; userId: string | null },
  ): boolean => isAdmin(access) || person.userId === access.userId || person.id === access.personId,

  viewGroups: (_access: AccessLike): boolean => true,
  createGroup: (access: AccessLike): boolean => isAdmin(access),
  manageGroup: (access: AccessLike, groupId: string): boolean =>
    isAdmin(access) || isLeaderOf(access, groupId),
  deleteGroup: (access: AccessLike): boolean => isAdmin(access),
  assignGroupLeaders: (access: AccessLike): boolean => isAdmin(access),

  viewEvents: (_access: AccessLike): boolean => true,
  createEvent: (access: AccessLike, groupId: string | null): boolean =>
    isAdmin(access) || isLeaderOf(access, groupId),
  manageEvent: (access: AccessLike, event: { groupId: string | null }): boolean =>
    isAdmin(access) || isLeaderOf(access, event.groupId),

  recordAttendance: (access: AccessLike, scope: { groupId: string | null }): boolean =>
    isAdmin(access) || isLeaderOf(access, scope.groupId),
  viewAttendanceSession: (access: AccessLike, scope: { groupId: string | null }): boolean =>
    isAdmin(access) || isLeaderOf(access, scope.groupId),
  viewAttendanceOverview: (access: AccessLike): boolean =>
    isAdmin(access) || access.leaderGroupIds.length > 0,

  viewAnnouncements: (_access: AccessLike): boolean => true,
  createAnnouncement: (access: AccessLike, groupId: string | null): boolean =>
    isAdmin(access) || isLeaderOf(access, groupId),
  manageAnnouncement: (access: AccessLike, announcement: { groupId: string | null }): boolean =>
    isAdmin(access) || isLeaderOf(access, announcement.groupId),
} as const;

/** Group ids the caller may create scoped content (events, announcements, attendance) for. */
export const manageableGroupIds = (access: AccessLike, allGroupIds: readonly string[]): string[] =>
  isAdmin(access) ? [...allGroupIds] : [...access.leaderGroupIds];
