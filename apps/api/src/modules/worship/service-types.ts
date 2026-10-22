import {
  churchIdParamsSchema,
  churchParamsSchema,
  serviceTypeInputSchema,
} from '@tatagereja/shared';
import { and, asc, eq, ne } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { serviceTypes } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { loadServiceType } from './load';
import { toServiceType } from './serializers';

/** Ibadah Umum, Pemuda, Remaja, Sekolah Minggu, Doa, Hari Raya: the kinds of services planned. */
export const serviceTypesRouter = (deps: Deps) => {
  const { db } = deps;

  const assertNameFree = (churchId: string, name: string, exceptId?: string) => {
    const conditions = [eq(serviceTypes.churchId, churchId), eq(serviceTypes.name, name)];
    if (exceptId) conditions.push(ne(serviceTypes.id, exceptId));
    const taken = db
      .select({ id: serviceTypes.id })
      .from(serviceTypes)
      .where(and(...conditions))
      .get();
    if (taken) throw conflict('A service type with this name already exists');
  };

  return new Elysia({ prefix: '/churches/:churchId/worship/service-types' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church }) => ({
        items: db
          .select()
          .from(serviceTypes)
          .where(eq(serviceTypes.churchId, church.id))
          .orderBy(asc(serviceTypes.sortOrder), asc(serviceTypes.name))
          .all()
          .map(toServiceType),
      }),
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
      },
    )
    .post(
      '/',
      ({ church, audit, body, set }) => {
        assertNameFree(church.id, body.name);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(serviceTypes)
            .values({ id: newId(), churchId: church.id, ...body, createdAt: now, updatedAt: now })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'service_type.create',
            entityType: 'service_type',
            entityId: created.id,
            summary: `Added the service type ${created.name}`,
            after: toServiceType(created),
          });
          return created;
        });
        set.status = 201;
        return { serviceType: toServiceType(row) };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchParamsSchema,
        body: serviceTypeInputSchema,
      },
    )
    .patch(
      '/:id',
      ({ church, audit, params, body }) => {
        const before = loadServiceType(db, church.id, params.id);
        assertNameFree(church.id, body.name, before.id);
        const row = db.transaction((tx) => {
          const updated = tx
            .update(serviceTypes)
            .set({ ...body, updatedAt: nowIso() })
            .where(eq(serviceTypes.id, before.id))
            .returning()
            .get();
          if (!updated) throw notFound('Service type');
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'service_type.update',
            entityType: 'service_type',
            entityId: before.id,
            summary: `Updated the service type ${updated.name}`,
            ...changes(toServiceType(before), toServiceType(updated)),
          });
          return updated;
        });
        return { serviceType: toServiceType(row) };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
        body: serviceTypeInputSchema,
      },
    )
    .delete(
      '/:id',
      ({ church, audit, params }) => {
        const row = loadServiceType(db, church.id, params.id);
        // Services keep their own title; their type is cleared (`on delete set null`).
        db.transaction((tx) => {
          tx.delete(serviceTypes).where(eq(serviceTypes.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'service_type.delete',
            entityType: 'service_type',
            entityId: row.id,
            summary: `Deleted the service type ${row.name}`,
            before: toServiceType(row),
          });
        });
        return { ok: true as const };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
      },
    );
};
