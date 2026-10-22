import {
  BASE_ROLE_PERMISSIONS,
  ROLE_LABELS,
  can,
  canGrantBaseRole,
  canViewSecurity,
  churchIdParamsSchema,
  churchInputSchema,
  churchParamsSchema,
  confirmTransferOwnershipBodySchema,
  deleteChurchBodySchema,
  effectivePermissions,
  memberListQuerySchema,
  namesMatch,
  updateChurchModulesBodySchema,
  updateMembershipRoleBodySchema,
  updateMembershipStatusBodySchema,
  type ModuleId,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../db/client';
import type { ChurchRow, MembershipRow } from '../db/schema';
import {
  churches,
  churchMemberships,
  churchRoles,
  groupLeaders,
  groups,
  membershipRoles,
  notifications,
  people,
  sessions,
  users,
} from '../db/schema';
import type { Deps } from '../deps';
import {
  HttpError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
  validationError,
} from '../lib/errors';
import { verifyPassword } from '../lib/password';
import { offsetOf } from '../lib/query';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toChurch, toMembership } from '../serializers';
import { customRolesOf, seedRoleTemplates } from '../services/access';
import { changes, recordAudit, type AuditContext } from '../services/audit';
import { enabledModulesOf, moduleStates } from '../services/modules';
import { notify } from '../services/notifications';
import { filterMembers, loadMemberRows, summarizeMembers } from './admin-security/members';
import { toMemberListItem } from './admin-security/serializers';

/** Church fields compared and recorded in the audit log when the profile changes. */
const auditedChurchFields = (row: ChurchRow) => ({
  name: row.name,
  description: row.description,
  address: row.address,
  city: row.city,
  phone: row.phone,
  email: row.email,
  website: row.website,
  logoUrl: row.logoUrl,
  brandColor: row.brandColor,
  currency: row.currency,
  timezone: row.timezone,
});

const escalationDenied = () =>
  new HttpError(
    403,
    'ESCALATION_DENIED',
    'This member holds permissions you do not have; ask someone who holds them',
  );

export const churchesModule = (deps: Deps) => {
  const { db } = deps;

  const memberCount = (churchId: string): number =>
    db
      .select({ value: count() })
      .from(churchMemberships)
      .where(eq(churchMemberships.churchId, churchId))
      .get()?.value ?? 0;

  /** Custom role ids per membership of a church, in one query. */
  const roleIdsByMembership = (churchId: string): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const row of db
      .select({ membershipId: membershipRoles.membershipId, roleId: membershipRoles.roleId })
      .from(membershipRoles)
      .where(eq(membershipRoles.churchId, churchId))
      .all()) {
      const list = map.get(row.membershipId) ?? [];
      list.push(row.roleId);
      map.set(row.membershipId, list);
    }
    return map;
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

  /** Removes a user's church-scoped assignments when they leave or are removed. */
  const detachUserFromChurch = (tx: Queryable, churchId: string, userId: string) => {
    tx.delete(groupLeaders)
      .where(and(eq(groupLeaders.churchId, churchId), eq(groupLeaders.userId, userId)))
      .run();
    tx.update(people)
      .set({ userId: null, updatedAt: nowIso() })
      .where(and(eq(people.churchId, churchId), eq(people.userId, userId)))
      .run();
    tx.delete(notifications)
      .where(and(eq(notifications.churchId, churchId), eq(notifications.userId, userId)))
      .run();
    // Custom role assignments cascade with the membership.
    tx.delete(churchMemberships)
      .where(and(eq(churchMemberships.churchId, churchId), eq(churchMemberships.userId, userId)))
      .run();
  };

  /** The membership as a permission target, with its effective permissions. */
  const targetOf = (membership: MembershipRow) => ({
    role: membership.role,
    userId: membership.userId,
    permissions: effectivePermissions(
      membership.role,
      customRolesOf(db, membership.id).permissionLists,
    ),
  });

  const verifyOwnPassword = async (userId: string, password: string) => {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized('Password is incorrect');
    }
  };

  const recordMemberAudit = (
    tx: Queryable,
    audit: AuditContext,
    action: string,
    summary: string,
    membershipId: string,
    before: unknown,
    after: unknown,
  ) =>
    recordAudit(tx, audit, {
      module: 'core',
      action,
      entityType: 'membership',
      entityId: membershipId,
      summary,
      before,
      after,
    });

  return new Elysia({ prefix: '/churches' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ auth }) => {
        const rows = db
          .select({ church: churches, membership: churchMemberships })
          .from(churchMemberships)
          .innerJoin(churches, eq(churches.id, churchMemberships.churchId))
          .where(eq(churchMemberships.userId, auth.user.id))
          .orderBy(asc(churches.name))
          .all();
        return {
          items: rows.map((row) => ({
            church: toChurch(row.church),
            role: row.membership.role,
            status: row.membership.status,
            memberCount: memberCount(row.church.id),
            joinedAt: row.membership.joinedAt,
          })),
        };
      },
      { auth: true },
    )
    .post(
      '/',
      ({ auth, audit, body, set }) => {
        const now = nowIso();
        const church = db.transaction((tx) => {
          const created = tx
            .insert(churches)
            .values({
              id: newId(),
              ...body,
              ownerUserId: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          tx.insert(churchMemberships)
            .values({
              id: newId(),
              churchId: created.id,
              userId: auth.user.id,
              role: 'owner',
              joinedAt: now,
            })
            .run();
          seedRoleTemplates(tx, created.id);
          recordAudit(
            tx,
            { ...audit, churchId: created.id },
            {
              module: 'core',
              action: 'church.create',
              entityType: 'church',
              entityId: created.id,
              summary: `Created the church ${created.name}`,
              after: auditedChurchFields(created),
            },
          );
          return tx.select().from(churches).where(eq(churches.id, created.id)).get() ?? created;
        });
        set.status = 201;
        return { church: toChurch(church) };
      },
      { auth: true, body: churchInputSchema },
    )
    .get(
      '/:churchId',
      ({ church, membership, access, auth }) => ({
        church: toChurch(church),
        membership: toMembership(membership, auth.user, access.roleIds),
        access,
        memberCount: memberCount(church.id),
      }),
      { church: true, params: churchParamsSchema },
    )
    .patch(
      '/:churchId',
      ({ church, access, audit, body }) => {
        if (!can.editChurch(access)) throw forbidden('Only administrators can edit the church');
        const { currency, timezone, ...profile } = body;
        const patch = {
          ...profile,
          ...(currency ? { currency } : {}),
          ...(timezone ? { timezone } : {}),
        };
        const updated = db.transaction((tx) => {
          const row = tx
            .update(churches)
            .set({ ...patch, updatedAt: nowIso() })
            .where(eq(churches.id, church.id))
            .returning()
            .get();
          if (!row) throw notFound('Church');
          const diff = changes(auditedChurchFields(church), auditedChurchFields(row));
          if (diff.after) {
            recordAudit(tx, audit, {
              module: 'core',
              action: 'church.update',
              entityType: 'church',
              entityId: church.id,
              summary: `Updated the church profile (${Object.keys(diff.after).join(', ')})`,
              ...diff,
            });
          }
          return row;
        });
        return { church: toChurch(updated) };
      },
      { church: true, params: churchParamsSchema, body: churchInputSchema },
    )
    .delete(
      '/:churchId',
      async ({ church, access, audit, auth, body }) => {
        if (!can.deleteChurch(access)) throw forbidden('Only the owner can delete the church');
        await verifyOwnPassword(auth.user.id, body.password);
        db.transaction((tx) => {
          // Kept after the church's own log is gone, as an account-level record.
          recordAudit(tx, audit, {
            module: 'core',
            action: 'church.delete',
            entityType: 'church',
            entityId: church.id,
            churchId: null,
            summary: `Deleted the church ${church.name}`,
            before: { name: church.name, memberCount: memberCount(church.id) },
          });
          tx.delete(churches).where(eq(churches.id, church.id)).run();
        });
        return { ok: true as const };
      },
      { church: true, params: churchParamsSchema, body: deleteChurchBodySchema },
    )
    .get('/:churchId/modules', ({ church }) => ({ items: moduleStates(church) }), {
      church: true,
      params: churchParamsSchema,
    })
    .patch(
      '/:churchId/modules',
      ({ church, access, audit, body }) => {
        if (!can.manageSettings(access)) throw forbidden('You cannot change church modules');
        const before = enabledModulesOf(church);
        const next = new Set<ModuleId>(before);
        for (const [id, enabled] of Object.entries(body.modules) as [ModuleId, boolean][]) {
          if (enabled) next.add(id);
          else next.delete(id);
        }
        const after = [...next].sort();
        const updated = db.transaction((tx) => {
          const row = tx
            .update(churches)
            .set({ enabledModules: after, updatedAt: nowIso() })
            .where(eq(churches.id, church.id))
            .returning()
            .get();
          if (!row) throw notFound('Church');
          const turnedOn = after.filter((id) => !before.includes(id));
          const turnedOff = before.filter((id) => !after.includes(id));
          if (turnedOn.length > 0 || turnedOff.length > 0) {
            recordAudit(tx, audit, {
              module: 'core',
              action: 'church.modules_update',
              entityType: 'church',
              entityId: church.id,
              summary: [
                turnedOn.length > 0 ? `Turned on ${turnedOn.join(', ')}` : null,
                turnedOff.length > 0 ? `Turned off ${turnedOff.join(', ')}` : null,
              ]
                .filter(Boolean)
                .join('; '),
              before: { enabledModules: [...before].sort() },
              after: { enabledModules: after },
            });
          }
          return row;
        });
        return { items: moduleStates(updated) };
      },
      { church: true, params: churchParamsSchema, body: updateChurchModulesBodySchema },
    )
    .get(
      '/:churchId/members',
      ({ church, access, query }) => {
        if (!can.viewMembers(access)) throw forbidden('Only administrators can view members');
        const showSecurity = canViewSecurity(access);
        if (query.twoFactor && !showSecurity) {
          throw forbidden('You cannot see the two-step verification of members');
        }
        const rows = loadMemberRows(db, church.id);
        const filtered = filterMembers(rows, query);
        const start = offsetOf(query);
        return {
          items: filtered
            .slice(start, start + query.limit)
            .map((row) => toMemberListItem(row, showSecurity)),
          total: filtered.length,
          page: query.page,
          limit: query.limit,
          summary: summarizeMembers(rows, showSecurity),
        };
      },
      { church: true, params: churchParamsSchema, query: memberListQuerySchema },
    )
    .get(
      '/:churchId/members/:id',
      ({ church, access, membership: own, params }) => {
        if (own.id !== params.id && !can.viewMembers(access)) {
          throw forbidden('You cannot view this member');
        }
        const row = loadMemberRows(db, church.id).find(
          (candidate) => candidate.membership.id === params.id,
        );
        if (!row) throw notFound('Membership');
        const showSecurity = canViewSecurity(access) || own.id === params.id;
        const roles = db
          .select({ id: churchRoles.id, name: churchRoles.name })
          .from(membershipRoles)
          .innerJoin(churchRoles, eq(churchRoles.id, membershipRoles.roleId))
          .where(eq(membershipRoles.membershipId, row.membership.id))
          .orderBy(asc(churchRoles.name))
          .all();
        const leaderGroups = db
          .select({ id: groups.id, name: groups.name })
          .from(groupLeaders)
          .innerJoin(groups, eq(groups.id, groupLeaders.groupId))
          .where(and(eq(groupLeaders.churchId, church.id), eq(groupLeaders.userId, row.user.id)))
          .orderBy(asc(groups.name))
          .all();
        const person = row.personId
          ? db
              .select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
              .from(people)
              .where(and(eq(people.id, row.personId), eq(people.churchId, church.id)))
              .get()
          : undefined;
        const lastSession = showSecurity
          ? db
              .select({ lastUsedAt: sessions.lastUsedAt })
              .from(sessions)
              .where(eq(sessions.userId, row.user.id))
              .orderBy(desc(sessions.lastUsedAt))
              .get()
          : undefined;
        return {
          membership: toMemberListItem(row, showSecurity),
          permissions: {
            membershipId: row.membership.id,
            role: row.membership.role,
            roles,
            permissions: row.permissions,
            basePermissions: [...BASE_ROLE_PERMISSIONS[row.membership.role]],
            isLeader: row.isLeader,
          },
          leaderGroups,
          person: person
            ? { id: person.id, name: [person.firstName, person.lastName].filter(Boolean).join(' ') }
            : null,
          lastActiveAt: lastSession?.lastUsedAt ?? null,
        };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .patch(
      '/:churchId/members/:id',
      ({ church, access, audit, auth, params, body }) => {
        const row = loadMembership(church.id, params.id);
        if (!can.changeMemberRole(access, row.membership)) {
          throw forbidden('You cannot change the role of this member');
        }
        if (!can.changeMemberRole(access, targetOf(row.membership))) throw escalationDenied();
        if (!canGrantBaseRole(access, body.role)) {
          throw new HttpError(
            403,
            'ESCALATION_DENIED',
            'Only someone with every administrator permission can make another administrator',
          );
        }
        if (row.membership.role === body.role) {
          return { membership: toMembership(row.membership, row.user) };
        }
        const updated = db.transaction((tx) => {
          const result = tx
            .update(churchMemberships)
            .set({ role: body.role })
            .where(eq(churchMemberships.id, row.membership.id))
            .returning()
            .get();
          if (!result) throw notFound('Membership');
          recordMemberAudit(
            tx,
            audit,
            'member.role_change',
            `Changed ${row.user.name} from ${ROLE_LABELS[row.membership.role].toLowerCase()} to ${ROLE_LABELS[body.role].toLowerCase()}`,
            row.membership.id,
            { role: row.membership.role },
            { role: body.role },
          );
          notify(tx, {
            churchId: church.id,
            userIds: [row.user.id],
            excludeUserIds: [auth.user.id],
            type: 'membership.role_changed',
            title: `Your role in ${church.name} is now ${ROLE_LABELS[body.role].toLowerCase()}`,
            link: `/c/${church.id}`,
            entityType: 'membership',
            entityId: row.membership.id,
          });
          return result;
        });
        const roleIds = roleIdsByMembership(church.id).get(updated.id) ?? [];
        return { membership: toMembership(updated, row.user, roleIds) };
      },
      { church: true, params: churchIdParamsSchema, body: updateMembershipRoleBodySchema },
    )
    .patch(
      '/:churchId/members/:id/status',
      ({ church, access, audit, auth, params, body }) => {
        const row = loadMembership(church.id, params.id);
        if (!can.suspendMember(access, row.membership)) {
          throw forbidden('You cannot change the status of this member');
        }
        if (!can.suspendMember(access, targetOf(row.membership))) throw escalationDenied();
        if (row.membership.status === body.status) {
          const roleIds = roleIdsByMembership(church.id).get(row.membership.id) ?? [];
          return { membership: toMembership(row.membership, row.user, roleIds) };
        }
        const suspended = body.status === 'suspended';
        const updated = db.transaction((tx) => {
          const result = tx
            .update(churchMemberships)
            .set({ status: body.status, suspendedAt: suspended ? nowIso() : null })
            .where(eq(churchMemberships.id, row.membership.id))
            .returning()
            .get();
          if (!result) throw notFound('Membership');
          recordMemberAudit(
            tx,
            audit,
            suspended ? 'member.suspend' : 'member.reactivate',
            `${suspended ? 'Suspended' : 'Reactivated'} ${row.user.name}`,
            row.membership.id,
            { status: row.membership.status },
            { status: body.status },
          );
          // Account-level, because a suspended member cannot open the church's notifications.
          notify(tx, {
            churchId: null,
            userIds: [row.user.id],
            excludeUserIds: [auth.user.id],
            type: 'membership.status_changed',
            title: suspended
              ? `Your access to ${church.name} was suspended`
              : `Your access to ${church.name} was restored`,
            link: suspended ? '/churches' : `/c/${church.id}`,
            entityType: 'membership',
            entityId: row.membership.id,
          });
          return result;
        });
        const roleIds = roleIdsByMembership(church.id).get(updated.id) ?? [];
        return { membership: toMembership(updated, row.user, roleIds) };
      },
      { church: true, params: churchIdParamsSchema, body: updateMembershipStatusBodySchema },
    )
    .delete(
      '/:churchId/members/:id',
      ({ church, access, audit, params }) => {
        const row = loadMembership(church.id, params.id);
        if (!can.removeMember(access, row.membership)) {
          throw forbidden('You cannot remove this member');
        }
        if (!can.removeMember(access, targetOf(row.membership))) throw escalationDenied();
        db.transaction((tx) => {
          recordMemberAudit(
            tx,
            audit,
            'member.remove',
            `Removed ${row.user.name} from the church`,
            row.membership.id,
            { userId: row.user.id, name: row.user.name, role: row.membership.role },
            null,
          );
          detachUserFromChurch(tx, church.id, row.membership.userId);
          // Account-level: the person no longer belongs to the church's inbox.
          notify(tx, {
            churchId: null,
            userIds: [row.user.id],
            type: 'membership.status_changed',
            title: `You were removed from ${church.name}`,
            body: 'Ask a church administrator for a new invitation if this was a mistake.',
            link: '/churches',
            entityType: 'church',
            entityId: church.id,
          });
        });
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .post(
      '/:churchId/leave',
      ({ church, access, audit, auth, membership }) => {
        if (!can.leaveChurch(access)) {
          throw conflict('Transfer ownership to another member before leaving the church');
        }
        db.transaction((tx) => {
          recordMemberAudit(
            tx,
            audit,
            'member.leave',
            `${auth.user.name} left the church`,
            membership.id,
            { userId: auth.user.id, name: auth.user.name, role: membership.role },
            null,
          );
          detachUserFromChurch(tx, church.id, auth.user.id);
        });
        return { ok: true as const };
      },
      { church: true, params: churchParamsSchema },
    )
    .post(
      '/:churchId/transfer-ownership',
      async ({ church, access, audit, auth, body }) => {
        if (!can.transferOwnership(access))
          throw forbidden('Only the owner can transfer ownership');
        if (body.userId === auth.user.id) throw badRequest('You already own this church');
        if (body.confirmName !== undefined && !namesMatch(body.confirmName, church.name)) {
          const message = 'Type the church name exactly as shown';
          throw validationError(message, [{ path: 'confirmName', message }]);
        }
        await verifyOwnPassword(auth.user.id, body.password);
        const target = db
          .select({ membership: churchMemberships, user: users })
          .from(churchMemberships)
          .innerJoin(users, eq(users.id, churchMemberships.userId))
          .where(
            and(
              eq(churchMemberships.churchId, church.id),
              eq(churchMemberships.userId, body.userId),
            ),
          )
          .get();
        if (!target) throw notFound('Member');
        if (target.membership.status !== 'active') {
          throw conflict('Reactivate this member before handing them ownership');
        }
        const now = nowIso();
        db.transaction((tx) => {
          tx.update(churchMemberships)
            .set({ role: 'owner' })
            .where(eq(churchMemberships.id, target.membership.id))
            .run();
          tx.update(churchMemberships)
            .set({ role: 'administrator' })
            .where(
              and(
                eq(churchMemberships.churchId, church.id),
                eq(churchMemberships.userId, auth.user.id),
              ),
            )
            .run();
          tx.update(churches)
            .set({ ownerUserId: body.userId, updatedAt: now })
            .where(eq(churches.id, church.id))
            .run();
          recordAudit(tx, audit, {
            module: 'core',
            action: 'church.transfer',
            entityType: 'church',
            entityId: church.id,
            summary: `Transferred ownership from ${auth.user.name} to ${target.user.name}`,
            before: { ownerUserId: auth.user.id },
            after: { ownerUserId: body.userId },
          });
          notify(tx, {
            churchId: church.id,
            userIds: [body.userId],
            type: 'church.ownership_transferred',
            title: `You are now the owner of ${church.name}`,
            body: `${auth.user.name} handed ownership of the church to you.`,
            link: `/c/${church.id}/settings`,
            entityType: 'church',
            entityId: church.id,
          });
        });
        const updated = db.select().from(churches).where(eq(churches.id, church.id)).get();
        if (!updated) throw notFound('Church');
        return { church: toChurch(updated) };
      },
      { church: true, params: churchParamsSchema, body: confirmTransferOwnershipBodySchema },
    );
};
