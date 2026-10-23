import {
  FOLLOW_UP_STAGES,
  canModeratePrayer,
  canViewDiakonia,
  churchParamsSchema,
  has,
  hasAny,
  householdLookupQuerySchema,
  isCareTeam,
  careTeamQuerySchema,
  CARE_TEAM_PERMISSIONS,
  type AccessLike,
  type CareOverview,
  type FollowUpStage,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  or,
  sum,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  careCaseCaregivers,
  careCases,
  careTasks,
  careVisits,
  churchMemberships,
  diakoniaAid,
  households,
  people,
  prayerRequests,
  users,
  visitorFollowUps,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { forbidden } from '../../lib/errors';
import { likePattern } from '../../lib/query';
import { authPlugin } from '../../plugins/auth';
import { permissionsByUser } from '../../services/access';
import {
  addDaysToDate,
  monthStart,
  readableCaseCondition,
  readableVisitCondition,
  sendDueCareReminders,
  todayIn,
} from '../../services/care';
import { hydrateCases } from './serializers';

/** Visibility of other people's prayer requests on the wall. Mirrors the prayer router. */
const prayerWallCondition = (access: AccessLike): SQL | undefined =>
  or(
    and(eq(prayerRequests.visibility, 'church'), eq(prayerRequests.moderationStatus, 'approved')),
    hasAny(access, [...CARE_TEAM_PERMISSIONS, 'prayer.moderate'])
      ? eq(prayerRequests.visibility, 'care_team')
      : undefined,
    has(access, 'care.confidential') ? eq(prayerRequests.visibility, 'pastors') : undefined,
    eq(prayerRequests.submittedBy, access.userId),
  );

export const careOverviewRouter = (deps: Deps) => {
  const { db } = deps;

  const countOf = (table: SQLiteTable, where?: SQL) =>
    db.select({ value: count() }).from(table).where(where).get()?.value ?? 0;

  return new Elysia({ prefix: '/churches/:churchId/care' })
    .use(authPlugin(deps))
    .get(
      '/overview',
      ({ church, access }): CareOverview => {
        sendDueCareReminders(db, church);
        const today = todayIn(church.timezone);
        const weekAhead = addDaysToDate(today, 7);
        const readable = readableCaseCondition(db, access);
        const activeCases = and(
          eq(careCases.churchId, church.id),
          ne(careCases.status, 'closed'),
          ...(readable ? [readable] : []),
        );
        const mineCases = inArray(
          careCases.id,
          db
            .select({ id: careCaseCaregivers.caseId })
            .from(careCaseCaregivers)
            .where(eq(careCaseCaregivers.userId, access.userId)),
        );
        const upcoming = db
          .select()
          .from(careCases)
          .where(
            and(
              activeCases,
              isNotNull(careCases.nextActionDate),
              lte(careCases.nextActionDate, weekAhead),
            ),
          )
          .orderBy(asc(careCases.nextActionDate))
          .limit(8)
          .all();

        const myTasks = and(
          eq(careTasks.churchId, church.id),
          eq(careTasks.assignedUserId, access.userId),
          eq(careTasks.status, 'open'),
        );

        const wall = and(
          eq(prayerRequests.churchId, church.id),
          eq(prayerRequests.moderationStatus, 'approved'),
          prayerWallCondition(access),
        );

        const careTeam = isCareTeam(access);
        let visits: CareOverview['visits'] = null;
        let followUps: CareOverview['followUps'] = null;
        if (careTeam) {
          const visible = readableVisitCondition(db, access);
          const base = and(eq(careVisits.churchId, church.id), ...(visible ? [visible] : []));
          visits = {
            thisMonth: countOf(careVisits, and(base, gte(careVisits.visitDate, monthStart(today)))),
            followUpNeeded: countOf(careVisits, and(base, eq(careVisits.followUpNeeded, true))),
          };
          const stages = Object.fromEntries(FOLLOW_UP_STAGES.map((stage) => [stage, 0])) as Record<
            FollowUpStage,
            number
          >;
          for (const row of db
            .select({ stage: visitorFollowUps.stage, value: count() })
            .from(visitorFollowUps)
            .where(eq(visitorFollowUps.churchId, church.id))
            .groupBy(visitorFollowUps.stage)
            .all()) {
            stages[row.stage] = row.value;
          }
          followUps = stages;
        }

        let diakonia: CareOverview['diakonia'] = null;
        if (canViewDiakonia(access)) {
          const totals = db
            .select({ value: count(), amount: sum(diakoniaAid.amount) })
            .from(diakoniaAid)
            .where(
              and(
                eq(diakoniaAid.churchId, church.id),
                isNull(diakoniaAid.voidedAt),
                gte(diakoniaAid.givenAt, monthStart(today)),
              ),
            )
            .get();
          diakonia = {
            thisMonthCount: totals?.value ?? 0,
            thisMonthAmount: Number(totals?.amount ?? 0),
          };
        }

        return {
          today,
          cases: {
            active: countOf(careCases, activeCases),
            urgent: countOf(careCases, and(activeCases, eq(careCases.priority, 'urgent'))),
            mine: countOf(careCases, and(activeCases, mineCases)),
            due: countOf(careCases, and(activeCases, lte(careCases.nextActionDate, today))),
          },
          upcoming: hydrateCases(db, church.id, upcoming),
          tasks: {
            open: countOf(careTasks, myTasks),
            overdue: countOf(careTasks, and(myTasks, lt(careTasks.dueDate, today))),
            dueToday: countOf(careTasks, and(myTasks, eq(careTasks.dueDate, today))),
          },
          prayer: {
            active: countOf(prayerRequests, and(wall, isNull(prayerRequests.answeredAt))),
            answered: countOf(prayerRequests, and(wall, isNotNull(prayerRequests.answeredAt))),
            mine: countOf(
              prayerRequests,
              and(
                eq(prayerRequests.churchId, church.id),
                eq(prayerRequests.submittedBy, access.userId),
              ),
            ),
            pending: canModeratePrayer(access)
              ? countOf(
                  prayerRequests,
                  and(
                    eq(prayerRequests.churchId, church.id),
                    eq(prayerRequests.visibility, 'church'),
                    eq(prayerRequests.moderationStatus, 'pending'),
                  ),
                )
              : null,
          },
          visits,
          followUps,
          diakonia,
        };
      },
      { church: 'care', params: churchParamsSchema },
    )
    .get(
      '/team',
      ({ church, access, query }) => {
        if (query.scope === 'all' && !has(access, 'care.manage')) {
          throw forbidden('You cannot list every member');
        }
        const permissions = permissionsByUser(db, church.id);
        const rows = db
          .select({
            userId: users.id,
            name: users.name,
            avatarUrl: users.avatarUrl,
          })
          .from(churchMemberships)
          .innerJoin(users, eq(users.id, churchMemberships.userId))
          .where(
            and(eq(churchMemberships.churchId, church.id), eq(churchMemberships.status, 'active')),
          )
          .orderBy(asc(users.name))
          .all();
        const personIds = new Map(
          db
            .select({ id: people.id, userId: people.userId })
            .from(people)
            .where(and(eq(people.churchId, church.id), isNotNull(people.userId)))
            .all()
            .map((row) => [row.userId, row.id]),
        );
        const items = rows.flatMap((row) => {
          const held = { permissions: permissions.get(row.userId) ?? [] };
          const team = isCareTeam(held);
          if (query.scope === 'team' && !team) return [];
          return [
            {
              ...row,
              personId: personIds.get(row.userId) ?? null,
              isCareTeam: team,
              canReadConfidential: has(held, 'care.confidential'),
            },
          ];
        });
        return { items };
      },
      { church: 'care', params: churchParamsSchema, query: careTeamQuerySchema },
    )
    .get(
      '/households',
      ({ church, access, query }) => {
        if (!isCareTeam(access) && !canViewDiakonia(access)) {
          throw forbidden('You cannot look up households');
        }
        const conditions: SQL[] = [eq(households.churchId, church.id)];
        if (query.q) conditions.push(like(households.name, likePattern(query.q)));
        return {
          items: db
            .select({ id: households.id, name: households.name })
            .from(households)
            .where(and(...conditions))
            .orderBy(asc(households.name))
            .limit(20)
            .all(),
        };
      },
      { church: 'care', params: churchParamsSchema, query: householdLookupQuerySchema },
    );
};
