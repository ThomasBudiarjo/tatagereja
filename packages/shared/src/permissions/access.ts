import type { ChurchRole } from '../constants';
import type { Permission } from './catalog';
import { BASE_ROLE_PERMISSIONS, OWNER_ONLY_PERMISSIONS } from './roles';

/**
 * Minimal description of a caller inside a church. `permissions` are the effective
 * permissions: base role ∪ assigned custom roles. Group leadership is a scoped assignment
 * on top of them and is expressed through `leaderGroupIds`.
 */
export type AccessLike = {
  userId: string;
  role: ChurchRole;
  leaderGroupIds: readonly string[];
  personId: string | null;
  permissions: readonly Permission[];
};

/**
 * A membership another rule acts on. Pass its effective `permissions` when known (the API
 * always does): acting on someone who holds permissions the caller lacks is an escalation.
 */
export type MembershipTarget = {
  role: ChurchRole;
  userId: string;
  permissions?: readonly Permission[];
};

export const has = (access: Pick<AccessLike, 'permissions'>, permission: Permission): boolean =>
  access.permissions.includes(permission);

export const hasAny = (
  access: Pick<AccessLike, 'permissions'>,
  permissions: readonly Permission[],
): boolean => permissions.some((permission) => access.permissions.includes(permission));

export const hasAll = (
  access: Pick<AccessLike, 'permissions'>,
  permissions: readonly Permission[],
): boolean => permissions.every((permission) => access.permissions.includes(permission));

/** Base-role check. Prefer `has()` for decisions; this only describes the role itself. */
export const isAdminRole = (role: ChurchRole): boolean =>
  role === 'owner' || role === 'administrator';

/** Base-role check. Prefer `has()` for decisions; this only describes the role itself. */
export const isAdmin = (access: Pick<AccessLike, 'role'>): boolean => isAdminRole(access.role);

export const isLeaderOf = (access: AccessLike, groupId: string | null | undefined): boolean =>
  !!groupId && access.leaderGroupIds.includes(groupId);

export const isLeaderOfAny = (access: AccessLike, groupIds: readonly string[]): boolean =>
  groupIds.some((groupId) => access.leaderGroupIds.includes(groupId));

const isSelf = (access: AccessLike, person: { id: string; userId: string | null }): boolean =>
  person.userId === access.userId || (access.personId !== null && person.id === access.personId);

/**
 * Anti-escalation: a caller may only grant (or take away) permissions they hold themselves,
 * and owner-only permissions can never be granted.
 */
export const canGrant = (access: AccessLike, permissions: readonly Permission[]): boolean =>
  permissions.every(
    (permission) => !OWNER_ONLY_PERMISSIONS.includes(permission) && has(access, permission),
  );

/** Whether the caller may give someone the given base role, or take it from them. */
export const canGrantBaseRole = (access: AccessLike, role: ChurchRole): boolean =>
  role !== 'owner' && canGrant(access, BASE_ROLE_PERMISSIONS[role]);

/**
 * The owner is untouchable, nobody manages their own membership, and nobody acts on a member
 * who holds permissions they do not hold themselves.
 */
const canActOnMembership = (access: AccessLike, target: MembershipTarget): boolean =>
  has(access, 'members.manage') &&
  target.role !== 'owner' &&
  target.userId !== access.userId &&
  canGrantBaseRole(access, target.role) &&
  (!target.permissions || canGrant(access, target.permissions));

/**
 * Permission rules. Every rule is a pure function so the API can enforce it and the UI can
 * hide unavailable actions with the same logic.
 */
export const can = {
  viewChurch: (_access: AccessLike): boolean => true,
  editChurch: (access: AccessLike): boolean => has(access, 'church.edit'),
  deleteChurch: (access: AccessLike): boolean => has(access, 'church.delete'),
  transferOwnership: (access: AccessLike): boolean => has(access, 'church.transfer'),
  manageSettings: (access: AccessLike): boolean => has(access, 'settings.manage'),
  viewAuditLog: (access: AccessLike): boolean => has(access, 'audit.view'),

  viewMembers: (access: AccessLike): boolean => hasAny(access, ['members.view', 'members.manage']),
  manageMembers: (access: AccessLike): boolean => has(access, 'members.manage'),
  /** `newRole` is checked too when given: promoting to administrator needs every admin permission. */
  changeMemberRole: (access: AccessLike, target: MembershipTarget, newRole?: ChurchRole): boolean =>
    canActOnMembership(access, target) && (!newRole || canGrantBaseRole(access, newRole)),
  removeMember: (access: AccessLike, target: MembershipTarget): boolean =>
    canActOnMembership(access, target),
  suspendMember: (access: AccessLike, target: MembershipTarget): boolean =>
    canActOnMembership(access, target),
  leaveChurch: (access: AccessLike): boolean => access.role !== 'owner',

  manageRoles: (access: AccessLike): boolean => has(access, 'roles.manage'),
  /** Create, edit or delete a custom role holding these permissions (before and after). */
  editCustomRole: (access: AccessLike, permissions: readonly Permission[]): boolean =>
    has(access, 'roles.manage') && canGrant(access, permissions),
  /** Assign or unassign a custom role. The owner's roles are never edited. */
  assignCustomRole: (
    access: AccessLike,
    target: MembershipTarget,
    permissions: readonly Permission[],
  ): boolean =>
    has(access, 'roles.manage') && target.role !== 'owner' && canGrant(access, permissions),

  createInvitations: (access: AccessLike): boolean => has(access, 'invitations.manage'),
  /** Inviting someone as administrator needs every administrator permission. */
  inviteWithRole: (access: AccessLike, role: ChurchRole): boolean =>
    has(access, 'invitations.manage') && canGrantBaseRole(access, role),

  viewDirectory: (access: AccessLike): boolean => has(access, 'people.view'),
  createPerson: (access: AccessLike): boolean => has(access, 'people.create'),
  editPerson: (
    access: AccessLike,
    person: { id: string; userId: string | null },
    personGroupIds: readonly string[],
  ): boolean =>
    has(access, 'people.edit') || isSelf(access, person) || isLeaderOfAny(access, personGroupIds),
  /** Membership status and join date are administrative fields. */
  editPersonAdminFields: (access: AccessLike): boolean => has(access, 'people.edit'),
  deletePerson: (access: AccessLike): boolean => has(access, 'people.delete'),
  linkPersonUser: (access: AccessLike): boolean => has(access, 'people.link'),
  exportPeople: (access: AccessLike): boolean => has(access, 'people.export'),
  mergePeople: (access: AccessLike): boolean => has(access, 'people.merge'),
  manageHouseholds: (access: AccessLike): boolean => has(access, 'households.manage'),
  manageAreas: (access: AccessLike): boolean => has(access, 'areas.manage'),
  manageCustomFields: (access: AccessLike): boolean => has(access, 'people.fields.manage'),
  viewPrivateDetails: (
    access: AccessLike,
    person: { id: string; userId: string | null },
  ): boolean => has(access, 'people.private.view') || isSelf(access, person),
  editPrivateDetails: (
    access: AccessLike,
    person: { id: string; userId: string | null },
  ): boolean => has(access, 'people.private.edit') || isSelf(access, person),
  viewPersonAttendance: (
    access: AccessLike,
    person: { id: string; userId: string | null },
    personGroupIds: readonly string[],
  ): boolean =>
    has(access, 'attendance.view') ||
    isSelf(access, person) ||
    isLeaderOfAny(access, personGroupIds),

  viewGroups: (access: AccessLike): boolean => has(access, 'groups.view'),
  createGroup: (access: AccessLike): boolean => has(access, 'groups.create'),
  manageGroup: (access: AccessLike, groupId: string): boolean =>
    has(access, 'groups.manage') || isLeaderOf(access, groupId),
  deleteGroup: (access: AccessLike): boolean => has(access, 'groups.delete'),
  assignGroupLeaders: (access: AccessLike): boolean => has(access, 'groups.leaders.assign'),

  viewEvents: (access: AccessLike): boolean => has(access, 'events.view'),
  createEvent: (access: AccessLike, groupId: string | null): boolean =>
    has(access, 'events.manage') || isLeaderOf(access, groupId),
  /** Whether the caller can create an event in at least one scope. */
  createAnyEvent: (access: AccessLike): boolean =>
    has(access, 'events.manage') || access.leaderGroupIds.length > 0,
  manageEvent: (access: AccessLike, event: { groupId: string | null }): boolean =>
    has(access, 'events.manage') || isLeaderOf(access, event.groupId),

  recordAttendance: (access: AccessLike, scope: { groupId: string | null }): boolean =>
    has(access, 'attendance.record') || isLeaderOf(access, scope.groupId),
  viewAttendanceSession: (access: AccessLike, scope: { groupId: string | null }): boolean =>
    hasAny(access, ['attendance.view', 'attendance.record']) || isLeaderOf(access, scope.groupId),
  /** Sees every session, not only the groups they lead. */
  viewAllAttendance: (access: AccessLike): boolean =>
    hasAny(access, ['attendance.view', 'attendance.record']),
  viewAttendanceOverview: (access: AccessLike): boolean =>
    hasAny(access, ['attendance.view', 'attendance.record']) || access.leaderGroupIds.length > 0,

  viewAnnouncements: (access: AccessLike): boolean => has(access, 'announcements.view'),
  createAnnouncement: (access: AccessLike, groupId: string | null): boolean =>
    has(access, 'announcements.manage') || isLeaderOf(access, groupId),
  /** Whether the caller can post an announcement in at least one scope. */
  createAnyAnnouncement: (access: AccessLike): boolean =>
    has(access, 'announcements.manage') || access.leaderGroupIds.length > 0,
  manageAnnouncement: (access: AccessLike, announcement: { groupId: string | null }): boolean =>
    has(access, 'announcements.manage') || isLeaderOf(access, announcement.groupId),
  /** Sees drafts of every scope, not only the groups they lead. */
  viewAllAnnouncementDrafts: (access: AccessLike): boolean => has(access, 'announcements.manage'),
} as const;

/**
 * Group ids the caller may create scoped content (events, announcements, attendance) for:
 * every group with the church-wide `permission`, otherwise the groups they lead.
 */
export const manageableGroupIds = (
  access: AccessLike,
  allGroupIds: readonly string[],
  permission: Permission = 'groups.manage',
): string[] => (has(access, permission) ? [...allGroupIds] : [...access.leaderGroupIds]);
