import type { Event } from '@tatagereja/shared';
import { count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { EventRow } from '../db/schema';
import { eventParticipants, groups } from '../db/schema';
import { toEvent } from '../serializers';

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
