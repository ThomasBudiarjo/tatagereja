import {
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  eventInputSchema,
  eventListQuerySchema,
  idSchema,
  setParticipantsBodySchema,
  updateParticipantBodySchema,
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
  or,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { EventRow } from '../db/schema';
import { attendanceSessions, eventParticipants, events, groups, people } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound } from '../lib/errors';
import { likePattern, offsetOf } from '../lib/query';
import { nowIso, toUtcIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toPersonSummary } from '../serializers';
import { hydrateSessions } from '../services/attendance';
import { hydrateEvents } from '../services/events';

const participantParamsSchema = churchIdParamsSchema.extend({ personId: idSchema });

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

  const hydrateOne = (row: EventRow) => {
    const [event] = hydrateEvents(db, [row]);
    if (!event) throw notFound('Event');
    return event;
  };

  return new Elysia({ prefix: '/churches/:churchId/events' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => {
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
        return { items: hydrateEvents(db, rows), total, page: query.page, limit: query.limit };
      },
      { church: true, params: churchParamsSchema, query: eventListQuerySchema },
    )
    .post(
      '/',
      ({ church, access, auth, body, set }) => {
        if (!can.createEvent(access, body.groupId)) {
          throw forbidden('You cannot create events for this scope');
        }
        assertGroupInChurch(church.id, body.groupId);
        const now = nowIso();
        const row = db
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
            createdBy: auth.user.id,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        set.status = 201;
        return { event: hydrateOne(row) };
      },
      { church: true, params: churchParamsSchema, body: eventInputSchema },
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
        return {
          event: hydrateOne(event),
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
        };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, params, body }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event)) throw forbidden('You cannot edit this event');
        if (body.groupId !== event.groupId && !can.createEvent(access, body.groupId)) {
          throw forbidden('You cannot move this event to that scope');
        }
        assertGroupInChurch(church.id, body.groupId);
        const updated = db
          .update(events)
          .set({
            groupId: body.groupId,
            title: body.title,
            description: body.description,
            location: body.location,
            startsAt: toUtcIso(body.startsAt),
            endsAt: body.endsAt ? toUtcIso(body.endsAt) : null,
            isAllDay: body.isAllDay,
            updatedAt: nowIso(),
          })
          .where(eq(events.id, event.id))
          .returning()
          .get();
        if (!updated) throw notFound('Event');
        return { event: hydrateOne(updated) };
      },
      { church: true, params: churchIdParamsSchema, body: eventInputSchema },
    )
    .delete(
      '/:id',
      ({ church, access, params }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event)) throw forbidden('You cannot delete this event');
        db.delete(events).where(eq(events.id, event.id)).run();
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .post(
      '/:id/participants',
      ({ church, access, params, body }) => {
        const event = loadEvent(church.id, params.id);
        if (!can.manageEvent(access, event)) throw forbidden('You cannot manage participants');
        const personIds = [...new Set(body.personIds)];
        const found = db
          .select({ id: people.id })
          .from(people)
          .where(and(eq(people.churchId, church.id), inArray(people.id, personIds)))
          .all();
        if (found.length !== personIds.length) throw notFound('One or more people');
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
        return { event: hydrateOne(event) };
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
        const person = db
          .select({ id: people.id })
          .from(people)
          .where(and(eq(people.id, params.personId), eq(people.churchId, church.id)))
          .get();
        if (!person) throw notFound('Person');
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
        return { event: hydrateOne(event) };
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
        return { event: hydrateOne(event) };
      },
      { church: true, params: participantParamsSchema },
    );
};
