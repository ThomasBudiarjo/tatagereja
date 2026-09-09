import {
  addGroupMembersBodySchema,
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  groupInputSchema,
  groupLeaderBodySchema,
  groupListQuerySchema,
  idSchema,
  type GroupLeader,
} from '@tatagereja/shared';
import { and, asc, count, eq, inArray, like } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { GroupRow } from '../db/schema';
import { churchMemberships, groupLeaders, groupMembers, groups, people, users } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound } from '../lib/errors';
import { likePattern } from '../lib/query';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toGroup, toPersonSummary } from '../serializers';

const memberParamsSchema = churchIdParamsSchema.extend({ personId: idSchema });
const leaderParamsSchema = churchIdParamsSchema.extend({ userId: idSchema });

export const groupsModule = (deps: Deps) => {
  const { db } = deps;

  const loadGroup = (churchId: string, id: string): GroupRow => {
    const group = db
      .select()
      .from(groups)
      .where(and(eq(groups.id, id), eq(groups.churchId, churchId)))
      .get();
    if (!group) throw notFound('Group');
    return group;
  };

  const hydrate = (rows: GroupRow[]) => {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const counts = new Map<string, number>();
    for (const row of db
      .select({ groupId: groupMembers.groupId, value: count() })
      .from(groupMembers)
      .where(inArray(groupMembers.groupId, ids))
      .groupBy(groupMembers.groupId)
      .all()) {
      counts.set(row.groupId, row.value);
    }
    const leaders = new Map<string, GroupLeader[]>();
    for (const row of db
      .select({
        groupId: groupLeaders.groupId,
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(groupLeaders)
      .innerJoin(users, eq(users.id, groupLeaders.userId))
      .where(inArray(groupLeaders.groupId, ids))
      .orderBy(asc(users.name))
      .all()) {
      const list = leaders.get(row.groupId) ?? [];
      list.push({ userId: row.userId, name: row.name, email: row.email, avatarUrl: row.avatarUrl });
      leaders.set(row.groupId, list);
    }
    return rows.map((row) => toGroup(row, counts.get(row.id) ?? 0, leaders.get(row.id) ?? []));
  };

  const hydrateOne = (row: GroupRow) => {
    const [group] = hydrate([row]);
    if (!group) throw notFound('Group');
    return group;
  };

  return new Elysia({ prefix: '/churches/:churchId/groups' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => {
        const conditions = [eq(groups.churchId, church.id)];
        if (!query.includeInactive) conditions.push(eq(groups.isActive, true));
        if (query.q) conditions.push(like(groups.name, likePattern(query.q)));
        const rows = db
          .select()
          .from(groups)
          .where(and(...conditions))
          .orderBy(asc(groups.name))
          .all();
        return { items: hydrate(rows) };
      },
      { church: true, params: churchParamsSchema, query: groupListQuerySchema },
    )
    .post(
      '/',
      ({ church, access, body, set }) => {
        if (!can.createGroup(access)) throw forbidden('Only administrators can create groups');
        const now = nowIso();
        const row = db
          .insert(groups)
          .values({ id: newId(), churchId: church.id, ...body, createdAt: now, updatedAt: now })
          .returning()
          .get();
        set.status = 201;
        return { group: hydrateOne(row) };
      },
      { church: true, params: churchParamsSchema, body: groupInputSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const group = loadGroup(church.id, params.id);
        const members = db
          .select({ person: people, addedAt: groupMembers.addedAt })
          .from(groupMembers)
          .innerJoin(people, eq(people.id, groupMembers.personId))
          .where(eq(groupMembers.groupId, group.id))
          .orderBy(asc(people.firstName), asc(people.lastName))
          .all();
        return {
          group: hydrateOne(group),
          members: members.map((row) => ({
            ...toPersonSummary(row.person),
            joinedAt: row.person.joinedAt,
            addedAt: row.addedAt,
          })),
          canManage: can.manageGroup(access, group.id),
          canDelete: can.deleteGroup(access),
          canAssignLeaders: can.assignGroupLeaders(access),
        };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, params, body }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.manageGroup(access, group.id)) throw forbidden('You cannot edit this group');
        const updated = db
          .update(groups)
          .set({ ...body, updatedAt: nowIso() })
          .where(eq(groups.id, group.id))
          .returning()
          .get();
        if (!updated) throw notFound('Group');
        return { group: hydrateOne(updated) };
      },
      { church: true, params: churchIdParamsSchema, body: groupInputSchema },
    )
    .delete(
      '/:id',
      ({ church, access, params }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.deleteGroup(access)) throw forbidden('Only administrators can delete groups');
        db.delete(groups).where(eq(groups.id, group.id)).run();
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .post(
      '/:id/members',
      ({ church, access, params, body }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.manageGroup(access, group.id)) throw forbidden('You cannot manage this group');
        const personIds = [...new Set(body.personIds)];
        const found = db
          .select({ id: people.id })
          .from(people)
          .where(and(eq(people.churchId, church.id), inArray(people.id, personIds)))
          .all();
        if (found.length !== personIds.length) throw notFound('One or more people');
        const now = nowIso();
        db.insert(groupMembers)
          .values(
            personIds.map((personId) => ({
              id: newId(),
              groupId: group.id,
              personId,
              churchId: church.id,
              addedAt: now,
            })),
          )
          .onConflictDoNothing()
          .run();
        return { group: hydrateOne(group) };
      },
      { church: true, params: churchIdParamsSchema, body: addGroupMembersBodySchema },
    )
    .delete(
      '/:id/members/:personId',
      ({ church, access, params }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.manageGroup(access, group.id)) throw forbidden('You cannot manage this group');
        const deleted = db
          .delete(groupMembers)
          .where(
            and(eq(groupMembers.groupId, group.id), eq(groupMembers.personId, params.personId)),
          )
          .returning({ id: groupMembers.id })
          .get();
        if (!deleted) throw notFound('Group member');
        return { ok: true as const };
      },
      { church: true, params: memberParamsSchema },
    )
    .post(
      '/:id/leaders',
      ({ church, access, params, body }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.assignGroupLeaders(access))
          throw forbidden('Only administrators can assign leaders');
        const membership = db
          .select({ id: churchMemberships.id })
          .from(churchMemberships)
          .where(
            and(
              eq(churchMemberships.churchId, church.id),
              eq(churchMemberships.userId, body.userId),
            ),
          )
          .get();
        if (!membership) throw notFound('Church member');
        db.insert(groupLeaders)
          .values({
            id: newId(),
            groupId: group.id,
            userId: body.userId,
            churchId: church.id,
            assignedAt: nowIso(),
          })
          .onConflictDoNothing()
          .run();
        return { group: hydrateOne(group) };
      },
      { church: true, params: churchIdParamsSchema, body: groupLeaderBodySchema },
    )
    .delete(
      '/:id/leaders/:userId',
      ({ church, access, params }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.assignGroupLeaders(access))
          throw forbidden('Only administrators can remove leaders');
        const deleted = db
          .delete(groupLeaders)
          .where(and(eq(groupLeaders.groupId, group.id), eq(groupLeaders.userId, params.userId)))
          .returning({ id: groupLeaders.id })
          .get();
        if (!deleted) throw notFound('Group leader');
        return { group: hydrateOne(group) };
      },
      { church: true, params: leaderParamsSchema },
    );
};
