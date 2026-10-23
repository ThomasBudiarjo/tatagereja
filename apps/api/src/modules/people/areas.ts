import {
  areaAssignBodySchema,
  areaCoordinatorBodySchema,
  areaInputSchema,
  areaListQuerySchema,
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  idSchema,
} from '@tatagereja/shared';
import { and, asc, eq, inArray, ne, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { AreaRow } from '../../db/schema';
import {
  areaCoordinators,
  areas,
  churchMemberships,
  households,
  people,
  personAreas,
  users,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { notify } from '../../services/notifications';
import { coordinatedAreaIdsOf, todayIn } from '../../services/people';
import { hydrateArea, hydrateAreas } from '../../services/people-households';
import { peopleStats } from '../../services/people-stats';

const coordinatorParamsSchema = churchIdParamsSchema.extend({ userId: idSchema });

/** Areas (wilayah, sektor, rayon): coordinators and the households and people in them. */
export const areasRouter = (deps: Deps) => {
  const { db } = deps;

  const loadArea = (churchId: string, id: string): AreaRow => {
    const row = db
      .select()
      .from(areas)
      .where(and(eq(areas.id, id), eq(areas.churchId, churchId)))
      .get();
    if (!row) throw notFound('Area');
    return row;
  };

  const assertUniqueName = (churchId: string, name: string, exceptId?: string) => {
    const conditions: SQL[] = [eq(areas.churchId, churchId), eq(areas.name, name)];
    if (exceptId) conditions.push(ne(areas.id, exceptId));
    if (
      db
        .select({ id: areas.id })
        .from(areas)
        .where(and(...conditions))
        .get()
    ) {
      throw conflict('An area with this name already exists');
    }
  };

  const requireManage = (access: Parameters<typeof can.manageAreas>[0]) => {
    if (!can.manageAreas(access)) throw forbidden('You cannot manage areas');
  };

  return new Elysia({ prefix: '/churches/:churchId/areas' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => {
        const conditions: SQL[] = [eq(areas.churchId, church.id)];
        if (!query.includeInactive) conditions.push(eq(areas.isActive, true));
        const rows = db
          .select()
          .from(areas)
          .where(and(...conditions))
          .orderBy(asc(areas.sortOrder), asc(areas.name))
          .all()
          .filter(
            (row) =>
              !query.q ||
              `${row.name} ${row.code ?? ''}`.toLowerCase().includes(query.q.toLowerCase()),
          );
        return { items: hydrateAreas(db, church.id, rows) };
      },
      {
        church: { module: 'people', permission: 'people.view' },
        params: churchParamsSchema,
        query: areaListQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, access, audit, body, set }) => {
        requireManage(access);
        assertUniqueName(church.id, body.name);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const area = tx
            .insert(areas)
            .values({ id: newId(), churchId: church.id, ...body, createdAt: now, updatedAt: now })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'people',
            action: 'area.create',
            entityType: 'area',
            entityId: area.id,
            summary: `Created the area ${area.name}`,
            after: { name: area.name, code: area.code },
          });
          return area;
        });
        set.status = 201;
        return { area: hydrateArea(db, church.id, row) };
      },
      { church: 'people', params: churchParamsSchema, body: areaInputSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const area = loadArea(church.id, params.id);
        return {
          area: hydrateArea(db, church.id, area),
          stats: peopleStats(db, access, church.id, todayIn(church), area.id),
          canManage: can.manageAreas(access),
          isCoordinator: coordinatedAreaIdsOf(db, church.id, access.userId).includes(area.id),
        };
      },
      { church: { module: 'people', permission: 'people.view' }, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, audit, params, body }) => {
        requireManage(access);
        const area = loadArea(church.id, params.id);
        assertUniqueName(church.id, body.name, area.id);
        const updated = db.transaction((tx) => {
          const row = tx
            .update(areas)
            .set({ ...body, updatedAt: nowIso() })
            .where(eq(areas.id, area.id))
            .returning()
            .get();
          if (!row) throw notFound('Area');
          const pick = (value: AreaRow) => ({
            name: value.name,
            code: value.code,
            isActive: value.isActive,
          });
          const diff = changes(pick(area), pick(row));
          if (diff.after) {
            recordAudit(tx, audit, {
              module: 'people',
              action: 'area.update',
              entityType: 'area',
              entityId: row.id,
              summary: `Updated the area ${row.name}`,
              ...diff,
            });
          }
          return row;
        });
        return { area: hydrateArea(db, church.id, updated) };
      },
      { church: 'people', params: churchIdParamsSchema, body: areaInputSchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        requireManage(access);
        const area = loadArea(church.id, params.id);
        db.transaction((tx) => {
          recordAudit(tx, audit, {
            module: 'people',
            action: 'area.delete',
            entityType: 'area',
            entityId: area.id,
            summary: `Deleted the area ${area.name}`,
            before: { name: area.name, code: area.code },
          });
          tx.delete(areas).where(eq(areas.id, area.id)).run();
        });
        return { ok: true as const };
      },
      { church: 'people', params: churchIdParamsSchema },
    )
    .post(
      '/:id/assign',
      ({ church, access, params, body }) => {
        requireManage(access);
        const area = loadArea(church.id, params.id);
        const householdIds = [...new Set(body.householdIds)];
        const personIds = [...new Set(body.personIds)];
        if (householdIds.length > 0) {
          const found = db
            .select({ id: households.id })
            .from(households)
            .where(and(eq(households.churchId, church.id), inArray(households.id, householdIds)))
            .all();
          if (found.length !== householdIds.length) throw notFound('One or more households');
        }
        if (personIds.length > 0) {
          const found = db
            .select({ id: people.id })
            .from(people)
            .where(and(eq(people.churchId, church.id), inArray(people.id, personIds)))
            .all();
          if (found.length !== personIds.length) throw notFound('One or more people');
        }
        const now = nowIso();
        db.transaction((tx) => {
          if (householdIds.length > 0) {
            tx.update(households)
              .set({ areaId: area.id, updatedAt: now })
              .where(inArray(households.id, householdIds))
              .run();
          }
          for (const personId of personIds) {
            tx.insert(personAreas)
              .values({ personId, churchId: church.id, areaId: area.id, assignedAt: now })
              .onConflictDoUpdate({
                target: personAreas.personId,
                set: { areaId: area.id, assignedAt: now },
              })
              .run();
          }
        });
        return { area: hydrateArea(db, church.id, area) };
      },
      { church: 'people', params: churchIdParamsSchema, body: areaAssignBodySchema },
    )
    .post(
      '/:id/coordinators',
      ({ church, access, audit, auth, params, body }) => {
        requireManage(access);
        const area = loadArea(church.id, params.id);
        const member = db
          .select({ name: users.name })
          .from(churchMemberships)
          .innerJoin(users, eq(users.id, churchMemberships.userId))
          .where(
            and(
              eq(churchMemberships.churchId, church.id),
              eq(churchMemberships.userId, body.userId),
              eq(churchMemberships.status, 'active'),
            ),
          )
          .get();
        if (!member) throw notFound('Church member');
        db.transaction((tx) => {
          const added = tx
            .insert(areaCoordinators)
            .values({
              id: newId(),
              churchId: church.id,
              areaId: area.id,
              userId: body.userId,
              assignedAt: nowIso(),
            })
            .onConflictDoNothing()
            .returning({ id: areaCoordinators.id })
            .get();
          if (!added) return;
          recordAudit(tx, audit, {
            module: 'people',
            action: 'area.coordinator_assign',
            entityType: 'area',
            entityId: area.id,
            summary: `Made ${member.name} a coordinator of ${area.name}`,
            after: { userId: body.userId },
          });
          notify(tx, {
            churchId: church.id,
            userIds: [body.userId],
            excludeUserIds: [auth.user.id],
            type: 'area.coordinator_assigned',
            title: {
              id: `Anda menjadi koordinator ${area.name}`,
              en: `You coordinate ${area.name}`,
            },
            body: {
              id: 'Anda kini dapat memperbarui data jemaat di wilayah ini.',
              en: 'You can now update the profiles of people in this area.',
            },
            link: `/c/${church.id}/areas/${area.id}`,
            entityType: 'area',
            entityId: area.id,
          });
        });
        return { area: hydrateArea(db, church.id, area) };
      },
      { church: 'people', params: churchIdParamsSchema, body: areaCoordinatorBodySchema },
    )
    .delete(
      '/:id/coordinators/:userId',
      ({ church, access, audit, params }) => {
        requireManage(access);
        const area = loadArea(church.id, params.id);
        db.transaction((tx) => {
          const deleted = tx
            .delete(areaCoordinators)
            .where(
              and(eq(areaCoordinators.areaId, area.id), eq(areaCoordinators.userId, params.userId)),
            )
            .returning({ id: areaCoordinators.id })
            .get();
          if (!deleted) throw notFound('Area coordinator');
          recordAudit(tx, audit, {
            module: 'people',
            action: 'area.coordinator_remove',
            entityType: 'area',
            entityId: area.id,
            summary: `Removed a coordinator from ${area.name}`,
            before: { userId: params.userId },
          });
        });
        return { area: hydrateArea(db, church.id, area) };
      },
      { church: 'people', params: coordinatorParamsSchema },
    );
};
