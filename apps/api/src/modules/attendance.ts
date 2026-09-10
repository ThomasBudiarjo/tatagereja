import {
  attendanceListQuerySchema,
  attendanceSessionInputSchema,
  attendanceSessionUpdateSchema,
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  isAdmin,
  saveAttendanceRecordsBodySchema,
  type AttendanceRecord,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, inArray, like, ne, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { AttendanceSessionRow } from '../db/schema';
import {
  attendanceRecords,
  attendanceSessions,
  eventParticipants,
  events,
  groupMembers,
  groups,
  people,
} from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound } from '../lib/errors';
import { likePattern, offsetOf } from '../lib/query';
import { nowIso, toUtcIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toPersonSummary } from '../serializers';
import { hydrateSessions } from '../services/attendance';

export const attendanceModule = (deps: Deps) => {
  const { db } = deps;

  const loadSession = (churchId: string, id: string): AttendanceSessionRow => {
    const session = db
      .select()
      .from(attendanceSessions)
      .where(and(eq(attendanceSessions.id, id), eq(attendanceSessions.churchId, churchId)))
      .get();
    if (!session) throw notFound('Attendance session');
    return session;
  };

  const hydrateOne = (row: AttendanceSessionRow) => {
    const [session] = hydrateSessions(db, [row]);
    if (!session) throw notFound('Attendance session');
    return session;
  };

  /** Roster: recorded people ∪ event participants ∪ group members (∪ everyone for ad-hoc church-wide sessions). */
  const rosterOf = (session: AttendanceSessionRow): AttendanceRecord[] => {
    const records = new Map<
      string,
      { status: AttendanceRecord['status']; note: string | null; recordedAt: string | null }
    >();
    for (const row of db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, session.id))
      .all()) {
      records.set(row.personId, { status: row.status, note: row.note, recordedAt: row.recordedAt });
    }
    const personIds = new Set<string>(records.keys());
    if (session.eventId) {
      for (const row of db
        .select({ personId: eventParticipants.personId })
        .from(eventParticipants)
        .where(eq(eventParticipants.eventId, session.eventId))
        .all()) {
        personIds.add(row.personId);
      }
    }
    if (session.groupId) {
      for (const row of db
        .select({ personId: groupMembers.personId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, session.groupId))
        .all()) {
        personIds.add(row.personId);
      }
    }
    const where =
      !session.eventId && !session.groupId
        ? and(eq(people.churchId, session.churchId), ne(people.membershipStatus, 'inactive'))
        : personIds.size > 0
          ? and(eq(people.churchId, session.churchId), inArray(people.id, [...personIds]))
          : null;
    const rows = where
      ? db
          .select()
          .from(people)
          .where(where)
          .orderBy(asc(people.firstName), asc(people.lastName))
          .all()
      : [];
    // Inactive people who nevertheless have a record must still appear.
    const extraIds = [...personIds].filter((id) => !rows.some((row) => row.id === id));
    const extras =
      extraIds.length > 0
        ? db
            .select()
            .from(people)
            .where(and(eq(people.churchId, session.churchId), inArray(people.id, extraIds)))
            .all()
        : [];
    return [...rows, ...extras].map((person) => {
      const record = records.get(person.id);
      return {
        ...toPersonSummary(person),
        status: record?.status ?? null,
        note: record?.note ?? null,
        recordedAt: record?.recordedAt ?? null,
      };
    });
  };

  const detail = (session: AttendanceSessionRow, canManage: boolean) => ({
    session: hydrateOne(session),
    records: rosterOf(session),
    canManage,
  });

  return new Elysia({ prefix: '/churches/:churchId/attendance' })
    .use(authPlugin(deps))
    .get(
      '/sessions',
      ({ church, access, query }) => {
        if (!can.viewAttendanceOverview(access)) throw forbidden('You cannot view attendance');
        const conditions: SQL[] = [eq(attendanceSessions.churchId, church.id)];
        if (!isAdmin(access)) {
          if (access.leaderGroupIds.length === 0) {
            return { items: [], total: 0, page: query.page, limit: query.limit };
          }
          conditions.push(inArray(attendanceSessions.groupId, access.leaderGroupIds));
        }
        if (query.groupId) conditions.push(eq(attendanceSessions.groupId, query.groupId));
        if (query.eventId) conditions.push(eq(attendanceSessions.eventId, query.eventId));
        if (query.q) conditions.push(like(attendanceSessions.title, likePattern(query.q)));
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(attendanceSessions).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(attendanceSessions)
          .where(where)
          .orderBy(desc(attendanceSessions.sessionAt))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return { items: hydrateSessions(db, rows), total, page: query.page, limit: query.limit };
      },
      { church: true, params: churchParamsSchema, query: attendanceListQuerySchema },
    )
    .post(
      '/sessions',
      ({ church, access, auth, body, set }) => {
        let groupId = body.groupId;
        if (body.eventId) {
          const event = db
            .select()
            .from(events)
            .where(and(eq(events.id, body.eventId), eq(events.churchId, church.id)))
            .get();
          if (!event) throw notFound('Event');
          groupId = event.groupId;
        } else if (groupId) {
          const group = db
            .select({ id: groups.id })
            .from(groups)
            .where(and(eq(groups.id, groupId), eq(groups.churchId, church.id)))
            .get();
          if (!group) throw notFound('Group');
        }
        if (!can.recordAttendance(access, { groupId })) {
          throw forbidden('You cannot record attendance for this scope');
        }
        const now = nowIso();
        const row = db
          .insert(attendanceSessions)
          .values({
            id: newId(),
            churchId: church.id,
            eventId: body.eventId,
            groupId,
            title: body.title,
            sessionAt: toUtcIso(body.sessionAt),
            notes: body.notes,
            createdBy: auth.user.id,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        set.status = 201;
        return detail(row, true);
      },
      { church: true, params: churchParamsSchema, body: attendanceSessionInputSchema },
    )
    .get(
      '/sessions/:id',
      ({ church, access, params }) => {
        const session = loadSession(church.id, params.id);
        if (!can.viewAttendanceSession(access, session)) {
          throw forbidden('You cannot view this attendance session');
        }
        return detail(session, can.recordAttendance(access, session));
      },
      { church: true, params: churchIdParamsSchema },
    )
    .patch(
      '/sessions/:id',
      ({ church, access, params, body }) => {
        const session = loadSession(church.id, params.id);
        if (!can.recordAttendance(access, session)) throw forbidden('You cannot edit this session');
        const updated = db
          .update(attendanceSessions)
          .set({
            title: body.title,
            sessionAt: toUtcIso(body.sessionAt),
            notes: body.notes,
            updatedAt: nowIso(),
          })
          .where(eq(attendanceSessions.id, session.id))
          .returning()
          .get();
        if (!updated) throw notFound('Attendance session');
        return detail(updated, true);
      },
      { church: true, params: churchIdParamsSchema, body: attendanceSessionUpdateSchema },
    )
    .delete(
      '/sessions/:id',
      ({ church, access, params }) => {
        const session = loadSession(church.id, params.id);
        if (!can.recordAttendance(access, session))
          throw forbidden('You cannot delete this session');
        db.delete(attendanceSessions).where(eq(attendanceSessions.id, session.id)).run();
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .put(
      '/sessions/:id/records',
      ({ church, access, auth, params, body }) => {
        const session = loadSession(church.id, params.id);
        if (!can.recordAttendance(access, session)) throw forbidden('You cannot record attendance');
        const personIds = [...new Set(body.records.map((record) => record.personId))];
        const found = db
          .select({ id: people.id })
          .from(people)
          .where(and(eq(people.churchId, church.id), inArray(people.id, personIds)))
          .all();
        if (found.length !== personIds.length) throw notFound('One or more people');
        const now = nowIso();
        db.transaction((tx) => {
          for (const record of body.records) {
            if (record.status === null) {
              tx.delete(attendanceRecords)
                .where(
                  and(
                    eq(attendanceRecords.sessionId, session.id),
                    eq(attendanceRecords.personId, record.personId),
                  ),
                )
                .run();
              continue;
            }
            tx.insert(attendanceRecords)
              .values({
                id: newId(),
                sessionId: session.id,
                personId: record.personId,
                churchId: church.id,
                status: record.status,
                note: record.note,
                recordedBy: auth.user.id,
                recordedAt: now,
              })
              .onConflictDoUpdate({
                target: [attendanceRecords.sessionId, attendanceRecords.personId],
                set: {
                  status: record.status,
                  note: record.note,
                  recordedBy: auth.user.id,
                  recordedAt: now,
                },
              })
              .run();
          }
          tx.update(attendanceSessions)
            .set({ updatedAt: now })
            .where(eq(attendanceSessions.id, session.id))
            .run();
        });
        return detail(session, true);
      },
      { church: true, params: churchIdParamsSchema, body: saveAttendanceRecordsBodySchema },
    )
    .get(
      '/me',
      ({ access }) => {
        if (!access.personId) return { items: [] };
        const rows = db
          .select({
            sessionId: attendanceSessions.id,
            title: attendanceSessions.title,
            sessionAt: attendanceSessions.sessionAt,
            groupName: groups.name,
            status: attendanceRecords.status,
          })
          .from(attendanceRecords)
          .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
          .leftJoin(groups, eq(groups.id, attendanceSessions.groupId))
          .where(eq(attendanceRecords.personId, access.personId))
          .orderBy(desc(attendanceSessions.sessionAt))
          .limit(100)
          .all();
        return { items: rows.map((row) => ({ ...row, groupName: row.groupName ?? null })) };
      },
      { church: true, params: churchParamsSchema },
    );
};
