import {
  can,
  canEditPersonPrivacy,
  canEditPersonProfile,
  canSeeGroup,
  churchIdParamsSchema,
  churchParamsSchema,
  directoryQuerySchema,
  effectivePermissions,
  fullName,
  has,
  linkPersonUserBodySchema,
  personFormSchema,
  personPrivateDetailsInputSchema,
  type AccessLike,
  type PersonProfile,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ChurchRow, PersonRow } from '../db/schema';
import {
  attendanceRecords,
  attendanceSessions,
  careCases,
  churchMemberships,
  financeContributions,
  groupLeaders,
  groupMembers,
  groups,
  households,
  people,
  personPrivateDetails,
  personTags,
  registryRecordPeople,
  registryRecords,
  users,
} from '../db/schema';
import type { Deps } from '../deps';
import { conflict, forbidden, notFound } from '../lib/errors';
import { offsetOf } from '../lib/query';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toPrivateDetails } from '../serializers';
import { customRolesOf } from '../services/access';
import { changes, recordAudit, redact } from '../services/audit';
import { moduleEnabled } from '../services/modules';
import {
  assertDirectoryFilters,
  coordinatedAreaIdsOf,
  daysUntilSql,
  directoryConditions,
  effectiveAreaOf,
  groupIdsOfPerson,
  hiddenFieldsFor,
  householdLinksByPerson,
  hydrateDirectory,
  hydrateDirectoryOne,
  privacyByPerson,
  privacyOf,
  todayIn,
} from '../services/people';
import {
  customFieldsOf,
  loadPersonRow,
  saveCustomFieldValues,
  savePersonTags,
} from '../services/people-fields';
import { areaSummaries, hydrateHousehold } from '../services/people-households';

/** Private detail fields whose values never reach the audit log; only the change is noted. */
const PRIVATE_REDACTED_FIELDS = [
  'nationalId',
  'emergencyContactName',
  'emergencyContactPhone',
  'medicalNotes',
  'privateNotes',
];

/** What scopes a person's edit rights: their groups and their area. */
export function editScopeOf(
  deps: Deps,
  church: Pick<ChurchRow, 'id'>,
  access: AccessLike,
  person: Pick<PersonRow, 'id' | 'userId'>,
) {
  const { db } = deps;
  // The linked member's own permissions: scoped editors may not act on someone holding more.
  const membership = person.userId
    ? db
        .select()
        .from(churchMemberships)
        .where(
          and(
            eq(churchMemberships.churchId, church.id),
            eq(churchMemberships.userId, person.userId),
          ),
        )
        .get()
    : undefined;
  return {
    groupIds: groupIdsOfPerson(db, person.id),
    coordinatedAreaIds: coordinatedAreaIdsOf(db, church.id, access.userId),
    areaId: effectiveAreaOf(db, person.id).areaId,
    linkedPermissions: membership
      ? effectivePermissions(membership.role, customRolesOf(db, membership.id).permissionLists)
      : null,
  };
}

export const peopleModule = (deps: Deps) => {
  const { db } = deps;

  /** Groups the caller sees on someone's profile: public ones, and private ones they belong to. */
  const visibleGroupsOf = (access: AccessLike, personId: string, userId: string | null) => {
    const rows = db
      .select({ group: groups, addedAt: groupMembers.addedAt })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(eq(groupMembers.personId, personId))
      .orderBy(asc(groups.name))
      .all();
    const mine = new Set(access.personId ? groupIdsOfPerson(db, access.personId) : []);
    const led = new Set(
      userId
        ? db
            .select({ groupId: groupLeaders.groupId })
            .from(groupLeaders)
            .where(eq(groupLeaders.userId, userId))
            .all()
            .map((row) => row.groupId)
        : [],
    );
    return rows
      .filter(({ group }) => canSeeGroup(access, group, mine.has(group.id)))
      .map(({ group, addedAt }) => ({
        id: group.id,
        name: group.name,
        type: group.type,
        coverColor: group.coverColor,
        isLeader: led.has(group.id),
        addedAt,
      }));
  };

  /** Counts from optional modules, only when they are on and the caller may open them. */
  const otherModuleLinks = (
    church: ChurchRow,
    access: AccessLike,
    person: PersonRow,
  ): PersonProfile['links'] => {
    const self = person.userId === access.userId || access.personId === person.id;
    const care =
      moduleEnabled(church, 'care') && has(access, 'care.view')
        ? {
            open:
              db
                .select({ value: count() })
                .from(careCases)
                .where(
                  and(
                    eq(careCases.churchId, church.id),
                    eq(careCases.personId, person.id),
                    ne(careCases.status, 'closed'),
                    has(access, 'care.confidential')
                      ? undefined
                      : eq(careCases.confidentiality, 'normal'),
                  ),
                )
                .get()?.value ?? 0,
          }
        : null;
    const giving =
      moduleEnabled(church, 'finance') && (has(access, 'finance.view') || self)
        ? {
            count:
              db
                .select({ value: count() })
                .from(financeContributions)
                .where(
                  and(
                    eq(financeContributions.churchId, church.id),
                    eq(financeContributions.personId, person.id),
                    sql`${financeContributions.voidedAt} is null`,
                  ),
                )
                .get()?.value ?? 0,
          }
        : null;
    const records =
      moduleEnabled(church, 'records') && (has(access, 'records.view') || self)
        ? {
            count:
              db
                .select({ value: count() })
                .from(registryRecordPeople)
                .innerJoin(registryRecords, eq(registryRecords.id, registryRecordPeople.recordId))
                .where(
                  and(
                    eq(registryRecordPeople.personId, person.id),
                    eq(registryRecords.churchId, church.id),
                    eq(registryRecords.status, 'active'),
                  ),
                )
                .get()?.value ?? 0,
          }
        : null;
    return { care, giving, records };
  };

  const profileOf = (church: ChurchRow, access: AccessLike, person: PersonRow): PersonProfile => {
    const scope = editScopeOf(deps, church, access, person);
    const area = effectiveAreaOf(db, person.id);
    const link = householdLinksByPerson(db, [person.id]).get(person.id);
    const household = link
      ? db.select().from(households).where(eq(households.id, link.householdId)).get()
      : undefined;
    const self = person.userId === access.userId || access.personId === person.id;
    // The account e-mail is contact data: only for the person, account linkers and private viewers.
    const linkedUser =
      person.userId && (self || can.linkPersonUser(access) || has(access, 'people.private.view'))
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
    const directory = hydrateDirectoryOne(db, access, person);
    const tags =
      directory.tagIds.length > 0
        ? db
            .select({ id: personTags.id, name: personTags.name, color: personTags.color })
            .from(personTags)
            .where(inArray(personTags.id, directory.tagIds))
            .orderBy(asc(personTags.name))
            .all()
        : [];
    const privacy = privacyOf(privacyByPerson(db, [person.id]), person.id);
    const canEditPrivacy = canEditPersonPrivacy(access, person);
    const canEdit = canEditPersonProfile(access, person, scope);
    return {
      person: directory,
      groups: visibleGroupsOf(access, person.id, person.userId),
      linkedUser,
      privateDetails: privateDetails ? toPrivateDetails(privateDetails) : null,
      household: household ? hydrateHousehold(db, access, household) : null,
      area: area.areaId ? (areaSummaries(db, [area.areaId]).get(area.areaId) ?? null) : null,
      areaSource: area.source,
      tags,
      customFields: customFieldsOf(db, access, person),
      privacy: canEditPrivacy ? privacy : null,
      hiddenFields: hiddenFieldsFor(access, person, privacy),
      links: otherModuleLinks(church, access, person),
      canEdit,
      canDelete: can.deletePerson(access),
      canViewPrivate,
      canEditPrivate: can.editPrivateDetails(access, person),
      canLinkUser: can.linkPersonUser(access),
      canEditPrivacy,
      canEditTags: has(access, 'people.edit'),
      canEditFields: canEdit,
      canManageHousehold: can.manageHouseholds(access),
      canAddFamily: can.manageHouseholds(access) && can.createPerson(access),
      canAssignArea: can.manageAreas(access),
      canMerge: can.mergePeople(access),
      canViewAttendance: can.viewPersonAttendance(access, person, scope.groupIds),
    };
  };

  return new Elysia({ prefix: '/churches/:churchId/people' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        assertDirectoryFilters(db, access, church.id, query);
        const today = todayIn(church);
        const where = and(...directoryConditions(db, access, church.id, query, today));
        const total = db.select({ value: count() }).from(people).where(where).get()?.value ?? 0;
        const direction = query.order === 'desc' ? desc : asc;
        const byName = [
          direction(sql`${people.firstName} collate nocase`),
          direction(sql`coalesce(${people.lastName}, '') collate nocase`),
        ];
        const nullsLast = (value: SQL) => [asc(sql`${value} is null`), direction(value)];
        // Birthdays hidden from the caller sort as unknown, so the order reveals nothing.
        const birthday = has(access, 'people.private.view')
          ? daysUntilSql(people.birthDate, today)
          : sql`(case when coalesce((select show_birthday from person_privacy_settings where person_id = ${people.id}), 1) = 1 then ${daysUntilSql(people.birthDate, today)} end)`;
        const orderBy =
          query.sort === 'created'
            ? [direction(people.createdAt), ...byName]
            : query.sort === 'joined'
              ? [...nullsLast(sql`${people.joinedAt}`), ...byName]
              : query.sort === 'birthday'
                ? [...nullsLast(birthday), ...byName]
                : query.sort === 'anniversary'
                  ? [...nullsLast(daysUntilSql(people.weddingDate, today)), ...byName]
                  : byName;
        const rows = db
          .select()
          .from(people)
          .where(where)
          .orderBy(...orderBy)
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateDirectory(db, access, rows),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { module: 'people', permission: 'people.view' },
        params: churchParamsSchema,
        query: directoryQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, access, audit, body, set }) => {
        if (!can.createPerson(access)) throw forbidden('Only administrators can add people');
        const { tagIds, customFields, ...profile } = body;
        const now = nowIso();
        const person = db.transaction((tx) => {
          const row = tx
            .insert(people)
            .values({
              id: newId(),
              churchId: church.id,
              ...profile,
              userId: null,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          if (tagIds) savePersonTags(tx, church.id, row.id, tagIds);
          if (customFields) {
            saveCustomFieldValues(tx, access, row, customFields, { requireComplete: true });
          }
          recordAudit(tx, audit, {
            module: 'people',
            action: 'person.create',
            entityType: 'person',
            entityId: row.id,
            summary: `Added ${fullName(row)} to the directory`,
            after: {
              firstName: row.firstName,
              lastName: row.lastName,
              status: row.membershipStatus,
            },
          });
          return row;
        });
        set.status = 201;
        return { person: hydrateDirectoryOne(db, access, person) };
      },
      { church: 'people', params: churchParamsSchema, body: personFormSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) =>
        profileOf(church, access, loadPersonRow(db, church.id, params.id)),
      { church: { module: 'people', permission: 'people.view' }, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, audit, params, body }) => {
        const person = loadPersonRow(db, church.id, params.id);
        if (!canEditPersonProfile(access, person, editScopeOf(deps, church, access, person))) {
          throw forbidden('You cannot edit this person');
        }
        const { tagIds, customFields, ...profile } = body;
        if (tagIds && !has(access, 'people.edit')) throw forbidden('You cannot change tags');
        // Membership status and join date are administrative fields.
        const patch = can.editPersonAdminFields(access)
          ? { ...profile }
          : { ...profile, membershipStatus: person.membershipStatus, joinedAt: person.joinedAt };
        // The form cannot show contact fields the person hid from the caller; leaving one empty
        // keeps the stored value instead of erasing it.
        const hidden = hiddenFieldsFor(
          access,
          person,
          privacyOf(privacyByPerson(db, [person.id]), person.id),
        );
        for (const field of hidden) {
          const column = field === 'birthday' ? 'birthDate' : field;
          if (patch[column] === null) patch[column] = person[column];
        }
        const updated = db.transaction((tx) => {
          const row = tx
            .update(people)
            .set({ ...patch, updatedAt: nowIso() })
            .where(eq(people.id, person.id))
            .returning()
            .get();
          if (!row) throw notFound('Person');
          if (tagIds) savePersonTags(tx, church.id, row.id, tagIds);
          if (customFields) {
            saveCustomFieldValues(tx, access, row, customFields, { requireComplete: true });
          }
          const diff = changes(
            { membershipStatus: person.membershipStatus, joinedAt: person.joinedAt },
            { membershipStatus: row.membershipStatus, joinedAt: row.joinedAt },
          );
          if (diff.after) {
            recordAudit(tx, audit, {
              module: 'people',
              action: 'person.status_change',
              entityType: 'person',
              entityId: row.id,
              summary: `Changed the membership of ${fullName(row)}`,
              ...diff,
            });
          }
          return row;
        });
        return { person: hydrateDirectoryOne(db, access, updated) };
      },
      { church: 'people', params: churchIdParamsSchema, body: personFormSchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        const person = loadPersonRow(db, church.id, params.id);
        if (!can.deletePerson(access)) throw forbidden('Only administrators can delete people');
        db.transaction((tx) => {
          recordAudit(tx, audit, {
            module: 'people',
            action: 'person.delete',
            entityType: 'person',
            entityId: person.id,
            summary: `Deleted ${fullName(person)}`,
            before: {
              firstName: person.firstName,
              lastName: person.lastName,
              membershipStatus: person.membershipStatus,
              userId: person.userId,
            },
          });
          tx.delete(people).where(eq(people.id, person.id)).run();
        });
        return { ok: true as const };
      },
      { church: 'people', params: churchIdParamsSchema },
    )
    .put(
      '/:id/private',
      ({ church, access, audit, params, body }) => {
        const person = loadPersonRow(db, church.id, params.id);
        if (!can.editPrivateDetails(access, person)) {
          throw forbidden('You cannot edit private details for this person');
        }
        const now = nowIso();
        const row = db.transaction((tx) => {
          const existing = tx
            .select()
            .from(personPrivateDetails)
            .where(eq(personPrivateDetails.personId, person.id))
            .get();
          const saved = tx
            .insert(personPrivateDetails)
            .values({ personId: person.id, churchId: church.id, ...body, updatedAt: now })
            .onConflictDoUpdate({
              target: personPrivateDetails.personId,
              set: { ...body, updatedAt: now },
            })
            .returning()
            .get();
          const { updatedAt: _before, ...previous } = existing
            ? toPrivateDetails(existing)
            : { updatedAt: null };
          const { updatedAt: _after, personId: _id, ...next } = toPrivateDetails(saved);
          const diff = changes(previous as Record<string, unknown>, next);
          if (diff.after) {
            recordAudit(tx, audit, {
              module: 'people',
              action: 'person.private_update',
              entityType: 'person',
              entityId: person.id,
              summary: `Updated private details of ${fullName(person)} (${Object.keys(diff.after).join(', ')})`,
              before: diff.before && redact(diff.before, PRIVATE_REDACTED_FIELDS),
              after: redact(diff.after, PRIVATE_REDACTED_FIELDS),
            });
          }
          return saved;
        });
        return { privateDetails: toPrivateDetails(row) };
      },
      { church: 'people', params: churchIdParamsSchema, body: personPrivateDetailsInputSchema },
    )
    .put(
      '/:id/user',
      ({ church, access, audit, params, body }) => {
        const person = loadPersonRow(db, church.id, params.id);
        if (!can.linkPersonUser(access)) throw forbidden('Only administrators can link accounts');
        // A linked account sees the record's private details as its own profile.
        if (
          body.userId === access.userId &&
          person.userId !== access.userId &&
          !has(access, 'people.private.view')
        ) {
          throw forbidden('Ask another administrator to link your own account');
        }
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
        const updated = db.transaction((tx) => {
          const row = tx
            .update(people)
            .set({ userId: body.userId, updatedAt: nowIso() })
            .where(eq(people.id, person.id))
            .returning()
            .get();
          if (!row) throw notFound('Person');
          if (person.userId !== body.userId) {
            recordAudit(tx, audit, {
              module: 'people',
              action: body.userId ? 'person.link_user' : 'person.unlink_user',
              entityType: 'person',
              entityId: person.id,
              summary: body.userId
                ? `Linked ${fullName(person)} to a member account`
                : `Unlinked ${fullName(person)} from their member account`,
              before: { userId: person.userId },
              after: { userId: body.userId },
            });
          }
          return row;
        });
        return { person: hydrateDirectoryOne(db, access, updated) };
      },
      { church: 'people', params: churchIdParamsSchema, body: linkPersonUserBodySchema },
    )
    .get(
      '/:id/attendance',
      ({ church, access, params }) => {
        const person = loadPersonRow(db, church.id, params.id);
        if (!can.viewPersonAttendance(access, person, groupIdsOfPerson(db, person.id))) {
          throw forbidden("You cannot view this person's attendance");
        }
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
      { church: 'people', params: churchIdParamsSchema },
    );
};
