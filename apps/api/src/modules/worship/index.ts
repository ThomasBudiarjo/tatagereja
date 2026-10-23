import {
  DEFAULT_SERVICE_TYPES,
  DEFAULT_SERVING_TEAMS,
  churchParamsSchema,
  has,
  worshipPeopleQuerySchema,
} from '@tatagereja/shared';
import { and, asc, count, eq, inArray, like, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import {
  people,
  rosterAssignments,
  serviceTypes,
  servingPositions,
  servingTeams,
  songs,
  worshipServices,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { forbidden } from '../../lib/errors';
import { likePattern } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { toPersonSummary } from '../../serializers';
import { recordAudit } from '../../services/audit';
import { moduleStatus } from '../../services/modules';
import {
  canSeeDraftServices,
  hydrateServices,
  ledTeamIdsOf,
  memberTeamIdsOf,
  schedulableTeamIds,
} from '../../services/worship';
import { rosterRouter } from './roster';
import { serviceTypesRouter } from './service-types';
import { servicesRouter, upcomingCondition } from './services';
import { songsRouter } from './songs';
import { teamsRouter } from './teams';
import { scheduleItems, volunteersRouter } from './volunteers';

/** Days ahead the overview looks at. */
const OVERVIEW_DAYS = 28;

/**
 * `status` is the wiring check (200 with the caller's worship permissions, or 403
 * MODULE_DISABLED); `me` tells the interface which teams the caller leads; `overview` feeds the
 * module home; `setup` adds the suggested service types and teams; `people` is the person
 * search used by planners and schedulers.
 */
const worshipHomeRouter = (deps: Deps) => {
  const { db } = deps;
  return new Elysia({ prefix: '/churches/:churchId/worship' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'worship'), {
      church: 'worship',
      params: churchParamsSchema,
    })
    .get(
      '/me',
      ({ church, access }) => {
        const pendingCount = access.personId
          ? (db
              .select({ value: count() })
              .from(rosterAssignments)
              .innerJoin(worshipServices, eq(worshipServices.id, rosterAssignments.serviceId))
              .where(
                and(
                  eq(rosterAssignments.churchId, church.id),
                  eq(rosterAssignments.personId, access.personId),
                  eq(rosterAssignments.status, 'pending'),
                  ne(worshipServices.status, 'cancelled'),
                  upcomingCondition(Date.now()),
                ),
              )
              .get()?.value ?? 0)
          : 0;
        return {
          personId: access.personId,
          ledTeamIds: ledTeamIdsOf(db, church.id, access.personId),
          memberTeamIds: memberTeamIdsOf(db, church.id, access.personId),
          pendingCount,
        };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
      },
    )
    .get(
      '/overview',
      ({ church, access }) => {
        const now = Date.now();
        const horizon = new Date(now + OVERVIEW_DAYS * 86_400_000).toISOString();
        const ledTeamIds = ledTeamIdsOf(db, church.id, access.personId);
        const visible: SQL[] = [
          eq(worshipServices.churchId, church.id),
          ne(worshipServices.status, 'cancelled'),
          upcomingCondition(now),
        ];
        if (!canSeeDraftServices(access, ledTeamIds)) {
          visible.push(ne(worshipServices.status, 'draft'));
        }
        const upcomingRows = db
          .select()
          .from(worshipServices)
          .where(and(...visible))
          .orderBy(asc(worshipServices.startsAt))
          .limit(5)
          .all();
        const serviceIds = db
          .select({ id: worshipServices.id })
          .from(worshipServices)
          .where(and(...visible, lt(worshipServices.startsAt, horizon)))
          .all()
          .map((row) => row.id);

        const teamIds = schedulableTeamIds(db, church.id, access, ledTeamIds);
        // Schedulers see their teams' numbers; everyone else their own replies.
        const scope: SQL =
          teamIds.length > 0
            ? inArray(rosterAssignments.teamId, teamIds)
            : eq(rosterAssignments.personId, access.personId ?? '');
        const counts = new Map<string, number>();
        let openPositions = 0;
        if (serviceIds.length > 0) {
          for (const row of db
            .select({ status: rosterAssignments.status, value: count() })
            .from(rosterAssignments)
            .where(and(inArray(rosterAssignments.serviceId, serviceIds), scope))
            .groupBy(rosterAssignments.status)
            .all()) {
            counts.set(row.status, row.value);
          }
          if (teamIds.length > 0) {
            // Positions still needed in each team already on a service's roster.
            const filled = db
              .select({
                serviceId: rosterAssignments.serviceId,
                teamId: rosterAssignments.teamId,
                positionId: rosterAssignments.positionId,
                value: sql<number>`sum(case when ${rosterAssignments.status} != 'declined' then 1 else 0 end)`,
              })
              .from(rosterAssignments)
              .where(
                and(
                  inArray(rosterAssignments.serviceId, serviceIds),
                  inArray(rosterAssignments.teamId, teamIds),
                ),
              )
              .groupBy(
                rosterAssignments.serviceId,
                rosterAssignments.teamId,
                rosterAssignments.positionId,
              )
              .all();
            const positions = db
              .select({
                id: servingPositions.id,
                teamId: servingPositions.teamId,
                needed: servingPositions.needed,
              })
              .from(servingPositions)
              .where(inArray(servingPositions.teamId, teamIds))
              .all();
            const teamsByService = new Map<string, Set<string>>();
            for (const row of filled) {
              const set = teamsByService.get(row.serviceId) ?? new Set<string>();
              set.add(row.teamId);
              teamsByService.set(row.serviceId, set);
            }
            for (const [serviceId, teams] of teamsByService) {
              for (const position of positions.filter((item) => teams.has(item.teamId))) {
                const have =
                  filled.find(
                    (row) => row.serviceId === serviceId && row.positionId === position.id,
                  )?.value ?? 0;
                openPositions += Math.max(0, position.needed - Number(have));
              }
            }
          }
        }

        const mySchedule = access.personId
          ? scheduleItems(
              db,
              church,
              and(
                eq(rosterAssignments.personId, access.personId),
                ne(worshipServices.status, 'cancelled'),
                upcomingCondition(now),
              )!,
              'asc',
              3,
            )
          : [];
        const attention =
          teamIds.length > 0 && serviceIds.length > 0
            ? scheduleItems(
                db,
                church,
                and(
                  inArray(rosterAssignments.serviceId, serviceIds),
                  inArray(rosterAssignments.teamId, teamIds),
                )!,
                'asc',
                500,
              )
                .filter(
                  (item) =>
                    item.status === 'declined' ||
                    item.conflicts.some((conflict) => conflict.kind !== 'not_in_team'),
                )
                .slice(0, 10)
            : [];

        const total = (table: typeof songs | typeof servingTeams) =>
          db.select({ value: count() }).from(table).where(eq(table.churchId, church.id)).get()
            ?.value ?? 0;
        return {
          upcoming: hydrateServices(db, upcomingRows),
          stats: {
            upcomingServices: serviceIds.length,
            openPositions,
            pendingResponses: counts.get('pending') ?? 0,
            declined: counts.get('declined') ?? 0,
            songs: total(songs),
            teams: total(servingTeams),
          },
          mySchedule,
          attention,
        };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
      },
    )
    .post(
      '/setup',
      ({ church, audit }) => {
        const now = nowIso();
        return db.transaction((tx) => {
          const types = new Set(
            tx
              .select({ name: serviceTypes.name })
              .from(serviceTypes)
              .where(eq(serviceTypes.churchId, church.id))
              .all()
              .map((row) => row.name.toLowerCase()),
          );
          const newTypes = DEFAULT_SERVICE_TYPES.filter(
            (item) => !types.has(item.name.toLowerCase()),
          );
          if (newTypes.length > 0) {
            tx.insert(serviceTypes)
              .values(
                newTypes.map((item) => ({
                  id: newId(),
                  churchId: church.id,
                  name: item.name,
                  category: item.category,
                  defaultTime: item.defaultTime,
                  defaultDurationMinutes: item.category === 'prayer' ? 90 : 120,
                  sortOrder: DEFAULT_SERVICE_TYPES.indexOf(item) * 10,
                  createdAt: now,
                  updatedAt: now,
                })),
              )
              .run();
          }
          const teams = new Set(
            tx
              .select({ name: servingTeams.name })
              .from(servingTeams)
              .where(eq(servingTeams.churchId, church.id))
              .all()
              .map((row) => row.name.toLowerCase()),
          );
          const newTeams = DEFAULT_SERVING_TEAMS.filter(
            (item) => !teams.has(item.name.toLowerCase()),
          );
          for (const team of newTeams) {
            const teamId = newId();
            tx.insert(servingTeams)
              .values({
                id: teamId,
                churchId: church.id,
                name: team.name,
                createdAt: now,
                updatedAt: now,
              })
              .run();
            tx.insert(servingPositions)
              .values(
                team.positions.map((name, sortOrder) => ({
                  id: newId(),
                  churchId: church.id,
                  teamId,
                  name,
                  needed: name === 'Singer' || name === 'Usher' ? 2 : 1,
                  sortOrder,
                  createdAt: now,
                })),
              )
              .run();
          }
          if (newTypes.length + newTeams.length > 0) {
            recordAudit(tx, audit, {
              module: 'worship',
              action: 'worship.setup',
              entityType: 'church',
              entityId: church.id,
              summary: `Added ${newTypes.length} suggested service types and ${newTeams.length} serving teams`,
              after: {
                serviceTypes: newTypes.map((item) => item.name),
                teams: newTeams.map((item) => item.name),
              },
            });
          }
          return { serviceTypes: newTypes.length, teams: newTeams.length };
        });
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchParamsSchema,
      },
    )
    .get(
      '/people',
      ({ church, access, query }) => {
        if (
          !has(access, 'services.manage') &&
          !has(access, 'volunteers.schedule') &&
          ledTeamIdsOf(db, church.id, access.personId).length === 0
        ) {
          throw forbidden('You cannot search the directory here');
        }
        const conditions: SQL[] = [eq(people.churchId, church.id)];
        if (query.q) {
          const pattern = likePattern(query.q);
          const text = or(
            like(people.firstName, pattern),
            like(people.lastName, pattern),
            like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
          );
          if (text) conditions.push(text);
        }
        return {
          items: db
            .select()
            .from(people)
            .where(and(...conditions))
            .orderBy(asc(people.firstName), asc(people.lastName))
            .limit(query.limit)
            .all()
            .map(toPersonSummary),
        };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
        query: worshipPeopleQuerySchema,
      },
    );
};

/**
 * Worship services, liturgy, songs, serving teams and rosters (ibadah & jadwal pelayanan).
 *
 * Owned by the worship module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: every route declares `module: 'worship'`, so
 * a church that turned it off gets 403 MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const worshipModule = (deps: Deps) =>
  new Elysia()
    .use(worshipHomeRouter(deps))
    .use(serviceTypesRouter(deps))
    .use(servicesRouter(deps))
    .use(songsRouter(deps))
    .use(teamsRouter(deps))
    .use(rosterRouter(deps))
    .use(volunteersRouter(deps));
