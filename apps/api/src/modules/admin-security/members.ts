import {
  CHURCH_ROLES,
  effectivePermissions,
  holdsManagementPermission,
  type ChurchRole,
  type MemberListQuery,
  type MemberListSummary,
  type Permission,
} from '@tatagereja/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Queryable } from '../../db/client';
import type { MembershipRow, UserRow } from '../../db/schema';
import {
  churchMemberships,
  churchRoles,
  groupLeaders,
  membershipRoles,
  people,
  users,
} from '../../db/schema';
import { usersWithTwoFactor } from './two-factor';

/** A member account with what the members screen and the security overview need. */
export type MemberRow = {
  membership: MembershipRow;
  user: UserRow;
  roleIds: string[];
  permissions: Permission[];
  manager: boolean;
  twoFactorEnabled: boolean;
  isLeader: boolean;
  personId: string | null;
};

/**
 * Every member of a church with roles, effective permissions, 2FA and leader state, in five
 * queries. Churches have hundreds to a few thousand accounts, so filters run in memory.
 */
export function loadMemberRows(db: Queryable, churchId: string): MemberRow[] {
  const rows = db
    .select({ membership: churchMemberships, user: users })
    .from(churchMemberships)
    .innerJoin(users, eq(users.id, churchMemberships.userId))
    .where(eq(churchMemberships.churchId, churchId))
    .all();
  const roles = new Map<string, { ids: string[]; lists: string[][] }>();
  for (const row of db
    .select({
      membershipId: membershipRoles.membershipId,
      roleId: churchRoles.id,
      permissions: churchRoles.permissions,
    })
    .from(membershipRoles)
    .innerJoin(churchRoles, eq(churchRoles.id, membershipRoles.roleId))
    .where(eq(membershipRoles.churchId, churchId))
    .all()) {
    const entry = roles.get(row.membershipId) ?? { ids: [], lists: [] };
    entry.ids.push(row.roleId);
    entry.lists.push(Array.isArray(row.permissions) ? row.permissions : []);
    roles.set(row.membershipId, entry);
  }
  const leaders = new Set(
    db
      .select({ userId: groupLeaders.userId })
      .from(groupLeaders)
      .where(eq(groupLeaders.churchId, churchId))
      .all()
      .map((row) => row.userId),
  );
  const personByUser = new Map(
    db
      .select({ id: people.id, userId: people.userId })
      .from(people)
      .where(and(eq(people.churchId, churchId), isNotNull(people.userId)))
      .all()
      .map((row) => [row.userId ?? '', row.id]),
  );
  const twoFactor = usersWithTwoFactor(
    db,
    rows.map((row) => row.user.id),
  );
  return rows.map(({ membership, user }) => {
    const entry = roles.get(membership.id);
    const permissions = effectivePermissions(membership.role, entry?.lists ?? []);
    return {
      membership,
      user,
      roleIds: entry?.ids ?? [],
      permissions,
      manager: holdsManagementPermission({ permissions }),
      twoFactorEnabled: twoFactor.has(user.id),
      isLeader: leaders.has(user.id),
      personId: personByUser.get(user.id) ?? null,
    };
  });
}

const ROLE_ORDER: Record<ChurchRole, number> = { owner: 0, administrator: 1, member: 2 };

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

export function filterMembers(rows: MemberRow[], query: MemberListQuery): MemberRow[] {
  const q = query.q ? normalize(query.q) : '';
  const filtered = rows.filter((row) => {
    if (q && !normalize(`${row.user.name} ${row.user.email}`).includes(q)) return false;
    if (query.role && row.membership.role !== query.role) return false;
    if (query.status && row.membership.status !== query.status) return false;
    if (query.roleId && !row.roleIds.includes(query.roleId)) return false;
    if (query.twoFactor === 'on' && !row.twoFactorEnabled) return false;
    if (query.twoFactor === 'off' && (row.twoFactorEnabled || !row.manager)) return false;
    return true;
  });
  const byName = (a: MemberRow, b: MemberRow) =>
    a.user.name.localeCompare(b.user.name, 'id', { sensitivity: 'base' });
  const sorters: Record<MemberListQuery['sort'], (a: MemberRow, b: MemberRow) => number> = {
    name: byName,
    '-name': (a, b) => byName(b, a),
    joinedAt: (a, b) => a.membership.joinedAt.localeCompare(b.membership.joinedAt),
    '-joinedAt': (a, b) => b.membership.joinedAt.localeCompare(a.membership.joinedAt),
    role: (a, b) => ROLE_ORDER[a.membership.role] - ROLE_ORDER[b.membership.role] || byName(a, b),
  };
  return filtered.sort(sorters[query.sort]);
}

export function summarizeMembers(rows: MemberRow[], showSecurity: boolean): MemberListSummary {
  const byRole = Object.fromEntries(CHURCH_ROLES.map((role) => [role, 0])) as Record<
    ChurchRole,
    number
  >;
  for (const row of rows) byRole[row.membership.role] += 1;
  const active = rows.filter((row) => row.membership.status === 'active').length;
  return {
    total: rows.length,
    active,
    suspended: rows.length - active,
    byRole,
    managersWithoutTwoFactor: showSecurity
      ? rows.filter(
          (row) => row.manager && !row.twoFactorEnabled && row.membership.status === 'active',
        ).length
      : null,
  };
}
