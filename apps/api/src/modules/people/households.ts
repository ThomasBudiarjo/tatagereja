import {
  PEOPLE_LIMITS,
  addHouseholdMemberBodySchema,
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  createFamilyMemberBodySchema,
  fullName,
  householdCreateSchema,
  householdInputSchema,
  householdListQuerySchema,
  idSchema,
  updateHouseholdMemberBodySchema,
  type HouseholdRelationship,
} from '@tatagereja/shared';
import { and, asc, count, eq, like, ne, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { HouseholdRow } from '../../db/schema';
import { areas, householdMembers, households, people } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { notify } from '../../services/notifications';
import { hydrateDirectoryOne } from '../../services/people';
import { loadPersonRow } from '../../services/people-fields';
import { hydrateHousehold, hydrateHouseholds } from '../../services/people-households';

const memberParamsSchema = churchIdParamsSchema.extend({ personId: idSchema });

const AUDITED_FIELDS = ['name', 'areaId', 'address', 'city', 'postalCode', 'phone'] as const;

/** Households (keluarga): shared address and phone, members with their relationship. */
export const householdsRouter = (deps: Deps) => {
  const { db } = deps;

  const loadHousehold = (churchId: string, id: string): HouseholdRow => {
    const row = db
      .select()
      .from(households)
      .where(and(eq(households.id, id), eq(households.churchId, churchId)))
      .get();
    if (!row) throw notFound('Household');
    return row;
  };

  const assertArea = (churchId: string, areaId: string | null) => {
    if (!areaId) return;
    const area = db
      .select({ id: areas.id })
      .from(areas)
      .where(and(eq(areas.id, areaId), eq(areas.churchId, churchId)))
      .get();
    if (!area) throw notFound('Area');
  };

  /**
   * Puts a person in a household, moving them out of their current one. A primary contact
   * replaces the previous one. Returns the household they left.
   */
  const placeMember = (
    tx: Queryable,
    household: HouseholdRow,
    member: { personId: string; relationship: HouseholdRelationship; isPrimaryContact: boolean },
  ): { id: string; name: string } | null => {
    const current = tx
      .select({ id: households.id, name: households.name, memberId: householdMembers.id })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .where(eq(householdMembers.personId, member.personId))
      .get();
    if (current?.id === household.id) {
      tx.update(householdMembers)
        .set({ relationship: member.relationship, isPrimaryContact: member.isPrimaryContact })
        .where(eq(householdMembers.id, current.memberId))
        .run();
    } else {
      const size =
        tx
          .select({ value: count() })
          .from(householdMembers)
          .where(eq(householdMembers.householdId, household.id))
          .get()?.value ?? 0;
      if (size >= PEOPLE_LIMITS.householdMembersMax) throw conflict('This household is full');
      if (current)
        tx.delete(householdMembers).where(eq(householdMembers.id, current.memberId)).run();
      tx.insert(householdMembers)
        .values({
          id: newId(),
          churchId: household.churchId,
          householdId: household.id,
          personId: member.personId,
          relationship: member.relationship,
          isPrimaryContact: member.isPrimaryContact,
          addedAt: nowIso(),
        })
        .run();
    }
    if (member.isPrimaryContact) {
      tx.update(householdMembers)
        .set({ isPrimaryContact: false })
        .where(
          and(
            eq(householdMembers.householdId, household.id),
            ne(householdMembers.personId, member.personId),
          ),
        )
        .run();
    }
    return current && current.id !== household.id ? { id: current.id, name: current.name } : null;
  };

  const notifyAdded = (
    tx: Queryable,
    churchId: string,
    actorUserId: string,
    household: HouseholdRow,
    userIds: (string | null)[],
  ) => {
    const recipients = userIds.filter((id): id is string => !!id);
    if (recipients.length === 0) return;
    notify(tx, {
      churchId,
      userIds: recipients,
      excludeUserIds: [actorUserId],
      type: 'household.added',
      title: {
        id: `Anda ditambahkan ke ${household.name}`,
        en: `You were added to ${household.name}`,
      },
      link: `/c/${churchId}/households/${household.id}`,
      entityType: 'household',
      entityId: household.id,
    });
  };

  const requireManage = (access: Parameters<typeof can.manageHouseholds>[0]) => {
    if (!can.manageHouseholds(access)) throw forbidden('You cannot manage households');
  };

  return new Elysia({ prefix: '/churches/:churchId/households' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const conditions: SQL[] = [eq(households.churchId, church.id)];
        if (query.q) conditions.push(like(households.name, likePattern(query.q)));
        if (query.areaId) conditions.push(eq(households.areaId, query.areaId));
        const where = and(...conditions);
        const total = db.select({ value: count() }).from(households).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(households)
          .where(where)
          .orderBy(asc(households.name))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateHouseholds(db, access, rows),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { module: 'people', permission: 'people.view' },
        params: churchParamsSchema,
        query: householdListQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, access, auth, body, set }) => {
        requireManage(access);
        assertArea(church.id, body.areaId);
        const { members, ...input } = body;
        const personIds = [...new Set(members.map((member) => member.personId))];
        for (const personId of personIds) loadPersonRow(db, church.id, personId);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const household = tx
            .insert(households)
            .values({ id: newId(), churchId: church.id, ...input, createdAt: now, updatedAt: now })
            .returning()
            .get();
          for (const member of members) placeMember(tx, household, member);
          const userIds = personIds.map(
            (id) =>
              tx.select({ userId: people.userId }).from(people).where(eq(people.id, id)).get()
                ?.userId ?? null,
          );
          notifyAdded(tx, church.id, auth.user.id, household, userIds);
          return household;
        });
        set.status = 201;
        return { household: hydrateHousehold(db, access, row) };
      },
      { church: 'people', params: churchParamsSchema, body: householdCreateSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => ({
        household: hydrateHousehold(db, access, loadHousehold(church.id, params.id)),
        canManage: can.manageHouseholds(access),
        canAddPeople: can.manageHouseholds(access) && can.createPerson(access),
      }),
      { church: { module: 'people', permission: 'people.view' }, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, audit, params, body }) => {
        requireManage(access);
        const household = loadHousehold(church.id, params.id);
        assertArea(church.id, body.areaId);
        const updated = db.transaction((tx) => {
          const row = tx
            .update(households)
            .set({ ...body, updatedAt: nowIso() })
            .where(eq(households.id, household.id))
            .returning()
            .get();
          if (!row) throw notFound('Household');
          const pick = (value: HouseholdRow) =>
            Object.fromEntries(AUDITED_FIELDS.map((key) => [key, value[key]]));
          const diff = changes(pick(household), pick(row));
          if (diff.after) {
            recordAudit(tx, audit, {
              module: 'people',
              action: 'household.update',
              entityType: 'household',
              entityId: row.id,
              summary: `Updated the household ${row.name}`,
              ...diff,
            });
          }
          return row;
        });
        return { household: hydrateHousehold(db, access, updated) };
      },
      { church: 'people', params: churchIdParamsSchema, body: householdInputSchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        requireManage(access);
        const household = loadHousehold(church.id, params.id);
        db.transaction((tx) => {
          const size =
            tx
              .select({ value: count() })
              .from(householdMembers)
              .where(eq(householdMembers.householdId, household.id))
              .get()?.value ?? 0;
          recordAudit(tx, audit, {
            module: 'people',
            action: 'household.delete',
            entityType: 'household',
            entityId: household.id,
            summary: `Deleted the household ${household.name} (${size} members kept in the directory)`,
            before: { name: household.name, members: size },
          });
          tx.delete(households).where(eq(households.id, household.id)).run();
        });
        return { ok: true as const };
      },
      { church: 'people', params: churchIdParamsSchema },
    )
    .post(
      '/:id/members',
      ({ church, access, auth, params, body }) => {
        requireManage(access);
        const household = loadHousehold(church.id, params.id);
        const person = loadPersonRow(db, church.id, body.personId);
        const movedFrom = db.transaction((tx) => {
          const moved = placeMember(tx, household, body);
          notifyAdded(tx, church.id, auth.user.id, household, [person.userId]);
          return moved;
        });
        return { household: hydrateHousehold(db, access, household), movedFrom };
      },
      { church: 'people', params: churchIdParamsSchema, body: addHouseholdMemberBodySchema },
    )
    .patch(
      '/:id/members/:personId',
      ({ church, access, params, body }) => {
        requireManage(access);
        const household = loadHousehold(church.id, params.id);
        const member = db
          .select({ id: householdMembers.id })
          .from(householdMembers)
          .where(
            and(
              eq(householdMembers.householdId, household.id),
              eq(householdMembers.personId, params.personId),
            ),
          )
          .get();
        if (!member) throw notFound('Household member');
        db.transaction((tx) => placeMember(tx, household, { personId: params.personId, ...body }));
        return { household: hydrateHousehold(db, access, household) };
      },
      { church: 'people', params: memberParamsSchema, body: updateHouseholdMemberBodySchema },
    )
    .delete(
      '/:id/members/:personId',
      ({ church, access, params }) => {
        requireManage(access);
        const household = loadHousehold(church.id, params.id);
        const deleted = db
          .delete(householdMembers)
          .where(
            and(
              eq(householdMembers.householdId, household.id),
              eq(householdMembers.personId, params.personId),
            ),
          )
          .returning({ id: householdMembers.id })
          .get();
        if (!deleted) throw notFound('Household member');
        return { household: hydrateHousehold(db, access, household) };
      },
      { church: 'people', params: memberParamsSchema },
    )
    .post(
      '/:id/family-members',
      ({ church, access, audit, params, body, set }) => {
        requireManage(access);
        if (!can.createPerson(access)) throw forbidden('You cannot add people');
        const household = loadHousehold(church.id, params.id);
        const now = nowIso();
        const person = db.transaction((tx) => {
          const row = tx
            .insert(people)
            .values({
              id: newId(),
              churchId: church.id,
              ...body.person,
              address: body.person.address ?? (body.copyContact ? household.address : null),
              phone: body.person.phone ?? (body.copyContact ? household.phone : null),
              userId: null,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          placeMember(tx, household, {
            personId: row.id,
            relationship: body.relationship,
            isPrimaryContact: false,
          });
          recordAudit(tx, audit, {
            module: 'people',
            action: 'person.create',
            entityType: 'person',
            entityId: row.id,
            summary: `Added ${fullName(row)} to ${household.name}`,
            after: { firstName: row.firstName, householdId: household.id },
          });
          return row;
        });
        set.status = 201;
        return {
          household: hydrateHousehold(db, access, household),
          person: hydrateDirectoryOne(db, access, person),
        };
      },
      { church: 'people', params: churchIdParamsSchema, body: createFamilyMemberBodySchema },
    );
};
