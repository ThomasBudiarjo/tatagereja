import {
  type AccessLike,
  type Event,
  type EventDetails,
  type EventRegistration,
  type MyEventRegistration,
  type Locale,
} from '@tatagereja/shared';
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db, Queryable } from '../db/client';
import type { ChurchRow, EventRegistrationRow, EventRow } from '../db/schema';
import {
  eventParticipants,
  eventRegistrations,
  eventSeries,
  groupLeaders,
  groups,
  householdMembers,
  people,
} from '../db/schema';
import { nowIso } from '../lib/time';
import { toEvent, toPersonSummary } from '../serializers';
import { notify } from './notifications';

/** Adds group names and participant counts to raw event rows. */
export function hydrateEvents(db: Db, rows: EventRow[]): Event[] {
  if (rows.length === 0) return [];
  const eventIds = rows.map((row) => row.id);
  const groupIds = [...new Set(rows.map((row) => row.groupId).filter((id): id is string => !!id))];

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

  const counts = new Map<string, number>();
  for (const row of db
    .select({ eventId: eventParticipants.eventId, value: count() })
    .from(eventParticipants)
    .where(inArray(eventParticipants.eventId, eventIds))
    .groupBy(eventParticipants.eventId)
    .all()) {
    counts.set(row.eventId, row.value);
  }

  return rows.map((row) =>
    toEvent(
      row,
      row.groupId ? (groupNames.get(row.groupId) ?? null) : null,
      counts.get(row.id) ?? 0,
    ),
  );
}

export function groupNameOf(db: Db, groupId: string | null): string | null {
  if (!groupId) return null;
  return (
    db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).get()?.name ?? null
  );
}

type RegistrationCounts = { registered: number; waitlisted: number };

/** Places taken (party sizes) and waitlist length per event. */
export function registrationCountsOf(
  db: Queryable,
  eventIds: string[],
): Map<string, RegistrationCounts> {
  const counts = new Map<string, RegistrationCounts>();
  if (eventIds.length === 0) return counts;
  for (const row of db
    .select({
      eventId: eventRegistrations.eventId,
      status: eventRegistrations.status,
      places: sql<number>`coalesce(sum(${eventRegistrations.partySize}), 0)`.mapWith(Number),
      value: count(),
    })
    .from(eventRegistrations)
    .where(
      and(
        inArray(eventRegistrations.eventId, eventIds),
        ne(eventRegistrations.status, 'cancelled'),
      ),
    )
    .groupBy(eventRegistrations.eventId, eventRegistrations.status)
    .all()) {
    const current = counts.get(row.eventId) ?? { registered: 0, waitlisted: 0 };
    if (row.status === 'registered') current.registered += row.places;
    else current.waitlisted += row.value;
    counts.set(row.eventId, current);
  }
  return counts;
}

/** 1-based waitlist places of the waitlisted registrations of one event, in arrival order. */
export function waitlistPositionsOf(db: Queryable, eventId: string): Map<string, number> {
  const rows = db
    .select({ id: eventRegistrations.id })
    .from(eventRegistrations)
    .where(
      and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.status, 'waitlisted')),
    )
    .orderBy(asc(eventRegistrations.createdAt), asc(eventRegistrations.id))
    .all();
  return new Map(rows.map((row, index) => [row.id, index + 1]));
}

const toMyRegistration = (
  row: EventRegistrationRow,
  positions: Map<string, number>,
): MyEventRegistration => ({
  id: row.id,
  personId: row.personId,
  status: row.status,
  partySize: row.partySize,
  waitlistPosition: row.status === 'waitlisted' ? (positions.get(row.id) ?? null) : null,
  checkedInAt: row.checkedInAt,
});

/**
 * Events with their series, registration counts, places left and the caller's own
 * registration and RSVP.
 */
export function hydrateEventDetails(
  db: Db,
  rows: EventRow[],
  access: Pick<AccessLike, 'personId'>,
): EventDetails[] {
  if (rows.length === 0) return [];
  const base = hydrateEvents(db, rows);
  const ids = rows.map((row) => row.id);
  const counts = registrationCountsOf(db, ids);
  const seriesIds = [
    ...new Set(rows.map((row) => row.seriesId).filter((id): id is string => !!id)),
  ];
  const series = new Map(
    seriesIds.length > 0
      ? db
          .select({
            id: eventSeries.id,
            frequency: eventSeries.frequency,
            untilDate: eventSeries.untilDate,
          })
          .from(eventSeries)
          .where(inArray(eventSeries.id, seriesIds))
          .all()
          .map((row) => [row.id, { frequency: row.frequency, untilDate: row.untilDate }])
      : [],
  );
  const going = new Map(
    db
      .select({ eventId: eventParticipants.eventId, value: count() })
      .from(eventParticipants)
      .where(and(inArray(eventParticipants.eventId, ids), eq(eventParticipants.status, 'going')))
      .groupBy(eventParticipants.eventId)
      .all()
      .map((row) => [row.eventId, row.value]),
  );
  const mine = new Map<string, EventRegistrationRow>();
  const rsvps = new Map<string, EventDetails['myRsvp']>();
  if (access.personId) {
    for (const row of db
      .select()
      .from(eventRegistrations)
      .where(
        and(
          inArray(eventRegistrations.eventId, ids),
          eq(eventRegistrations.personId, access.personId),
        ),
      )
      .all()) {
      mine.set(row.eventId, row);
    }
    for (const row of db
      .select({ eventId: eventParticipants.eventId, status: eventParticipants.status })
      .from(eventParticipants)
      .where(
        and(
          inArray(eventParticipants.eventId, ids),
          eq(eventParticipants.personId, access.personId),
        ),
      )
      .all()) {
      rsvps.set(row.eventId, row.status);
    }
  }
  return rows.map((row, index) => {
    const event = base[index] as Event;
    const taken = counts.get(row.id) ?? { registered: 0, waitlisted: 0 };
    const own = mine.get(row.id);
    return {
      ...event,
      seriesId: row.seriesId,
      series: row.seriesId ? (series.get(row.seriesId) ?? null) : null,
      isSeriesException: row.isSeriesException,
      coverColor: row.coverColor,
      capacity: row.capacity,
      registrationRequired: row.registrationRequired,
      registrationClosesAt: row.registrationClosesAt,
      waitlistEnabled: row.waitlistEnabled,
      checkInEnabled: row.checkInEnabled,
      cancelledAt: row.cancelledAt,
      registeredCount: taken.registered,
      waitlistCount: taken.waitlisted,
      placesLeft: row.capacity === null ? null : Math.max(0, row.capacity - taken.registered),
      goingCount: going.get(row.id) ?? 0,
      myRegistration:
        own && own.status !== 'cancelled'
          ? toMyRegistration(
              own,
              own.status === 'waitlisted' ? waitlistPositionsOf(db, row.id) : new Map(),
            )
          : null,
      myRsvp: rsvps.get(row.id) ?? null,
    };
  });
}

/** Registrations of one event with people and waitlist places, registered first. */
export function hydrateRegistrations(db: Queryable, eventId: string): EventRegistration[] {
  const positions = waitlistPositionsOf(db, eventId);
  return db
    .select({ registration: eventRegistrations, person: people })
    .from(eventRegistrations)
    .innerJoin(people, eq(people.id, eventRegistrations.personId))
    .where(eq(eventRegistrations.eventId, eventId))
    .orderBy(
      sql`case ${eventRegistrations.status} when 'registered' then 0 when 'waitlisted' then 1 else 2 end`,
      asc(eventRegistrations.createdAt),
    )
    .all()
    .map(({ registration, person }) => ({
      id: registration.id,
      eventId: registration.eventId,
      person: toPersonSummary(person),
      status: registration.status,
      partySize: registration.partySize,
      note: registration.note,
      waitlistPosition:
        registration.status === 'waitlisted' ? (positions.get(registration.id) ?? null) : null,
      checkedInAt: registration.checkedInAt,
      createdAt: registration.createdAt,
    }));
}

/** The caller's own person and the people of their household, all in this church. */
export function householdPersonIdsOf(
  db: Queryable,
  churchId: string,
  personId: string | null,
): string[] {
  if (!personId) return [];
  const household = db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(and(eq(householdMembers.personId, personId), eq(householdMembers.churchId, churchId)))
    .get();
  if (!household) return [personId];
  const ids = db
    .select({ personId: householdMembers.personId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, household.householdId),
        eq(householdMembers.churchId, churchId),
      ),
    )
    .all()
    .map((row) => row.personId);
  return [...new Set([personId, ...ids])];
}

/** Login accounts of people (only people linked to an account), keyed by person id. */
export function userIdsByPerson(
  db: Queryable,
  churchId: string,
  personIds: readonly string[],
): Map<string, string> {
  if (personIds.length === 0) return new Map();
  return new Map(
    db
      .select({ id: people.id, userId: people.userId })
      .from(people)
      .where(and(eq(people.churchId, churchId), inArray(people.id, [...personIds])))
      .all()
      .flatMap((row) => (row.userId ? [[row.id, row.userId] as const] : [])),
  );
}

/** Organisers of an event: its creator and the leaders of its group. */
export function organiserUserIds(db: Queryable, event: EventRow): string[] {
  const leaders = event.groupId
    ? db
        .select({ userId: groupLeaders.userId })
        .from(groupLeaders)
        .where(
          and(eq(groupLeaders.groupId, event.groupId), eq(groupLeaders.churchId, event.churchId)),
        )
        .all()
        .map((row) => row.userId)
    : [];
  return [...new Set([event.createdBy, ...leaders])];
}

/** Everyone who expects to attend: active registrations and "going" RSVPs, as accounts. */
export function attendeeUserIds(db: Queryable, event: EventRow): string[] {
  const registered = db
    .select({
      personId: eventRegistrations.personId,
      registeredBy: eventRegistrations.registeredBy,
    })
    .from(eventRegistrations)
    .where(
      and(eq(eventRegistrations.eventId, event.id), ne(eventRegistrations.status, 'cancelled')),
    )
    .all();
  const going = db
    .select({ personId: eventParticipants.personId })
    .from(eventParticipants)
    .where(and(eq(eventParticipants.eventId, event.id), eq(eventParticipants.status, 'going')))
    .all();
  const linked = userIdsByPerson(db, event.churchId, [
    ...registered.map((row) => row.personId),
    ...going.map((row) => row.personId),
  ]);
  return [
    ...new Set([
      ...linked.values(),
      ...registered.flatMap((row) => (row.registeredBy ? [row.registeredBy] : [])),
    ]),
  ];
}

/** "Min, 3 Nov 18.00" in the church time zone, for notification bodies (Indonesian first). */
export function eventWhen(
  event: Pick<EventRow, 'startsAt' | 'isAllDay'>,
  timeZone: string,
  locale: Locale = 'id',
) {
  try {
    return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(event.isAllDay ? {} : { hour: '2-digit', minute: '2-digit' }),
    }).format(new Date(event.startsAt));
  } catch {
    return event.startsAt.slice(0, 16).replace('T', ' ');
  }
}

export const eventLink = (churchId: string, eventId: string) => `/c/${churchId}/events/${eventId}`;

/**
 * Moves waitlisted people onto the event, first come first served, while their party fits.
 * Stops at the first party that does not fit, so nobody is skipped. Promoted people are
 * notified. Returns the number of promoted registrations.
 */
export function promoteWaitlist(
  tx: Queryable,
  church: Pick<ChurchRow, 'id' | 'timezone'>,
  event: EventRow,
  actorUserId: string | null,
): number {
  if (!event.registrationRequired || event.cancelledAt) return 0;
  const counts = registrationCountsOf(tx, [event.id]).get(event.id) ?? {
    registered: 0,
    waitlisted: 0,
  };
  let taken = counts.registered;
  const waiting = tx
    .select()
    .from(eventRegistrations)
    .where(
      and(eq(eventRegistrations.eventId, event.id), eq(eventRegistrations.status, 'waitlisted')),
    )
    .orderBy(asc(eventRegistrations.createdAt), asc(eventRegistrations.id))
    .all();
  const promoted: EventRegistrationRow[] = [];
  const now = nowIso();
  for (const row of waiting) {
    if (event.capacity !== null && taken + row.partySize > event.capacity) break;
    tx.update(eventRegistrations)
      .set({ status: 'registered', promotedAt: now, updatedAt: now })
      .where(eq(eventRegistrations.id, row.id))
      .run();
    taken += row.partySize;
    promoted.push(row);
  }
  if (promoted.length === 0) return 0;
  const linked = userIdsByPerson(
    tx,
    church.id,
    promoted.map((row) => row.personId),
  );
  const userIds = [
    ...new Set([
      ...linked.values(),
      ...promoted.flatMap((row) => (row.registeredBy ? [row.registeredBy] : [])),
    ]),
  ];
  notify(tx, {
    churchId: church.id,
    userIds,
    excludeUserIds: actorUserId ? [actorUserId] : [],
    type: 'event.registration',
    title: event.title,
    body: {
      id: `Ada tempat untuk Anda: pendaftaran dari daftar tunggu kini terkonfirmasi · ${eventWhen(event, church.timezone)}`,
      en: `A place opened up: your registration from the waiting list is confirmed · ${eventWhen(event, church.timezone, 'en')}`,
    },
    link: eventLink(church.id, event.id),
    entityType: 'event',
    entityId: event.id,
  });
  return promoted.length;
}
