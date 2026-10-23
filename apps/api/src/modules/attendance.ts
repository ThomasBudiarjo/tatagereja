import {
  INSIGHTS_LIMITS,
  absenceQuerySchema,
  attendanceListQuerySchema,
  attendanceSessionInputSchema,
  attendanceSessionUpdateSchema,
  bulkMarkAttendanceBodySchema,
  can,
  canFollowUpAbsence,
  canSeeAbsenceOf,
  canViewAbsences,
  churchIdParamsSchema,
  churchParamsSchema,
  fullName,
  has,
  headcountSchema,
  personAttendanceParamsSchema,
  resolveAbsenceAlertBodySchema,
  saveAttendanceRecordsBodySchema,
  type AttendanceRecord,
  type AttendanceStatus,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, inArray, like, ne, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { AttendanceSessionRow, PersonRow } from '../db/schema';
import {
  absenceAlerts,
  attendanceRecords,
  attendanceSessions,
  careTasks,
  eventParticipants,
  events,
  groupMembers,
  groups,
  people,
} from '../db/schema';
import type { Deps } from '../deps';
import { conflict, forbidden, notFound } from '../lib/errors';
import { likePattern, offsetOf } from '../lib/query';
import { nowIso, toUtcIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toPersonSummary } from '../serializers';
import {
  absenceScope,
  absenceStreaks,
  attendanceHistory,
  headcountColumns,
  hydrateSessions,
  lastPresentByPerson,
  listAbsences,
  marksOf,
  stillResolved,
  toAbsenceAlert,
} from '../services/attendance';
import { changes, recordAudit } from '../services/audit';
import { assertActiveMembers } from '../services/care';
import { assertModuleEnabled, enabledModulesOf } from '../services/modules';
import { notify } from '../services/notifications';
import { groupIdsOfPerson, todayIn } from '../services/people';

const SORTS = {
  recent: [desc(attendanceSessions.sessionAt)],
  oldest: [asc(attendanceSessions.sessionAt)],
  title: [asc(attendanceSessions.title), desc(attendanceSessions.sessionAt)],
} as const;

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

  const loadPerson = (churchId: string, id: string): PersonRow => {
    const person = db
      .select()
      .from(people)
      .where(and(eq(people.id, id), eq(people.churchId, churchId)))
      .get();
    if (!person) throw notFound('Person');
    return person;
  };

  const hydrateOne = (row: AttendanceSessionRow) => {
    const [session] = hydrateSessions(db, [row]);
    if (!session) throw notFound('Attendance session');
    return session;
  };

  /**
   * Roster: recorded people ∪ event participants ∪ group members (∪ everyone for ad-hoc
   * church-wide sessions). Headcount sessions have no roster.
   */
  const rosterOf = (session: AttendanceSessionRow): AttendanceRecord[] => {
    if (session.mode === 'headcount') return [];
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

  /** Throws 404 unless every person belongs to the church. */
  const assertPeopleInChurch = (churchId: string, personIds: readonly string[]) => {
    const wanted = [...new Set(personIds)];
    if (wanted.length === 0) return;
    const found = db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.churchId, churchId), inArray(people.id, wanted)))
      .all();
    if (found.length !== wanted.length) throw notFound('One or more people');
  };

  const requireRoster = (session: AttendanceSessionRow) => {
    if (session.mode === 'headcount') {
      throw conflict('This session only counts heads. Enter the counts instead of names.');
    }
  };

  /** Writes marks in one transaction; a null status clears the mark. */
  const writeMarks = (
    session: AttendanceSessionRow,
    userId: string,
    marks: readonly { personId: string; status: AttendanceStatus | null; note: string | null }[],
  ) => {
    const now = nowIso();
    db.transaction((tx) => {
      for (const mark of marks) {
        if (mark.status === null) {
          tx.delete(attendanceRecords)
            .where(
              and(
                eq(attendanceRecords.sessionId, session.id),
                eq(attendanceRecords.personId, mark.personId),
              ),
            )
            .run();
          continue;
        }
        tx.insert(attendanceRecords)
          .values({
            id: newId(),
            sessionId: session.id,
            personId: mark.personId,
            churchId: session.churchId,
            status: mark.status,
            note: mark.note,
            recordedBy: userId,
            recordedAt: now,
          })
          .onConflictDoUpdate({
            target: [attendanceRecords.sessionId, attendanceRecords.personId],
            set: { status: mark.status, note: mark.note, recordedBy: userId, recordedAt: now },
          })
          .run();
      }
      tx.update(attendanceSessions)
        .set({ updatedAt: now })
        .where(eq(attendanceSessions.id, session.id))
        .run();
    });
  };

  return new Elysia({ prefix: '/churches/:churchId/attendance' })
    .use(authPlugin(deps))
    .get(
      '/sessions',
      ({ church, access, query }) => {
        if (!can.viewAttendanceOverview(access)) throw forbidden('You cannot view attendance');
        const conditions: SQL[] = [eq(attendanceSessions.churchId, church.id)];
        if (!can.viewAllAttendance(access)) {
          if (access.leaderGroupIds.length === 0) {
            return { items: [], total: 0, page: query.page, limit: query.limit };
          }
          conditions.push(inArray(attendanceSessions.groupId, access.leaderGroupIds));
        }
        if (query.groupId) conditions.push(eq(attendanceSessions.groupId, query.groupId));
        if (query.eventId) conditions.push(eq(attendanceSessions.eventId, query.eventId));
        if (query.mode) conditions.push(eq(attendanceSessions.mode, query.mode));
        if (query.q) conditions.push(like(attendanceSessions.title, likePattern(query.q)));
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(attendanceSessions).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(attendanceSessions)
          .where(where)
          .orderBy(...SORTS[query.sort])
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
        const headcount =
          body.mode === 'headcount'
            ? (body.headcount ?? { men: 0, women: 0, children: 0, visitors: 0 })
            : null;
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
            mode: body.mode,
            ...headcountColumns(headcount),
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
      ({ church, access, audit, params }) => {
        const session = loadSession(church.id, params.id);
        if (!can.recordAttendance(access, session)) {
          throw forbidden('You cannot delete this session');
        }
        const [hydrated] = hydrateSessions(db, [session]);
        db.transaction((tx) => {
          tx.delete(attendanceSessions).where(eq(attendanceSessions.id, session.id)).run();
          recordAudit(tx, audit, {
            module: 'insights',
            action: 'attendance_session.delete',
            entityType: 'attendance_session',
            entityId: session.id,
            summary: `Deleted the attendance session ${session.title}`,
            before: {
              title: session.title,
              sessionAt: session.sessionAt,
              mode: session.mode,
              groupId: session.groupId,
              records: hydrated?.totalCount ?? 0,
              attendees: hydrated?.attendeeCount ?? 0,
            },
          });
        });
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .put(
      '/sessions/:id/records',
      ({ church, access, auth, params, body }) => {
        const session = loadSession(church.id, params.id);
        if (!can.recordAttendance(access, session)) throw forbidden('You cannot record attendance');
        requireRoster(session);
        assertPeopleInChurch(
          church.id,
          body.records.map((record) => record.personId),
        );
        writeMarks(session, auth.user.id, body.records);
        return detail(session, true);
      },
      { church: true, params: churchIdParamsSchema, body: saveAttendanceRecordsBodySchema },
    )
    .post(
      '/sessions/:id/bulk',
      ({ church, access, auth, params, body }) => {
        const session = loadSession(church.id, params.id);
        if (!can.recordAttendance(access, session)) throw forbidden('You cannot record attendance');
        requireRoster(session);
        const roster = rosterOf(session);
        const current = new Map(roster.map((record) => [record.id, record]));
        let personIds: string[];
        if (body.personIds) {
          personIds = [...new Set(body.personIds)];
          assertPeopleInChurch(church.id, personIds);
        } else {
          personIds = roster.map((record) => record.id);
        }
        const marks = personIds
          .filter((personId) => !body.onlyUnmarked || !current.get(personId)?.status)
          .map((personId) => ({
            personId,
            status: body.status,
            note: current.get(personId)?.note ?? null,
          }));
        if (marks.length > 0) writeMarks(session, auth.user.id, marks);
        return { ...detail(session, true), changed: marks.length };
      },
      { church: true, params: churchIdParamsSchema, body: bulkMarkAttendanceBodySchema },
    )
    .put(
      '/sessions/:id/headcount',
      ({ church, access, params, body }) => {
        const session = loadSession(church.id, params.id);
        if (!can.recordAttendance(access, session)) throw forbidden('You cannot record attendance');
        if (session.mode !== 'headcount') {
          throw conflict('This session records people by name. Mark the roster instead.');
        }
        const updated = db
          .update(attendanceSessions)
          .set({ ...headcountColumns(body), updatedAt: nowIso() })
          .where(eq(attendanceSessions.id, session.id))
          .returning()
          .get();
        if (!updated) throw notFound('Attendance session');
        return detail(updated, true);
      },
      { church: true, params: churchIdParamsSchema, body: headcountSchema },
    )
    .get(
      '/me',
      ({ church, access }) => {
        if (!access.personId) return { history: null };
        const person = loadPerson(church.id, access.personId);
        return {
          history: attendanceHistory(
            db,
            church,
            person,
            INSIGHTS_LIMITS.historyMax,
            todayIn(church),
          ),
        };
      },
      { church: true, params: churchParamsSchema },
    )
    .get(
      '/people/:personId',
      ({ church, access, params }) => {
        const person = loadPerson(church.id, params.personId);
        if (!can.viewPersonAttendance(access, person, groupIdsOfPerson(db, person.id))) {
          throw forbidden("You cannot view this person's attendance");
        }
        return {
          history: attendanceHistory(
            db,
            church,
            person,
            INSIGHTS_LIMITS.historyMax,
            todayIn(church),
          ),
        };
      },
      { church: true, params: personAttendanceParamsSchema },
    )
    .get(
      '/absences',
      ({ church, access, query }) => {
        if (query.groupId) {
          const group = db
            .select({ id: groups.id })
            .from(groups)
            .where(and(eq(groups.id, query.groupId), eq(groups.churchId, church.id)))
            .get();
          if (!group) throw notFound('Group');
        }
        if (!canViewAbsences(access, query.groupId)) {
          throw forbidden('You cannot view absences');
        }
        const items = listAbsences(db, church.id, access, query);
        return {
          items,
          threshold: query.threshold,
          canFollowUp: canFollowUpAbsence(access, enabledModulesOf(church)),
        };
      },
      { church: true, params: churchParamsSchema, query: absenceQuerySchema },
    )
    .post(
      '/absences/:personId',
      ({ church, access, auth, audit, params, body }) => {
        const person = loadPerson(church.id, params.personId);
        if (!canSeeAbsenceOf(access, groupIdsOfPerson(db, person.id))) {
          throw forbidden("You cannot act on this person's attendance");
        }
        const streak = absenceStreaks(
          marksOf(db, church.id, { groupIds: absenceScope(access), personIds: [person.id] }),
        ).get(person.id);
        const existing = db
          .select()
          .from(absenceAlerts)
          .where(and(eq(absenceAlerts.churchId, church.id), eq(absenceAlerts.personId, person.id)))
          .get();
        const lastPresentAt = lastPresentByPerson(db, church.id, [person.id]).get(person.id) ?? null;
        const name = fullName(person);

        if (body.action === 'reopen') {
          if (!existing || !stillResolved(existing, lastPresentAt)) {
            throw notFound('Absence alert');
          }
          if (!streak) throw conflict(`${name} is no longer missing services`);
          const row = db.transaction((tx) => {
            const updated = tx
              .update(absenceAlerts)
              .set({
                status: 'open',
                careTaskId: null,
                resolvedBy: null,
                resolvedAt: null,
                updatedAt: nowIso(),
              })
              .where(eq(absenceAlerts.id, existing.id))
              .returning()
              .get();
            recordAudit(tx, audit, {
              module: 'insights',
              action: 'absence_alert.reopen',
              entityType: 'absence_alert',
              entityId: existing.id,
              summary: `Reopened the absence alert for ${name}`,
              ...changes({ status: existing.status }, { status: 'open' }),
            });
            return updated;
          });
          return { alert: toAbsenceAlert(person, streak, row, lastPresentAt) };
        }

        if (!streak || streak.streak < INSIGHTS_LIMITS.absentStreakMin) {
          throw conflict(`${name} has not missed enough services in a row`);
        }
        if (stillResolved(existing, lastPresentAt) && existing?.status === 'followed_up') {
          throw conflict(`A follow-up for ${name} was already created`);
        }

        let careTaskId: string | null = null;
        let assigneeId: string | null = null;
        if (body.action === 'follow_up') {
          assertModuleEnabled(church, 'care');
          if (!has(access, 'care.manage')) throw forbidden('You cannot create care follow-ups');
          assigneeId = body.assignedUserId ?? auth.user.id;
          assertActiveMembers(db, church.id, [assigneeId]);
        }

        const now = nowIso();
        const row = db.transaction((tx) => {
          if (body.action === 'follow_up' && assigneeId) {
            const task = tx
              .insert(careTasks)
              .values({
                id: newId(),
                churchId: church.id,
                title: `Hubungi ${name}: ${streak.streak}× tidak hadir berturut-turut`,
                description: body.note,
                dueDate: body.dueDate,
                status: 'open',
                assignedUserId: assigneeId,
                personId: person.id,
                createdBy: auth.user.id,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
              .get();
            careTaskId = task.id;
          }
          const values = {
            streak: streak.streak,
            lastPresentAt: streak.lastPresentAt,
            status: body.action === 'follow_up' ? ('followed_up' as const) : ('dismissed' as const),
            careTaskId,
            resolvedBy: auth.user.id,
            resolvedAt: now,
            updatedAt: now,
          };
          const saved = tx
            .insert(absenceAlerts)
            .values({ id: newId(), churchId: church.id, personId: person.id, createdAt: now, ...values })
            .onConflictDoUpdate({
              target: [absenceAlerts.churchId, absenceAlerts.personId],
              set: values,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'insights',
            action:
              body.action === 'follow_up' ? 'absence_alert.follow_up' : 'absence_alert.dismiss',
            entityType: 'absence_alert',
            entityId: saved.id,
            summary:
              body.action === 'follow_up'
                ? `Created a care follow-up for ${name} after ${streak.streak} absences`
                : `Dismissed the absence alert for ${name}`,
            after: {
              status: saved.status,
              streak: saved.streak,
              careTaskId: saved.careTaskId,
              assignedUserId: assigneeId,
              dueDate: body.dueDate,
            },
          });
          if (careTaskId && assigneeId) {
            notify(tx, {
              churchId: church.id,
              userIds: [assigneeId],
              excludeUserIds: [auth.user.id],
              type: 'attendance.absence_follow_up',
              title: `Tolong hubungi ${name}`,
              body: `${streak.streak}× tidak hadir berturut-turut`,
              link: `/c/${church.id}/care/tasks`,
              entityType: 'care_task',
              entityId: careTaskId,
            });
          }
          return saved;
        });
        return { alert: toAbsenceAlert(person, streak, row, lastPresentAt) };
      },
      {
        church: true,
        params: personAttendanceParamsSchema,
        body: resolveAbsenceAlertBodySchema,
      },
    );
};
