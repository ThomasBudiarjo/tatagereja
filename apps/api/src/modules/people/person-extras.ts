import {
  addFamilyMemberBodySchema,
  assignAreaBodySchema,
  can,
  canEditPersonPrivacy,
  canEditPersonProfile,
  canSeeGroup,
  churchIdParamsSchema,
  fullName,
  has,
  PEOPLE_LIMITS,
  personPrivacyInputSchema,
  setCustomFieldValuesBodySchema,
  setPersonTagsBodySchema,
  type PersonTimelineItem,
} from '@tatagereja/shared';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import {
  areas,
  attendanceRecords,
  attendanceSessions,
  groupMembers,
  groups,
  householdMembers,
  households,
  people,
  personAreas,
  personPrivacySettings,
  registryRecordPeople,
  registryRecords,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { moduleEnabled } from '../../services/modules';
import {
  groupIdsOfPerson,
  householdLinksByPerson,
  hydrateDirectoryOne,
  privacyByPerson,
  privacyOf,
} from '../../services/people';
import {
  customFieldsOf,
  loadPersonRow,
  saveCustomFieldValues,
  savePersonTags,
} from '../../services/people-fields';
import { hydrateHousehold } from '../../services/people-households';
import { editScopeOf } from '../people';

/** Privacy, tags, custom fields, area, timeline and "add family member" on one person. */
export const personExtrasRouter = (deps: Deps) => {
  const { db } = deps;

  return new Elysia({ prefix: '/churches/:churchId/people' })
    .use(authPlugin(deps))
    .put(
      '/:id/privacy',
      ({ church, access, audit, params, body }) => {
        const person = loadPersonRow(db, church.id, params.id);
        if (!canEditPersonPrivacy(access, person)) {
          throw forbidden("You cannot change this person's privacy");
        }
        const before = privacyOf(privacyByPerson(db, [person.id]), person.id);
        const now = nowIso();
        db.transaction((tx) => {
          tx.insert(personPrivacySettings)
            .values({
              personId: person.id,
              churchId: church.id,
              ...body,
              updatedBy: access.userId,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: personPrivacySettings.personId,
              set: { ...body, updatedBy: access.userId, updatedAt: now },
            })
            .run();
          const diff = changes(before, body);
          if (diff.after) {
            recordAudit(tx, audit, {
              module: 'people',
              action: 'person.privacy_update',
              entityType: 'person',
              entityId: person.id,
              summary: `Changed the directory privacy of ${fullName(person)}`,
              ...diff,
            });
          }
        });
        return { privacy: body };
      },
      { church: 'people', params: churchIdParamsSchema, body: personPrivacyInputSchema },
    )
    .put(
      '/:id/tags',
      ({ church, access, params, body }) => {
        const person = loadPersonRow(db, church.id, params.id);
        if (!has(access, 'people.edit')) throw forbidden('You cannot change tags');
        db.transaction((tx) => savePersonTags(tx, church.id, person.id, body.tagIds));
        return { person: hydrateDirectoryOne(db, access, person) };
      },
      { church: 'people', params: churchIdParamsSchema, body: setPersonTagsBodySchema },
    )
    .put(
      '/:id/fields',
      ({ church, access, params, body }) => {
        const person = loadPersonRow(db, church.id, params.id);
        if (!canEditPersonProfile(access, person, editScopeOf(deps, church, access, person))) {
          throw forbidden('You cannot edit this person');
        }
        db.transaction((tx) =>
          saveCustomFieldValues(tx, access, person, body.values, { pathPrefix: 'values' }),
        );
        return { customFields: customFieldsOf(db, access, person) };
      },
      { church: 'people', params: churchIdParamsSchema, body: setCustomFieldValuesBodySchema },
    )
    .put(
      '/:id/area',
      ({ church, access, params, body }) => {
        const person = loadPersonRow(db, church.id, params.id);
        if (!can.manageAreas(access)) throw forbidden('You cannot assign areas');
        db.transaction((tx) => {
          if (body.areaId === null) {
            tx.delete(personAreas).where(eq(personAreas.personId, person.id)).run();
            return;
          }
          const area = tx
            .select({ id: areas.id })
            .from(areas)
            .where(and(eq(areas.id, body.areaId), eq(areas.churchId, church.id)))
            .get();
          if (!area) throw notFound('Area');
          tx.insert(personAreas)
            .values({
              personId: person.id,
              churchId: church.id,
              areaId: area.id,
              assignedAt: nowIso(),
            })
            .onConflictDoUpdate({
              target: personAreas.personId,
              set: { areaId: area.id, assignedAt: nowIso() },
            })
            .run();
        });
        return { person: hydrateDirectoryOne(db, access, person) };
      },
      { church: 'people', params: churchIdParamsSchema, body: assignAreaBodySchema },
    )
    .get(
      '/:id/timeline',
      ({ church, access, params }) => {
        const person = loadPersonRow(db, church.id, params.id);
        const self = person.userId === access.userId || access.personId === person.id;
        const items: PersonTimelineItem[] = [];
        const base = `/c/${church.id}`;
        items.push({
          kind: 'note',
          date: person.createdAt,
          title: 'added',
          subtitle: null,
          link: null,
        });
        if (person.joinedAt) {
          items.push({
            kind: 'joined',
            date: person.joinedAt,
            title: person.membershipStatus,
            subtitle: null,
            link: null,
          });
        }
        if (moduleEnabled(church, 'records') && (has(access, 'records.view') || self)) {
          for (const row of db
            .select({
              id: registryRecords.id,
              type: registryRecords.type,
              subtype: registryRecords.subtype,
              number: registryRecords.number,
              date: registryRecords.date,
            })
            .from(registryRecordPeople)
            .innerJoin(registryRecords, eq(registryRecords.id, registryRecordPeople.recordId))
            .where(
              and(
                eq(registryRecordPeople.personId, person.id),
                eq(registryRecords.churchId, church.id),
                eq(registryRecords.status, 'active'),
              ),
            )
            .all()) {
            items.push({
              kind: 'record',
              date: row.date,
              title: row.type === 'custom' && row.subtype ? row.subtype : row.type,
              subtitle: row.number,
              link: `${base}/records`,
            });
          }
        }
        const mine = new Set(access.personId ? groupIdsOfPerson(db, access.personId) : []);
        for (const row of db
          .select({ group: groups, addedAt: groupMembers.addedAt })
          .from(groupMembers)
          .innerJoin(groups, eq(groups.id, groupMembers.groupId))
          .where(eq(groupMembers.personId, person.id))
          .all()) {
          if (!canSeeGroup(access, row.group, mine.has(row.group.id))) continue;
          items.push({
            kind: 'group_joined',
            date: row.addedAt,
            title: row.group.name,
            subtitle: row.group.type,
            link: `${base}/groups/${row.group.id}`,
          });
        }
        const household = db
          .select({ id: households.id, name: households.name, addedAt: householdMembers.addedAt })
          .from(householdMembers)
          .innerJoin(households, eq(households.id, householdMembers.householdId))
          .where(eq(householdMembers.personId, person.id))
          .get();
        if (household) {
          items.push({
            kind: 'household',
            date: household.addedAt,
            title: household.name,
            subtitle: null,
            link: `${base}/households/${household.id}`,
          });
        }
        let attendance = { present: 0, total: 0, lastPresentAt: null as string | null };
        if (can.viewPersonAttendance(access, person, groupIdsOfPerson(db, person.id))) {
          const totals = db
            .select({
              total: count(),
              present: sql<number>`sum(case when ${attendanceRecords.status} = 'present' then 1 else 0 end)`,
            })
            .from(attendanceRecords)
            .where(eq(attendanceRecords.personId, person.id))
            .get();
          const last = db
            .select({ title: attendanceSessions.title, sessionAt: attendanceSessions.sessionAt })
            .from(attendanceRecords)
            .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
            .where(
              and(
                eq(attendanceRecords.personId, person.id),
                eq(attendanceRecords.status, 'present'),
              ),
            )
            .orderBy(desc(attendanceSessions.sessionAt))
            .limit(1)
            .get();
          attendance = {
            present: Number(totals?.present ?? 0),
            total: totals?.total ?? 0,
            lastPresentAt: last?.sessionAt ?? null,
          };
          if (last) {
            items.push({
              kind: 'attendance',
              date: last.sessionAt,
              title: last.title,
              subtitle: null,
              link: null,
            });
          }
        }
        items.sort((a, b) => b.date.localeCompare(a.date));
        return { items, attendance };
      },
      { church: { module: 'people', permission: 'people.view' }, params: churchIdParamsSchema },
    )
    .post(
      '/:id/family',
      ({ church, access, audit, params, body, set }) => {
        const anchor = loadPersonRow(db, church.id, params.id);
        if (!can.manageHouseholds(access) || !can.createPerson(access)) {
          throw forbidden('You cannot add family members');
        }
        const link = householdLinksByPerson(db, [anchor.id]).get(anchor.id);
        const now = nowIso();
        const result = db.transaction((tx) => {
          let household = link
            ? tx.select().from(households).where(eq(households.id, link.householdId)).get()
            : undefined;
          if (!household) {
            household = tx
              .insert(households)
              .values({
                id: newId(),
                churchId: church.id,
                name: `Keluarga ${anchor.lastName ?? anchor.firstName}`,
                address: anchor.address,
                phone: anchor.phone,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
              .get();
            tx.insert(householdMembers)
              .values({
                id: newId(),
                churchId: church.id,
                householdId: household.id,
                personId: anchor.id,
                relationship: body.anchorRelationship,
                isPrimaryContact: true,
                addedAt: now,
              })
              .run();
          }
          const memberCount =
            tx
              .select({ value: count() })
              .from(householdMembers)
              .where(eq(householdMembers.householdId, household.id))
              .get()?.value ?? 0;
          if (memberCount >= PEOPLE_LIMITS.householdMembersMax) {
            throw conflict('This household is full');
          }
          const person = tx
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
          tx.insert(householdMembers)
            .values({
              id: newId(),
              churchId: church.id,
              householdId: household.id,
              personId: person.id,
              relationship: body.relationship,
              isPrimaryContact: false,
              addedAt: now,
            })
            .run();
          recordAudit(tx, audit, {
            module: 'people',
            action: 'person.create',
            entityType: 'person',
            entityId: person.id,
            summary: `Added ${fullName(person)} to ${household.name}`,
            after: { firstName: person.firstName, householdId: household.id },
          });
          return { household, person };
        });
        set.status = 201;
        return {
          household: hydrateHousehold(db, access, result.household),
          person: hydrateDirectoryOne(db, access, result.person),
        };
      },
      { church: 'people', params: churchIdParamsSchema, body: addFamilyMemberBodySchema },
    );
};
