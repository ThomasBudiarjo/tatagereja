import {
  CALENDAR_SOURCES,
  COMMS_LIMITS,
  calendarFeedTokenParamsSchema,
  calendarQuerySchema,
  calendarSourcesFor,
  churchIdParamsSchema,
  churchParamsSchema,
  createCalendarFeedBodySchema,
  type CalendarFeed,
  type CalendarSource,
} from '@tatagereja/shared';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { CalendarFeedTokenRow } from '../../db/schema';
import { calendarFeedTokens, churches, churchMemberships } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, notFound } from '../../lib/errors';
import { enforceRateLimit } from '../../lib/rate-limit';
import { clientIp } from '../../lib/request';
import { nowIso } from '../../lib/time';
import { generateToken, hashToken, newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { loadAccess } from '../../services/access';
import { recordAudit } from '../../services/audit';
import { enabledModulesOf } from '../../services/modules';
import { calendarItems } from './calendar-items';
import { buildIcs } from './ics';

const DAY_MS = 86_400_000;
/** Calendar apps poll feeds; one address may ask this often. */
const FEED_LIMIT = { windowMs: 15 * 60_000, max: 120 };
/** Touching `last_used_at` at most this often keeps polling cheap. */
const TOUCH_MS = 10 * 60_000;

const feedSources = (row: CalendarFeedTokenRow): CalendarSource[] =>
  (Array.isArray(row.sources) ? row.sources : []).filter((source): source is CalendarSource =>
    (CALENDAR_SOURCES as readonly string[]).includes(source),
  );

const toFeed = (row: CalendarFeedTokenRow): CalendarFeed => ({
  id: row.id,
  label: row.label,
  sources: feedSources(row),
  lastUsedAt: row.lastUsedAt,
  createdAt: row.createdAt,
});

const feedPath = (token: string) => `/api/calendar/feeds/${token}.ics`;

/** The public origin of the request, honouring a TLS-terminating proxy. */
const originOf = (request: Request): string => {
  const url = new URL(request.url);
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || url.host;
  return `${proto}://${host}`;
};

/**
 * The unified calendar (events, services, room bookings, birthdays) for the sources the caller
 * may see, and private iCal feeds: revocable per-user tokens of which only a hash is stored.
 */
export const calendarRouter = (deps: Deps) => {
  const { db } = deps;

  return new Elysia({ prefix: '/churches/:churchId/calendar' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => ({
        items: calendarItems(db, church, access, query),
        available: calendarSourcesFor(access, enabledModulesOf(church)),
      }),
      { church: 'comms', params: churchParamsSchema, query: calendarQuerySchema },
    )
    .get(
      '/feeds',
      ({ church, access }) => ({
        items: db
          .select()
          .from(calendarFeedTokens)
          .where(
            and(
              eq(calendarFeedTokens.churchId, church.id),
              eq(calendarFeedTokens.userId, access.userId),
              isNull(calendarFeedTokens.revokedAt),
            ),
          )
          .orderBy(desc(calendarFeedTokens.createdAt))
          .all()
          .map(toFeed),
      }),
      { church: 'comms', params: churchParamsSchema },
    )
    .post(
      '/feeds',
      ({ church, access, audit, body, request, set }) => {
        const active =
          db
            .select({ value: count() })
            .from(calendarFeedTokens)
            .where(
              and(
                eq(calendarFeedTokens.churchId, church.id),
                eq(calendarFeedTokens.userId, access.userId),
                isNull(calendarFeedTokens.revokedAt),
              ),
            )
            .get()?.value ?? 0;
        if (active >= COMMS_LIMITS.feedTokensPerUserMax) {
          throw conflict(
            `You can have at most ${COMMS_LIMITS.feedTokensPerUserMax} calendar links. Revoke one first.`,
          );
        }
        const token = generateToken(32);
        const row = db.transaction((tx) => {
          const created = tx
            .insert(calendarFeedTokens)
            .values({
              id: newId(),
              churchId: church.id,
              userId: access.userId,
              tokenHash: hashToken(token),
              label: body.label,
              sources: [...new Set(body.sources)],
              createdAt: nowIso(),
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'calendar_feed.create',
            entityType: 'calendar_feed',
            entityId: created.id,
            summary: 'Created a private calendar link',
            after: { label: created.label, sources: created.sources },
          });
          return created;
        });
        set.status = 201;
        const path = feedPath(token);
        return { feed: toFeed(row), url: `${originOf(request)}${path}`, path };
      },
      { church: 'comms', params: churchParamsSchema, body: createCalendarFeedBodySchema },
    )
    .delete(
      '/feeds/:id',
      ({ church, access, audit, params }) => {
        const row = db
          .select()
          .from(calendarFeedTokens)
          .where(
            and(
              eq(calendarFeedTokens.id, params.id),
              eq(calendarFeedTokens.churchId, church.id),
              eq(calendarFeedTokens.userId, access.userId),
              isNull(calendarFeedTokens.revokedAt),
            ),
          )
          .get();
        if (!row) throw notFound('Calendar link');
        db.transaction((tx) => {
          tx.update(calendarFeedTokens)
            .set({ revokedAt: nowIso() })
            .where(eq(calendarFeedTokens.id, row.id))
            .run();
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'calendar_feed.revoke',
            entityType: 'calendar_feed',
            entityId: row.id,
            summary: 'Revoked a private calendar link',
          });
        });
        return { ok: true as const };
      },
      { church: 'comms', params: churchIdParamsSchema },
    );
};

/**
 * The feed itself, read by calendar apps without a session: the token is the credential. It
 * answers 404 for unknown or revoked tokens and for people who left or were suspended, and
 * shows only what the person may see today.
 */
export const calendarFeedRouter = (deps: Deps) => {
  const { db, config } = deps;

  return new Elysia({ prefix: '/calendar/feeds' }).get(
    '/:token',
    ({ params, request, server, set }) => {
      enforceRateLimit(
        deps.limiters,
        'comms.calendar_feed',
        clientIp(request, server ?? undefined),
        FEED_LIMIT,
      );
      const token = params.token.replace(/\.ics$/, '');
      const feed = db
        .select()
        .from(calendarFeedTokens)
        .where(eq(calendarFeedTokens.tokenHash, hashToken(token)))
        .get();
      if (!feed || feed.revokedAt) throw notFound('Calendar');
      const church = db.select().from(churches).where(eq(churches.id, feed.churchId)).get();
      const membership = db
        .select()
        .from(churchMemberships)
        .where(
          and(
            eq(churchMemberships.churchId, feed.churchId),
            eq(churchMemberships.userId, feed.userId),
          ),
        )
        .get();
      if (!church || !membership || membership.status !== 'active') throw notFound('Calendar');
      const access = loadAccess(db, church, membership);
      const now = Date.now();
      if (!feed.lastUsedAt || now - new Date(feed.lastUsedAt).getTime() > TOUCH_MS) {
        db.update(calendarFeedTokens)
          .set({ lastUsedAt: new Date(now).toISOString() })
          .where(eq(calendarFeedTokens.id, feed.id))
          .run();
      }
      const items = calendarItems(db, church, access, {
        from: new Date(now - COMMS_LIMITS.feedPastDays * DAY_MS).toISOString(),
        to: new Date(now + COMMS_LIMITS.feedFutureDays * DAY_MS).toISOString(),
        sources: feedSources(feed),
      });
      set.headers['content-type'] = 'text/calendar; charset=utf-8';
      set.headers['cache-control'] = 'private, max-age=300';
      set.headers['content-disposition'] = 'inline; filename="tatagereja.ics"';
      return buildIcs({
        name: feed.label ? `${church.name} · ${feed.label}` : church.name,
        timeZone: church.timezone,
        appUrl: config.appUrl,
        items,
      });
    },
    { params: calendarFeedTokenParamsSchema },
  );
};
