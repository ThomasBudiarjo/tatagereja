import {
  CALENDAR_SOURCE_COLORS,
  DEFAULT_PERSON_PRIVACY,
  addDaysToDate,
  calendarSourcesFor,
  churchDateOf,
  fullName,
  has,
  hasAny,
  zonedInstant,
  type AccessLike,
  type CalendarItem,
  type CalendarSource,
} from '@tatagereja/shared';
import { and, asc, eq, gte, inArray, isNotNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Queryable } from '../../db/client';
import type { ChurchRow } from '../../db/schema';
import {
  events,
  facilityBookings,
  facilityResources,
  groups,
  people,
  personPrivacySettings,
  serviceTypes,
  worshipServices,
} from '../../db/schema';
import { expandOccurrences, intersectsWindow } from '../../services/facilities';
import { enabledModulesOf } from '../../services/modules';

const DAY_MS = 86_400_000;
const DEFAULT_SERVICE_MINUTES = 90;

export type CalendarRange = {
  from: string;
  to: string;
  sources: readonly CalendarSource[];
  groupId?: string;
};

/** The caller's sources among the requested ones. */
export const allowedSources = (
  church: Pick<ChurchRow, 'enabledModules'>,
  access: Pick<AccessLike, 'permissions'>,
  requested: readonly CalendarSource[],
): CalendarSource[] => {
  const available = calendarSourcesFor(access, enabledModulesOf(church));
  return requested.filter((source) => available.includes(source));
};

/** Church-local dates from `from` to `to` (both instants), inclusive. */
const datesBetween = (from: string, to: string, timeZone: string): string[] => {
  const first = churchDateOf(from, timeZone);
  const last = churchDateOf(new Date(new Date(to).getTime() - 1).toISOString(), timeZone);
  const dates: string[] = [];
  for (let date = first; date <= last && dates.length < 400; date = addDaysToDate(date, 1)) {
    dates.push(date);
  }
  return dates;
};

/**
 * Every calendar item in a window, from the sources the caller may see: church and group
 * events, worship services (drafts only for planners), approved room bookings and, when asked
 * for, birthdays of people who show theirs.
 */
export function calendarItems(
  db: Queryable,
  church: ChurchRow,
  access: AccessLike,
  range: CalendarRange,
): CalendarItem[] {
  const sources = allowedSources(church, access, range.sources);
  const base = `/c/${church.id}`;
  const items: CalendarItem[] = [];

  if (sources.includes('events')) {
    const conditions: (SQL | undefined)[] = [
      eq(events.churchId, church.id),
      lt(events.startsAt, range.to),
      or(
        gte(events.endsAt, range.from),
        and(sql`${events.endsAt} is null`, gte(events.startsAt, range.from)),
      ),
    ];
    if (range.groupId) conditions.push(eq(events.groupId, range.groupId));
    const rows = db
      .select({ event: events, groupName: groups.name })
      .from(events)
      .leftJoin(groups, eq(groups.id, events.groupId))
      .where(and(...conditions))
      .orderBy(asc(events.startsAt))
      .all();
    for (const { event, groupName } of rows) {
      items.push({
        key: `events:${event.id}`,
        source: 'events',
        id: event.id,
        title: event.title,
        subtitle: groupName ?? null,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        isAllDay: event.isAllDay,
        location: event.location,
        color: event.coverColor ?? CALENDAR_SOURCE_COLORS.events,
        cancelled: event.cancelledAt !== null,
        link: `${base}/events/${event.id}`,
      });
    }
  }

  if (sources.includes('services') && !range.groupId) {
    const seesDrafts = hasAny(access, ['services.manage', 'volunteers.schedule']);
    const rows = db
      .select({
        service: worshipServices,
        typeColor: serviceTypes.color,
        typeMinutes: serviceTypes.defaultDurationMinutes,
      })
      .from(worshipServices)
      .leftJoin(serviceTypes, eq(serviceTypes.id, worshipServices.serviceTypeId))
      .where(
        and(
          eq(worshipServices.churchId, church.id),
          lt(worshipServices.startsAt, range.to),
          gte(
            worshipServices.startsAt,
            new Date(new Date(range.from).getTime() - DAY_MS).toISOString(),
          ),
          seesDrafts ? undefined : ne(worshipServices.status, 'draft'),
        ),
      )
      .orderBy(asc(worshipServices.startsAt))
      .all();
    for (const { service, typeColor, typeMinutes } of rows) {
      const endsAt =
        service.endsAt ??
        new Date(
          new Date(service.startsAt).getTime() + (typeMinutes ?? DEFAULT_SERVICE_MINUTES) * 60_000,
        ).toISOString();
      if (endsAt <= range.from) continue;
      items.push({
        key: `services:${service.id}`,
        source: 'services',
        id: service.id,
        title: service.title,
        subtitle: service.preacherName ?? service.theme ?? null,
        startsAt: service.startsAt,
        endsAt,
        isAllDay: false,
        location: service.location,
        color: typeColor ?? CALENDAR_SOURCE_COLORS.services,
        cancelled: service.status === 'cancelled',
        link: `${base}/worship/services/${service.id}`,
      });
    }
  }

  if (sources.includes('bookings')) {
    const rows = db
      .select()
      .from(facilityBookings)
      .where(
        and(
          eq(facilityBookings.churchId, church.id),
          eq(facilityBookings.status, 'approved'),
          intersectsWindow(range.from, range.to),
          range.groupId ? eq(facilityBookings.groupId, range.groupId) : undefined,
        ),
      )
      .all();
    const resourceIds = [...new Set(rows.map((row) => row.resourceId))];
    const resources = new Map(
      resourceIds.length > 0
        ? db
            .select({
              id: facilityResources.id,
              name: facilityResources.name,
              color: facilityResources.color,
              location: facilityResources.location,
            })
            .from(facilityResources)
            .where(inArray(facilityResources.id, resourceIds))
            .all()
            .map((row) => [row.id, row])
        : [],
    );
    for (const occurrence of expandOccurrences(db, rows, range.from, range.to)) {
      const resource = resources.get(occurrence.resourceId);
      items.push({
        key: `bookings:${occurrence.bookingId}:${occurrence.startsAt}`,
        source: 'bookings',
        id: occurrence.bookingId,
        title: occurrence.title,
        subtitle: resource?.name ?? null,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        isAllDay: false,
        location: resource?.location ?? resource?.name ?? null,
        color: resource?.color ?? CALENDAR_SOURCE_COLORS.bookings,
        cancelled: false,
        link: `${base}/facilities/bookings/${occurrence.bookingId}`,
      });
    }
  }

  if (sources.includes('birthdays') && !range.groupId) {
    const dates = datesBetween(range.from, range.to, church.timezone);
    const byMonthDay = new Map(dates.map((date) => [date.slice(5), date]));
    const shows = has(access, 'people.private.view')
      ? undefined
      : sql`coalesce((select ${personPrivacySettings.showBirthday} from ${personPrivacySettings} where ${personPrivacySettings.personId} = ${people.id}), ${DEFAULT_PERSON_PRIVACY.showBirthday ? 1 : 0}) = 1`;
    if (byMonthDay.size > 0) {
      const rows = db
        .select({
          id: people.id,
          firstName: people.firstName,
          lastName: people.lastName,
          birthDate: people.birthDate,
        })
        .from(people)
        .where(
          and(
            eq(people.churchId, church.id),
            isNotNull(people.birthDate),
            ne(people.membershipStatus, 'inactive'),
            inArray(sql`substr(${people.birthDate}, 6, 5)`, [...byMonthDay.keys()]),
            shows,
          ),
        )
        .all();
      for (const person of rows) {
        const date = byMonthDay.get((person.birthDate ?? '').slice(5));
        if (!date) continue;
        items.push({
          key: `birthdays:${person.id}:${date}`,
          source: 'birthdays',
          id: person.id,
          title: fullName(person),
          subtitle: null,
          startsAt: new Date(zonedInstant(date, 0, church.timezone)).toISOString(),
          endsAt: null,
          isAllDay: true,
          location: null,
          color: CALENDAR_SOURCE_COLORS.birthdays,
          cancelled: false,
          link: `${base}/people/${person.id}`,
        });
      }
    }
  }

  return items.sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title),
  );
}
