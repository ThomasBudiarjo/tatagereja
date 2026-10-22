import {
  ROLE_TEMPLATES,
  effectivePermissions,
  has,
  hasAny,
  localize,
  templatePermissions,
  type Access,
  type AccessLike,
  type Permission,
} from '@tatagereja/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Queryable } from '../db/client';
import type { ChurchRow, MembershipRow } from '../db/schema';
import {
  churches,
  churchMemberships,
  churchRoles,
  groupLeaders,
  membershipRoles,
  people,
} from '../db/schema';
import { forbidden } from '../lib/errors';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';

/** Throws 403 unless the caller holds `permission`. */
export function requirePermission(
  access: AccessLike,
  permission: Permission,
  message = 'You do not have permission to do that',
): void {
  if (!has(access, permission)) throw forbidden(message);
}

/** Throws 403 unless the caller holds at least one of `permissions`. */
export function requireAnyPermission(
  access: AccessLike,
  permissions: readonly Permission[],
  message = 'You do not have permission to do that',
): void {
  if (!hasAny(access, permissions)) throw forbidden(message);
}

/**
 * Creates the suggested custom roles (Pendeta, Majelis, Bendahara, ...) once per church.
 * Idempotent: the church's `role_templates_seeded_at` marker is claimed atomically, so
 * concurrent or repeated calls seed at most once. Names are Indonesian, the primary audience;
 * they are ordinary editable roles.
 */
export function seedRoleTemplates(db: Queryable, churchId: string): boolean {
  const now = nowIso();
  const claimed = db
    .update(churches)
    .set({ roleTemplatesSeededAt: now })
    .where(and(eq(churches.id, churchId), isNull(churches.roleTemplatesSeededAt)))
    .returning({ id: churches.id })
    .get();
  if (!claimed) return false;
  db.insert(churchRoles)
    .values(
      ROLE_TEMPLATES.map((template) => ({
        id: newId(),
        churchId,
        name: localize(template.name, 'id'),
        description: localize(template.description, 'id'),
        permissions: templatePermissions(template.key),
        isTemplate: true,
        templateKey: template.key,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing()
    .run();
  return true;
}

/** Custom role ids and stored permission lists of one membership, in one query. */
export function customRolesOf(
  db: Queryable,
  membershipId: string,
): { roleIds: string[]; permissionLists: string[][] } {
  const rows = db
    .select({ id: churchRoles.id, permissions: churchRoles.permissions })
    .from(membershipRoles)
    .innerJoin(churchRoles, eq(churchRoles.id, membershipRoles.roleId))
    .where(eq(membershipRoles.membershipId, membershipId))
    .all();
  return {
    roleIds: rows.map((row) => row.id),
    permissionLists: rows.map((row) => (Array.isArray(row.permissions) ? row.permissions : [])),
  };
}

/** The caller's access inside a church: effective permissions, leader scope and own person. */
export function loadAccess(db: Queryable, church: ChurchRow, membership: MembershipRow): Access {
  const roles = customRolesOf(db, membership.id);
  const leaderGroupIds = db
    .select({ groupId: groupLeaders.groupId })
    .from(groupLeaders)
    .where(and(eq(groupLeaders.churchId, church.id), eq(groupLeaders.userId, membership.userId)))
    .all()
    .map((row) => row.groupId);
  const person = db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.churchId, church.id), eq(people.userId, membership.userId)))
    .get();
  return {
    userId: membership.userId,
    role: membership.role,
    leaderGroupIds,
    personId: person?.id ?? null,
    permissions: effectivePermissions(membership.role, roles.permissionLists),
    roleIds: roles.roleIds,
  };
}

/**
 * Effective permissions of every active member of a church, keyed by user id. Two queries,
 * used to resolve permission-based notification audiences and member lists.
 */
export function permissionsByUser(
  db: Queryable,
  churchId: string,
  userIds?: readonly string[],
): Map<string, Permission[]> {
  if (userIds && userIds.length === 0) return new Map();
  const conditions = [
    eq(churchMemberships.churchId, churchId),
    eq(churchMemberships.status, 'active'),
  ];
  if (userIds) conditions.push(inArray(churchMemberships.userId, [...userIds]));
  const memberships = db
    .select({
      id: churchMemberships.id,
      userId: churchMemberships.userId,
      role: churchMemberships.role,
    })
    .from(churchMemberships)
    .where(and(...conditions))
    .all();
  const lists = new Map<string, string[][]>();
  for (const row of db
    .select({ membershipId: membershipRoles.membershipId, permissions: churchRoles.permissions })
    .from(membershipRoles)
    .innerJoin(churchRoles, eq(churchRoles.id, membershipRoles.roleId))
    .where(eq(membershipRoles.churchId, churchId))
    .all()) {
    const list = lists.get(row.membershipId) ?? [];
    list.push(Array.isArray(row.permissions) ? row.permissions : []);
    lists.set(row.membershipId, list);
  }
  return new Map(
    memberships.map((membership) => [
      membership.userId,
      effectivePermissions(membership.role, lists.get(membership.id) ?? []),
    ]),
  );
}
