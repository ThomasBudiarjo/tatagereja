import {
  announcementInputSchema,
  announcementListQuerySchema,
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  isAdmin,
} from '@tatagereja/shared';
import { and, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { AnnouncementRow } from '../db/schema';
import { announcements, groups } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound } from '../lib/errors';
import { likePattern, offsetOf } from '../lib/query';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { hydrateAnnouncements } from '../services/announcements';

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

  const assertGroupInChurch = (churchId: string, groupId: string | null) => {
    if (!groupId) return;
    const group = db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.churchId, churchId)))
      .get();
    if (!group) throw notFound('Group');
  };

  const hydrateOne = (row: AnnouncementRow) => {
    const [announcement] = hydrateAnnouncements(db, [row]);
    if (!announcement) throw notFound('Announcement');
    return announcement;
  };

  return new Elysia({ prefix: '/churches/:churchId/announcements' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const conditions: SQL[] = [eq(announcements.churchId, church.id)];
        if (!isAdmin(access)) {
          // Members see published posts; leaders additionally see drafts for their groups.
          const visible =
            access.leaderGroupIds.length > 0
              ? or(
                  eq(announcements.status, 'published'),
                  inArray(announcements.groupId, access.leaderGroupIds),
                )
              : eq(announcements.status, 'published');
          if (visible) conditions.push(visible);
        }
        if (query.status) conditions.push(eq(announcements.status, query.status));
        if (query.groupId) conditions.push(eq(announcements.groupId, query.groupId));
        if (query.q) conditions.push(like(announcements.title, likePattern(query.q)));
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(announcements).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(announcements)
          .where(where)
          .orderBy(desc(sql`coalesce(${announcements.publishedAt}, ${announcements.createdAt})`))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateAnnouncements(db, rows),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      { church: true, params: churchParamsSchema, query: announcementListQuerySchema },
    )
    .post(
      '/',
      ({ church, access, auth, body, set }) => {
        if (!can.createAnnouncement(access, body.groupId)) {
          throw forbidden('You cannot publish announcements for this scope');
        }
        assertGroupInChurch(church.id, body.groupId);
        const now = nowIso();
        const row = db
          .insert(announcements)
          .values({
            id: newId(),
            churchId: church.id,
            groupId: body.groupId,
            title: body.title,
            body: body.body,
            status: body.status,
            publishedAt: body.status === 'published' ? now : null,
            createdBy: auth.user.id,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        set.status = 201;
        return { announcement: hydrateOne(row) };
      },
      { church: true, params: churchParamsSchema, body: announcementInputSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const row = loadAnnouncement(church.id, params.id);
        const canManage = can.manageAnnouncement(access, row);
        if (row.status !== 'published' && !canManage) throw notFound('Announcement');
        return { announcement: hydrateOne(row), canManage };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, params, body }) => {
        const row = loadAnnouncement(church.id, params.id);
        if (!can.manageAnnouncement(access, row))
          throw forbidden('You cannot edit this announcement');
        if (body.groupId !== row.groupId && !can.createAnnouncement(access, body.groupId)) {
          throw forbidden('You cannot move this announcement to that scope');
        }
        assertGroupInChurch(church.id, body.groupId);
        const now = nowIso();
        const publishedAt = body.status === 'published' ? (row.publishedAt ?? now) : null;
        const updated = db
          .update(announcements)
          .set({
            groupId: body.groupId,
            title: body.title,
            body: body.body,
            status: body.status,
            publishedAt,
            updatedAt: now,
          })
          .where(eq(announcements.id, row.id))
          .returning()
          .get();
        if (!updated) throw notFound('Announcement');
        return { announcement: hydrateOne(updated) };
      },
      { church: true, params: churchIdParamsSchema, body: announcementInputSchema },
    )
    .delete(
      '/:id',
      ({ church, access, params }) => {
        const row = loadAnnouncement(church.id, params.id);
        if (!can.manageAnnouncement(access, row))
          throw forbidden('You cannot delete this announcement');
        db.delete(announcements).where(eq(announcements.id, row.id)).run();
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    );
};
