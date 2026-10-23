import {
  COMMS_LIMITS,
  addDaysToDate,
  can,
  canCheckInEvent,
  cancelEventBodySchema,
  churchDateOf,
  churchIdParamsSchema,
  churchParamsSchema,
  editEventScopeQuerySchema,
  eventCheckInBodySchema,
  eventDetailsInputSchema,
  eventDetailsListQuerySchema,
  eventRegistrationParamsSchema,
  eventSeriesInputSchema,
  idSchema,
  isRegistrationOpen,
  isSelfCheckInOpen,
  registerForEventBodySchema,
  seriesOccurrenceStarts,
  setParticipantsBodySchema,
  updateParticipantBodySchema,
  type Access,
  type EventRegistrationSettings,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lt,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../db/client';
import type { ChurchRow, EventRegistrationRow, EventRow } from '../db/schema';
import {
  attendanceRecords,
  attendanceSessions,
  eventParticipants,
  eventRegistrations,
  eventSeries,
  events,
  groups,
  people,
} from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, conflict, forbidden, notFound, validationError } from '../lib/errors';
import { likePattern, offsetOf } from '../lib/query';
import { enforceRateLimit } from '../lib/rate-limit';
import { nowIso, toUtcIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toPersonSummary } from '../serializers';
import { hydrateSessions } from '../services/attendance';
import { changes, recordAudit } from '../services/audit';
import {
  attendeeUserIds,
  eventLink,
  eventWhen,
  householdPersonIdsOf,
  hydrateEventDetails,
  hydrateRegistrations,
  organiserUserIds,
  promoteWaitlist,
  registrationCountsOf,
  userIdsByPerson,
  waitlistPositionsOf,
} from '../services/events';
import { notify } from '../services/notifications';

const participantParamsSchema = churchIdParamsSchema.extend({ personId: idSchema });

/** Registrations notify organisers, so members may only send so many. */
const REGISTRATION_LIMIT = { windowMs: 60 * 60_000, max: 60 };

/** Stored registration settings of an event or series. */
const settingsOf = (body: EventRegistrationSettings) => ({
  capacity: body.capacity,
  registrationRequired: body.registrationRequired,
  registrationClosesAt: body.registrationClosesAt ? toUtcIso(body.registrationClosesAt) : null,
  waitlistEnabled: body.waitlistEnabled,
  checkInEnabled: body.checkInEnabled,
  coverColor: body.coverColor,
});

const snapshot = (row: EventRow) => ({
  title: row.title,
  groupId: row.groupId,
  location: row.location,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  capacity: row.capacity,
  registrationRequired: row.registrationRequired,
  cancelledAt: row.cancelledAt,
});

/**
 * Events: single events and recurring series (edit one or every later occurrence), RSVP,
 * registration with capacity and a waitlist that moves up on its own, cancellation, and
 * check-in that records attendance.
 */
export const eventsModule = (deps: Deps) => {
  const { db } = deps;

  const loadEvent = (churchId: string, id: string): EventRow => {
    const event = db
      .select()
      .from(events)
      .where(and(eq(events.id, id), eq(events.churchId, churchId)))
      .get();
    if (!event) throw notFound('Event');
    return event;
  };

  const assertGroupInChurch = (churchId: string, groupId: string | null) => {
    if (!groupId) return;
    const group = db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.churchId, churchId)))
      .get();
    if (!group) throw notFound('Group');
  };

  const loadPerson = (churchId: string, personId: string) => {
    const person = db
      .select()
      .from(people)
      .where(and(eq(people.id, personId), eq(people.churchId, churchId)))
      .get();
    if (!person) throw notFound('Person');
    return person;
  };

  const hydrateOne = (row: EventRow, access: Pick<Access, 'personId'>) => {
    const [event] = hydrateEventDetails(db, [row], access);
    if (!event) throw notFound('Event');
    return event;
  };

  /** Tells everyone expecting to attend that the event moved, was cancelled or is back on. */
  const notifyAttendees = (
    tx: Queryable,
    church: ChurchRow,
    event: EventRow,
    actorUserId: string,
    body: string,
    userIds = attendeeUserIds(tx, event),
  ) => {
    if (new Date(event.endsAt ?? event.startsAt).getTime() < Date.now()) return;
    notify(tx, {
      churchId: church.id,
      userIds,
      excludeUserIds: [actorUserId],
      type: 'event.changed',
      title: event.title,
      body,
      link: eventLink(church.id, event.id),
      entityType: 'event',
      entityId: event.id,
    });
  };

  /** A new group event is announced to the group (church-wide events are not, to keep it calm). */
  const notifyGroupOfNewEvent = (
    tx: Queryable,
    church: ChurchRow,
    event: EventRow,
    actorUserId: string,
    recurring: boolean,
  ) => {
    if (!event.groupId) return;
    notify(tx, {
      churchId: church.id,
      audience: { kind: 'group', groupId: event.groupId },
      excludeUserIds: [actorUserId],
      type: 'event.created',
      title: event.title,
      body: `${eventWhen(event, church.timezone)}${recurring ? ' · kegiatan rutin' : ''}${event.location ? ` · ${event.location}` : ''}`,
      link: eventLink(church.id, event.id),
      entityType: 'event',
      entityId: event.id,
    });
  };

  /** The person a registration or check-in is for: the caller, their household, or (managers) anyone. */
  const assertMayActFor = (
    church: ChurchRow,
    access: Access,
    event: EventRow,
    personId: string,
  ) => {
    if (can.manageEvent(access, event)) return;
    if (!householdPersonIdsOf(db, church.id, access.personId).includes(personId)) {
      throw forbidden('You can only register yourself and your household');
    }
  };

  /** The check-in attendance session of an event, created on first use. */
  const checkInSession = (tx: Queryable, event: EventRow, userId: string) => {
    const existing = tx
      .select()
      .from(attendanceSessions)
      .where(and(eq(attendanceSessions.eventId, event.id), eq(attendanceSessions.churchId, event.churchId)))
      .orderBy(asc(attendanceSessions.createdAt))
      .get();
    if (existing) return existing;
    const now = nowIso();
    return tx
      .insert(attendanceSessions)
      .values({
        id: newId(),
        churchId: event.churchId,
        eventId: event.id,
        groupId: event.groupId,
        title: event.title,
        sessionAt: event.startsAt,
        notes: null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  };

  const checkIn = (event: EventRow, personIds: string[], userId: string) =>
    db.transaction((tx) => {
      const session = checkInSession(tx, event, userId);
      const now = nowIso();
      for (const personId of personIds) {
        tx.insert(attendanceRecords)
          .values({
            id: newId(),
            sessionId: session.id,
            personId,
            churchId: event.churchId,
            status: 'present',
            note: null,
            recordedBy: userId,
            recordedAt: now,
          })
          .onConflictDoUpdate({
            target: [attendanceRecords.sessionId, attendanceRecords.personId],
            set: { status: 'present', recordedBy: userId, recordedAt: now },
          })
          .run();
      }
      tx.update(eventRegistrations)
        .set({ checkedInAt: now, checkedInBy: userId, updatedAt: now })
        .where(
          and(
            eq(eventRegistrations.eventId, event.id),
            inArray(eventRegistrations.personId, personIds),
            ne(eventRegistrations.status, 'cancelled'),
            isNull(eventRegistrations.checkedInAt),
          ),
        )
        .run();
      return { sessionId: session.id, checkedIn: personIds.length };
    });

  const assertPeopleInChurch = (churchId: string, personIds: string[]) => {
    const found = db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.churchId, churchId), inArray(people.id, personIds)))
      .all();
    if (found.length !== personIds.length) throw notFound('One or more people');
  };

  return new Elysia({ prefix: '/churches/:churchId/events' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const now = nowIso();
        const conditions: SQL[] = [eq(events.churchId, church.id)];
        if (query.scope === 'upcoming') {
          const upcoming = or(gte(events.startsAt, now), gte(events.endsAt, now));
          if (upcoming) conditions.push(upcoming);
        } else if (query.scope === 'past') {
          const past = and(
            lt(events.startsAt, now),
            or(isNull(events.endsAt), lt(events.endsAt, now)),
          );
          if (past) conditions.push(past);
        }
        if (query.groupId) conditions.push(eq(events.groupId, query.groupId));
        if (query.q) {
          const search = or(
            like(events.title, likePattern(query.q)),
            like(events.location, likePattern(query.q)),
          );
          if (search) conditions.push(search);
        }
        if (query.mine) {
          const personId = access.personId ?? '';
          const mine = or(
            inArray(
              events.id,
              db
                .select({ id: eventRegistrations.eventId })
                .from(eventRegistrations)
                .where(
                  and(
                    eq(eventRegistrations.personId, personId),
                    ne(eventRegistrations.status, 'cancelled'),
                  ),
                ),
            ),
            inArray(
              events.id,
              db
                .select({ id: eventParticipants.eventId })
                .from(eventParticipants)
                .where(
                  and(eq(eventParticipants.personId, personId), eq(eventParticipants.status, 'going')),
                ),
            ),
          );
          if (mine) conditions.push(mine);
        }
        const where = and(...conditions);
        const total = db.select({ value: count() }).from(events).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(events)
          .where(where)
          .orderBy(query.scope === 'upcoming' ? asc(events.startsAt) : desc(events.startsAt))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateEventDetails(db, rows, access),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { permission: 'events.view' },
        params: churchParamsSchema,
        query: eventDetailsListQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, access, audit, auth, body, set }) => {
        if (!can.createEvent(access, body.groupId)) {
          throw forbidden('You cannot create events for this scope');
        }
        assertGroupInChurch(church.id, body.groupId);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(events)
            .values({
              id: newId(),
              churchId: church.id,
              groupId: body.groupId,
              title: body.title,
              description: body.description,
              location: body.location,
              startsAt: toUtcIso(body.startsAt),
              endsAt: body.endsAt ? toUtcIso(body.endsAt) : null,
              isAllDay: body.isAllDay,
              ...settingsOf(body),
              createdBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'event.create',
            entityType: 'event',
            entityId: created.id,
            summary: `Created the event ${created.title}`,
            after: snapshot(created),
          });
          notifyGroupOfNewEvent(tx, church, created, auth.user.id, false);
          return created;
        });
        set.status = 201;
        return { event: hydrateOne(row, access) };
      },
      { church: true, params: churchParamsSchema, body: eventDetailsInputSchema },
    )
    .post(
      '/series',
      ({ church, access, audit, auth, body, set }) => {
        if (!can.createEvent(access, body.groupId)) {
          throw forbidden('You cannot create events for this scope');
        }
        assertGroupInChurch(church.id, body.groupId);
        const starts = seriesOccurrenceStarts(
          { startsAt: body.startsAt, frequency: body.frequency, untilDate: body.untilDate },
          church.timezone,
          COMMS_LIMITS.seriesOccurrencesMax + 1,
        );
        if (starts.length > COMMS_LIMITS.seriesOccurrencesMax) {
          throw validationError('Too many occurrences', [
            {
              path: 'untilDate',
              message: `A series can have at most ${COMMS_LIMITS.seriesOccurrencesMax} occurrences`,
            },
          ]);
        }
        const now = nowIso();
        const settings = settingsOf(body);
        const result = db.transaction((tx) => {
          const series = tx
            .insert(eventSeries)
            .values({
              id: newId(),
              churchId: church.id,
              groupId: body.groupId,
              title: body.title,
              description: body.description,
              location: body.location,
              frequency: body.frequency,
              startsAt: toUtcIso(body.startsAt),
              durationMinutes: body.durationMinutes,
              isAllDay: body.isAllDay,
              untilDate: body.untilDate,
              capacity: body.capacity,
              registrationRequired: body.registrationRequired,
              createdBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          const rows = tx
            .insert(events)
            .values(
              starts.map((startsAt) => ({
                id: newId(),
                churchId: church.id,
                groupId: body.groupId,
                title: body.title,
                description: body.description,
                location: body.location,
                startsAt,
                endsAt: body.durationMinutes
                  ? new Date(new Date(startsAt).getTime() + body.durationMinutes * 60_000).toISOString()
                  : null,
                isAllDay: body.isAllDay,
                seriesId: series.id,
                ...settings,
                // A closing time belongs to one occurrence; series close when each one starts.
                registrationClosesAt: null,
                createdBy: auth.user.id,
                createdAt: now,
                updatedAt: now,
              })),
            )
            .returning()
            .all();
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'event_series.create',
            entityType: 'event_series',
            entityId: series.id,
            summary: `Created the recurring event ${series.title} (${rows.length} occurrences)`,
            after: {
              title: series.title,
              frequency: series.frequency,
              startsAt: series.startsAt,
              untilDate: series.untilDate,
              groupId: series.groupId,
            },
          });
          const first = rows[0];
          if (first) notifyGroupOfNewEvent(tx, church, first, auth.user.id, true);
          return { series, rows };
        });
        const first = result.rows[0];
        if (!first) throw notFound('Event');
        set.status = 201;
        return {
          series: {
            id: result.series.id,
            churchId: result.series.churchId,
            groupId: result.series.groupId,
            title: result.series.title,
            frequency: result.series.frequency,
            startsAt: result.series.startsAt,
            untilDate: result.series.untilDate,
            occurrenceCount: result.rows.length,
          },
          event: hydrateOne(first, access),
        };
      },
      { church: true, params: churchParamsSchema, body: eventSeriesInputSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const event = loadEvent(church.id, params.id);
        const participants = db
          .select({ person: people, status: eventParticipants.status })
          .from(eventParticipants)
          .innerJoin(people, eq(people.id, eventParticipants.personId))
          .where(eq(eventParticipants.eventId, event.id))
          .orderBy(asc(people.firstName), asc(people.lastName))
          .all();
        const canRecordAttendance = can.recordAttendance(access, event);
        const sessionRows = canRecordAttendance
          ? db
              .select()
              .from(attendanceSessions)
              .where(eq(attendanceSessions.eventId, event.id))
              .orderBy(desc(attendanceSessions.sessionAt))
              .all()
          : [];
        const householdIds = householdPersonIdsOf(db, church.id, access.personId);
        const registrable =
          householdIds.length > 0
            ? db
                .select()
                .from(people)
                .where(and(eq(people.churchId, church.id), inArray(people.id, householdIds)))
                .orderBy(asc(people.firstName))
                .all()
            : [];
        const positions = waitlistPositionsOf(db, event.id);
        const householdRegistrations =
          householdIds.length > 0
            ? db
                .select()
                .from(eventRegistrations)
                .where(
                  and(
                    eq(eventRegistrations.eventId, event.id),
                    inArray(eventRegistrations.personId, householdIds),
                    ne(eventRegistrations.status, 'cancelled'),
                  ),
                )
                .all()
                .map((row) => ({
                  id: row.id,
                  personId: row.personId,
                  status: row.status,
                  partySize: row.partySize,
                  waitlistPosition:
                    row.status === 'waitlisted' ? (positions.get(row.id) ?? null) : null,
                  checkedInAt: row.checkedInAt,
                }))
            : [];
        // Registrable people come first: the caller, then their household.
        registrable.sort((a, b) =>
          a.id === access.personId ? -1 : b.id === access.personId ? 1 : 0,
        );
        return {
          event: hydrateOne(event, access),
          participants: participants.map((row) => ({
            ...toPersonSummary(row.person),
            status: row.status,
          })),
          sessions: hydrateSessions(db, sessionRows).map((session) => ({
            id: session.id,
            title: session.title,
            sessionAt: session.sessionAt,
            presentCount: session.presentCount,
            totalCount: session.totalCount,
          })),
          canManage: can.manageEvent(access, event),
          canRecordAttendance,
          canCheckIn: canCheckInEvent(access, event),
          registrationOpen: isRegistrationOpen(event),
          selfCheckInOpen: isSelfCheckInOpen(event),
          registrablePeople: registrable.map(toPersonSummary),
          householdRegistrations,
        };
      },
      { church: { permission: 'events.view' }, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, audit, auth, params, query, body }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event)) throw forbidden('You cannot edit this event');
        if (body.groupId !== event.groupId && !can.createEvent(access, body.groupId)) {
          throw forbidden('You cannot move this event to that scope');
        }
        assertGroupInChurch(church.id, body.groupId);
        const startsAt = toUtcIso(body.startsAt);
        const endsAt = body.endsAt ? toUtcIso(body.endsAt) : null;
        const shift = new Date(startsAt).getTime() - new Date(event.startsAt).getTime();
        const duration = endsAt ? new Date(endsAt).getTime() - new Date(startsAt).getTime() : null;
        const fields = {
          groupId: body.groupId,
          title: body.title,
          description: body.description,
          location: body.location,
          isAllDay: body.isAllDay,
          ...settingsOf(body),
        };
        const future = query.scope === 'future' && event.seriesId !== null;
        const updated = db.transaction((tx) => {
          const now = nowIso();
          const targets = future
            ? tx
                .select()
                .from(events)
                .where(
                  and(
                    eq(events.seriesId, event.seriesId as string),
                    eq(events.churchId, church.id),
                    gte(events.startsAt, event.startsAt),
                    or(eq(events.id, event.id), eq(events.isSeriesException, false)),
                  ),
                )
                .all()
            : [event];
          for (const target of targets) {
            const start = new Date(new Date(target.startsAt).getTime() + shift).toISOString();
            const next = tx
              .update(events)
              .set({
                ...fields,
                startsAt: start,
                endsAt:
                  duration === null
                    ? null
                    : new Date(new Date(start).getTime() + duration).toISOString(),
                // A closing time only makes sense for the edited occurrence.
                registrationClosesAt: target.id === event.id ? fields.registrationClosesAt : null,
                isSeriesException: future ? target.isSeriesException && target.id !== event.id : target.seriesId !== null,
                updatedAt: now,
              })
              .where(eq(events.id, target.id))
              .returning()
              .get();
            if (next) promoteWaitlist(tx, church, next, auth.user.id);
          }
          if (future && event.seriesId) {
            tx.update(eventSeries)
              .set({
                groupId: body.groupId,
                title: body.title,
                description: body.description,
                location: body.location,
                isAllDay: body.isAllDay,
                capacity: body.capacity,
                registrationRequired: body.registrationRequired,
                durationMinutes: duration === null ? null : Math.round(duration / 60_000),
                updatedAt: now,
              })
              .where(eq(eventSeries.id, event.seriesId))
              .run();
          }
          const row = tx.select().from(events).where(eq(events.id, event.id)).get();
          if (!row) throw notFound('Event');
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'event.update',
            entityType: 'event',
            entityId: event.id,
            summary: future
              ? `Updated ${targets.length} occurrences of ${row.title}`
              : `Updated the event ${row.title}`,
            ...changes(snapshot(event), snapshot(row)),
          });
          if (shift !== 0 || row.location !== event.location) {
            notifyAttendees(
              tx,
              church,
              row,
              auth.user.id,
              `Jadwal berubah: ${eventWhen(row, church.timezone)}${row.location ? ` · ${row.location}` : ''}${future && targets.length > 1 ? ' (juga pertemuan berikutnya)' : ''}`,
            );
          }
          return row;
        });
        return { event: hydrateOne(updated, access) };
      },
      {
        church: true,
        params: churchIdParamsSchema,
        query: editEventScopeQuerySchema,
        body: eventDetailsInputSchema,
      },
    )
    .delete(
      '/:id',
      ({ church, access, audit, auth, params, query }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event)) throw forbidden('You cannot delete this event');
        const future = query.scope === 'future' && event.seriesId !== null;
        const deleted = db.transaction((tx) => {
          const targets = future
            ? tx
                .select()
                .from(events)
                .where(
                  and(
                    eq(events.seriesId, event.seriesId as string),
                    eq(events.churchId, church.id),
                    gte(events.startsAt, event.startsAt),
                  ),
                )
                .all()
            : [event];
          const recipients = [...new Set(targets.flatMap((target) => attendeeUserIds(tx, target)))];
          notifyAttendees(
            tx,
            church,
            event,
            auth.user.id,
            `Kegiatan ini dihapus dari jadwal${future && targets.length > 1 ? ', bersama pertemuan berikutnya' : ''}.`,
            recipients,
          );
          tx.delete(events)
            .where(
              inArray(
                events.id,
                targets.map((target) => target.id),
              ),
            )
            .run();
          if (future && event.seriesId) {
            const remaining =
              tx
                .select({ value: count() })
                .from(events)
                .where(eq(events.seriesId, event.seriesId))
                .get()?.value ?? 0;
            if (remaining === 0) {
              tx.delete(eventSeries).where(eq(eventSeries.id, event.seriesId)).run();
            } else {
              tx.update(eventSeries)
                .set({
                  untilDate: addDaysToDate(churchDateOf(event.startsAt, church.timezone), -1),
                  updatedAt: nowIso(),
                })
                .where(eq(eventSeries.id, event.seriesId))
                .run();
            }
          }
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'event.delete',
            entityType: 'event',
            entityId: event.id,
            summary: future
              ? `Deleted ${targets.length} occurrences of ${event.title}`
              : `Deleted the event ${event.title}`,
            before: snapshot(event),
          });
          return targets.length;
        });
        return { ok: true as const, deleted };
      },
      { church: true, params: churchIdParamsSchema, query: editEventScopeQuerySchema },
    )
    .post(
      '/:id/cancel',
      ({ church, access, audit, auth, params, body }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event)) throw forbidden('You cannot cancel this event');
        if (event.cancelledAt) throw conflict('This event is already cancelled');
        const updated = db.transaction((tx) => {
          const row = tx
            .update(events)
            .set({ cancelledAt: nowIso(), isSeriesException: event.seriesId !== null, updatedAt: nowIso() })
            .where(eq(events.id, event.id))
            .returning()
            .get();
          if (!row) throw notFound('Event');
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'event.cancel',
            entityType: 'event',
            entityId: event.id,
            summary: `Cancelled the event ${event.title}`,
            after: { reason: body.reason },
          });
          notifyAttendees(
            tx,
            church,
            row,
            auth.user.id,
            `Dibatalkan · ${eventWhen(row, church.timezone)}${body.reason ? ` · ${body.reason}` : ''}`,
          );
          return row;
        });
        return { event: hydrateOne(updated, access) };
      },
      { church: true, params: churchIdParamsSchema, body: cancelEventBodySchema },
    )
    .post(
      '/:id/restore',
      ({ church, access, audit, auth, params }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event)) throw forbidden('You cannot restore this event');
        if (!event.cancelledAt) throw conflict('This event is not cancelled');
        const updated = db.transaction((tx) => {
          const row = tx
            .update(events)
            .set({ cancelledAt: null, updatedAt: nowIso() })
            .where(eq(events.id, event.id))
            .returning()
            .get();
          if (!row) throw notFound('Event');
          recordAudit(tx, audit, {
            module: 'comms',
            action: 'event.restore',
            entityType: 'event',
            entityId: event.id,
            summary: `Restored the cancelled event ${event.title}`,
          });
          notifyAttendees(
            tx,
            church,
            row,
            auth.user.id,
            `Kegiatan ini jadi diadakan · ${eventWhen(row, church.timezone)}`,
          );
          return row;
        });
        return { event: hydrateOne(updated, access) };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .post(
      '/:id/participants',
      ({ church, access, params, body }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event)) throw forbidden('You cannot manage participants');
        const personIds = [...new Set(body.personIds)];
        assertPeopleInChurch(church.id, personIds);
        const now = nowIso();
        db.insert(eventParticipants)
          .values(
            personIds.map((personId) => ({
              id: newId(),
              eventId: event.id,
              personId,
              churchId: church.id,
              status: body.status,
              createdAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: [eventParticipants.eventId, eventParticipants.personId],
            set: { status: body.status },
          })
          .run();
        return { event: hydrateOne(event, access) };
      },
      { church: true, params: churchIdParamsSchema, body: setParticipantsBodySchema },
    )
    .patch(
      '/:id/participants/:personId',
      ({ church, access, params, body }) => {
        const event = loadEvent(church.id, params.id);
        const isSelf = access.personId !== null && access.personId === params.personId;
        if (!can.manageEvent(access, event) && !isSelf) {
          throw forbidden('You cannot change this participant');
        }
        const person = loadPerson(church.id, params.personId);
        db.insert(eventParticipants)
          .values({
            id: newId(),
            eventId: event.id,
            personId: person.id,
            churchId: church.id,
            status: body.status,
            createdAt: nowIso(),
          })
          .onConflictDoUpdate({
            target: [eventParticipants.eventId, eventParticipants.personId],
            set: { status: body.status },
          })
          .run();
        return { event: hydrateOne(event, access) };
      },
      { church: true, params: participantParamsSchema, body: updateParticipantBodySchema },
    )
    .delete(
      '/:id/participants/:personId',
      ({ church, access, params }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event)) throw forbidden('You cannot manage participants');
        const deleted = db
          .delete(eventParticipants)
          .where(
            and(
              eq(eventParticipants.eventId, event.id),
              eq(eventParticipants.personId, params.personId),
            ),
          )
          .returning({ id: eventParticipants.id })
          .get();
        if (!deleted) throw notFound('Participant');
        return { event: hydrateOne(event, access) };
      },
      { church: true, params: participantParamsSchema },
    )
    .get(
      '/:id/registrations',
      ({ church, access, params }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event) && !canCheckInEvent(access, event)) {
          throw forbidden('You cannot see the registrations of this event');
        }
        const counts = registrationCountsOf(db, [event.id]).get(event.id);
        return {
          items: hydrateRegistrations(db, event.id),
          capacity: event.capacity,
          registeredCount: counts?.registered ?? 0,
          waitlistCount: counts?.waitlisted ?? 0,
        };
      },
      { church: { permission: 'events.view' }, params: churchIdParamsSchema },
    )
    .post(
      '/:id/registrations',
      ({ church, access, auth, params, body, set }) => {
        const event = loadEvent(church.id, params.id);
        if (!event.registrationRequired) throw conflict('This event does not take registrations');
        if (!isRegistrationOpen(event)) throw conflict('Registration for this event is closed');
        const personId = body.personId ?? access.personId;
        if (!personId) {
          throw badRequest('Your account is not linked to a person in this church yet');
        }
        const person = loadPerson(church.id, personId);
        assertMayActFor(church, access, event, person.id);
        if (!can.manageEvent(access, event)) {
          enforceRateLimit(
            deps.limiters,
            'comms.event_registration',
            `${church.id}:${access.userId}`,
            REGISTRATION_LIMIT,
          );
        }
        const registration = db.transaction((tx) => {
          const existing = tx
            .select()
            .from(eventRegistrations)
            .where(
              and(eq(eventRegistrations.eventId, event.id), eq(eventRegistrations.personId, person.id)),
            )
            .get();
          if (existing && existing.status !== 'cancelled') {
            throw conflict('This person is already registered for the event');
          }
          const taken = registrationCountsOf(tx, [event.id]).get(event.id)?.registered ?? 0;
          // Nobody jumps the queue: with people waiting, newcomers wait too.
          const waiting = (registrationCountsOf(tx, [event.id]).get(event.id)?.waitlisted ?? 0) > 0;
          const fits = event.capacity === null || (!waiting && taken + body.partySize <= event.capacity);
          if (!fits && !event.waitlistEnabled) throw conflict('This event is full');
          const status: EventRegistrationRow['status'] = fits ? 'registered' : 'waitlisted';
          const now = nowIso();
          const values = {
            registeredBy: auth.user.id,
            status,
            partySize: body.partySize,
            note: body.note,
            promotedAt: null,
            cancelledAt: null,
            checkedInAt: null,
            checkedInBy: null,
            createdAt: now,
            updatedAt: now,
          };
          const row = existing
            ? tx
                .update(eventRegistrations)
                .set(values)
                .where(eq(eventRegistrations.id, existing.id))
                .returning()
                .get()
            : tx
                .insert(eventRegistrations)
                .values({
                  id: newId(),
                  churchId: church.id,
                  eventId: event.id,
                  personId: person.id,
                  ...values,
                })
                .returning()
                .get();
          if (!row) throw notFound('Registration');
          const personUser = userIdsByPerson(tx, church.id, [person.id]).get(person.id);
          if (personUser) {
            notify(tx, {
              churchId: church.id,
              userIds: [personUser],
              excludeUserIds: [auth.user.id],
              type: 'event.registration',
              title: event.title,
              body:
                status === 'registered'
                  ? `Anda terdaftar · ${eventWhen(event, church.timezone)}`
                  : `Anda masuk daftar tunggu · ${eventWhen(event, church.timezone)}`,
              link: eventLink(church.id, event.id),
              entityType: 'event',
              entityId: event.id,
            });
          }
          notify(tx, {
            churchId: church.id,
            userIds: organiserUserIds(tx, event),
            excludeUserIds: [auth.user.id],
            type: 'event.registrations',
            title: event.title,
            body: `${person.firstName}${person.lastName ? ` ${person.lastName}` : ''} ${status === 'registered' ? 'mendaftar' : 'masuk daftar tunggu'}${body.partySize > 1 ? ` (${body.partySize} orang)` : ''}`,
            link: eventLink(church.id, event.id),
            entityType: 'event',
            entityId: event.id,
          });
          return row;
        });
        set.status = 201;
        const item = hydrateRegistrations(db, event.id).find((row) => row.id === registration.id);
        if (!item) throw notFound('Registration');
        return { registration: item, event: hydrateOne(event, access) };
      },
      { church: { permission: 'events.view' }, params: churchIdParamsSchema, body: registerForEventBodySchema },
    )
    .post(
      '/:id/registrations/:registrationId/cancel',
      ({ church, access, auth, params }) => {
        const event = loadEvent(church.id, params.id);
        const registration = db
          .select()
          .from(eventRegistrations)
          .where(
            and(
              eq(eventRegistrations.id, params.registrationId),
              eq(eventRegistrations.eventId, event.id),
              eq(eventRegistrations.churchId, church.id),
            ),
          )
          .get();
        if (!registration) throw notFound('Registration');
        const own =
          registration.registeredBy === access.userId ||
          householdPersonIdsOf(db, church.id, access.personId).includes(registration.personId);
        if (!own && !can.manageEvent(access, event)) {
          throw forbidden('You cannot cancel this registration');
        }
        if (registration.status === 'cancelled') throw conflict('This registration is already cancelled');
        db.transaction((tx) => {
          const now = nowIso();
          tx.update(eventRegistrations)
            .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
            .where(eq(eventRegistrations.id, registration.id))
            .run();
          const person = tx
            .select({ firstName: people.firstName, lastName: people.lastName })
            .from(people)
            .where(eq(people.id, registration.personId))
            .get();
          notify(tx, {
            churchId: church.id,
            userIds: organiserUserIds(tx, event),
            excludeUserIds: [auth.user.id],
            type: 'event.registrations',
            title: event.title,
            body: `${person ? `${person.firstName}${person.lastName ? ` ${person.lastName}` : ''}` : 'Seseorang'} membatalkan pendaftaran`,
            link: eventLink(church.id, event.id),
            entityType: 'event',
            entityId: event.id,
          });
          if (registration.status === 'registered') promoteWaitlist(tx, church, event, auth.user.id);
        });
        const item = hydrateRegistrations(db, event.id).find((row) => row.id === registration.id);
        if (!item) throw notFound('Registration');
        return { registration: item, event: hydrateOne(event, access) };
      },
      { church: { permission: 'events.view' }, params: eventRegistrationParamsSchema },
    )
    .get(
      '/:id/check-in',
      ({ church, access, params }) => {
        const event = loadEvent(church.id, params.id);
        if (!canCheckInEvent(access, event)) throw forbidden('You cannot check people in');
        const session = db
          .select()
          .from(attendanceSessions)
          .where(and(eq(attendanceSessions.eventId, event.id), eq(attendanceSessions.churchId, church.id)))
          .orderBy(asc(attendanceSessions.createdAt))
          .get();
        const present = new Map(
          session
            ? db
                .select({ personId: attendanceRecords.personId, at: attendanceRecords.recordedAt })
                .from(attendanceRecords)
                .where(
                  and(
                    eq(attendanceRecords.sessionId, session.id),
                    eq(attendanceRecords.status, 'present'),
                  ),
                )
                .all()
                .map((row) => [row.personId, row.at])
            : [],
        );
        const registered = db
          .select({ registration: eventRegistrations, person: people })
          .from(eventRegistrations)
          .innerJoin(people, eq(people.id, eventRegistrations.personId))
          .where(and(eq(eventRegistrations.eventId, event.id), eq(eventRegistrations.status, 'registered')))
          .all();
        const going = db
          .select({ person: people })
          .from(eventParticipants)
          .innerJoin(people, eq(people.id, eventParticipants.personId))
          .where(and(eq(eventParticipants.eventId, event.id), eq(eventParticipants.status, 'going')))
          .all();
        const seen = new Set<string>();
        const items: {
          person: ReturnType<typeof toPersonSummary>;
          source: 'registration' | 'rsvp' | 'walk_in';
          partySize: number;
          checkedInAt: string | null;
        }[] = [];
        for (const row of registered) {
          seen.add(row.person.id);
          items.push({
            person: toPersonSummary(row.person),
            source: 'registration',
            partySize: row.registration.partySize,
            checkedInAt: present.get(row.person.id) ?? row.registration.checkedInAt,
          });
        }
        for (const row of going) {
          if (seen.has(row.person.id)) continue;
          seen.add(row.person.id);
          items.push({
            person: toPersonSummary(row.person),
            source: 'rsvp',
            partySize: 1,
            checkedInAt: present.get(row.person.id) ?? null,
          });
        }
        const walkInIds = [...present.keys()].filter((personId) => !seen.has(personId));
        if (walkInIds.length > 0) {
          for (const person of db
            .select()
            .from(people)
            .where(and(eq(people.churchId, church.id), inArray(people.id, walkInIds)))
            .all()) {
            items.push({
              person: toPersonSummary(person),
              source: 'walk_in',
              partySize: 1,
              checkedInAt: present.get(person.id) ?? null,
            });
          }
        }
        items.sort((a, b) =>
          `${a.person.firstName} ${a.person.lastName ?? ''}`.localeCompare(
            `${b.person.firstName} ${b.person.lastName ?? ''}`,
          ),
        );
        return {
          items,
          sessionId: session?.id ?? null,
          checkedInCount: items.filter((item) => item.checkedInAt).length,
        };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .post(
      '/:id/check-in',
      ({ church, access, auth, params, body }) => {
        const event = loadEvent(church.id, params.id);
        if (!canCheckInEvent(access, event)) throw forbidden('You cannot check people in');
        if (event.cancelledAt) throw conflict('This event is cancelled');
        const personIds = [...new Set(body.personIds)];
        assertPeopleInChurch(church.id, personIds);
        return checkIn(event, personIds, auth.user.id);
      },
      { church: true, params: churchIdParamsSchema, body: eventCheckInBodySchema },
    )
    .post(
      '/:id/check-in/me',
      ({ church, access, auth, params, body }) => {
        const event = loadEvent(church.id, params.id);
        if (!isSelfCheckInOpen(event)) throw conflict('Check-in is not open for this event');
        const household = householdPersonIdsOf(db, church.id, access.personId);
        const personIds = [...new Set(body.personIds)];
        if (personIds.some((personId) => !household.includes(personId))) {
          throw forbidden('You can only check in yourself and your household');
        }
        if (event.registrationRequired) {
          const registered = db
            .select({ personId: eventRegistrations.personId })
            .from(eventRegistrations)
            .where(
              and(
                eq(eventRegistrations.eventId, event.id),
                eq(eventRegistrations.status, 'registered'),
                inArray(eventRegistrations.personId, personIds),
              ),
            )
            .all();
          if (registered.length !== personIds.length) {
            throw conflict('Only registered people can check in to this event');
          }
        }
        return checkIn(event, personIds, auth.user.id);
      },
      { church: { permission: 'events.view' }, params: churchIdParamsSchema, body: eventCheckInBodySchema },
    )
    .delete(
      '/:id/check-in/:personId',
      ({ church, access, params }) => {
        const event = loadEvent(church.id, params.id);
        if (!canCheckInEvent(access, event)) throw forbidden('You cannot check people in');
        const session = db
          .select({ id: attendanceSessions.id })
          .from(attendanceSessions)
          .where(and(eq(attendanceSessions.eventId, event.id), eq(attendanceSessions.churchId, church.id)))
          .orderBy(asc(attendanceSessions.createdAt))
          .get();
        db.transaction((tx) => {
          const removed = session
            ? tx
                .delete(attendanceRecords)
                .where(
                  and(
                    eq(attendanceRecords.sessionId, session.id),
                    eq(attendanceRecords.personId, params.personId),
                  ),
                )
                .returning({ id: attendanceRecords.id })
                .get()
            : undefined;
          const unmarked = tx
            .update(eventRegistrations)
            .set({ checkedInAt: null, checkedInBy: null, updatedAt: nowIso() })
            .where(
              and(
                eq(eventRegistrations.eventId, event.id),
                eq(eventRegistrations.personId, params.personId),
              ),
            )
            .returning({ id: eventRegistrations.id })
            .get();
          if (!removed && !unmarked) throw notFound('Check-in');
        });
        return { ok: true as const };
      },
      { church: true, params: participantParamsSchema },
    );
};
