import {
  CHECKIN_LIMITS,
  GUARDIAN_RELATIONSHIPS,
  checkinSettingsSchema,
  churchParamsSchema,
} from '@tatagereja/shared';
import { and, asc, count, countDistinct, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { Elysia } from 'elysia';
import {
  checkinChildAlerts,
  checkinClasses,
  checkinClassTeachers,
  checkins,
  checkinSessions,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { addDays } from '../../lib/time';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import {
  buildHouseholds,
  checkinSettingsOf,
  householdLinkOf,
  hydrateCheckins,
  hydrateSessions,
  sessionClassStats,
  todayIn,
} from '../../services/checkin';
import { moduleStatus, saveModuleSettings } from '../../services/modules';
import { checkinCheckinsRouter } from './checkins';
import { checkinChildrenRouter } from './children';
import { checkinClassesRouter } from './classes';
import { checkinSessionsRouter } from './sessions';

const operate = { module: 'checkin', permission: ['checkin.operate', 'checkin.manage'] } as const;

/**
 * `status` is the wiring check (200 with the caller's checkin permissions, or 403
 * MODULE_DISABLED); `overview` feeds the module home; `settings` holds self check-in and the
 * child age limit; `me` is the guardian's phone: their family, open sessions and who is in class.
 */
const checkinHomeRouter = (deps: Deps) => {
  const { db } = deps;
  return new Elysia({ prefix: '/churches/:churchId/checkin' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'checkin'), {
      church: 'checkin',
      params: churchParamsSchema,
    })
    .get(
      '/overview',
      ({ church }) => {
        const open = db
          .select()
          .from(checkinSessions)
          .where(and(eq(checkinSessions.churchId, church.id), eq(checkinSessions.status, 'open')))
          .orderBy(desc(checkinSessions.date), desc(checkinSessions.openedAt))
          .limit(5)
          .all();
        const recent = db
          .select()
          .from(checkinSessions)
          .where(and(eq(checkinSessions.churchId, church.id), eq(checkinSessions.status, 'closed')))
          .orderBy(desc(checkinSessions.date), desc(checkinSessions.openedAt))
          .limit(CHECKIN_LIMITS.recentSessionsMax)
          .all();
        const since = addDays(new Date(), -30).toISOString();
        const window = db
          .select({ total: count(), children: countDistinct(checkins.childPersonId) })
          .from(checkins)
          .where(and(eq(checkins.churchId, church.id), gte(checkins.checkedInAt, since)))
          .get();
        const trend = db
          .select({
            date: checkinSessions.date,
            name: checkinSessions.name,
            count: count(checkins.id),
          })
          .from(checkinSessions)
          .leftJoin(checkins, eq(checkins.sessionId, checkinSessions.id))
          .where(eq(checkinSessions.churchId, church.id))
          .groupBy(checkinSessions.id)
          .orderBy(desc(checkinSessions.date), desc(checkinSessions.openedAt))
          .limit(8)
          .all()
          .reverse();
        return {
          openSessions: hydrateSessions(db, open).map((session) => ({
            session,
            classes: sessionClassStats(db, church.id, session.id),
          })),
          recentSessions: hydrateSessions(db, recent),
          stats: {
            activeClasses:
              db
                .select({ value: count() })
                .from(checkinClasses)
                .where(
                  and(eq(checkinClasses.churchId, church.id), eq(checkinClasses.isActive, true)),
                )
                .get()?.value ?? 0,
            teachers:
              db
                .select({ value: countDistinct(checkinClassTeachers.personId) })
                .from(checkinClassTeachers)
                .where(eq(checkinClassTeachers.churchId, church.id))
                .get()?.value ?? 0,
            childrenWithAlerts:
              db
                .select({ value: countDistinct(checkinChildAlerts.personId) })
                .from(checkinChildAlerts)
                .where(
                  and(
                    eq(checkinChildAlerts.churchId, church.id),
                    eq(checkinChildAlerts.isActive, true),
                  ),
                )
                .get()?.value ?? 0,
            checkinsLast30Days: window?.total ?? 0,
            childrenLast30Days: window?.children ?? 0,
          },
          trend,
        };
      },
      { church: operate, params: churchParamsSchema },
    )
    .get('/settings', ({ church }) => ({ settings: checkinSettingsOf(church) }), {
      church: 'checkin',
      params: churchParamsSchema,
    })
    .put(
      '/settings',
      ({ church, audit, body }) => {
        const before = checkinSettingsOf(church);
        db.transaction((tx) => {
          saveModuleSettings(tx, church.id, 'checkin', body);
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_settings.update',
            entityType: 'church',
            entityId: church.id,
            summary: 'Updated the kids check-in settings',
            ...changes(before, body),
          });
        });
        return { settings: body };
      },
      {
        church: { module: 'checkin', permission: ['checkin.manage', 'settings.manage'] },
        params: churchParamsSchema,
        body: checkinSettingsSchema,
      },
    )
    .get(
      '/me',
      ({ church, access }) => {
        const settings = checkinSettingsOf(church);
        const today = todayIn(church.timezone);
        // Sessions left open from earlier weeks are not offered to guardians.
        const yesterday = addDays(new Date(`${today}T00:00:00Z`), -1)
          .toISOString()
          .slice(0, 10);
        const openRows = db
          .select()
          .from(checkinSessions)
          .where(
            and(
              eq(checkinSessions.churchId, church.id),
              eq(checkinSessions.status, 'open'),
              gte(checkinSessions.date, yesterday),
            ),
          )
          .orderBy(desc(checkinSessions.date), asc(checkinSessions.openedAt))
          .all();
        const link = access.personId ? householdLinkOf(db, church.id, access.personId) : null;
        const isGuardian =
          !!link && (GUARDIAN_RELATIONSHIPS as readonly string[]).includes(link.relationship);
        const household =
          link && isGuardian
            ? (buildHouseholds(db, church, [link.householdId], openRows[0]?.id ?? null)[0] ?? null)
            : null;
        const childIds = household?.children.map((child) => child.id) ?? [];
        // Children in class right now: the household's, and any the caller brought.
        const whose = [
          ...(childIds.length > 0 ? [inArray(checkins.childPersonId, childIds)] : []),
          ...(access.personId ? [eq(checkins.guardianPersonId, access.personId)] : []),
        ];
        const current =
          whose.length === 0
            ? []
            : db
                .select({ checkin: checkins })
                .from(checkins)
                .innerJoin(checkinSessions, eq(checkinSessions.id, checkins.sessionId))
                .where(
                  and(
                    eq(checkins.churchId, church.id),
                    eq(checkins.status, 'checked_in'),
                    gte(checkinSessions.date, yesterday),
                    or(...whose),
                  ),
                )
                .orderBy(asc(checkins.checkedInAt))
                .all()
                .map((row) => row.checkin);
        return {
          household,
          isGuardian,
          allowSelfCheckIn: settings.allowSelfCheckIn,
          openSessions: hydrateSessions(db, openRows),
          current: hydrateCheckins(db, church.id, current, () => true),
        };
      },
      { church: 'checkin', params: churchParamsSchema },
    );
};

/**
 * Kids check-in for Sekolah Minggu.
 *
 * Owned by the checkin module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'checkin'` (or
 * `church: { module: 'checkin', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const checkinModule = (deps: Deps) =>
  new Elysia()
    .use(checkinHomeRouter(deps))
    .use(checkinClassesRouter(deps))
    .use(checkinSessionsRouter(deps))
    .use(checkinCheckinsRouter(deps))
    .use(checkinChildrenRouter(deps));
