import type { AttendanceSession } from '@tatagereja/shared';
import { count, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { AttendanceSessionRow } from '../db/schema';
import { attendanceRecords, events, groups } from '../db/schema';
import { toAttendanceSession, type AttendanceCounts } from '../serializers';

export function hydrateSessions(db: Db, rows: AttendanceSessionRow[]): AttendanceSession[] {
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
    const current = counts.get(row.sessionId) ?? {
      presentCount: 0,
      absentCount: 0,
      excusedCount: 0,
      totalCount: 0,
    };
    if (row.status === 'present') current.presentCount += row.value;
    else if (row.status === 'absent') current.absentCount += row.value;
    else current.excusedCount += row.value;
    current.totalCount += row.value;
    counts.set(row.sessionId, current);
  }

  return rows.map((row) =>
    toAttendanceSession(row, {
      eventTitle: row.eventId ? (eventTitles.get(row.eventId) ?? null) : null,
      groupName: row.groupId ? (groupNames.get(row.groupId) ?? null) : null,
      ...(counts.get(row.id) ?? {
        presentCount: 0,
        absentCount: 0,
        excusedCount: 0,
        totalCount: 0,
      }),
    }),
  );
}
