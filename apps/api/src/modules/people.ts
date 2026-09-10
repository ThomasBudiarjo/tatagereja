import {
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  isAdmin,
  linkPersonUserBodySchema,
  personInputSchema,
  personListQuerySchema,
  personPrivateDetailsInputSchema,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, inArray, like, or } from 'drizzle-orm';
import { Elysia } from 'elysia';
import {
  attendanceRecords,
  attendanceSessions,
  churchMemberships,
  groupMembers,
  groups,
  people,
  personPrivateDetails,
  users,
} from '../db/schema';
import type { Deps } from '../deps';
import { conflict, forbidden, notFound } from '../lib/errors';
import { likePattern, offsetOf } from '../lib/query';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toPerson, toPrivateDetails } from '../serializers';

export const peopleModule = (deps: Deps) => {
  const { db } = deps;

  const loadPerson = (churchId: string, id: string) => {
    const person = db
      .select()
      .from(people)
      .where(and(eq(people.id, id), eq(people.churchId, churchId)))
      .get();
    if (!person) throw notFound('Person');
    return person;
  };

  const groupIdsOf = (personId: string): string[] =>
    db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.personId, personId))
      .all()
      .map((row) => row.groupId);

  return new Elysia({ prefix: '/churches/:churchId/people' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => {
        const conditions = [eq(people.churchId, church.id)];
        if (query.status) conditions.push(eq(people.membershipStatus, query.status));
        if (query.q) {
          const pattern = likePattern(query.q);
          const search = or(
            like(people.firstName, pattern),
            like(people.lastName, pattern),
            like(people.email, pattern),
            like(people.phone, pattern),
          );
          if (search) conditions.push(search);
        }
        if (query.groupId) {
          conditions.push(
            inArray(
              people.id,
              db
                .select({ id: groupMembers.personId })
                .from(groupMembers)
                .where(eq(groupMembers.groupId, query.groupId)),
            ),
          );
        }
        const where = and(...conditions);
        const total = db.select({ value: count() }).from(people).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(people)
          .where(where)
          .orderBy(asc(people.firstName), asc(people.lastName))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return { items: rows.map(toPerson), total, page: query.page, limit: query.limit };
      },
      { church: true, params: churchParamsSchema, query: personListQuerySchema },
    )
    .post(
      '/',
      ({ church, access, body, set }) => {
        if (!can.createPerson(access)) throw forbidden('Only administrators can add people');
        const now = nowIso();
        const person = db
          .insert(people)
          .values({
            id: newId(),
            churchId: church.id,
            ...body,
            userId: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        set.status = 201;
        return { person: toPerson(person) };
      },
      { church: true, params: churchParamsSchema, body: personInputSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const person = loadPerson(church.id, params.id);
        const personGroups = db
          .select({ id: groups.id, name: groups.name })
          .from(groupMembers)
          .innerJoin(groups, eq(groups.id, groupMembers.groupId))
          .where(eq(groupMembers.personId, person.id))
          .orderBy(asc(groups.name))
          .all();
        const groupIds = personGroups.map((group) => group.id);
        const linkedUser = person.userId
          ? (db
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(eq(users.id, person.userId))
              .get() ?? null)
          : null;
        const canViewPrivate = can.viewPrivateDetails(access, person);
        const privateDetails = canViewPrivate
          ? db
              .select()
              .from(personPrivateDetails)
              .where(eq(personPrivateDetails.personId, person.id))
              .get()
          : undefined;
        return {
          person: toPerson(person),
          groups: personGroups,
          linkedUser,
          privateDetails: privateDetails ? toPrivateDetails(privateDetails) : null,
          canEdit: can.editPerson(access, person, groupIds),
          canDelete: can.deletePerson(access),
          canViewPrivate,
          canEditPrivate: can.editPrivateDetails(access, person),
          canLinkUser: can.linkPersonUser(access),
        };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, params, body }) => {
        const person = loadPerson(church.id, params.id);
        if (!can.editPerson(access, person, groupIdsOf(person.id))) {
          throw forbidden('You cannot edit this person');
        }
        // Membership status and join date are administrative fields.
        const patch = isAdmin(access)
          ? body
          : { ...body, membershipStatus: person.membershipStatus, joinedAt: person.joinedAt };
        const updated = db
          .update(people)
          .set({ ...patch, updatedAt: nowIso() })
          .where(eq(people.id, person.id))
          .returning()
          .get();
        if (!updated) throw notFound('Person');
        return { person: toPerson(updated) };
      },
      { church: true, params: churchIdParamsSchema, body: personInputSchema },
    )
    .delete(
      '/:id',
      ({ church, access, params }) => {
        const person = loadPerson(church.id, params.id);
        if (!can.deletePerson(access)) throw forbidden('Only administrators can delete people');
        db.delete(people).where(eq(people.id, person.id)).run();
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .put(
      '/:id/private',
      ({ church, access, params, body }) => {
        const person = loadPerson(church.id, params.id);
        if (!can.editPrivateDetails(access, person)) {
          throw forbidden('You cannot edit private details for this person');
        }
        const now = nowIso();
        const row = db
          .insert(personPrivateDetails)
          .values({ personId: person.id, churchId: church.id, ...body, updatedAt: now })
          .onConflictDoUpdate({
            target: personPrivateDetails.personId,
            set: { ...body, updatedAt: now },
          })
          .returning()
          .get();
        return { privateDetails: toPrivateDetails(row) };
      },
      { church: true, params: churchIdParamsSchema, body: personPrivateDetailsInputSchema },
    )
    .put(
      '/:id/user',
      ({ church, access, params, body }) => {
        const person = loadPerson(church.id, params.id);
        if (!can.linkPersonUser(access)) throw forbidden('Only administrators can link accounts');
        if (body.userId) {
          const membership = db
            .select({ id: churchMemberships.id })
            .from(churchMemberships)
            .where(
              and(
                eq(churchMemberships.churchId, church.id),
                eq(churchMemberships.userId, body.userId),
              ),
            )
            .get();
          if (!membership) throw notFound('Church member');
          const taken = db
            .select({ id: people.id })
            .from(people)
            .where(and(eq(people.churchId, church.id), eq(people.userId, body.userId)))
            .get();
          if (taken && taken.id !== person.id) {
            throw conflict('This account is already linked to another person');
          }
        }
        const updated = db
          .update(people)
          .set({ userId: body.userId, updatedAt: nowIso() })
          .where(eq(people.id, person.id))
          .returning()
          .get();
        if (!updated) throw notFound('Person');
        return { person: toPerson(updated) };
      },
      { church: true, params: churchIdParamsSchema, body: linkPersonUserBodySchema },
    )
    .get(
      '/:id/attendance',
      ({ church, access, params }) => {
        const person = loadPerson(church.id, params.id);
        const groupIds = groupIdsOf(person.id);
        const allowed =
          can.viewPrivateDetails(access, person) ||
          groupIds.some((groupId) => access.leaderGroupIds.includes(groupId));
        if (!allowed) throw forbidden("You cannot view this person's attendance");
        const rows = db
          .select({
            sessionId: attendanceSessions.id,
            title: attendanceSessions.title,
            sessionAt: attendanceSessions.sessionAt,
            groupName: groups.name,
            status: attendanceRecords.status,
          })
          .from(attendanceRecords)
          .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
          .leftJoin(groups, eq(groups.id, attendanceSessions.groupId))
          .where(eq(attendanceRecords.personId, person.id))
          .orderBy(desc(attendanceSessions.sessionAt))
          .limit(100)
          .all();
        return { items: rows.map((row) => ({ ...row, groupName: row.groupName ?? null })) };
      },
      { church: true, params: churchIdParamsSchema },
    );
};
