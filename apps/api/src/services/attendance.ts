import {
  isCareTeam,
  INSIGHTS_LIMITS,
  attendanceStreakOf,
  dateTimeFormat,
  has,
  headcountTotal,
  type AbsenceAlert,
  type AbsenceQuery,
  type AccessLike,
  type AttendanceHistory,
  type AttendanceSessionView,
  type AttendanceStatus,
  type Headcount,
} from '@tatagereja/shared';
import { and, count, desc, eq, inArray, like, max, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db, Queryable } from '../db/client';
import type { AbsenceAlertRow, AttendanceSessionRow, PersonRow } from '../db/schema';
import {
  absenceAlerts,
  attendanceRecords,
  attendanceSessions,
  events,
  groups,
  people,
} from '../db/schema';
import type { ResultCache } from '../lib/cache';
import { likePattern } from '../lib/query';
import { toAttendanceSession, toPersonSummary, type AttendanceCounts } from '../serializers';

const NO_COUNTS: AttendanceCounts = {
  presentCount: 0,
  absentCount: 0,
  excusedCount: 0,
  totalCount: 0,
};

/** The stored counts of a headcount session; null for roster sessions. */
export const headcountOf = (row: AttendanceSessionRow): Headcount | null =>
  row.mode === 'headcount'
    ? {
        men: row.headcountMen ?? 0,
        women: row.headcountWomen ?? 0,
        children: row.headcountChildren ?? 0,
        visitors: row.headcountVisitors ?? 0,
      }
    : null;

/** Column values for a headcount (all null for roster sessions). */
export const headcountColumns = (headcount: Headcount | null) => ({
  headcountMen: headcount?.men ?? null,
  headcountWomen: headcount?.women ?? null,
  headcountChildren: headcount?.children ?? null,
  headcountVisitors: headcount?.visitors ?? null,
});

/** People counted at a session: present marks, or the headcount total. */
export const attendeesOf = (row: AttendanceSessionRow, presentCount: number): number => {
  const headcount = headcountOf(row);
  return headcount ? headcountTotal(headcount) : presentCount;
};

export function hydrateSessions(db: Db, rows: AttendanceSessionRow[]): AttendanceSessionView[] {
  if (rows.length === 0) return [];
  const sessionIds = rows.map((row) => row.id);
  const groupIds = [...new Set(rows.map((row) => row.groupId).filter((id): id is string => !!id))];
  const eventIds = [...new Set(rows.map((row) => row.eventId).filter((id): id is string => !!id))];

  const groupNames = new Map<string, string>();
  if (groupIds.length > 0) {
    for (const row of db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(inArray(groups.id, groupIds))
      .all()) {
      groupNames.set(row.id, row.name);
    }
  }
  const eventTitles = new Map<string, string>();
  if (eventIds.length > 0) {
    for (const row of db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(inArray(events.id, eventIds))
      .all()) {
      eventTitles.set(row.id, row.title);
    }
  }

  const counts = new Map<string, AttendanceCounts>();
  for (const row of db
    .select({
      sessionId: attendanceRecords.sessionId,
      status: attendanceRecords.status,
      value: count(),
    })
    .from(attendanceRecords)
    .where(inArray(attendanceRecords.sessionId, sessionIds))
    .groupBy(attendanceRecords.sessionId, attendanceRecords.status)
    .all()) {
    const current = counts.get(row.sessionId) ?? { ...NO_COUNTS };
    if (row.status === 'present') current.presentCount += row.value;
    else if (row.status === 'absent') current.absentCount += row.value;
    else current.excusedCount += row.value;
    current.totalCount += row.value;
    counts.set(row.sessionId, current);
  }

  return rows.map((row) => {
    const sessionCounts = counts.get(row.id) ?? NO_COUNTS;
    return {
      ...toAttendanceSession(row, {
        eventTitle: row.eventId ? (eventTitles.get(row.eventId) ?? null) : null,
        groupName: row.groupId ? (groupNames.get(row.groupId) ?? null) : null,
        ...sessionCounts,
      }),
      mode: row.mode,
      headcount: headcountOf(row),
      attendeeCount: attendeesOf(row, sessionCounts.presentCount),
    };
  });
}

/** The calendar day (YYYY-MM-DD) of an instant in the church time zone. */
export function localDayOf(instant: string, timeZone: string): string {
  try {
    return dateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(instant));
  } catch {
    return instant.slice(0, 10);
  }
}

export type PersonMark = {
  personId: string;
  sessionId: string;
  sessionAt: string;
  status: AttendanceStatus;
};

/**
 * Marks of roster sessions, newest first, optionally limited to the sessions of some groups or
 * to some people. Headcount sessions carry no marks.
 */
export function marksOf(
  db: Queryable,
  churchId: string,
  scope: { groupIds?: readonly string[]; personIds?: readonly string[] } = {},
): PersonMark[] {
  if (scope.groupIds && scope.groupIds.length === 0) return [];
  if (scope.personIds && scope.personIds.length === 0) return [];
  const conditions: SQL[] = [
    eq(attendanceRecords.churchId, churchId),
    eq(attendanceSessions.churchId, churchId),
    ne(attendanceSessions.mode, 'headcount'),
  ];
  if (scope.groupIds) conditions.push(inArray(attendanceSessions.groupId, [...scope.groupIds]));
  if (scope.personIds) conditions.push(inArray(attendanceRecords.personId, [...scope.personIds]));
  return db
    .select({
      personId: attendanceRecords.personId,
      sessionId: attendanceRecords.sessionId,
      sessionAt: attendanceSessions.sessionAt,
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
    .where(and(...conditions))
    .orderBy(desc(attendanceSessions.sessionAt), desc(attendanceSessions.createdAt))
    .all();
}

export type AbsenceStreak = {
  personId: string;
  streak: number;
  lastPresentAt: string | null;
  lastAbsentAt: string;
};

/**
 * Current absent streaks: per person, the absent marks after their last present mark (excused
 * marks neither count nor break a streak). Only roster sessions carry marks. `groupIds` limits
 * the sessions considered, `personIds` the people; only streaks of at least `threshold` come
 * back. Answered in SQL from the copy of each session's time on its marks, so a church with
 * years of weekly attendance is one index scan, not every mark loaded into memory. Two
 * sessions at the same instant are one point in time: a present mark at it ends the streak.
 */
export function absenceStreaksOf(
  db: Queryable,
  churchId: string,
  scope: { groupIds?: readonly string[]; personIds?: readonly string[] } = {},
  threshold = 1,
): AbsenceStreak[] {
  if (scope.groupIds && scope.groupIds.length === 0) return [];
  if (scope.personIds && scope.personIds.length === 0) return [];
  const present = alias(attendanceRecords, 'present');
  const counted = alias(attendanceRecords, 'counted');
  const scopedSessions = scope.groupIds
    ? db
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.churchId, churchId),
            inArray(attendanceSessions.groupId, [...scope.groupIds]),
          ),
        )
    : null;
  // Per person with an absent mark: the newest absence and the newest presence. Both are one
  // seek in the covering (church, status, person, session_at) index.
  const lastPresent = db
    .select({ at: max(present.sessionAt) })
    .from(present)
    .where(
      and(
        eq(present.churchId, churchId),
        eq(present.status, 'present'),
        eq(present.personId, attendanceRecords.personId),
        scopedSessions ? inArray(present.sessionId, scopedSessions) : undefined,
      ),
    );
  const perPerson = db
    .select({
      personId: attendanceRecords.personId,
      lastAbsentAt: sql<string>`max(${attendanceRecords.sessionAt})`.as('last_absent_at'),
      lastPresentAt: sql<string | null>`(${lastPresent})`.as('last_present_at'),
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.churchId, churchId),
        eq(attendanceRecords.status, 'absent'),
        scopedSessions ? inArray(attendanceRecords.sessionId, scopedSessions) : undefined,
        scope.personIds ? inArray(attendanceRecords.personId, [...scope.personIds]) : undefined,
      ),
    )
    .groupBy(attendanceRecords.personId)
    .as('per_person');
  // Then, only for people absent since they were last present, the absences since then.
  const streak = db
    .select({ value: count() })
    .from(counted)
    .where(
      and(
        eq(counted.churchId, churchId),
        eq(counted.status, 'absent'),
        eq(counted.personId, perPerson.personId),
        scopedSessions ? inArray(counted.sessionId, scopedSessions) : undefined,
        sql`${counted.sessionAt} > coalesce(${perPerson.lastPresentAt}, '')`,
      ),
    );
  const minimum = Math.max(1, threshold);
  return db
    .select({
      personId: perPerson.personId,
      streak: sql<number>`(${streak})`.mapWith(Number),
      lastPresentAt: perPerson.lastPresentAt,
      lastAbsentAt: perPerson.lastAbsentAt,
    })
    .from(perPerson)
    .where(sql`${perPerson.lastAbsentAt} > coalesce(${perPerson.lastPresentAt}, '')`)
    .all()
    .filter((row) => row.streak >= minimum);
}

/**
 * Keeps the copy of a session's time on its marks in step after the session moved. Every
 * write of `attendance_sessions.session_at` for a session with marks calls this.
 */
export function syncRecordTimes(db: Queryable, sessionId: string, sessionAt: string): void {
  db.update(attendanceRecords)
    .set({ sessionAt })
    .where(eq(attendanceRecords.sessionId, sessionId))
    .run();
}

/** The groups whose sessions the caller's absence view covers; undefined means every session. */
export const absenceScope = (access: AccessLike, groupId?: string): string[] | undefined => {
  if (groupId) return [groupId];
  return has(access, 'attendance.view') ? undefined : [...access.leaderGroupIds];
};

/** The latest session each person was present at, across every session of the church. */
export function lastPresentByPerson(
  db: Queryable,
  churchId: string,
  personIds: readonly string[],
): Map<string, string> {
  if (personIds.length === 0) return new Map();
  return new Map(
    db
      .select({ personId: attendanceRecords.personId, at: max(attendanceRecords.sessionAt) })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.churchId, churchId),
          eq(attendanceRecords.status, 'present'),
          inArray(attendanceRecords.personId, [...personIds]),
        ),
      )
      .groupBy(attendanceRecords.personId)
      .all()
      .flatMap((row) => (row.at ? [[row.personId, row.at] as const] : [])),
  );
}

/**
 * Whether a dismissed or followed-up alert still holds: the person has not been present at a
 * session held after it was resolved. Attending again reopens the alert for the next streak.
 */
export const stillResolved = (row: AbsenceAlertRow | undefined, lastPresentAt: string | null) =>
  !!row &&
  row.status !== 'open' &&
  !!row.resolvedAt &&
  (lastPresentAt === null || lastPresentAt <= row.resolvedAt);

export const toAbsenceAlert = (
  person: PersonRow,
  streak: AbsenceStreak,
  row: AbsenceAlertRow | undefined,
  lastPresentAt: string | null,
  access: Pick<AccessLike, 'permissions'>,
): AbsenceAlert => {
  const resolved = stillResolved(row, lastPresentAt);
  return {
    person: toPersonSummary(person),
    streak: streak.streak,
    lastPresentAt: streak.lastPresentAt,
    lastAbsentAt: streak.lastAbsentAt,
    status: resolved && row ? row.status : 'open',
    // Pastoral care that followed the alert is the care team's to see.
    careTaskId: resolved && isCareTeam(access) ? (row?.careTaskId ?? null) : null,
    resolvedAt: resolved ? (row?.resolvedAt ?? null) : null,
  };
};

/**
 * People absent from at least `threshold` consecutive roster sessions in the caller's scope
 * (every session with `attendance.view`, the groups they lead otherwise), longest streak first.
 * Inactive people are left out. The caller's access to the scope is checked by the route.
 */
export function listAbsences(
  db: Queryable,
  churchId: string,
  access: AccessLike,
  query: Pick<AbsenceQuery, 'threshold' | 'groupId' | 'includeResolved' | 'q'>,
): AbsenceAlert[] {
  const streaks = absenceStreaksOf(
    db,
    churchId,
    { groupIds: absenceScope(access, query.groupId) },
    query.threshold,
  );
  if (streaks.length === 0) return [];
  const ids = streaks.map((streak) => streak.personId);
  const conditions: SQL[] = [
    eq(people.churchId, churchId),
    ne(people.membershipStatus, 'inactive'),
    inArray(people.id, ids),
  ];
  if (query.q) {
    const pattern = likePattern(query.q);
    const nameMatch = or(like(people.firstName, pattern), like(people.lastName, pattern));
    if (nameMatch) conditions.push(nameMatch);
  }
  const persons = new Map(
    db
      .select()
      .from(people)
      .where(and(...conditions))
      .all()
      .map((row) => [row.id, row]),
  );
  const stored = new Map(
    db
      .select()
      .from(absenceAlerts)
      .where(and(eq(absenceAlerts.churchId, churchId), inArray(absenceAlerts.personId, ids)))
      .all()
      .map((row) => [row.personId, row]),
  );
  const lastPresent = lastPresentByPerson(db, churchId, ids);
  return streaks
    .flatMap((streak) => {
      const person = persons.get(streak.personId);
      if (!person) return [];
      return [
        toAbsenceAlert(
          person,
          streak,
          stored.get(person.id),
          lastPresent.get(person.id) ?? null,
          access,
        ),
      ];
    })
    .filter((alert) => query.includeResolved || alert.status === 'open')
    .sort(
      (a, b) =>
        b.streak - a.streak ||
        b.lastAbsentAt.localeCompare(a.lastAbsentAt) ||
        a.person.firstName.localeCompare(b.person.firstName),
    )
    .slice(0, INSIGHTS_LIMITS.absenceListMax);
}

/**
 * `listAbsences` through the church's result cache. Every write to the church drops it, so a
 * new mark, a resolved alert or an edited person shows at once; only the scan is saved.
 */
export function cachedAbsences(
  cache: ResultCache,
  db: Queryable,
  churchId: string,
  access: AccessLike,
  query: Pick<AbsenceQuery, 'threshold' | 'groupId' | 'includeResolved' | 'q'>,
): AbsenceAlert[] {
  const scope = absenceScope(access, query.groupId);
  const key = `absences:${JSON.stringify([
    scope ? [...scope].sort() : null,
    isCareTeam(access),
    query.threshold,
    query.includeResolved,
    query.q ?? null,
  ])}`;
  return cache.remember(churchId, key, () => listAbsences(db, churchId, access, query));
}

/** SQL for `personAttendanceScope`: every session, or only those of the given groups. */
export const attendanceScopeCondition = (scope: readonly string[] | null): SQL | undefined =>
  scope === null ? undefined : inArray(attendanceSessions.groupId, [...scope]);

/**
 * A person's attendance history: streaks, counts, the last twelve months and recent sessions,
 * of the sessions in `scope` only (see `personAttendanceScope`): a leader reads the sessions of
 * the groups they lead, not the person's whole history.
 */
export function attendanceHistory(
  db: Queryable,
  church: { id: string; timezone: string },
  person: Pick<PersonRow, 'id' | 'firstName' | 'lastName' | 'photoUrl' | 'membershipStatus'>,
  limit: number,
  today: string,
  /** Sessions the caller may read (see `personAttendanceScope`); `null` for all. */
  scope: readonly string[] | null,
): AttendanceHistory {
  const rows = db
    .select({
      sessionId: attendanceSessions.id,
      title: attendanceSessions.title,
      sessionAt: attendanceSessions.sessionAt,
      groupId: attendanceSessions.groupId,
      groupName: groups.name,
      status: attendanceRecords.status,
      note: attendanceRecords.note,
    })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
    .leftJoin(groups, eq(groups.id, attendanceSessions.groupId))
    .where(
      and(
        eq(attendanceRecords.churchId, church.id),
        eq(attendanceRecords.personId, person.id),
        attendanceScopeCondition(scope),
      ),
    )
    .orderBy(desc(attendanceSessions.sessionAt))
    .all();

  const months: AttendanceHistory['months'] = [];
  const [year = 2000, month = 1] = today.split('-').map(Number);
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    months.push({ month: date.toISOString().slice(0, 7), present: 0, total: 0 });
  }
  const monthIndex = new Map(months.map((entry, index) => [entry.month, index]));
  const counts = { present: 0, absent: 0, excused: 0 };
  for (const row of rows) {
    counts[row.status] += 1;
    const index = monthIndex.get(localDayOf(row.sessionAt, church.timezone).slice(0, 7));
    const entry = index === undefined ? undefined : months[index];
    if (entry && row.status !== 'excused') {
      entry.total += 1;
      if (row.status === 'present') entry.present += 1;
    }
  }

  return {
    person: toPersonSummary(person),
    streak: attendanceStreakOf(rows),
    counts,
    months,
    items: rows.slice(0, limit).map((row) => ({
      ...row,
      groupName: row.groupName ?? null,
    })),
  };
}
