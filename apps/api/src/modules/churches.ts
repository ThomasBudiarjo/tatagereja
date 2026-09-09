import {
  can,
  churchIdParamsSchema,
  churchInputSchema,
  churchParamsSchema,
  transferOwnershipBodySchema,
  updateMembershipRoleBodySchema,
} from '@tatagereja/shared';
import { and, asc, count, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';
import { churches, churchMemberships, groupLeaders, people, users } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors';
import { verifyPassword } from '../lib/password';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toChurch, toMembership } from '../serializers';

const deleteChurchBodySchema = z.object({ password: z.string().min(1).max(128) });

export const churchesModule = (deps: Deps) => {
  const { db } = deps;

  const memberCount = (churchId: string): number =>
    db
      .select({ value: count() })
      .from(churchMemberships)
      .where(eq(churchMemberships.churchId, churchId))
      .get()?.value ?? 0;

  /** Removes a user's church-scoped assignments when they leave or are removed. */
  const detachUserFromChurch = (churchId: string, userId: string) => {
    db.delete(groupLeaders)
      .where(and(eq(groupLeaders.churchId, churchId), eq(groupLeaders.userId, userId)))
      .run();
    db.update(people)
      .set({ userId: null, updatedAt: nowIso() })
      .where(and(eq(people.churchId, churchId), eq(people.userId, userId)))
      .run();
    db.delete(churchMemberships)
      .where(and(eq(churchMemberships.churchId, churchId), eq(churchMemberships.userId, userId)))
      .run();
  };

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
            memberCount: memberCount(row.church.id),
            joinedAt: row.membership.joinedAt,
          })),
        };
      },
      { auth: true },
    )
    .post(
      '/',
      ({ auth, body, set }) => {
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
          return created;
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
        membership: toMembership(membership, auth.user),
        access,
        memberCount: memberCount(church.id),
      }),
      { church: true, params: churchParamsSchema },
    )
    .patch(
      '/:churchId',
      ({ church, access, body }) => {
        if (!can.editChurch(access)) throw forbidden('Only administrators can edit the church');
        const updated = db
          .update(churches)
          .set({ ...body, updatedAt: nowIso() })
          .where(eq(churches.id, church.id))
          .returning()
          .get();
        if (!updated) throw notFound('Church');
        return { church: toChurch(updated) };
      },
      { church: true, params: churchParamsSchema, body: churchInputSchema },
    )
    .delete(
      '/:churchId',
      async ({ church, access, auth, body }) => {
        if (!can.deleteChurch(access)) throw forbidden('Only the owner can delete the church');
        const user = db.select().from(users).where(eq(users.id, auth.user.id)).get();
        if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
          throw unauthorized('Password is incorrect');
        }
        db.delete(churches).where(eq(churches.id, church.id)).run();
        return { ok: true as const };
      },
      { church: true, params: churchParamsSchema, body: deleteChurchBodySchema },
    )
    .get(
      '/:churchId/members',
      ({ church, access }) => {
        if (!can.manageMembers(access)) throw forbidden('Only administrators can view members');
        const rows = db
          .select({ membership: churchMemberships, user: users })
          .from(churchMemberships)
          .innerJoin(users, eq(users.id, churchMemberships.userId))
          .where(eq(churchMemberships.churchId, church.id))
          .orderBy(asc(users.name))
          .all();
        return { items: rows.map((row) => toMembership(row.membership, row.user)) };
      },
      { church: true, params: churchParamsSchema },
    )
    .patch(
      '/:churchId/members/:id',
      ({ church, access, params, body }) => {
        const row = db
          .select({ membership: churchMemberships, user: users })
          .from(churchMemberships)
          .innerJoin(users, eq(users.id, churchMemberships.userId))
          .where(
            and(eq(churchMemberships.id, params.id), eq(churchMemberships.churchId, church.id)),
          )
          .get();
        if (!row) throw notFound('Membership');
        if (!can.changeMemberRole(access, row.membership)) {
          throw forbidden('You cannot change the role of this member');
        }
        const updated = db
          .update(churchMemberships)
          .set({ role: body.role })
          .where(eq(churchMemberships.id, row.membership.id))
          .returning()
          .get();
        if (!updated) throw notFound('Membership');
        return { membership: toMembership(updated, row.user) };
      },
      { church: true, params: churchIdParamsSchema, body: updateMembershipRoleBodySchema },
    )
    .delete(
      '/:churchId/members/:id',
      ({ church, access, params }) => {
        const membership = db
          .select()
          .from(churchMemberships)
          .where(
            and(eq(churchMemberships.id, params.id), eq(churchMemberships.churchId, church.id)),
          )
          .get();
        if (!membership) throw notFound('Membership');
        if (!can.removeMember(access, membership)) throw forbidden('You cannot remove this member');
        db.transaction(() => detachUserFromChurch(church.id, membership.userId));
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .post(
      '/:churchId/leave',
      ({ church, access, auth }) => {
        if (!can.leaveChurch(access)) {
          throw conflict('Transfer ownership to another member before leaving the church');
        }
        db.transaction(() => detachUserFromChurch(church.id, auth.user.id));
        return { ok: true as const };
      },
      { church: true, params: churchParamsSchema },
    )
    .post(
      '/:churchId/transfer-ownership',
      async ({ church, access, auth, body }) => {
        if (!can.transferOwnership(access))
          throw forbidden('Only the owner can transfer ownership');
        if (body.userId === auth.user.id) throw badRequest('You already own this church');
        const user = db.select().from(users).where(eq(users.id, auth.user.id)).get();
        if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
          throw unauthorized('Password is incorrect');
        }
        const target = db
          .select()
          .from(churchMemberships)
          .where(
            and(
              eq(churchMemberships.churchId, church.id),
              eq(churchMemberships.userId, body.userId),
            ),
          )
          .get();
        if (!target) throw notFound('Member');
        const now = nowIso();
        db.transaction((tx) => {
          tx.update(churchMemberships)
            .set({ role: 'owner' })
            .where(eq(churchMemberships.id, target.id))
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
        });
        const updated = db.select().from(churches).where(eq(churches.id, church.id)).get();
        if (!updated) throw notFound('Church');
        return { church: toChurch(updated) };
      },
      { church: true, params: churchParamsSchema, body: transferOwnershipBodySchema },
    );
};
