import {
  DEFAULT_CHECKIN_CLASSES,
  checkinClassInputSchema,
  checkinClassListQuerySchema,
  churchIdParamsSchema,
  churchParamsSchema,
  fullName,
  setClassTeachersBodySchema,
  type CheckinClassInput,
} from '@tatagereja/shared';
import { and, count, eq, inArray } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { CheckinClassRow } from '../../db/schema';
import {
  checkinClasses,
  checkinClassTeachers,
  checkins,
  facilityResources,
  people,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, notFound, validationError } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { classRowsOf, hydrateClasses, loadClassRow } from '../../services/checkin';
import { notify } from '../../services/notifications';

const operate = { module: 'checkin', permission: ['checkin.operate', 'checkin.manage'] } as const;
const manage = { module: 'checkin', permission: 'checkin.manage' } as const;

const pick = (row: CheckinClassRow) => ({
  name: row.name,
  minAge: row.minAge,
  maxAge: row.maxAge,
  resourceId: row.resourceId,
  location: row.location,
  capacity: row.capacity,
  maxChildrenPerTeacher: row.maxChildrenPerTeacher,
  color: row.color,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
});

const assertResourceInChurch = (db: Queryable, churchId: string, resourceId: string | null) => {
  if (!resourceId) return;
  const resource = db
    .select({ id: facilityResources.id })
    .from(facilityResources)
    .where(and(eq(facilityResources.id, resourceId), eq(facilityResources.churchId, churchId)))
    .get();
  if (!resource) throw notFound('Room');
};

const assertUniqueName = (db: Queryable, churchId: string, name: string, exceptId?: string) => {
  const existing = db
    .select({ id: checkinClasses.id })
    .from(checkinClasses)
    .where(and(eq(checkinClasses.churchId, churchId), eq(checkinClasses.name, name)))
    .get();
  if (existing && existing.id !== exceptId) {
    throw validationError('A class with this name already exists', [
      { path: 'name', message: 'A class with this name already exists' },
    ]);
  }
};

const values = (body: CheckinClassInput) => ({
  name: body.name,
  minAge: body.minAge,
  maxAge: body.maxAge,
  resourceId: body.resourceId,
  location: body.location,
  capacity: body.capacity,
  maxChildrenPerTeacher: body.maxChildrenPerTeacher,
  color: body.color,
  sortOrder: body.sortOrder,
  isActive: body.isActive,
});

/** Sekolah Minggu classes by age and their teachers (Guru Sekolah Minggu). */
export const checkinClassesRouter = (deps: Deps) => {
  const { db } = deps;

  const hydrateOne = (row: CheckinClassRow) => hydrateClasses(db, [row])[0]!;

  return new Elysia({ prefix: '/churches/:churchId/checkin/classes' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => ({
        items: hydrateClasses(db, classRowsOf(db, church.id, query.includeInactive)),
      }),
      { church: operate, params: churchParamsSchema, query: checkinClassListQuerySchema },
    )
    .post(
      '/',
      ({ church, audit, body, set }) => {
        assertUniqueName(db, church.id, body.name);
        assertResourceInChurch(db, church.id, body.resourceId);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(checkinClasses)
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
            module: 'checkin',
            action: 'checkin_class.create',
            entityType: 'checkin_class',
            entityId: created.id,
            summary: `Created the class ${created.name}`,
            after: pick(created),
          });
          return created;
        });
        set.status = 201;
        return { class: hydrateOne(row) };
      },
      { church: manage, params: churchParamsSchema, body: checkinClassInputSchema },
    )
    .post(
      '/defaults',
      ({ church, audit, set }) => {
        const existing = new Set(classRowsOf(db, church.id).map((row) => row.name.toLowerCase()));
        const missing = DEFAULT_CHECKIN_CLASSES.filter(
          (item) => !existing.has(item.name.toLowerCase()),
        );
        const now = nowIso();
        db.transaction((tx) => {
          if (missing.length === 0) return;
          tx.insert(checkinClasses)
            .values(
              missing.map((item, index) => ({
                id: newId(),
                churchId: church.id,
                name: item.name,
                minAge: item.minAge,
                maxAge: item.maxAge,
                maxChildrenPerTeacher: 8,
                sortOrder: (index + 1) * 10,
                isActive: true,
                createdAt: now,
                updatedAt: now,
              })),
            )
            .run();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_class.create_defaults',
            entityType: 'checkin_class',
            summary: `Added the suggested classes: ${missing.map((item) => item.name).join(', ')}`,
          });
        });
        set.status = missing.length > 0 ? 201 : 200;
        return { items: hydrateClasses(db, classRowsOf(db, church.id)), created: missing.length };
      },
      { church: manage, params: churchParamsSchema },
    )
    .get(
      '/:id',
      ({ church, params }) => ({ class: hydrateOne(loadClassRow(db, church.id, params.id)) }),
      {
        church: operate,
        params: churchIdParamsSchema,
      },
    )
    .patch(
      '/:id',
      ({ church, audit, params, body }) => {
        const row = loadClassRow(db, church.id, params.id);
        assertUniqueName(db, church.id, body.name, row.id);
        assertResourceInChurch(db, church.id, body.resourceId);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(checkinClasses)
            .set({ ...values(body), updatedAt: nowIso() })
            .where(eq(checkinClasses.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Class');
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_class.update',
            entityType: 'checkin_class',
            entityId: row.id,
            summary: `Updated the class ${next.name}`,
            ...changes(pick(row), pick(next)),
          });
          return next;
        });
        return { class: hydrateOne(updated) };
      },
      { church: manage, params: churchIdParamsSchema, body: checkinClassInputSchema },
    )
    .delete(
      '/:id',
      ({ church, audit, params }) => {
        const row = loadClassRow(db, church.id, params.id);
        const used =
          db
            .select({ value: count() })
            .from(checkins)
            .where(and(eq(checkins.churchId, church.id), eq(checkins.classId, row.id)))
            .get()?.value ?? 0;
        if (used > 0) {
          throw conflict(
            'This class has check-in history. Turn it off instead, so its attendance stays',
          );
        }
        db.transaction((tx) => {
          tx.delete(checkinClasses).where(eq(checkinClasses.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_class.delete',
            entityType: 'checkin_class',
            entityId: row.id,
            summary: `Deleted the class ${row.name}`,
            before: pick(row),
          });
        });
        return { ok: true as const };
      },
      { church: manage, params: churchIdParamsSchema },
    )
    .put(
      '/:id/teachers',
      ({ church, access, audit, params, body }) => {
        const row = loadClassRow(db, church.id, params.id);
        const ids = [...new Set(body.teachers.map((teacher) => teacher.personId))];
        const found =
          ids.length === 0
            ? []
            : db
                .select({
                  id: people.id,
                  firstName: people.firstName,
                  lastName: people.lastName,
                  userId: people.userId,
                })
                .from(people)
                .where(and(eq(people.churchId, church.id), inArray(people.id, ids)))
                .all();
        if (found.length !== ids.length) throw notFound('Person');
        const before = db
          .select({ personId: checkinClassTeachers.personId, isLead: checkinClassTeachers.isLead })
          .from(checkinClassTeachers)
          .where(eq(checkinClassTeachers.classId, row.id))
          .all();
        const previous = new Set(before.map((teacher) => teacher.personId));
        const lead = new Map(body.teachers.map((teacher) => [teacher.personId, teacher.isLead]));
        const now = nowIso();
        db.transaction((tx) => {
          tx.delete(checkinClassTeachers).where(eq(checkinClassTeachers.classId, row.id)).run();
          if (ids.length > 0) {
            tx.insert(checkinClassTeachers)
              .values(
                ids.map((personId) => ({
                  id: newId(),
                  churchId: church.id,
                  classId: row.id,
                  personId,
                  isLead: lead.get(personId) ?? false,
                  assignedAt: now,
                })),
              )
              .run();
          }
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_class.teachers',
            entityType: 'checkin_class',
            entityId: row.id,
            summary: `Updated the teachers of ${row.name}`,
            ...changes(
              { teachers: before.map((teacher) => teacher.personId).sort() },
              { teachers: [...ids].sort() },
            ),
          });
          const added = found.filter((person) => !previous.has(person.id) && person.userId);
          if (added.length > 0) {
            notify(tx, {
              churchId: church.id,
              userIds: added.flatMap((person) => (person.userId ? [person.userId] : [])),
              excludeUserIds: [access.userId],
              type: 'checkin.teacher_assigned',
              title: {
                id: `Anda ditugaskan mengajar ${row.name}`,
                en: `You were asked to teach ${row.name}`,
              },
              body: 'Sekolah Minggu',
              link: `/c/${church.id}/checkin/classes`,
              entityType: 'checkin_class',
              entityId: row.id,
            });
          }
        });
        return {
          class: hydrateOne(row),
          added: found
            .filter((person) => !previous.has(person.id))
            .map((person) => fullName(person)),
        };
      },
      { church: manage, params: churchIdParamsSchema, body: setClassTeachersBodySchema },
    );
};
