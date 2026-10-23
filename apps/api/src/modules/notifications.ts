import {
  NOTIFICATION_TYPE_DEFINITIONS,
  idParamsSchema,
  markAllNotificationsBodySchema,
  markNotificationBodySchema,
  notificationListQuerySchema,
  unreadCountQuerySchema,
  updateNotificationPreferencesBodySchema,
} from '@tatagereja/shared';
import { and, count, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { churchMemberships, notificationPreferences, notifications } from '../db/schema';
import type { Deps } from '../deps';
import { afterCursor, decodeCursor, keysetPage } from '../lib/cursor';
import { notFound } from '../lib/errors';
import { offsetOf } from '../lib/query';
import { requestLocale } from '../lib/request';
import { nowIso } from '../lib/time';
import { authPlugin } from '../plugins/auth';
import { toNotification } from '../serializers';
import { releaseDueAnnouncements } from '../services/announcements';

/**
 * The caller's own notifications across churches. Notifications of a church the caller is
 * no longer an active member of stay hidden.
 */
export const notificationsModule = (deps: Deps) => {
  const { db } = deps;

  const visibleTo = (userId: string, churchId?: string): SQL => {
    const activeChurches = db
      .select({ id: churchMemberships.churchId })
      .from(churchMemberships)
      .where(and(eq(churchMemberships.userId, userId), eq(churchMemberships.status, 'active')));
    const scope = churchId
      ? and(eq(notifications.churchId, churchId), inArray(notifications.churchId, activeChurches))
      : or(isNull(notifications.churchId), inArray(notifications.churchId, activeChurches));
    return and(eq(notifications.userId, userId), scope) as SQL;
  };

  /** Scheduled announcements of the caller's churches whose time has come are released first. */
  const releaseFor = (userId: string, churchId?: string) => {
    const churchIds = db
      .select({ id: churchMemberships.churchId })
      .from(churchMemberships)
      .where(
        and(
          eq(churchMemberships.userId, userId),
          eq(churchMemberships.status, 'active'),
          churchId ? eq(churchMemberships.churchId, churchId) : undefined,
        ),
      )
      .all()
      .map((row) => row.id);
    releaseDueAnnouncements(db, churchIds);
  };

  const unreadCount = (userId: string, churchId?: string): number =>
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(visibleTo(userId, churchId), isNull(notifications.readAt)))
      .get()?.value ?? 0;

  return new Elysia({ prefix: '/notifications' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ auth, query, request }) => {
        releaseFor(auth.user.id, query.churchId);
        const conditions: SQL[] = [visibleTo(auth.user.id, query.churchId)];
        if (query.unread) conditions.push(isNull(notifications.readAt));
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(notifications).where(where).get()?.value ?? 0;
        const after = query.cursor ? decodeCursor(query.cursor, 2) : null;
        const { rows, nextCursor } = keysetPage(
          db
            .select()
            .from(notifications)
            .where(
              after
                ? and(
                    where,
                    afterCursor([notifications.createdAt, notifications.id], after, 'desc'),
                  )
                : where,
            )
            .orderBy(desc(notifications.createdAt), desc(notifications.id))
            .limit(query.limit + 1)
            .offset(after ? 0 : offsetOf(query))
            .all(),
          query.limit,
          (row) => [row.createdAt, row.id],
        );
        return {
          items: rows.map((row) => toNotification(row, requestLocale(request))),
          total,
          page: query.page,
          limit: query.limit,
          unreadCount: unreadCount(auth.user.id, query.churchId),
          nextCursor,
        };
      },
      { auth: true, query: notificationListQuerySchema },
    )
    .get(
      '/unread-count',
      ({ auth, query }) => {
        releaseFor(auth.user.id, query.churchId);
        return { count: unreadCount(auth.user.id, query.churchId) };
      },
      { auth: true, query: unreadCountQuerySchema },
    )
    .patch(
      '/',
      ({ auth, body }) => {
        db.update(notifications)
          .set({ readAt: nowIso() })
          .where(and(visibleTo(auth.user.id, body.churchId), isNull(notifications.readAt)))
          .run();
        return { count: unreadCount(auth.user.id, body.churchId) };
      },
      { auth: true, body: markAllNotificationsBodySchema },
    )
    .get(
      '/preferences',
      ({ auth }) => {
        const stored = new Map(
          db
            .select()
            .from(notificationPreferences)
            .where(eq(notificationPreferences.userId, auth.user.id))
            .all()
            .map((row) => [row.type, row]),
        );
        return {
          items: NOTIFICATION_TYPE_DEFINITIONS.map((definition) => {
            const row = stored.get(definition.type);
            const mandatory = definition.mandatory ?? false;
            return {
              type: definition.type,
              inApp: mandatory || (row?.inApp ?? definition.defaultInApp ?? true),
              email: row?.email ?? false,
              mandatory,
            };
          }),
        };
      },
      { auth: true },
    )
    .put(
      '/preferences',
      ({ auth, body }) => {
        const now = nowIso();
        db.transaction((tx) => {
          for (const item of body.items) {
            tx.insert(notificationPreferences)
              .values({
                userId: auth.user.id,
                type: item.type,
                inApp: item.inApp,
                email: item.email,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: [notificationPreferences.userId, notificationPreferences.type],
                set: { inApp: item.inApp, email: item.email, updatedAt: now },
              })
              .run();
          }
        });
        return { ok: true as const };
      },
      { auth: true, body: updateNotificationPreferencesBodySchema },
    )
    .patch(
      '/:id',
      ({ auth, params, body, request }) => {
        const row = db
          .update(notifications)
          // Keeps the first read time when a read notification is marked read again.
          .set({ readAt: body.read ? sql`coalesce(${notifications.readAt}, ${nowIso()})` : null })
          .where(and(eq(notifications.id, params.id), visibleTo(auth.user.id)))
          .returning()
          .get();
        if (!row) throw notFound('Notification');
        return { notification: toNotification(row, requestLocale(request)) };
      },
      { auth: true, params: idParamsSchema, body: markNotificationBodySchema },
    );
};
