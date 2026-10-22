import {
  BASE_ROLE_PERMISSIONS,
  CHURCH_ROLES,
  LIMITS,
  assignRoleBodySchema,
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  customRoleInputSchema,
  effectivePermissions,
  has,
  idSchema,
  normalizePermissions,
  setMemberRolesBodySchema,
  type Access,
  type Permission,
} from '@tatagereja/shared';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../db/client';
import type { ChurchRoleRow } from '../db/schema';
import { churchMemberships, churchRoles, groupLeaders, membershipRoles, users } from '../db/schema';
import type { Deps } from '../deps';
import { HttpError, conflict, forbidden, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toCustomRole } from '../serializers';
import { recordAudit, type AuditContext } from '../services/audit';
import { notify } from '../services/notifications';

const memberRoleParamsSchema = churchIdParamsSchema.extend({ roleId: idSchema });

const escalationDenied = () =>
  new HttpError(
    403,
    'ESCALATION_DENIED',
    'You can only grant or remove permissions that you hold yourself',
  );

const lockoutPrevented = () =>
  new HttpError(
    409,
    'LOCKOUT_PREVENTED',
    'This change would remove your own permission to manage roles',
  );

const permissionsOf = (row: Pick<ChurchRoleRow, 'permissions'>): Permission[] =>
  normalizePermissions(Array.isArray(row.permissions) ? row.permissions : []);

/**
 * Custom roles and their assignment to members. Anti-escalation is enforced here: nobody
 * grants, removes or edits permissions they do not hold, the owner's roles are never edited,
 * and nobody can take away their own `roles.manage`.
 */
export const rolesModule = (deps: Deps) => {
  const { db } = deps;

  const loadRole = (tx: Queryable, churchId: string, id: string): ChurchRoleRow => {
    const role = tx
      .select()
      .from(churchRoles)
      .where(and(eq(churchRoles.id, id), eq(churchRoles.churchId, churchId)))
      .get();
    if (!role) throw notFound('Role');
    return role;
  };

  const memberCounts = (churchId: string): Map<string, number> =>
    new Map(
      db
        .select({ roleId: membershipRoles.roleId, value: count() })
        .from(membershipRoles)
        .where(eq(membershipRoles.churchId, churchId))
        .groupBy(membershipRoles.roleId)
        .all()
        .map((row) => [row.roleId, row.value]),
    );

  const serialize = (row: ChurchRoleRow) =>
    toCustomRole(row, memberCounts(row.churchId).get(row.id) ?? 0);

  const assertUniqueName = (churchId: string, name: string, exceptId?: string) => {
    const clash = db
      .select({ id: churchRoles.id })
      .from(churchRoles)
      .where(
        and(
          eq(churchRoles.churchId, churchId),
          sql`lower(${churchRoles.name}) = ${name.toLowerCase()}`,
        ),
      )
      .all()
      .find((row) => row.id !== exceptId);
    if (clash) throw conflict('A role with this name already exists');
  };

  /** Fails when the caller would no longer hold `roles.manage` after their roles change. */
  const assertNoLockout = (access: Access, nextRolePermissions: Permission[][]) => {
    if (!has(access, 'roles.manage')) return;
    const next = effectivePermissions(access.role, nextRolePermissions);
    if (!next.includes('roles.manage')) throw lockoutPrevented();
  };

  /** Stored permissions of each of the caller's roles, with one role replaced or removed. */
  const callerRolePermissions = (
    access: Access,
    change: { roleId: string; permissions: Permission[] | null },
  ): Permission[][] => {
    if (access.roleIds.length === 0) return [];
    return db
      .select()
      .from(churchRoles)
      .where(inArray(churchRoles.id, access.roleIds))
      .all()
      .flatMap((row) =>
        row.id === change.roleId
          ? change.permissions
            ? [change.permissions]
            : []
          : [permissionsOf(row)],
      );
  };

  const loadMembership = (churchId: string, id: string) => {
    const row = db
      .select({ membership: churchMemberships, user: users })
      .from(churchMemberships)
      .innerJoin(users, eq(users.id, churchMemberships.userId))
      .where(and(eq(churchMemberships.id, id), eq(churchMemberships.churchId, churchId)))
      .get();
    if (!row) throw notFound('Membership');
    return row;
  };

  const assignedRoleIds = (membershipId: string): string[] =>
    db
      .select({ roleId: membershipRoles.roleId })
      .from(membershipRoles)
      .where(eq(membershipRoles.membershipId, membershipId))
      .all()
      .map((row) => row.roleId);

  /** Describes a member's effective permissions and where they come from. */
  const memberPermissions = (churchId: string, membershipId: string) => {
    const { membership } = loadMembership(churchId, membershipId);
    const roles = db
      .select({ id: churchRoles.id, name: churchRoles.name, permissions: churchRoles.permissions })
      .from(membershipRoles)
      .innerJoin(churchRoles, eq(churchRoles.id, membershipRoles.roleId))
      .where(eq(membershipRoles.membershipId, membership.id))
      .orderBy(asc(churchRoles.name))
      .all();
    const isLeader = !!db
      .select({ id: groupLeaders.id })
      .from(groupLeaders)
      .where(and(eq(groupLeaders.churchId, churchId), eq(groupLeaders.userId, membership.userId)))
      .get();
    return {
      membershipId: membership.id,
      role: membership.role,
      roles: roles.map((role) => ({ id: role.id, name: role.name })),
      permissions: effectivePermissions(
        membership.role,
        roles.map((role) => permissionsOf(role)),
      ),
      basePermissions: [...BASE_ROLE_PERMISSIONS[membership.role]],
      isLeader,
    };
  };

  /**
   * Replaces a member's custom roles. Every added or removed role must be grantable by the
   * caller, the owner is untouchable, and the caller cannot lock themselves out.
   */
  const setMemberRoles = (
    church: { id: string; name: string },
    access: Access,
    audit: AuditContext,
    membershipId: string,
    nextIds: string[],
  ) => {
    const target = loadMembership(church.id, membershipId);
    if (!has(access, 'roles.manage')) throw forbidden('You cannot assign roles');
    if (target.membership.role === 'owner') {
      throw forbidden("The owner's roles cannot be changed");
    }
    const currentIds = assignedRoleIds(target.membership.id);
    const added = nextIds.filter((id) => !currentIds.includes(id));
    const removed = currentIds.filter((id) => !nextIds.includes(id));
    if (added.length === 0 && removed.length === 0) return;
    const touched = [...added, ...removed];
    const rows = db
      .select()
      .from(churchRoles)
      .where(and(eq(churchRoles.churchId, church.id), inArray(churchRoles.id, touched)))
      .all();
    if (rows.length !== touched.length) throw notFound('Role');
    for (const row of rows) {
      if (!can.assignCustomRole(access, target.membership, permissionsOf(row))) {
        throw escalationDenied();
      }
    }
    if (target.membership.userId === access.userId) {
      const next =
        nextIds.length > 0
          ? db
              .select()
              .from(churchRoles)
              .where(inArray(churchRoles.id, nextIds))
              .all()
              .map((row) => permissionsOf(row))
          : [];
      assertNoLockout(access, next);
    }
    const names = new Map(rows.map((row) => [row.id, row.name]));
    db.transaction((tx) => {
      if (removed.length > 0) {
        tx.delete(membershipRoles)
          .where(
            and(
              eq(membershipRoles.membershipId, target.membership.id),
              inArray(membershipRoles.roleId, removed),
            ),
          )
          .run();
      }
      if (added.length > 0) {
        const now = nowIso();
        tx.insert(membershipRoles)
          .values(
            added.map((roleId) => ({
              membershipId: target.membership.id,
              roleId,
              churchId: church.id,
              assignedBy: access.userId,
              assignedAt: now,
            })),
          )
          .onConflictDoNothing()
          .run();
      }
      const describe = (ids: string[]) => ids.map((id) => names.get(id) ?? id).join(', ');
      recordAudit(tx, audit, {
        module: 'core',
        action: 'member.roles_update',
        entityType: 'membership',
        entityId: target.membership.id,
        summary: [
          added.length > 0 ? `Gave ${target.user.name} ${describe(added)}` : null,
          removed.length > 0 ? `Removed ${describe(removed)} from ${target.user.name}` : null,
        ]
          .filter(Boolean)
          .join('; '),
        before: { roleIds: currentIds },
        after: { roleIds: nextIds },
      });
      notify(tx, {
        churchId: church.id,
        userIds: [target.user.id],
        excludeUserIds: [access.userId],
        type: 'membership.roles_changed',
        title: `Your roles in ${church.name} changed`,
        body: [
          added.length > 0 ? `Added: ${describe(added)}` : null,
          removed.length > 0 ? `Removed: ${describe(removed)}` : null,
        ]
          .filter(Boolean)
          .join('. '),
        link: `/c/${church.id}`,
        entityType: 'membership',
        entityId: target.membership.id,
      });
    });
  };

  const assignmentResponse = (churchId: string, membershipId: string) => ({
    roleIds: assignedRoleIds(membershipId),
    permissions: memberPermissions(churchId, membershipId),
  });

  return new Elysia({ prefix: '/churches/:churchId' })
    .use(authPlugin(deps))
    .get(
      '/roles',
      ({ church }) => {
        const counts = memberCounts(church.id);
        const rows = db
          .select()
          .from(churchRoles)
          .where(eq(churchRoles.churchId, church.id))
          .orderBy(asc(churchRoles.name))
          .all();
        return {
          baseRoles: CHURCH_ROLES.map((role) => ({
            role,
            permissions: [...BASE_ROLE_PERMISSIONS[role]],
          })),
          items: rows.map((row) => toCustomRole(row, counts.get(row.id) ?? 0)),
        };
      },
      {
        church: { permission: ['roles.manage', 'members.view', 'members.manage'] },
        params: churchParamsSchema,
      },
    )
    .post(
      '/roles',
      ({ church, access, audit, body, set }) => {
        if (!can.editCustomRole(access, body.permissions)) {
          if (!can.manageRoles(access)) throw forbidden('You cannot manage roles');
          throw escalationDenied();
        }
        const total =
          db
            .select({ value: count() })
            .from(churchRoles)
            .where(eq(churchRoles.churchId, church.id))
            .get()?.value ?? 0;
        if (total >= LIMITS.customRolesMax) {
          throw conflict(`A church can have at most ${LIMITS.customRolesMax} custom roles`);
        }
        assertUniqueName(church.id, body.name);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(churchRoles)
            .values({
              id: newId(),
              churchId: church.id,
              name: body.name,
              description: body.description,
              permissions: normalizePermissions(body.permissions),
              isTemplate: false,
              templateKey: null,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'core',
            action: 'role.create',
            entityType: 'role',
            entityId: created.id,
            summary: `Created the role ${created.name}`,
            after: { name: created.name, permissions: created.permissions },
          });
          return created;
        });
        set.status = 201;
        return { role: serialize(row) };
      },
      { church: true, params: churchParamsSchema, body: customRoleInputSchema },
    )
    .get(
      '/roles/:id',
      ({ church, params }) => ({ role: serialize(loadRole(db, church.id, params.id)) }),
      {
        church: { permission: ['roles.manage', 'members.view', 'members.manage'] },
        params: churchIdParamsSchema,
      },
    )
    .patch(
      '/roles/:id',
      ({ church, access, audit, params, body }) => {
        const role = loadRole(db, church.id, params.id);
        const before = permissionsOf(role);
        const after = normalizePermissions(body.permissions);
        const touched = normalizePermissions([...before, ...after]);
        if (!can.editCustomRole(access, touched)) {
          if (!can.manageRoles(access)) throw forbidden('You cannot manage roles');
          throw escalationDenied();
        }
        assertUniqueName(church.id, body.name, role.id);
        if (access.roleIds.includes(role.id)) {
          assertNoLockout(
            access,
            callerRolePermissions(access, { roleId: role.id, permissions: after }),
          );
        }
        const updated = db.transaction((tx) => {
          const row = tx
            .update(churchRoles)
            .set({
              name: body.name,
              description: body.description,
              permissions: after,
              updatedAt: nowIso(),
            })
            .where(eq(churchRoles.id, role.id))
            .returning()
            .get();
          if (!row) throw notFound('Role');
          recordAudit(tx, audit, {
            module: 'core',
            action: 'role.update',
            entityType: 'role',
            entityId: role.id,
            summary: `Updated the role ${row.name}`,
            before: { name: role.name, description: role.description, permissions: before },
            after: { name: row.name, description: row.description, permissions: after },
          });
          return row;
        });
        return { role: serialize(updated) };
      },
      { church: true, params: churchIdParamsSchema, body: customRoleInputSchema },
    )
    .delete(
      '/roles/:id',
      ({ church, access, audit, params }) => {
        const role = loadRole(db, church.id, params.id);
        if (!can.editCustomRole(access, permissionsOf(role))) {
          if (!can.manageRoles(access)) throw forbidden('You cannot manage roles');
          throw escalationDenied();
        }
        if (access.roleIds.includes(role.id)) {
          assertNoLockout(
            access,
            callerRolePermissions(access, { roleId: role.id, permissions: null }),
          );
        }
        const assigned = memberCounts(church.id).get(role.id) ?? 0;
        db.transaction((tx) => {
          recordAudit(tx, audit, {
            module: 'core',
            action: 'role.delete',
            entityType: 'role',
            entityId: role.id,
            summary: `Deleted the role ${role.name}${assigned > 0 ? ` (assigned to ${assigned})` : ''}`,
            before: { name: role.name, permissions: permissionsOf(role), memberCount: assigned },
          });
          // Assignments cascade with the role.
          tx.delete(churchRoles).where(eq(churchRoles.id, role.id)).run();
        });
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .get(
      '/members/:id/permissions',
      ({ church, access, membership, params }) => {
        const isSelf = membership.id === params.id;
        if (!isSelf && !can.viewMembers(access) && !can.manageRoles(access)) {
          throw forbidden('You cannot view the permissions of this member');
        }
        return memberPermissions(church.id, params.id);
      },
      { church: true, params: churchIdParamsSchema },
    )
    .put(
      '/members/:id/roles',
      ({ church, access, audit, params, body }) => {
        setMemberRoles(church, access, audit, params.id, body.roleIds);
        return assignmentResponse(church.id, params.id);
      },
      { church: true, params: churchIdParamsSchema, body: setMemberRolesBodySchema },
    )
    .post(
      '/members/:id/roles',
      ({ church, access, audit, params, body }) => {
        const current = assignedRoleIds(loadMembership(church.id, params.id).membership.id);
        if (current.length >= LIMITS.rolesPerMemberMax && !current.includes(body.roleId)) {
          throw conflict(`A member can have at most ${LIMITS.rolesPerMemberMax} custom roles`);
        }
        setMemberRoles(church, access, audit, params.id, [...new Set([...current, body.roleId])]);
        return assignmentResponse(church.id, params.id);
      },
      { church: true, params: churchIdParamsSchema, body: assignRoleBodySchema },
    )
    .delete(
      '/members/:id/roles/:roleId',
      ({ church, access, audit, params }) => {
        const current = assignedRoleIds(loadMembership(church.id, params.id).membership.id);
        if (!current.includes(params.roleId)) throw notFound('Role assignment');
        setMemberRoles(
          church,
          access,
          audit,
          params.id,
          current.filter((id) => id !== params.roleId),
        );
        return assignmentResponse(church.id, params.id);
      },
      { church: true, params: memberRoleParamsSchema },
    );
};
