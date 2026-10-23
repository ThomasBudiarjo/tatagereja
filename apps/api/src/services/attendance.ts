import {
  attendanceStreakOf,
  headcountTotal,
  type AttendanceHistory,
  type AttendanceSessionView,
  type AttendanceStatus,
  type Headcount,
} from '@tatagereja/shared';
import { and, count, desc, eq, inArray, ne, type SQL } from 'drizzle-orm';
import type { Db, Queryable } from '../db/client';
import type { AttendanceSessionRow, PersonRow } from '../db/schema';
import { attendanceRecords, attendanceSessions, events, groups } from '../db/schema';
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
    return new Intl.DateTimeFormat('en-CA', {
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
 * Current absent streaks per person from their marks (newest first). Excused marks are skipped
 * and a present mark ends the streak. Only people currently on a streak are returned.
 */
export function absenceStreaks(marks: readonly PersonMark[]): Map<string, AbsenceStreak> {
  const byPerson = new Map<string, PersonMark[]>();
  for (const mark of marks) {
    const list = byPerson.get(mark.personId) ?? [];
    list.push(mark);
    byPerson.set(mark.personId, list);
  }
  const result = new Map<string, AbsenceStreak>();
  for (const [personId, list] of byPerson) {
    let streak = 0;
    let lastAbsentAt: string | null = null;
    let lastPresentAt: string | null = null;
    for (const mark of list) {
      if (mark.status === 'excused') continue;
      if (mark.status === 'present') {
        lastPresentAt = mark.sessionAt;
        break;
      }
      streak += 1;
      lastAbsentAt ??= mark.sessionAt;
    }
    if (streak > 0 && lastAbsentAt) {
      result.set(personId, { personId, streak, lastPresentAt, lastAbsentAt });
    }
  }
  return result;
}

/** A person's attendance history: streaks, counts, the last twelve months and recent sessions. */
export function attendanceHistory(
  db: Queryable,
  church: { id: string; timezone: string },
  person: Pick<PersonRow, 'id' | 'firstName' | 'lastName' | 'photoUrl' | 'membershipStatus'>,
  limit: number,
  today: string,
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
      and(eq(attendanceRecords.churchId, church.id), eq(attendanceRecords.personId, person.id)),
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
    items: rows.slice(0, limit).map((row) => ({ ...row, groupName: row.groupName ?? null })),
  };
}
