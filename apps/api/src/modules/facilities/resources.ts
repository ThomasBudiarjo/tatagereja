import {
  canManageFacilities,
  churchIdParamsSchema,
  churchParamsSchema,
  facilityResourceInputSchema,
  facilityResourceListQuerySchema,
  type FacilityResourceInput,
} from '@tatagereja/shared';
import { and, asc, eq, like, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { FacilityResourceRow } from '../../db/schema';
import { facilityResources } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, notFound } from '../../lib/errors';
import { likePattern } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { hydrateResources } from '../../services/facilities';
import { loadResource } from './load';

/** Who may see rooms, resources and their schedule. */
export const FACILITIES_VIEW = ['facilities.view', 'facilities.book', 'facilities.manage'] as const;

const snapshot = (row: FacilityResourceRow) => ({
  name: row.name,
  kind: row.kind,
  description: row.description,
  location: row.location,
  capacity: row.capacity,
  features: row.features,
  photoUrl: row.photoUrl,
  color: row.color,
  requiresApproval: row.requiresApproval,
  isActive: row.isActive,
});

/** Names are unique per church (case-insensitive), so pickers stay unambiguous. */
function assertNameFree(db: Queryable, churchId: string, name: string, exceptId?: string) {
  const clash = db
    .select({ id: facilityResources.id, name: facilityResources.name })
    .from(facilityResources)
    .where(eq(facilityResources.churchId, churchId))
    .all()
    .find(
      (row) => row.id !== exceptId && row.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
  if (clash) throw conflict(`A resource called ${clash.name} already exists`);
}

const values = (body: FacilityResourceInput) => ({
  name: body.name,
  kind: body.kind,
  description: body.description,
  location: body.location,
  capacity: body.capacity,
  features: [...new Set(body.features)],
  photoUrl: body.photoUrl,
  color: body.color,
  requiresApproval: body.requiresApproval,
  isActive: body.isActive,
});

/** Rooms and bookable resources: the sanctuary, halls, classrooms, vehicles, projectors. */
export const resourcesRouter = (deps: Deps) => {
  const { db } = deps;

  const hydrateOne = (churchId: string, row: FacilityResourceRow) => {
    const [resource] = hydrateResources(db, churchId, [row]);
    if (!resource) throw notFound('Resource');
    return resource;
  };

  return new Elysia({ prefix: '/churches/:churchId/facilities/resources' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const conditions: SQL[] = [eq(facilityResources.churchId, church.id)];
        // Inactive resources are hidden from everyone but the managers.
        if (!query.includeInactive || !canManageFacilities(access)) {
          conditions.push(eq(facilityResources.isActive, true));
        }
        if (query.kind) conditions.push(eq(facilityResources.kind, query.kind));
        if (query.q) {
          const pattern = likePattern(query.q);
          const match = or(
            like(facilityResources.name, pattern),
            like(facilityResources.location, pattern),
          );
          if (match) conditions.push(match);
        }
        const rows = db
          .select()
          .from(facilityResources)
          .where(and(...conditions))
          .orderBy(asc(facilityResources.name))
          .all();
        return { items: hydrateResources(db, church.id, rows) };
      },
      {
        church: { module: 'facilities', permission: FACILITIES_VIEW },
        params: churchParamsSchema,
        query: facilityResourceListQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, audit, body, set }) => {
        assertNameFree(db, church.id, body.name);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(facilityResources)
            .values({
              id: newId(),
              churchId: church.id,
              ...values(body),
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'resource.create',
            entityType: 'facility_resource',
            entityId: created.id,
            summary: `Added the resource ${created.name}`,
            after: snapshot(created),
          });
          return created;
        });
        set.status = 201;
        return { resource: hydrateOne(church.id, row) };
      },
      {
        church: { module: 'facilities', permission: 'facilities.manage' },
        params: churchParamsSchema,
        body: facilityResourceInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const row = loadResource(db, church.id, params.id);
        if (!row.isActive && !canManageFacilities(access)) throw notFound('Resource');
        return { resource: hydrateOne(church.id, row) };
      },
      {
        church: { module: 'facilities', permission: FACILITIES_VIEW },
        params: churchIdParamsSchema,
      },
    )
    .patch(
      '/:id',
      ({ church, audit, params, body }) => {
        const row = loadResource(db, church.id, params.id);
        assertNameFree(db, church.id, body.name, row.id);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(facilityResources)
            .set({ ...values(body), updatedAt: nowIso() })
            .where(eq(facilityResources.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Resource');
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'resource.update',
            entityType: 'facility_resource',
            entityId: row.id,
            summary: `Updated the resource ${next.name}`,
            ...changes(snapshot(row), snapshot(next)),
          });
          return next;
        });
        return { resource: hydrateOne(church.id, updated) };
      },
      {
        church: { module: 'facilities', permission: 'facilities.manage' },
        params: churchIdParamsSchema,
        body: facilityResourceInputSchema,
      },
    )
    .delete(
      '/:id',
      ({ church, audit, params }) => {
        const row = loadResource(db, church.id, params.id);
        // Bookings go with the resource (cascade); assets keep their record without the room.
        db.transaction((tx) => {
          tx.delete(facilityResources).where(eq(facilityResources.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'facilities',
            action: 'resource.delete',
            entityType: 'facility_resource',
            entityId: row.id,
            summary: `Deleted the resource ${row.name} and its bookings`,
            before: snapshot(row),
          });
        });
        return { ok: true as const };
      },
      {
        church: { module: 'facilities', permission: 'facilities.manage' },
        params: churchIdParamsSchema,
      },
    );
};
