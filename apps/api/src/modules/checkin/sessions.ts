import {
  CHECKIN_LIMITS,
  canManageCheckin,
  canOperateCheckin,
  checkInBodySchema,
  checkinListQuerySchema,
  checkinSessionInputSchema,
  checkinSessionListQuerySchema,
  childAge,
  churchIdParamsSchema,
  churchParamsSchema,
  fullName,
  isRatioExceeded,
  sessionClassParamsSchema,
  suggestClass,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { CheckinSessionRow } from '../../db/schema';
import {
  checkinChildProfiles,
  checkinClassTeachers,
  checkins,
  checkinSessions,
  people,
  worshipServices,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import {
  checkinSettingsOf,
  classRowsOf,
  guardianUserIds,
  hydrateCheckins,
  hydrateClasses,
  hydrateSession,
  hydrateSessions,
  isGuardianOf,
  loadClassRow,
  loadPerson,
  loadSessionRow,
  openCheckinsByChild,
  sessionClassStats,
  syncAttendance,
  todayIn,
  uniqueSecurityCode,
} from '../../services/checkin';
import { notify } from '../../services/notifications';

const operate = { module: 'checkin', permission: ['checkin.operate', 'checkin.manage'] } as const;
const manage = { module: 'checkin', permission: 'checkin.manage' } as const;

const pick = (row: CheckinSessionRow) => ({
  name: row.name,
  date: row.date,
  worshipServiceId: row.worshipServiceId,
  status: row.status,
});

const assertServiceInChurch = (db: Queryable, churchId: string, serviceId: string | null) => {
  if (!serviceId) return;
  const service = db
    .select({ id: worshipServices.id })
    .from(worshipServices)
    .where(and(eq(worshipServices.id, serviceId), eq(worshipServices.churchId, churchId)))
    .get();
  if (!service) throw notFound('Service');
};

/** Name filter on the child of a check-in. */
const childNameMatches = (q: string): SQL | undefined => {
  const pattern = likePattern(q);
  return or(
    like(people.firstName, pattern),
    like(people.lastName, pattern),
    like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
  );
};

/**
 * Check-in sessions (one per service or date), their class rosters and the check-in itself.
 * Guardians check their own children in with `method: 'self'`; everything else needs
 * `checkin.operate`.
 */
export const checkinSessionsRouter = (deps: Deps) => {
  const { db } = deps;

  return new Elysia({ prefix: '/churches/:churchId/checkin/sessions' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => {
        const conditions: SQL[] = [eq(checkinSessions.churchId, church.id)];
        if (query.status) conditions.push(eq(checkinSessions.status, query.status));
        if (query.from) conditions.push(gte(checkinSessions.date, query.from));
        if (query.to) conditions.push(lte(checkinSessions.date, query.to));
        if (query.q) conditions.push(like(checkinSessions.name, likePattern(query.q)));
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(checkinSessions).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(checkinSessions)
          .where(where)
          .orderBy(desc(checkinSessions.date), desc(checkinSessions.openedAt))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return { items: hydrateSessions(db, rows), total, page: query.page, limit: query.limit };
      },
      { church: operate, params: churchParamsSchema, query: checkinSessionListQuerySchema },
    )
    .post(
      '/',
      ({ church, auth, audit, body, set }) => {
        assertServiceInChurch(db, church.id, body.worshipServiceId);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(checkinSessions)
            .values({
              id: newId(),
              churchId: church.id,
              name: body.name,
              date: body.date,
              worshipServiceId: body.worshipServiceId,
              status: 'open',
              openedBy: auth.user.id,
              openedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_session.open',
            entityType: 'checkin_session',
            entityId: created.id,
            summary: `Opened the check-in session ${created.name}`,
            after: pick(created),
          });
          return created;
        });
        set.status = 201;
        return { session: hydrateSession(db, row) };
      },
      { church: manage, params: churchParamsSchema, body: checkinSessionInputSchema },
    )
    .get(
      '/:id',
      ({ church, params }) => {
        const row = loadSessionRow(db, church.id, params.id);
        return {
          session: hydrateSession(db, row),
          classes: sessionClassStats(db, church.id, row.id),
        };
      },
      { church: operate, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, audit, params, body }) => {
        const row = loadSessionRow(db, church.id, params.id);
        assertServiceInChurch(db, church.id, body.worshipServiceId);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(checkinSessions)
            .set({
              name: body.name,
              date: body.date,
              worshipServiceId: body.worshipServiceId,
              updatedAt: nowIso(),
            })
            .where(eq(checkinSessions.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Session');
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_session.update',
            entityType: 'checkin_session',
            entityId: row.id,
            summary: `Updated the check-in session ${next.name}`,
            ...changes(pick(row), pick(next)),
          });
          return next;
        });
        return { session: hydrateSession(db, updated) };
      },
      { church: manage, params: churchIdParamsSchema, body: checkinSessionInputSchema },
    )
    .post(
      '/:id/close',
      ({ church, auth, audit, params }) => {
        const row = loadSessionRow(db, church.id, params.id);
        if (row.status === 'closed') throw conflict('This session is already closed');
        const updated = db.transaction((tx) => {
          const attendanceSessionId = syncAttendance(tx, row, auth.user.id);
          const now = nowIso();
          const next = tx
            .update(checkinSessions)
            .set({
              status: 'closed',
              closedAt: now,
              closedBy: auth.user.id,
              attendanceSessionId,
              updatedAt: now,
            })
            .where(eq(checkinSessions.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Session');
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_session.close',
            entityType: 'checkin_session',
            entityId: row.id,
            summary: `Closed the check-in session ${row.name}`,
            before: { status: row.status },
            after: { status: 'closed', attendanceSessionId },
          });
          return next;
        });
        return { session: hydrateSession(db, updated) };
      },
      { church: manage, params: churchIdParamsSchema },
    )
    .post(
      '/:id/reopen',
      ({ church, audit, params }) => {
        const row = loadSessionRow(db, church.id, params.id);
        if (row.status === 'open') throw conflict('This session is already open');
        const updated = db.transaction((tx) => {
          const next = tx
            .update(checkinSessions)
            .set({ status: 'open', closedAt: null, closedBy: null, updatedAt: nowIso() })
            .where(eq(checkinSessions.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Session');
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_session.reopen',
            entityType: 'checkin_session',
            entityId: row.id,
            summary: `Reopened the check-in session ${row.name}`,
            before: { status: 'closed' },
            after: { status: 'open' },
          });
          return next;
        });
        return { session: hydrateSession(db, updated) };
      },
      { church: manage, params: churchIdParamsSchema },
    )
    .delete(
      '/:id',
      ({ church, audit, params }) => {
        const row = loadSessionRow(db, church.id, params.id);
        const used =
          db.select({ value: count() }).from(checkins).where(eq(checkins.sessionId, row.id)).get()
            ?.value ?? 0;
        if (used > 0) throw conflict('Children were checked in to this session. Close it instead');
        db.transaction((tx) => {
          tx.delete(checkinSessions).where(eq(checkinSessions.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_session.delete',
            entityType: 'checkin_session',
            entityId: row.id,
            summary: `Deleted the check-in session ${row.name}`,
            before: pick(row),
          });
        });
        return { ok: true as const };
      },
      { church: manage, params: churchIdParamsSchema },
    )
    .get(
      '/:id/checkins',
      ({ church, access, params, query }) => {
        const session = loadSessionRow(db, church.id, params.id);
        const conditions: SQL[] = [
          eq(checkins.churchId, church.id),
          eq(checkins.sessionId, session.id),
        ];
        if (query.classId) conditions.push(eq(checkins.classId, query.classId));
        if (query.status) conditions.push(eq(checkins.status, query.status));
        if (query.q) {
          const name = childNameMatches(query.q);
          if (name) conditions.push(name);
        }
        const where = and(...conditions);
        const total =
          db
            .select({ value: count() })
            .from(checkins)
            .innerJoin(people, eq(people.id, checkins.childPersonId))
            .where(where)
            .get()?.value ?? 0;
        const rows = db
          .select({ checkin: checkins })
          .from(checkins)
          .innerJoin(people, eq(people.id, checkins.childPersonId))
          .where(where)
          .orderBy(desc(checkins.checkedInAt))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all()
          .map((row) => row.checkin);
        const reveal = canManageCheckin(access);
        return {
          items: hydrateCheckins(db, church.id, rows, () => reveal),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      { church: operate, params: churchIdParamsSchema, query: checkinListQuerySchema },
    )
    .get(
      '/:id/classes/:classId/roster',
      ({ church, access, params }) => {
        const session = loadSessionRow(db, church.id, params.id);
        const classRow = loadClassRow(db, church.id, params.classId);
        const rows = db
          .select()
          .from(checkins)
          .where(
            and(
              eq(checkins.churchId, church.id),
              eq(checkins.sessionId, session.id),
              eq(checkins.classId, classRow.id),
            ),
          )
          .orderBy(
            sql`case ${checkins.status} when 'checked_in' then 0 else 1 end`,
            asc(checkins.checkedInAt),
          )
          .all();
        const teacherCount =
          db
            .select({ value: count() })
            .from(checkinClassTeachers)
            .where(eq(checkinClassTeachers.classId, classRow.id))
            .get()?.value ?? 0;
        const presentCount = rows.filter((row) => row.status === 'checked_in').length;
        const reveal = canManageCheckin(access);
        return {
          class: hydrateClasses(db, [classRow])[0]!,
          session: hydrateSession(db, session),
          checkins: hydrateCheckins(db, church.id, rows, () => reveal),
          presentCount,
          teacherCount,
          ratioExceeded: isRatioExceeded(
            presentCount,
            teacherCount,
            classRow.maxChildrenPerTeacher,
          ),
        };
      },
      { church: operate, params: sessionClassParamsSchema },
    )
    .post(
      '/:id/checkins',
      ({ church, access, auth, params, body, set }) => {
        const session = loadSessionRow(db, church.id, params.id);
        const operator = canOperateCheckin(access);
        const self = body.method === 'self';
        if (!self && !operator) throw forbidden('You cannot run check-in for other families');
        if (self && !checkinSettingsOf(church).allowSelfCheckIn) {
          throw forbidden('Self check-in is turned off for this church');
        }
        if (self && !access.personId) {
          throw forbidden('Your account is not linked to a person in this church');
        }
        if (session.status !== 'open') throw conflict('This session is closed');
        const guardianId = self ? access.personId : body.guardianPersonId;
        const guardian =
          guardianId && !self ? loadPerson(db, church.id, guardianId, 'Guardian') : null;

        const today = todayIn(church.timezone);
        const classes = classRowsOf(db, church.id);
        const childIds = body.children.map((item) => item.personId);
        const profiles = new Map(
          db
            .select({
              personId: checkinChildProfiles.personId,
              defaultClassId: checkinChildProfiles.defaultClassId,
            })
            .from(checkinChildProfiles)
            .where(
              and(
                eq(checkinChildProfiles.churchId, church.id),
                inArray(checkinChildProfiles.personId, childIds),
              ),
            )
            .all()
            .map((row) => [row.personId, row.defaultClassId]),
        );
        const planned = body.children.map((item, index) => {
          const child = loadPerson(db, church.id, item.personId, 'Child');
          if (self && !isGuardianOf(db, church.id, guardianId, child.id)) {
            throw forbidden('You can only check in the children of your own household');
          }
          let classRow = item.classId
            ? classes.find((candidate) => candidate.id === item.classId)
            : suggestClass(
                classes,
                childAge(child.birthDate, today),
                profiles.get(child.id) ?? null,
              );
          if (item.classId && !classRow) throw notFound('Class');
          if (classRow && !classRow.isActive) classRow = undefined;
          if (!classRow) {
            throw validationError(`Choose a class for ${fullName(child)}`, [
              { path: `children.${index}.classId`, message: 'Choose an active class' },
            ]);
          }
          return { child, classRow };
        });

        const already = openCheckinsByChild(db, church.id, session.id, childIds);
        const first = planned.find((item) => already.has(item.child.id));
        if (first) throw conflict(`${fullName(first.child)} is already checked in`);

        // Guardians and kiosks respect class capacity; volunteers at the door may go over it.
        if (body.method !== 'staff') {
          const present = new Map(
            db
              .select({ classId: checkins.classId, value: count() })
              .from(checkins)
              .where(and(eq(checkins.sessionId, session.id), eq(checkins.status, 'checked_in')))
              .groupBy(checkins.classId)
              .all()
              .map((row) => [row.classId, row.value]),
          );
          for (const item of planned) {
            const next = (present.get(item.classRow.id) ?? 0) + 1;
            present.set(item.classRow.id, next);
            if (item.classRow.capacity !== null && next > item.classRow.capacity) {
              throw conflict(`${item.classRow.name} is full. Ask a teacher to help you check in`);
            }
          }
        }

        const now = nowIso();
        const taken = new Set<string>();
        const rows = db.transaction((tx) => {
          const inserted = planned.map((item) =>
            tx
              .insert(checkins)
              .values({
                id: newId(),
                churchId: church.id,
                sessionId: session.id,
                classId: item.classRow.id,
                childPersonId: item.child.id,
                guardianPersonId: guardianId ?? null,
                securityCode: uniqueSecurityCode(
                  tx,
                  session.id,
                  taken,
                  CHECKIN_LIMITS.securityCodeLength,
                ),
                method: body.method,
                status: 'checked_in',
                checkedInAt: now,
                checkedInBy: auth.user.id,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
              .get(),
          );
          for (const item of planned) {
            const recipients = guardianUserIds(tx, church.id, item.child.id);
            if (recipients.length === 0) continue;
            notify(tx, {
              churchId: church.id,
              userIds: recipients,
              excludeUserIds: [access.userId],
              type: 'checkin.child_checked_in',
              title: `${item.child.firstName} sudah masuk kelas ${item.classRow.name}`,
              body: guardian ? `${session.name} · diantar ${fullName(guardian)}` : session.name,
              link: `/c/${church.id}/checkin/me`,
              entityType: 'checkin_session',
              entityId: session.id,
            });
          }
          return inserted;
        });
        set.status = 201;
        // The caller prints the labels now, so the codes come back this once.
        return { items: hydrateCheckins(db, church.id, rows, () => true) };
      },
      { church: 'checkin', params: churchIdParamsSchema, body: checkInBodySchema },
    );
};
