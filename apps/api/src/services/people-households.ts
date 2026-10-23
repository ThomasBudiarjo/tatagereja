import {
  HOUSEHOLD_RELATIONSHIPS,
  canSeeHiddenContact,
  has,
  type AccessLike,
  type Area,
  type AreaSummary,
  type Household,
  type HouseholdMember,
} from '@tatagereja/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { Queryable } from '../db/client';
import type { AreaRow, HouseholdRow } from '../db/schema';
import {
  areaCoordinators,
  areas,
  householdMembers,
  households,
  people,
  personAreas,
  users,
} from '../db/schema';
import { privacyByPerson, privacyOf } from './people';

/** Household members are listed head first, then spouse, children, parents and others. */
const RELATIONSHIP_RANK = new Map(HOUSEHOLD_RELATIONSHIPS.map((value, index) => [value, index]));

export const toAreaSummary = (
  row: Pick<AreaRow, 'id' | 'name' | 'code' | 'color'>,
): AreaSummary => ({
  id: row.id,
  name: row.name,
  code: row.code,
  color: row.color,
});

/** Area summaries by id, for the areas named on households and people. */
export function areaSummaries(
  db: Queryable,
  areaIds: readonly (string | null)[],
): Map<string, AreaSummary> {
  const ids = [...new Set(areaIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  return new Map(
    db
      .select({ id: areas.id, name: areas.name, code: areas.code, color: areas.color })
      .from(areas)
      .where(inArray(areas.id, ids))
      .all()
      .map((row) => [row.id, toAreaSummary(row)]),
  );
}

/**
 * Households with their members. Family contact details are shared, so they follow the
 * privacy choices of the head (or primary contact) unless the caller may see hidden contact
 * fields, manages households, or belongs to the family.
 */
export function hydrateHouseholds(
  db: Queryable,
  access: AccessLike,
  rows: readonly HouseholdRow[],
): Household[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const memberRows = db
    .select({ member: householdMembers, person: people })
    .from(householdMembers)
    .innerJoin(people, eq(people.id, householdMembers.personId))
    .where(inArray(householdMembers.householdId, ids))
    .all();
  const privacy = privacyByPerson(
    db,
    memberRows.map((row) => row.person.id),
  );
  const byHousehold = new Map<string, typeof memberRows>();
  for (const row of memberRows) {
    const list = byHousehold.get(row.member.householdId) ?? [];
    list.push(row);
    byHousehold.set(row.member.householdId, list);
  }
  const summaries = areaSummaries(
    db,
    rows.map((row) => row.areaId),
  );
  const seesAll = has(access, 'people.private.view') || has(access, 'households.manage');

  return rows.map((row) => {
    const list = (byHousehold.get(row.id) ?? []).sort(
      (a, b) =>
        (RELATIONSHIP_RANK.get(a.member.relationship) ?? 9) -
          (RELATIONSHIP_RANK.get(b.member.relationship) ?? 9) ||
        (a.person.birthDate ?? '9999').localeCompare(b.person.birthDate ?? '9999') ||
        a.person.firstName.localeCompare(b.person.firstName),
    );
    const members: HouseholdMember[] = list.map(({ member, person }) => {
      const showBirthday =
        canSeeHiddenContact(access, person) || privacyOf(privacy, person.id).showBirthday;
      return {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        photoUrl: person.photoUrl,
        membershipStatus: person.membershipStatus,
        relationship: member.relationship,
        isPrimaryContact: member.isPrimaryContact,
        birthDate: showBirthday ? person.birthDate : null,
        gender: person.gender,
      };
    });
    const isFamily = access.personId !== null && list.some((m) => m.person.id === access.personId);
    const contact =
      list.find((m) => m.member.isPrimaryContact) ??
      list.find((m) => m.member.relationship === 'head');
    const contactPrivacy = contact ? privacyOf(privacy, contact.person.id) : null;
    const showAddress = seesAll || isFamily || (contactPrivacy?.showAddress ?? false);
    const showPhone = seesAll || isFamily || (contactPrivacy?.showPhone ?? true);
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      areaId: row.areaId,
      area: row.areaId ? (summaries.get(row.areaId) ?? null) : null,
      address: showAddress ? row.address : null,
      city: row.city,
      postalCode: showAddress ? row.postalCode : null,
      phone: showPhone ? row.phone : null,
      photoUrl: row.photoUrl,
      notes: seesAll || isFamily ? row.notes : null,
      members,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

export const hydrateHousehold = (db: Queryable, access: AccessLike, row: HouseholdRow): Household =>
  hydrateHouseholds(db, access, [row])[0] as Household;

/** Person id → effective area id for every person of the church who has one. */
export function effectiveAreaByPerson(db: Queryable, churchId: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const row of db
    .select({ personId: householdMembers.personId, areaId: households.areaId })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.churchId, churchId))
    .all()) {
    if (row.areaId) result.set(row.personId, row.areaId);
  }
  for (const row of db
    .select({ personId: personAreas.personId, areaId: personAreas.areaId })
    .from(personAreas)
    .where(eq(personAreas.churchId, churchId))
    .all()) {
    result.set(row.personId, row.areaId);
  }
  return result;
}

/** Areas with household and people counts and their coordinators. */
export function hydrateAreas(db: Queryable, churchId: string, rows: readonly AreaRow[]): Area[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const householdCounts = new Map(
    db
      .select({ areaId: households.areaId, value: count() })
      .from(households)
      .where(and(eq(households.churchId, churchId), inArray(households.areaId, ids)))
      .groupBy(households.areaId)
      .all()
      .map((row) => [row.areaId ?? '', row.value]),
  );
  const personCounts = new Map<string, number>();
  for (const areaId of effectiveAreaByPerson(db, churchId).values()) {
    personCounts.set(areaId, (personCounts.get(areaId) ?? 0) + 1);
  }
  const coordinators = new Map<string, Area['coordinators']>();
  for (const row of db
    .select({
      areaId: areaCoordinators.areaId,
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(areaCoordinators)
    .innerJoin(users, eq(users.id, areaCoordinators.userId))
    .where(inArray(areaCoordinators.areaId, ids))
    .orderBy(asc(users.name))
    .all()) {
    const list = coordinators.get(row.areaId) ?? [];
    list.push({ userId: row.userId, name: row.name, avatarUrl: row.avatarUrl });
    coordinators.set(row.areaId, list);
  }
  return rows.map((row) => ({
    id: row.id,
    churchId: row.churchId,
    name: row.name,
    code: row.code,
    description: row.description,
    color: row.color,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    householdCount: householdCounts.get(row.id) ?? 0,
    personCount: personCounts.get(row.id) ?? 0,
    coordinators: coordinators.get(row.id) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export const hydrateArea = (db: Queryable, churchId: string, row: AreaRow): Area =>
  hydrateAreas(db, churchId, [row])[0] as Area;
