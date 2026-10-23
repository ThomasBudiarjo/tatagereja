import { and, eq } from 'drizzle-orm';
import type { Queryable } from '../../db/client';
import type {
  PersonRow,
  RosterAssignmentRow,
  ServiceTypeRow,
  ServingPositionRow,
  ServingTeamRow,
  SongRow,
  WorshipServiceRow,
} from '../../db/schema';
import {
  people,
  rosterAssignments,
  serviceTypes,
  servingPositions,
  servingTeams,
  songs,
  worshipServices,
} from '../../db/schema';
import { notFound } from '../../lib/errors';

/*
 * Loaders for rows named by id in a request. Every one is scoped to the church and answers 404
 * otherwise, so an id from another church never reaches a write (no cross-church IDOR).
 */

export function loadService(db: Queryable, churchId: string, id: string): WorshipServiceRow {
  const row = db
    .select()
    .from(worshipServices)
    .where(and(eq(worshipServices.id, id), eq(worshipServices.churchId, churchId)))
    .get();
  if (!row) throw notFound('Service');
  return row;
}

export function loadServiceType(db: Queryable, churchId: string, id: string): ServiceTypeRow {
  const row = db
    .select()
    .from(serviceTypes)
    .where(and(eq(serviceTypes.id, id), eq(serviceTypes.churchId, churchId)))
    .get();
  if (!row) throw notFound('Service type');
  return row;
}

export function loadSong(db: Queryable, churchId: string, id: string): SongRow {
  const row = db
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), eq(songs.churchId, churchId)))
    .get();
  if (!row) throw notFound('Song');
  return row;
}

export function loadTeam(db: Queryable, churchId: string, id: string): ServingTeamRow {
  const row = db
    .select()
    .from(servingTeams)
    .where(and(eq(servingTeams.id, id), eq(servingTeams.churchId, churchId)))
    .get();
  if (!row) throw notFound('Serving team');
  return row;
}

export function loadPosition(db: Queryable, churchId: string, id: string): ServingPositionRow {
  const row = db
    .select()
    .from(servingPositions)
    .where(and(eq(servingPositions.id, id), eq(servingPositions.churchId, churchId)))
    .get();
  if (!row) throw notFound('Position');
  return row;
}

export function loadPerson(db: Queryable, churchId: string, id: string): PersonRow {
  const row = db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.churchId, churchId)))
    .get();
  if (!row) throw notFound('Person');
  return row;
}

export function loadAssignment(db: Queryable, churchId: string, id: string): RosterAssignmentRow {
  const row = db
    .select()
    .from(rosterAssignments)
    .where(and(eq(rosterAssignments.id, id), eq(rosterAssignments.churchId, churchId)))
    .get();
  if (!row) throw notFound('Assignment');
  return row;
}

/** Throws 404 unless every id names a row of the church (song and person references). */
export function assertAllInChurch(
  rows: readonly { id: string }[],
  ids: readonly (string | null | undefined)[],
  what: string,
): void {
  const known = new Set(rows.map((row) => row.id));
  for (const id of ids) {
    if (id && !known.has(id)) throw notFound(what);
  }
}

/** "Sun 26 Oct, 07:00" in the church time zone, for notification bodies. */
export function serviceWhen(startsAt: string, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(new Date(startsAt));
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).format(new Date(startsAt));
  }
}

export const serviceLink = (churchId: string, serviceId: string, tab?: string): string =>
  `/c/${churchId}/worship/services/${serviceId}${tab ? `?tab=${tab}` : ''}`;
