import {
  canManageServices,
  churchIdParamsSchema,
  churchParamsSchema,
  liturgyTotalMinutes,
  reorderLiturgyBodySchema,
  saveLiturgyBodySchema,
  worshipServiceInputSchema,
  worshipServiceListQuerySchema,
  type WorshipServiceInput,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, WorshipServiceRow } from '../../db/schema';
import { liturgyItems, people, rosterAssignments, songs, worshipServices } from '../../db/schema';
import type { Deps } from '../../deps';
import { badRequest, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso, toUtcIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit, type AuditContext } from '../../services/audit';
import { notify } from '../../services/notifications';
import {
  canSeeDraftServices,
  hydrateServices,
  ledTeamIdsOf,
  loadLiturgy,
  loadRoster,
  schedulableTeamIds,
  userIdsOfPeople,
} from '../../services/worship';
import { assertAllInChurch, loadService, loadServiceType, serviceLink, serviceWhen } from './load';

/** A service counts as upcoming until it ends (two hours after the start without an end). */
const SERVICE_GRACE_MS = 2 * 60 * 60 * 1000;

export const upcomingCondition = (now: number): SQL =>
  or(
    and(
      isNotNull(worshipServices.endsAt),
      gte(worshipServices.endsAt, new Date(now).toISOString()),
    ),
    and(
      isNull(worshipServices.endsAt),
      gte(worshipServices.startsAt, new Date(now - SERVICE_GRACE_MS).toISOString()),
    ),
  )!;

const auditFields = (row: WorshipServiceRow) => ({
  serviceTypeId: row.serviceTypeId,
  title: row.title,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  location: row.location,
  theme: row.theme,
  scriptureReadings: row.scriptureReadings,
  preacherPersonId: row.preacherPersonId,
  preacherName: row.preacherName,
  notes: row.notes,
  status: row.status,
});

/** Tells everyone on the roster (with a login) that their assignment is gone. */
function notifyRosterGone(
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
        ? `${service.title} was cancelled`
        : `${service.title} was removed from the schedule`,
    body: `${serviceWhen(service.startsAt, church.timezone)} · You no longer serve at this service.`,
    link:
      reason === 'cancelled' ? serviceLink(church.id, service.id) : `/c/${church.id}/worship/me`,
    entityType: 'service',
    entityId: service.id,
  });
}

export const servicesRouter = (deps: Deps) => {
  const { db } = deps;

  /** Checks the referenced service type and preacher, and normalises the times to UTC. */
  const prepare = (churchId: string, body: WorshipServiceInput) => {
    if (body.serviceTypeId) loadServiceType(db, churchId, body.serviceTypeId);
    if (body.preacherPersonId) {
      const preacher = db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, body.preacherPersonId), eq(people.churchId, churchId)))
        .all();
      assertAllInChurch(preacher, [body.preacherPersonId], 'Preacher');
    }
    return {
      serviceTypeId: body.serviceTypeId,
      title: body.title,
      startsAt: toUtcIso(body.startsAt),
      endsAt: body.endsAt ? toUtcIso(body.endsAt) : null,
      location: body.location,
      theme: body.theme,
      scriptureReadings: body.scriptureReadings,
      preacherPersonId: body.preacherPersonId,
      preacherName: body.preacherPersonId ? null : body.preacherName,
      notes: body.notes,
      status: body.status,
    };
  };

  const hydrateOne = (row: WorshipServiceRow) => {
    const [service] = hydrateServices(db, [row]);
    if (!service) throw notFound('Service');
    return service;
  };

  /** Drafts are hidden from people who neither plan nor schedule, unless they serve in it. */
  const assertVisible = (
    church: ChurchRow,
    access: Parameters<typeof canSeeDraftServices>[0],
    ledTeamIds: string[],
    row: WorshipServiceRow,
  ) => {
    if (row.status !== 'draft' || canSeeDraftServices(access, ledTeamIds)) return;
    const serving =
      !!access.personId &&
      !!db
        .select({ id: rosterAssignments.id })
        .from(rosterAssignments)
        .where(
          and(
            eq(rosterAssignments.churchId, church.id),
            eq(rosterAssignments.serviceId, row.id),
            eq(rosterAssignments.personId, access.personId),
          ),
        )
        .get();
    if (!serving) throw notFound('Service');
  };

  const saveAudit = (
    tx: Queryable,
    audit: AuditContext,
    action: string,
    row: WorshipServiceRow,
    extra: { before?: unknown; after?: unknown },
    summary: string,
  ) =>
    recordAudit(tx, audit, {
      module: 'worship',
      action,
      entityType: 'service',
      entityId: row.id,
      summary,
      ...extra,
    });

  return new Elysia({ prefix: '/churches/:churchId/worship/services' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const ledTeamIds = ledTeamIdsOf(db, church.id, access.personId);
        const now = Date.now();
        const conditions: SQL[] = [eq(worshipServices.churchId, church.id)];
        if (!canSeeDraftServices(access, ledTeamIds)) {
          conditions.push(sql`${worshipServices.status} != 'draft'`);
        }
        const upcoming = upcomingCondition(now);
        if (query.scope === 'upcoming') conditions.push(upcoming);
        if (query.scope === 'past') conditions.push(sql`not (${upcoming})`);
        if (query.serviceTypeId)
          conditions.push(eq(worshipServices.serviceTypeId, query.serviceTypeId));
        if (query.status) conditions.push(eq(worshipServices.status, query.status));
        if (query.from) conditions.push(gte(worshipServices.startsAt, query.from));
        if (query.to) conditions.push(lt(worshipServices.startsAt, `${query.to}T23:59:59.999Z`));
        if (query.q) {
          const pattern = likePattern(query.q);
          const text = or(
            like(worshipServices.title, pattern),
            like(worshipServices.theme, pattern),
            like(worshipServices.preacherName, pattern),
          );
          if (text) conditions.push(text);
        }
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(worshipServices).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(worshipServices)
          .where(where)
          .orderBy(
            query.scope === 'upcoming'
              ? asc(worshipServices.startsAt)
              : desc(worshipServices.startsAt),
          )
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return { items: hydrateServices(db, rows), total, page: query.page, limit: query.limit };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
        query: worshipServiceListQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, auth, audit, body, set }) => {
        const values = prepare(church.id, body);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(worshipServices)
            .values({
              id: newId(),
              churchId: church.id,
              ...values,
              createdBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          saveAudit(
            tx,
            audit,
            'service.create',
            created,
            { after: auditFields(created) },
            `Planned ${created.title}`,
          );
          return created;
        });
        set.status = 201;
        return { service: hydrateOne(row) };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchParamsSchema,
        body: worshipServiceInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const row = loadService(db, church.id, params.id);
        const ledTeamIds = ledTeamIdsOf(db, church.id, access.personId);
        assertVisible(church, access, ledTeamIds, row);
        return {
          service: hydrateOne(row),
          liturgy: loadLiturgy(db, church.id, row.id),
          roster: loadRoster(db, church, row),
          canManage: canManageServices(access),
          schedulableTeamIds: schedulableTeamIds(db, church.id, access, ledTeamIds),
        };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
      },
    )
    .patch(
      '/:id',
      ({ church, access, audit, params, body }) => {
        const before = loadService(db, church.id, params.id);
        const values = prepare(church.id, body);
        const row = db.transaction((tx) => {
          const updated = tx
            .update(worshipServices)
            .set({ ...values, updatedAt: nowIso() })
            .where(eq(worshipServices.id, before.id))
            .returning()
            .get();
          if (!updated) throw notFound('Service');
          saveAudit(
            tx,
            audit,
            before.status !== 'cancelled' && updated.status === 'cancelled'
              ? 'service.cancel'
              : 'service.update',
            updated,
            changes(auditFields(before), auditFields(updated)),
            updated.status === 'cancelled' && before.status !== 'cancelled'
              ? `Cancelled ${updated.title}`
              : `Updated ${updated.title}`,
          );
          if (before.status !== 'cancelled' && updated.status === 'cancelled') {
            notifyRosterGone(tx, church, updated, access.userId, 'cancelled');
          }
          return updated;
        });
        return { service: hydrateOne(row) };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
        body: worshipServiceInputSchema,
      },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        const row = loadService(db, church.id, params.id);
        db.transaction((tx) => {
          if (row.status !== 'cancelled' && new Date(row.startsAt).getTime() > Date.now()) {
            notifyRosterGone(tx, church, row, access.userId, 'deleted');
          }
          tx.delete(worshipServices).where(eq(worshipServices.id, row.id)).run();
          saveAudit(
            tx,
            audit,
            'service.delete',
            row,
            { before: auditFields(row) },
            `Deleted ${row.title}`,
          );
        });
        return { ok: true as const };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
      },
    )
    .put(
      '/:id/liturgy',
      ({ church, audit, params, body }) => {
        const service = loadService(db, church.id, params.id);
        const songIds = [
          ...new Set(body.items.flatMap((item) => (item.songId ? [item.songId] : []))),
        ];
        if (songIds.length > 0) {
          const found = db
            .select({ id: songs.id })
            .from(songs)
            .where(and(eq(songs.churchId, church.id), inArray(songs.id, songIds)))
            .all();
          assertAllInChurch(found, songIds, 'Song');
        }
        const personIds = [
          ...new Set(body.items.flatMap((item) => (item.personId ? [item.personId] : []))),
        ];
        if (personIds.length > 0) {
          const found = db
            .select({ id: people.id })
            .from(people)
            .where(and(eq(people.churchId, church.id), inArray(people.id, personIds)))
            .all();
          assertAllInChurch(found, personIds, 'Person');
        }
        const now = nowIso();
        db.transaction((tx) => {
          const previous = tx
            .select({ value: count() })
            .from(liturgyItems)
            .where(eq(liturgyItems.serviceId, service.id))
            .get()?.value;
          tx.delete(liturgyItems).where(eq(liturgyItems.serviceId, service.id)).run();
          if (body.items.length > 0) {
            tx.insert(liturgyItems)
              .values(
                body.items.map((item, index) => ({
                  id: newId(),
                  churchId: church.id,
                  serviceId: service.id,
                  position: index,
                  type: item.type,
                  title: item.title,
                  durationMinutes: item.durationMinutes,
                  songId: item.type === 'song' ? item.songId : null,
                  songKey: item.type === 'song' ? item.songKey : null,
                  personId: item.personId,
                  personName: item.personId ? null : item.personName,
                  notes: item.notes,
                  createdAt: now,
                  updatedAt: now,
                })),
              )
              .run();
          }
          tx.update(worshipServices)
            .set({ updatedAt: now })
            .where(eq(worshipServices.id, service.id))
            .run();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'liturgy.update',
            entityType: 'service',
            entityId: service.id,
            summary: `Saved the liturgy of ${service.title}`,
            before: { items: previous ?? 0 },
            after: { items: body.items.length, totalMinutes: liturgyTotalMinutes(body.items) },
          });
        });
        const items = loadLiturgy(db, church.id, service.id);
        return { items, totalMinutes: liturgyTotalMinutes(items) };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
        body: saveLiturgyBodySchema,
      },
    )
    .post(
      '/:id/liturgy/reorder',
      ({ church, params, body }) => {
        const service = loadService(db, church.id, params.id);
        const existing = db
          .select({ id: liturgyItems.id })
          .from(liturgyItems)
          .where(and(eq(liturgyItems.churchId, church.id), eq(liturgyItems.serviceId, service.id)))
          .all()
          .map((row) => row.id);
        const wanted = new Set(body.itemIds);
        if (
          wanted.size !== body.itemIds.length ||
          wanted.size !== existing.length ||
          existing.some((id) => !wanted.has(id))
        ) {
          throw badRequest('Send every liturgy item of the service exactly once');
        }
        const now = nowIso();
        db.transaction((tx) => {
          body.itemIds.forEach((id, index) => {
            tx.update(liturgyItems)
              .set({ position: index, updatedAt: now })
              .where(and(eq(liturgyItems.id, id), eq(liturgyItems.serviceId, service.id)))
              .run();
          });
        });
        const items = loadLiturgy(db, church.id, service.id);
        return { items, totalMinutes: liturgyTotalMinutes(items) };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
        body: reorderLiturgyBodySchema,
      },
    );
};
