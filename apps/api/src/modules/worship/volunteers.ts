import {
  LIMITS,
  canManageBlockout,
  churchIdParamsSchema,
  churchParamsSchema,
  fullName,
  has,
  localDateOf,
  myScheduleQuerySchema,
  volunteerBlockoutInputSchema,
  volunteerBlockoutListQuerySchema,
  type AccessLike,
  type MyScheduleItem,
} from '@tatagereja/shared';
import { and, asc, desc, eq, gte, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, RosterAssignmentRow, VolunteerBlockoutRow } from '../../db/schema';
import { rosterAssignments, volunteerBlockouts, worshipServices } from '../../db/schema';
import type { Deps } from '../../deps';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit } from '../../services/audit';
import {
  hydrateRoster,
  ledTeamIdsOf,
  personSummaries,
  rosterLookups,
  teamPersonIds,
} from '../../services/worship';
import { loadPerson } from './load';
import { toVolunteerBlockout } from './serializers';
import { upcomingCondition } from './services';

/**
 * Assignments joined with their services, hydrated per service (team, position, person and
 * conflicts), in the order given.
 */
export function scheduleItems(
  db: Queryable,
  church: ChurchRow,
  where: SQL,
  order: 'asc' | 'desc',
  limit: number,
): MyScheduleItem[] {
  const rows = db
    .select({ assignment: rosterAssignments, service: worshipServices })
    .from(rosterAssignments)
    .innerJoin(worshipServices, eq(worshipServices.id, rosterAssignments.serviceId))
    .where(and(eq(rosterAssignments.churchId, church.id), where))
    .orderBy(
      order === 'asc' ? asc(worshipServices.startsAt) : desc(worshipServices.startsAt),
      asc(rosterAssignments.createdAt),
    )
    .limit(limit)
    .all();
  const byService = new Map<
    string,
    { service: (typeof rows)[number]['service']; rows: RosterAssignmentRow[] }
  >();
  for (const row of rows) {
    const entry = byService.get(row.service.id) ?? { service: row.service, rows: [] };
    entry.rows.push(row.assignment);
    byService.set(row.service.id, entry);
  }
  const hydrated = new Map<string, MyScheduleItem>();
  const lookups = rosterLookups(
    db,
    church.id,
    rows.map((row) => row.assignment),
  );
  for (const { service, rows: assignments } of byService.values()) {
    for (const assignment of hydrateRoster(db, church, service, assignments, lookups)) {
      hydrated.set(assignment.id, {
        ...assignment,
        serviceTitle: service.title,
        serviceStartsAt: service.startsAt,
        serviceLocation: service.location,
      });
    }
  }
  return rows.flatMap((row) => {
    const item = hydrated.get(row.assignment.id);
    return item ? [item] : [];
  });
}

/** People whose availability the caller may see: their own, their teams', or everyone's. */
function visiblePersonIds(db: Queryable, churchId: string, access: AccessLike): string[] | 'all' {
  if (has(access, 'volunteers.schedule')) return 'all';
  const led = ledTeamIdsOf(db, churchId, access.personId);
  return [
    ...new Set([
      ...(access.personId ? [access.personId] : []),
      ...teamPersonIds(db, churchId, led),
    ]),
  ];
}

/** "My schedule" and availability (blockout dates). */
export const volunteersRouter = (deps: Deps) => {
  const { db } = deps;

  const hydrateBlockouts = (churchId: string, rows: VolunteerBlockoutRow[]) => {
    const persons = personSummaries(
      db,
      churchId,
      rows.map((row) => row.personId),
    );
    return rows.flatMap((row) => {
      const person = persons.get(row.personId);
      return person ? [toVolunteerBlockout(row, person)] : [];
    });
  };

  return new Elysia({ prefix: '/churches/:churchId/worship' })
    .use(authPlugin(deps))
    .get(
      '/me/schedule',
      ({ church, access, query }) => {
        if (!access.personId) return { items: [] };
        const upcoming = upcomingCondition(Date.now());
        const where = and(
          eq(rosterAssignments.personId, access.personId),
          ne(worshipServices.status, 'cancelled'),
          query.scope === 'upcoming' ? upcoming : sql`not (${upcoming})`,
        )!;
        return {
          items: scheduleItems(db, church, where, query.scope === 'upcoming' ? 'asc' : 'desc', 100),
        };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
        query: myScheduleQuerySchema,
      },
    )
    .get(
      '/blockouts',
      ({ church, access, query }) => {
        const visible = visiblePersonIds(db, church.id, access);
        const today = localDateOf(nowIso(), church.timezone);
        const conditions: SQL[] = [eq(volunteerBlockouts.churchId, church.id)];
        if (query.scope === 'team') {
          if (visible !== 'all') {
            if (ledTeamIdsOf(db, church.id, access.personId).length === 0) {
              throw forbidden('You cannot see the availability of other volunteers');
            }
            if (visible.length === 0) return { items: [] };
            conditions.push(inArray(volunteerBlockouts.personId, visible));
          }
          conditions.push(gte(volunteerBlockouts.endDate, today));
        } else {
          const personId = query.personId ?? access.personId;
          if (!personId) return { items: [] };
          if (visible !== 'all' && !visible.includes(personId)) {
            throw forbidden('You cannot see the availability of this person');
          }
          conditions.push(eq(volunteerBlockouts.personId, personId));
        }
        const rows = db
          .select()
          .from(volunteerBlockouts)
          .where(and(...conditions))
          .orderBy(asc(volunteerBlockouts.startDate))
          .limit(LIMITS.listMax)
          .all();
        return { items: hydrateBlockouts(church.id, rows) };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
        query: volunteerBlockoutListQuerySchema,
      },
    )
    .post(
      '/blockouts',
      ({ church, access, audit, body, set }) => {
        const personId = body.personId ?? access.personId;
        if (!personId) {
          throw badRequest('Your account is not linked to a person in this church yet');
        }
        const person = loadPerson(db, church.id, personId);
        if (!canManageBlockout(access, person.id)) {
          throw forbidden('You cannot change the availability of this person');
        }
        const row = db.transaction((tx) => {
          const created = tx
            .insert(volunteerBlockouts)
            .values({
              id: newId(),
              churchId: church.id,
              personId: person.id,
              startDate: body.startDate,
              endDate: body.endDate,
              reason: body.reason,
              createdBy: access.userId,
              createdAt: nowIso(),
            })
            .returning()
            .get();
          if (person.id !== access.personId) {
            recordAudit(tx, audit, {
              module: 'worship',
              action: 'blockout.create',
              entityType: 'person',
              entityId: person.id,
              summary: `Marked ${fullName(person)} unavailable from ${body.startDate} to ${body.endDate}`,
              after: { startDate: body.startDate, endDate: body.endDate },
            });
          }
          return created;
        });
        set.status = 201;
        return { blockout: hydrateBlockouts(church.id, [row])[0]! };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
        body: volunteerBlockoutInputSchema,
      },
    )
    .delete(
      '/blockouts/:id',
      ({ church, access, audit, params }) => {
        const row = db
          .select()
          .from(volunteerBlockouts)
          .where(
            and(eq(volunteerBlockouts.id, params.id), eq(volunteerBlockouts.churchId, church.id)),
          )
          .get();
        if (!row) throw notFound('Blockout');
        if (!canManageBlockout(access, row.personId)) {
          throw forbidden('You cannot change the availability of this person');
        }
        db.transaction((tx) => {
          tx.delete(volunteerBlockouts).where(eq(volunteerBlockouts.id, row.id)).run();
          if (row.personId !== access.personId) {
            recordAudit(tx, audit, {
              module: 'worship',
              action: 'blockout.delete',
              entityType: 'person',
              entityId: row.personId,
              summary: `Removed an unavailable period (${row.startDate} to ${row.endDate})`,
              before: { startDate: row.startDate, endDate: row.endDate },
            });
          }
        });
        return { ok: true as const };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
      },
    );
};
