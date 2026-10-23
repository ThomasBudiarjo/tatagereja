import {
  DEFAULT_SERVICE_MINUTES,
  blockoutCovers,
  has,
  liturgyTotalMinutes,
  localDateOf,
  serviceWindow,
  windowsOverlap,
  type AccessLike,
  type LiturgyItem,
  type PersonSummary,
  type RosterAssignment,
  type RosterConflict,
  type WorshipService,
} from '@tatagereja/shared';
import { and, asc, count, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import type { Queryable } from '../db/client';
import type {
  ChurchRow,
  LiturgyItemRow,
  RosterAssignmentRow,
  WorshipServiceRow,
} from '../db/schema';
import {
  liturgyItems,
  people,
  rosterAssignments,
  serviceTypes,
  servingPositions,
  servingTeamMembers,
  servingTeams,
  songs,
  volunteerBlockouts,
  worshipServices,
} from '../db/schema';
import { notFound } from '../lib/errors';
import { toPersonSummary } from '../serializers';
import { toLiturgyItem, toWorshipService } from '../modules/worship/serializers';

/*
 * Reads shared by the worship routers: team leader scope, hydration of services, liturgy and
 * rosters, and the conflict checks (double-booked, blockout, declined, not in the team).
 */

const unique = <T>(values: readonly (T | null | undefined)[]): T[] => [
  ...new Set(values.filter((value): value is T => value !== null && value !== undefined)),
];

/** Person summaries by id, scoped to the church. */
export function personSummaries(
  db: Queryable,
  churchId: string,
  personIds: readonly (string | null | undefined)[],
): Map<string, PersonSummary> {
  const ids = unique(personIds);
  if (ids.length === 0) return new Map();
  return new Map(
    db
      .select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
        photoUrl: people.photoUrl,
        membershipStatus: people.membershipStatus,
      })
      .from(people)
      .where(and(eq(people.churchId, churchId), inArray(people.id, ids)))
      .all()
      .map((row) => [row.id, toPersonSummary(row)]),
  );
}

/** Teams the person leads (`serving_team_members.role = 'leader'`). */
export function ledTeamIdsOf(db: Queryable, churchId: string, personId: string | null): string[] {
  if (!personId) return [];
  return db
    .select({ teamId: servingTeamMembers.teamId })
    .from(servingTeamMembers)
    .where(
      and(
        eq(servingTeamMembers.churchId, churchId),
        eq(servingTeamMembers.personId, personId),
        eq(servingTeamMembers.role, 'leader'),
      ),
    )
    .all()
    .map((row) => row.teamId);
}

export function memberTeamIdsOf(
  db: Queryable,
  churchId: string,
  personId: string | null,
): string[] {
  if (!personId) return [];
  return db
    .select({ teamId: servingTeamMembers.teamId })
    .from(servingTeamMembers)
    .where(
      and(eq(servingTeamMembers.churchId, churchId), eq(servingTeamMembers.personId, personId)),
    )
    .all()
    .map((row) => row.teamId);
}

/** Every team with `volunteers.schedule`, otherwise the teams the caller leads. */
export function schedulableTeamIds(
  db: Queryable,
  churchId: string,
  access: AccessLike,
  ledTeamIds: readonly string[],
): string[] {
  if (!has(access, 'volunteers.schedule')) return [...ledTeamIds];
  return db
    .select({ id: servingTeams.id })
    .from(servingTeams)
    .where(eq(servingTeams.churchId, churchId))
    .all()
    .map((row) => row.id);
}

/** The person ids of every member of the given teams. */
export function teamPersonIds(
  db: Queryable,
  churchId: string,
  teamIds: readonly string[],
): string[] {
  if (teamIds.length === 0) return [];
  return unique(
    db
      .select({ personId: servingTeamMembers.personId })
      .from(servingTeamMembers)
      .where(
        and(
          eq(servingTeamMembers.churchId, churchId),
          inArray(servingTeamMembers.teamId, [...teamIds]),
        ),
      )
      .all()
      .map((row) => row.personId),
  );
}

/** The fallback length of each service type, so services without an end time get a window. */
function typeDurations(db: Queryable, churchId: string): Map<string, number> {
  return new Map(
    db
      .select({ id: serviceTypes.id, minutes: serviceTypes.defaultDurationMinutes })
      .from(serviceTypes)
      .where(eq(serviceTypes.churchId, churchId))
      .all()
      .map((row) => [row.id, row.minutes ?? DEFAULT_SERVICE_MINUTES]),
  );
}

export const windowOf = (
  service: Pick<WorshipServiceRow, 'startsAt' | 'endsAt' | 'serviceTypeId'>,
  durations: Map<string, number>,
) =>
  serviceWindow(
    service,
    service.serviceTypeId
      ? (durations.get(service.serviceTypeId) ?? DEFAULT_SERVICE_MINUTES)
      : DEFAULT_SERVICE_MINUTES,
  );

export function hydrateServices(db: Queryable, rows: WorshipServiceRow[]): WorshipService[] {
  if (rows.length === 0) return [];
  const churchId = rows[0]!.churchId;
  const ids = rows.map((row) => row.id);
  const typeIds = unique(rows.map((row) => row.serviceTypeId));
  const typeNames = new Map(
    typeIds.length > 0
      ? db
          .select({ id: serviceTypes.id, name: serviceTypes.name })
          .from(serviceTypes)
          .where(inArray(serviceTypes.id, typeIds))
          .all()
          .map((row) => [row.id, row.name])
      : [],
  );
  const preachers = personSummaries(
    db,
    churchId,
    rows.map((row) => row.preacherPersonId),
  );
  const minutes = new Map(
    db
      .select({
        serviceId: liturgyItems.serviceId,
        total: sql<number>`coalesce(sum(${liturgyItems.durationMinutes}), 0)`,
      })
      .from(liturgyItems)
      .where(inArray(liturgyItems.serviceId, ids))
      .groupBy(liturgyItems.serviceId)
      .all()
      .map((row) => [row.serviceId, Number(row.total)]),
  );
  const roster = new Map<string, { accepted: number; total: number }>();
  for (const row of db
    .select({
      serviceId: rosterAssignments.serviceId,
      status: rosterAssignments.status,
      value: count(),
    })
    .from(rosterAssignments)
    .where(inArray(rosterAssignments.serviceId, ids))
    .groupBy(rosterAssignments.serviceId, rosterAssignments.status)
    .all()) {
    const entry = roster.get(row.serviceId) ?? { accepted: 0, total: 0 };
    entry.total += row.value;
    if (row.status === 'accepted') entry.accepted += row.value;
    roster.set(row.serviceId, entry);
  }
  return rows.map((row) =>
    toWorshipService(row, {
      serviceTypeName: row.serviceTypeId ? (typeNames.get(row.serviceTypeId) ?? null) : null,
      preacher: row.preacherPersonId ? (preachers.get(row.preacherPersonId) ?? null) : null,
      totalMinutes: minutes.get(row.id) ?? 0,
      rosterAccepted: roster.get(row.id)?.accepted ?? 0,
      rosterTotal: roster.get(row.id)?.total ?? 0,
    }),
  );
}

export function loadLiturgy(db: Queryable, churchId: string, serviceId: string): LiturgyItem[] {
  const rows = db
    .select()
    .from(liturgyItems)
    .where(and(eq(liturgyItems.churchId, churchId), eq(liturgyItems.serviceId, serviceId)))
    .orderBy(asc(liturgyItems.position))
    .all();
  return hydrateLiturgy(db, churchId, rows);
}

export function hydrateLiturgy(
  db: Queryable,
  churchId: string,
  rows: LiturgyItemRow[],
): LiturgyItem[] {
  const songIds = unique(rows.map((row) => row.songId));
  const titles = new Map(
    songIds.length > 0
      ? db
          .select({ id: songs.id, title: songs.title })
          .from(songs)
          .where(and(eq(songs.churchId, churchId), inArray(songs.id, songIds)))
          .all()
          .map((row) => [row.id, row.title])
      : [],
  );
  const persons = personSummaries(
    db,
    churchId,
    rows.map((row) => row.personId),
  );
  return rows.map((row) =>
    toLiturgyItem(
      row,
      row.songId ? (titles.get(row.songId) ?? null) : null,
      row.personId ? (persons.get(row.personId) ?? null) : null,
    ),
  );
}

export const totalMinutesOf = liturgyTotalMinutes;

/** One person who may be (or is) scheduled in a team at a service. */
export type ConflictSubject = {
  personId: string;
  teamId: string;
  /** The assignment being checked, left out of its own double-booking check. */
  assignmentId?: string;
  status?: RosterAssignmentRow['status'];
  declineReason?: string | null;
};

const subjectKey = (subject: Pick<ConflictSubject, 'personId' | 'teamId' | 'assignmentId'>) =>
  `${subject.assignmentId ?? ''}:${subject.personId}:${subject.teamId}`;

/**
 * Conflicts of each subject at a service, in a fixed number of queries:
 *  - `double_booked`  another assignment (not declined) at an overlapping, not cancelled service,
 *                     or another position at the same service
 *  - `blockout`       a blockout covering the service day (church time zone)
 *  - `declined`       the person declined this service (this or another position)
 *  - `not_in_team`    the person is not a member of the position's team
 */
export function rosterConflicts(
  db: Queryable,
  church: Pick<ChurchRow, 'id' | 'timezone'>,
  service: WorshipServiceRow,
  subjects: readonly ConflictSubject[],
): Map<string, RosterConflict[]> {
  const result = new Map<string, RosterConflict[]>();
  if (subjects.length === 0) return result;
  const personIds = unique(subjects.map((subject) => subject.personId));
  const durations = typeDurations(db, church.id);
  const window = windowOf(service, durations);
  const day = localDateOf(service.startsAt, church.timezone);

  // Assignments of these people near this service (a day either side covers any window).
  const from = new Date(window.start - 86_400_000).toISOString();
  const to = new Date(window.end + 86_400_000).toISOString();
  const nearby = db
    .select({
      id: rosterAssignments.id,
      personId: rosterAssignments.personId,
      status: rosterAssignments.status,
      declineReason: rosterAssignments.declineReason,
      positionName: servingPositions.name,
      serviceId: worshipServices.id,
      title: worshipServices.title,
      startsAt: worshipServices.startsAt,
      endsAt: worshipServices.endsAt,
      serviceTypeId: worshipServices.serviceTypeId,
      serviceStatus: worshipServices.status,
    })
    .from(rosterAssignments)
    .innerJoin(worshipServices, eq(worshipServices.id, rosterAssignments.serviceId))
    .innerJoin(servingPositions, eq(servingPositions.id, rosterAssignments.positionId))
    .where(
      and(
        eq(rosterAssignments.churchId, church.id),
        inArray(rosterAssignments.personId, personIds),
        sql`${worshipServices.startsAt} >= ${from}`,
        lte(worshipServices.startsAt, to),
      ),
    )
    .all();

  const blockouts = db
    .select()
    .from(volunteerBlockouts)
    .where(
      and(
        eq(volunteerBlockouts.churchId, church.id),
        inArray(volunteerBlockouts.personId, personIds),
        lte(volunteerBlockouts.startDate, day),
        sql`${volunteerBlockouts.endDate} >= ${day}`,
      ),
    )
    .all();

  const memberships = new Set(
    db
      .select({ teamId: servingTeamMembers.teamId, personId: servingTeamMembers.personId })
      .from(servingTeamMembers)
      .where(
        and(
          eq(servingTeamMembers.churchId, church.id),
          inArray(servingTeamMembers.personId, personIds),
        ),
      )
      .all()
      .map((row) => `${row.teamId}:${row.personId}`),
  );

  for (const subject of subjects) {
    const conflicts: RosterConflict[] = [];
    const mine = nearby.filter(
      (row) => row.personId === subject.personId && row.id !== subject.assignmentId,
    );
    for (const row of mine) {
      if (row.status === 'declined' || row.serviceStatus === 'cancelled') continue;
      if (row.serviceId === service.id) {
        conflicts.push({ kind: 'double_booked', serviceId: service.id, detail: row.positionName });
      } else if (windowsOverlap(window, windowOf(row, durations))) {
        conflicts.push({ kind: 'double_booked', serviceId: row.serviceId, detail: row.title });
      }
    }
    const blockout = blockouts.find(
      (row) => row.personId === subject.personId && blockoutCovers(row, day),
    );
    if (blockout) conflicts.push({ kind: 'blockout', serviceId: null, detail: blockout.reason });
    const declinedHere =
      subject.status === 'declined'
        ? { declineReason: subject.declineReason ?? null }
        : mine.find((row) => row.serviceId === service.id && row.status === 'declined');
    if (declinedHere) {
      conflicts.push({
        kind: 'declined',
        serviceId: service.id,
        detail: declinedHere.declineReason ?? null,
      });
    }
    if (!memberships.has(`${subject.teamId}:${subject.personId}`)) {
      conflicts.push({ kind: 'not_in_team', serviceId: null, detail: null });
    }
    result.set(subjectKey(subject), conflicts);
  }
  return result;
}

export const conflictsOf = (
  map: Map<string, RosterConflict[]>,
  subject: Pick<ConflictSubject, 'personId' | 'teamId' | 'assignmentId'>,
): RosterConflict[] => map.get(subjectKey(subject)) ?? [];

/** Roster rows of one service with team, position, person and conflicts. */
/** Team and position names and people of roster rows, loaded once for any number of services. */
export function rosterLookups(
  db: Queryable,
  churchId: string,
  rows: readonly RosterAssignmentRow[],
) {
  const teamNames = new Map(
    db
      .select({ id: servingTeams.id, name: servingTeams.name })
      .from(servingTeams)
      .where(eq(servingTeams.churchId, churchId))
      .all()
      .map((row) => [row.id, row.name]),
  );
  const positions = new Map(
    db
      .select({ id: servingPositions.id, name: servingPositions.name })
      .from(servingPositions)
      .where(
        and(
          eq(servingPositions.churchId, churchId),
          inArray(servingPositions.id, unique(rows.map((row) => row.positionId))),
        ),
      )
      .all()
      .map((row) => [row.id, row.name]),
  );
  const persons = personSummaries(
    db,
    churchId,
    rows.map((row) => row.personId),
  );
  return { teamNames, positions, persons };
}

/**
 * Roster rows of one service with names, people and conflicts. Callers hydrating several
 * services pass `lookups` from one `rosterLookups` call over all their rows.
 */
export function hydrateRoster(
  db: Queryable,
  church: Pick<ChurchRow, 'id' | 'timezone'>,
  service: WorshipServiceRow,
  rows: RosterAssignmentRow[],
  lookups: ReturnType<typeof rosterLookups> = rosterLookups(db, church.id, rows),
): RosterAssignment[] {
  if (rows.length === 0) return [];
  const { teamNames, positions, persons } = lookups;
  const subjects = rows.map((row) => ({
    personId: row.personId,
    teamId: row.teamId,
    assignmentId: row.id,
    status: row.status,
    declineReason: row.declineReason,
  }));
  const conflicts = rosterConflicts(db, church, service, subjects);
  return rows.flatMap((row) => {
    const person = persons.get(row.personId);
    if (!person) return [];
    return [
      {
        id: row.id,
        serviceId: row.serviceId,
        teamId: row.teamId,
        teamName: teamNames.get(row.teamId) ?? '',
        positionId: row.positionId,
        positionName: positions.get(row.positionId) ?? '',
        person,
        status: row.status,
        declineReason: row.declineReason,
        respondedAt: row.respondedAt,
        notes: row.notes,
        conflicts: conflictsOf(conflicts, {
          personId: row.personId,
          teamId: row.teamId,
          assignmentId: row.id,
        }),
      },
    ];
  });
}

/** Roster rows of one service in team and position order. */
export function loadRoster(
  db: Queryable,
  church: Pick<ChurchRow, 'id' | 'timezone'>,
  service: WorshipServiceRow,
): RosterAssignment[] {
  const rows = db
    .select({ assignment: rosterAssignments })
    .from(rosterAssignments)
    .innerJoin(servingTeams, eq(servingTeams.id, rosterAssignments.teamId))
    .innerJoin(servingPositions, eq(servingPositions.id, rosterAssignments.positionId))
    .where(
      and(eq(rosterAssignments.churchId, church.id), eq(rosterAssignments.serviceId, service.id)),
    )
    .orderBy(
      asc(servingTeams.name),
      asc(servingPositions.sortOrder),
      asc(servingPositions.name),
      asc(rosterAssignments.createdAt),
    )
    .all()
    .map((row) => row.assignment);
  return hydrateRoster(db, church, service, rows);
}

/**
 * How often each person served in the rotation window before `before`, and when they last
 * served. Declined assignments and cancelled services do not count.
 */
export function servingHistory(
  db: Queryable,
  churchId: string,
  personIds: readonly string[],
  before: string,
  weeks: number,
): Map<string, { timesServed: number; lastServedAt: string | null }> {
  const result = new Map<string, { timesServed: number; lastServedAt: string | null }>();
  if (personIds.length === 0) return result;
  const since = new Date(new Date(before).getTime() - weeks * 7 * 86_400_000).toISOString();
  for (const row of db
    .select({
      personId: rosterAssignments.personId,
      times: count(),
      last: sql<string | null>`max(${worshipServices.startsAt})`,
    })
    .from(rosterAssignments)
    .innerJoin(worshipServices, eq(worshipServices.id, rosterAssignments.serviceId))
    .where(
      and(
        eq(rosterAssignments.churchId, churchId),
        inArray(rosterAssignments.personId, [...personIds]),
        ne(rosterAssignments.status, 'declined'),
        ne(worshipServices.status, 'cancelled'),
        sql`${worshipServices.startsAt} >= ${since}`,
        sql`${worshipServices.startsAt} < ${before}`,
      ),
    )
    .groupBy(rosterAssignments.personId)
    .all()) {
    result.set(row.personId, { timesServed: row.times, lastServedAt: row.last });
  }
  return result;
}

/** Last use (before now) and use count of songs, from the liturgy of services not cancelled. */
export function songUsage(
  db: Queryable,
  churchId: string,
  songIds: readonly string[],
  now: string,
): Map<string, { lastUsedAt: string | null; useCount: number }> {
  if (songIds.length === 0) return new Map();
  return new Map(
    db
      .select({
        songId: liturgyItems.songId,
        uses: sql<number>`count(distinct ${liturgyItems.serviceId})`,
        last: sql<string | null>`max(${worshipServices.startsAt})`,
      })
      .from(liturgyItems)
      .innerJoin(worshipServices, eq(worshipServices.id, liturgyItems.serviceId))
      .where(
        and(
          eq(liturgyItems.churchId, churchId),
          inArray(liturgyItems.songId, [...songIds]),
          ne(worshipServices.status, 'cancelled'),
          lte(worshipServices.startsAt, now),
        ),
      )
      .groupBy(liturgyItems.songId)
      .all()
      .flatMap((row) =>
        row.songId ? [[row.songId, { lastUsedAt: row.last, useCount: Number(row.uses) }]] : [],
      ),
  );
}

/** Login accounts linked to people of the church (people without an account are skipped). */
export function userIdsOfPeople(
  db: Queryable,
  churchId: string,
  personIds: readonly string[],
): Map<string, string> {
  const ids = unique(personIds);
  if (ids.length === 0) return new Map();
  return new Map(
    db
      .select({ id: people.id, userId: people.userId })
      .from(people)
      .where(and(eq(people.churchId, churchId), inArray(people.id, ids)))
      .all()
      .flatMap((row) => (row.userId ? [[row.id, row.userId] as const] : [])),
  );
}

/** Whether the caller sees draft services (planners, schedulers and team leaders). */
export const canSeeDraftServices = (access: AccessLike, ledTeamIds: readonly string[]): boolean =>
  has(access, 'services.manage') || has(access, 'volunteers.schedule') || ledTeamIds.length > 0;

/** Drafts are hidden (404) from people who neither plan nor schedule, unless they serve in it. */
export function assertServiceVisible(
  db: Queryable,
  access: AccessLike,
  ledTeamIds: readonly string[],
  service: WorshipServiceRow,
): void {
  if (service.status !== 'draft' || canSeeDraftServices(access, ledTeamIds)) return;
  const serving =
    !!access.personId &&
    !!db
      .select({ id: rosterAssignments.id })
      .from(rosterAssignments)
      .where(
        and(
          eq(rosterAssignments.churchId, service.churchId),
          eq(rosterAssignments.serviceId, service.id),
          eq(rosterAssignments.personId, access.personId),
        ),
      )
      .get();
  if (!serving) throw notFound('Service');
}

/**
 * Roster rows as a viewer may see them: everyone sees who serves where, but decline reasons
 * and conflicts (blockout reasons, other services) stay with the volunteer and whoever
 * schedules their team.
 */
export function rosterForViewer<T extends RosterAssignment>(
  rows: readonly T[],
  viewer: { personId: string | null; schedulableTeamIds: readonly string[] },
): T[] {
  return rows.map((row) =>
    (!!viewer.personId && row.person.id === viewer.personId) ||
    viewer.schedulableTeamIds.includes(row.teamId)
      ? row
      : { ...row, declineReason: null, conflicts: [] },
  );
}
