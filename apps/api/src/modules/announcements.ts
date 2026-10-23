import {
  announcementDetailsInputSchema,
  announcementDetailsListQuerySchema,
  can,
  canTargetChurchWide,
  churchIdParamsSchema,
  churchParamsSchema,
  pinAnnouncementBodySchema,
  type AccessLike,
  type AnnouncementDetailsInput,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, gt, inArray, like, lte, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../db/client';
import type { AnnouncementRow, ChurchRow } from '../db/schema';
import {
  announcementAudienceRoles,
  announcementReads,
  announcements,
  churchRoles,
  groups,
  users,
} from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound } from '../lib/errors';
import { likePattern, offsetOf } from '../lib/query';
import { nowIso, toUtcIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import {
  announcementAudienceUserIds,
  announcementVisibility,
  audienceRolesOf,
  hydrateAnnouncementDetails,
  liveAnnouncement,
  notifyAnnouncementOnce,
  releaseDueAnnouncements,
} from '../services/announcements';
import { changes, recordAudit } from '../services/audit';

type Scope = Pick<AnnouncementDetailsInput, 'audience' | 'groupId'>;

/** Whole-church and role posts need `announcements.manage`; group posts also suit leaders. */
const canPostTo = (access: AccessLike, scope: Scope) =>
  scope.audience === 'group'
    ? can.createAnnouncement(access, scope.groupId)
    : canTargetChurchWide(access);

const snapshot = (row: AnnouncementRow, roleIds: string[]) => ({
  title: row.title,
  status: row.status,
  audience: row.audience,
  groupId: row.groupId,
  roleIds,
  publishAt: row.publishAt,
  expiresAt: row.expiresAt,
  pinned: row.pinnedAt !== null,
  coverImageUrl: row.coverImageUrl,
});

/** Pinned posts first, then the newest by the time they became visible. */
const listOrder = [
  desc(sql`${announcements.pinnedAt} is not null`),
  desc(announcements.pinnedAt),
  desc(
    sql`coalesce(${announcements.publishAt}, ${announcements.publishedAt}, ${announcements.createdAt})`,
  ),
];

/**
 * Announcements: drafts, scheduled publishing and expiry, pinning, audiences (whole church,
 * a group, holders of roles), read receipts and audience notifications on publish.
 */
export const announcementsModule = (deps: Deps) => {
  const { db } = deps;

  const loadAnnouncement = (churchId: string, id: string): AnnouncementRow => {
    const row = db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, id), eq(announcements.churchId, churchId)))
      .get();
    if (!row) throw notFound('Announcement');
    return row;
  };

  /** Loads an announcement the caller may read; anything else answers 404. */
  const loadVisible = (church: ChurchRow, access: AccessLike, id: string): AnnouncementRow => {
    const visibility = announcementVisibility(db, church.id, access, nowIso());
    const row = db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, id), eq(announcements.churchId, church.id), visibility))
      .get();
    if (!row) throw notFound('Announcement');
    return row;
  };

  const assertGroupInChurch = (churchId: string, groupId: string | null) => {
    if (!groupId) return;
    const group = db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.churchId, churchId)))
      .get();
    if (!group) throw notFound('Group');
  };

  const assertRolesInChurch = (churchId: string, roleIds: string[]) => {
    if (roleIds.length === 0) return;
    const found =
      db
        .select({ value: count() })
        .from(churchRoles)
        .where(and(eq(churchRoles.churchId, churchId), inArray(churchRoles.id, roleIds)))
        .get()?.value ?? 0;
    if (found !== roleIds.length) throw notFound('Role');
  };

  const replaceRoles = (tx: Queryable, row: AnnouncementRow, roleIds: string[]) => {
    tx.delete(announcementAudienceRoles)
      .where(eq(announcementAudienceRoles.announcementId, row.id))
      .run();
    if (roleIds.length === 0) return;
    tx.insert(announcementAudienceRoles)
      .values(roleIds.map((roleId) => ({ announcementId: row.id, roleId, churchId: row.churchId })))
      .run();
  };

  const hydrateOne = (row: AnnouncementRow, access: AccessLike) => {
    const [announcement] = hydrateAnnouncementDetails(db, [row], access);
    if (!announcement) throw notFound('Announcement');
    return announcement;
  };

  const stateCondition = (state: string, now: string): SQL | undefined => {
    switch (state) {
      case 'draft':
        return eq(announcements.status, 'draft');
      case 'scheduled':
        return and(eq(announcements.status, 'published'), gt(announcements.publishAt, now));
      case 'expired':
        return and(eq(announcements.status, 'published'), lte(announcements.expiresAt, now));
      default:
        return liveAnnouncement(now);
    }
  };

  return new Elysia({ prefix: '/churches/:churchId/announcements' })
    .use(authPlugin(deps))
    .get(
      '/audience-options',
      ({ church, access }) => {
        const churchWide = canTargetChurchWide(access);
        if (!churchWide && access.leaderGroupIds.length === 0) {
          throw forbidden('You cannot publish announcements');
        }
        return {
          churchWide,
          groups: db
            .select({ id: groups.id, name: groups.name })
            .from(groups)
            .where(
              and(
                eq(groups.churchId, church.id),
                churchWide ? undefined : inArray(groups.id, access.leaderGroupIds),
              ),
            )
            .orderBy(asc(groups.name))
            .all(),
          roles: churchWide
            ? db
                .select({ id: churchRoles.id, name: churchRoles.name })
                .from(churchRoles)
                .where(eq(churchRoles.churchId, church.id))
                .orderBy(asc(churchRoles.name))
                .all()
            : [],
        };
      },
      { church: { permission: 'announcements.view' }, params: churchParamsSchema },
    )
    .get(
      '/',
      ({ church, access, query }) => {
        releaseDueAnnouncements(db, [church.id]);
        const now = nowIso();
        const conditions: (SQL | undefined)[] = [
          eq(announcements.churchId, church.id),
          announcementVisibility(db, church.id, access, now),
        ];
        if (query.status) conditions.push(eq(announcements.status, query.status));
        if (query.state) conditions.push(stateCondition(query.state, now));
        if (query.groupId) conditions.push(eq(announcements.groupId, query.groupId));
        if (query.audience) conditions.push(eq(announcements.audience, query.audience));
        if (query.q) conditions.push(like(announcements.title, likePattern(query.q)));
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(announcements).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(announcements)
          .where(where)
          .orderBy(...listOrder)
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateAnnouncementDetails(db, rows, access),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { permission: 'announcements.view' },
        params: churchParamsSchema,
        query: announcementDetailsListQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, access, auth, audit, body, set }) => {
        if (!canPostTo(access, body)) {
          throw forbidden('You cannot publish announcements for this audience');
        }
        assertGroupInChurch(church.id, body.groupId);
        assertRolesInChurch(church.id, body.roleIds);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(announcements)
            .values({
              id: newId(),
              churchId: church.id,
              groupId: body.groupId,
              audience: body.audience,
              title: body.title,
              body: body.body,
              status: body.status,
              publishedAt: body.status === 'published' ? now : null,
              publishAt: body.publishAt ? toUtcIso(body.publishAt) : null,
              expiresAt: body.expiresAt ? toUtcIso(body.expiresAt) : null,
              pinnedAt: body.pinned ? now : null,
              coverImageUrl: body.coverImageUrl,
              createdBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          replaceRoles(tx, created, body.roleIds);
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'announcement.create',
            entityType: 'announcement',
            entityId: created.id,
            summary: `Created the announcement ${created.title}`,
            after: snapshot(created, body.roleIds),
          });
          notifyAnnouncementOnce(tx, created, auth.user.id);
          return created;
        });
        set.status = 201;
        return { announcement: hydrateOne(loadAnnouncement(church.id, row.id), access) };
      },
      { church: true, params: churchParamsSchema, body: announcementDetailsInputSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        releaseDueAnnouncements(db, [church.id]);
        const row = loadVisible(church, access, params.id);
        return {
          announcement: hydrateOne(row, access),
          canManage: can.manageAnnouncement(access, row),
        };
      },
      { church: { permission: 'announcements.view' }, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, audit, auth, params, body }) => {
        const row = loadAnnouncement(church.id, params.id);
        if (!can.manageAnnouncement(access, row))
          throw forbidden('You cannot edit this announcement');
        const moved = body.audience !== row.audience || body.groupId !== row.groupId;
        if ((moved || body.audience === 'roles') && !canPostTo(access, body)) {
          throw forbidden('You cannot move this announcement to that audience');
        }
        assertGroupInChurch(church.id, body.groupId);
        assertRolesInChurch(church.id, body.roleIds);
        const beforeRoles = audienceRolesOf(db, [row.id]).get(row.id) ?? [];
        const now = nowIso();
        const publishedAt = body.status === 'published' ? (row.publishedAt ?? now) : null;
        const updated = db.transaction((tx) => {
          const next = tx
            .update(announcements)
            .set({
              groupId: body.groupId,
              audience: body.audience,
              title: body.title,
              body: body.body,
              status: body.status,
              publishedAt,
              publishAt: body.publishAt ? toUtcIso(body.publishAt) : null,
              expiresAt: body.expiresAt ? toUtcIso(body.expiresAt) : null,
              pinnedAt: body.pinned ? (row.pinnedAt ?? now) : null,
              coverImageUrl: body.coverImageUrl,
              updatedAt: now,
            })
            .where(eq(announcements.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Announcement');
          replaceRoles(tx, next, body.roleIds);
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'announcement.update',
            entityType: 'announcement',
            entityId: row.id,
            summary: `Updated the announcement ${next.title}`,
            ...changes(snapshot(row, beforeRoles), snapshot(next, body.roleIds)),
          });
          notifyAnnouncementOnce(tx, next, auth.user.id);
          return next;
        });
        return { announcement: hydrateOne(updated, access) };
      },
      { church: true, params: churchIdParamsSchema, body: announcementDetailsInputSchema },
    )
    .put(
      '/:id/pin',
      ({ church, access, params, body }) => {
        const row = loadAnnouncement(church.id, params.id);
        if (!can.manageAnnouncement(access, row))
          throw forbidden('You cannot pin this announcement');
        const updated = db
          .update(announcements)
          .set({ pinnedAt: body.pinned ? (row.pinnedAt ?? nowIso()) : null, updatedAt: nowIso() })
          .where(eq(announcements.id, row.id))
          .returning()
          .get();
        if (!updated) throw notFound('Announcement');
        return { announcement: hydrateOne(updated, access) };
      },
      { church: true, params: churchIdParamsSchema, body: pinAnnouncementBodySchema },
    )
    .post(
      '/:id/read',
      ({ church, access, params }) => {
        const row = loadVisible(church, access, params.id);
        if (row.status === 'published') {
          db.insert(announcementReads)
            .values({
              announcementId: row.id,
              userId: access.userId,
              churchId: church.id,
              readAt: nowIso(),
            })
            .onConflictDoNothing()
            .run();
        }
        return { announcement: hydrateOne(row, access) };
      },
      { church: { permission: 'announcements.view' }, params: churchIdParamsSchema },
    )
    .get(
      '/:id/readers',
      ({ church, access, params }) => {
        const row = loadAnnouncement(church.id, params.id);
        if (!can.manageAnnouncement(access, row)) throw forbidden('You cannot see who read this');
        const items = db
          .select({
            userId: announcementReads.userId,
            name: users.name,
            readAt: announcementReads.readAt,
          })
          .from(announcementReads)
          .innerJoin(users, eq(users.id, announcementReads.userId))
          .where(
            and(
              eq(announcementReads.announcementId, row.id),
              eq(announcementReads.churchId, church.id),
            ),
          )
          .orderBy(desc(announcementReads.readAt), asc(users.name))
          .all();
        return {
          seenCount: items.length,
          audienceCount: announcementAudienceUserIds(db, row).length,
          items,
        };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        const row = loadAnnouncement(church.id, params.id);
        if (!can.manageAnnouncement(access, row))
          throw forbidden('You cannot delete this announcement');
        const roleIds = audienceRolesOf(db, [row.id]).get(row.id) ?? [];
        db.transaction((tx) => {
          tx.delete(announcements).where(eq(announcements.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'announcement.delete',
            entityType: 'announcement',
            entityId: row.id,
            summary: `Deleted the announcement ${row.title}`,
            before: snapshot(row, roleIds),
          });
        });
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    );
};
