import { and, eq, gt, ne, type SQL } from 'drizzle-orm';
import type { Queryable } from '../../db/client';
import type { ChurchRow, WorshipServiceRow } from '../../db/schema';
import { rosterAssignments, servingPositions, worshipServices } from '../../db/schema';
import { notify } from '../../services/notifications';
import { userIdsOfPeople } from '../../services/worship';
import { serviceLink, serviceWhen } from './load';

/*
 * Notifications to the people on a roster when it changes under them (roster.changed).
 * Only services still to come and not cancelled are worth a notice.
 */

/** Everyone on the roster of a service (with a login) hears that their assignment is gone. */
export function notifyRosterGone(
  tx: Queryable,
  church: ChurchRow,
  service: WorshipServiceRow,
  actorUserId: string,
  reason: 'cancelled' | 'deleted',
) {
  const personIds = tx
    .select({ personId: rosterAssignments.personId })
    .from(rosterAssignments)
    .where(
      and(eq(rosterAssignments.churchId, church.id), eq(rosterAssignments.serviceId, service.id)),
    )
    .all()
    .map((row) => row.personId);
  const userIds = [...userIdsOfPeople(tx, church.id, personIds).values()];
  if (userIds.length === 0) return;
  notify(tx, {
    churchId: church.id,
    userIds,
    excludeUserIds: [actorUserId],
    type: 'roster.changed',
    title:
      reason === 'cancelled'
        ? { id: `${service.title} dibatalkan`, en: `${service.title} was cancelled` }
        : {
            id: `${service.title} dihapus dari jadwal`,
            en: `${service.title} was removed from the schedule`,
          },
    body: {
      id: `${serviceWhen(service.startsAt, church.timezone, 'id')} · Anda tidak lagi bertugas di ibadah ini.`,
      en: `${serviceWhen(service.startsAt, church.timezone)} · You no longer serve at this service.`,
    },
    link:
      reason === 'cancelled' ? serviceLink(church.id, service.id) : `/c/${church.id}/worship/me`,
    entityType: 'service',
    entityId: service.id,
  });
}

/** The roster of a service hears that it moved, or that a cancelled service is back on. */
export function notifyServiceChanged(
  tx: Queryable,
  church: ChurchRow,
  service: WorshipServiceRow,
  actorUserId: string,
  change: 'moved' | 'restored',
) {
  if (new Date(service.startsAt).getTime() <= Date.now()) return;
  const personIds = tx
    .select({ personId: rosterAssignments.personId })
    .from(rosterAssignments)
    .where(
      and(
        eq(rosterAssignments.churchId, church.id),
        eq(rosterAssignments.serviceId, service.id),
        ne(rosterAssignments.status, 'declined'),
      ),
    )
    .all()
    .map((row) => row.personId);
  const userIds = [...userIdsOfPeople(tx, church.id, personIds).values()];
  if (userIds.length === 0) return;
  const when = serviceWhen(service.startsAt, church.timezone);
  const whenId = serviceWhen(service.startsAt, church.timezone, 'id');
  const place = service.location ? ` · ${service.location}` : '';
  notify(tx, {
    churchId: church.id,
    userIds,
    excludeUserIds: [actorUserId],
    type: 'roster.changed',
    title:
      change === 'moved'
        ? { id: `Waktu ${service.title} berubah`, en: `${service.title} has a new time` }
        : {
            id: `${service.title} kembali dijadwalkan`,
            en: `${service.title} is back on the schedule`,
          },
    body:
      change === 'moved'
        ? {
            id: `Sekarang ${whenId}${place}. Anda tetap dijadwalkan bertugas.`,
            en: `Now ${when}${place}. You are still scheduled to serve.`,
          }
        : {
            id: `${whenId} · Anda tetap dijadwalkan bertugas.`,
            en: `${when} · You are still scheduled to serve.`,
          },
    link: serviceLink(church.id, service.id, 'roster'),
    entityType: 'service',
    entityId: service.id,
  });
}

/**
 * Before assignments are deleted (one assignment, or every assignment in a position or team),
 * tells each volunteer of an upcoming service which positions they no longer serve in.
 */
export function notifyAssignmentsRemoved(
  tx: Queryable,
  church: ChurchRow,
  where: SQL,
  actorUserId: string,
) {
  const rows = tx
    .select({
      personId: rosterAssignments.personId,
      positionName: servingPositions.name,
      service: worshipServices,
    })
    .from(rosterAssignments)
    .innerJoin(worshipServices, eq(worshipServices.id, rosterAssignments.serviceId))
    .innerJoin(servingPositions, eq(servingPositions.id, rosterAssignments.positionId))
    .where(
      and(
        eq(rosterAssignments.churchId, church.id),
        ne(worshipServices.status, 'cancelled'),
        gt(worshipServices.startsAt, new Date().toISOString()),
        where,
      ),
    )
    .all();
  if (rows.length === 0) return;
  const users = userIdsOfPeople(
    tx,
    church.id,
    rows.map((row) => row.personId),
  );
  const grouped = new Map<
    string,
    { userId: string; service: WorshipServiceRow; positions: string[] }
  >();
  for (const row of rows) {
    const userId = users.get(row.personId);
    if (!userId) continue;
    const key = `${userId}:${row.service.id}`;
    const entry = grouped.get(key) ?? { userId, service: row.service, positions: [] };
    entry.positions.push(row.positionName);
    grouped.set(key, entry);
  }
  for (const { userId, service, positions } of grouped.values()) {
    notify(tx, {
      churchId: church.id,
      userIds: [userId],
      excludeUserIds: [actorUserId],
      type: 'roster.changed',
      title: {
        id: `Anda tidak lagi bertugas di ${service.title}`,
        en: `You no longer serve at ${service.title}`,
      },
      body: {
        id: `${positions.join(', ')} · ${serviceWhen(service.startsAt, church.timezone, 'id')}`,
        en: `${positions.join(', ')} · ${serviceWhen(service.startsAt, church.timezone)}`,
      },
      link: `/c/${church.id}/worship/me`,
      entityType: 'service',
      entityId: service.id,
    });
  }
}
