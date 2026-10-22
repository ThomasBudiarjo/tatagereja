import {
  DEFAULT_PERSON_PRIVACY,
  PERSON_PRIVACY_FIELDS,
  applyPersonPrivacy,
  canSeeHiddenContact,
  has,
  type AccessLike,
  type DirectoryPerson,
  type DirectoryQuery,
  type HouseholdRelationship,
  type PersonPrivacy,
  type PersonPrivacyField,
} from '@tatagereja/shared';
import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  like,
  lte,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import type { Queryable } from '../db/client';
import type { ChurchRow, PersonRow } from '../db/schema';
import {
  areaCoordinators,
  customFieldValues,
  groupMembers,
  householdMembers,
  households,
  people,
  personAreas,
  personPrivacySettings,
  personTagAssignments,
} from '../db/schema';
import { likePattern } from '../lib/query';

/*
 * Directory helpers shared by the people routers: the effective area of a person, privacy,
 * batch hydration of directory rows and the SQL behind the directory filters.
 */

/** Today's date (YYYY-MM-DD) in the church time zone. */
export const todayIn = (church: Pick<ChurchRow, 'timezone'>): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: church.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

/** The same day `years` years earlier (string arithmetic keeps 29 February comparable). */
export const yearsBefore = (date: string, years: number): string =>
  `${String(Number(date.slice(0, 4)) - years).padStart(4, '0')}${date.slice(4)}`;

/**
 * The area a person belongs to: their own assignment, otherwise their household's. Usable in a
 * query that selects from `people`.
 */
export const effectiveAreaSql = sql<string | null>`coalesce(
  (select ${personAreas.areaId} from ${personAreas} where ${personAreas.personId} = ${people.id}),
  (select ${households.areaId} from ${householdMembers}
     inner join ${households} on ${households.id} = ${householdMembers.householdId}
     where ${householdMembers.personId} = ${people.id})
)`;

/** Days from `today` to the next anniversary of a YYYY-MM-DD column; null when empty. */
export const daysUntilSql = (column: SQLWrapper, today: string): SQL<number> => {
  const year = today.slice(0, 4);
  const nextYear = String(Number(year) + 1);
  return sql<number>`(case when ${column} is null then null else (
    julianday(case when date(${year} || '-' || substr(${column}, 6)) >= date(${today})
      then date(${year} || '-' || substr(${column}, 6))
      else date(${nextYear} || '-' || substr(${column}, 6)) end) - julianday(${today})
  ) end)`;
};

/** Whether the person shows a contact field in the directory (no row = the defaults). */
const showsSql = (column: 'show_phone' | 'show_email' | 'show_birthday'): SQL => {
  const fallback =
    column === 'show_phone'
      ? DEFAULT_PERSON_PRIVACY.showPhone
      : column === 'show_email'
        ? DEFAULT_PERSON_PRIVACY.showEmail
        : DEFAULT_PERSON_PRIVACY.showBirthday;
  return sql`coalesce((select ${sql.raw(column)} from ${personPrivacySettings} where ${personPrivacySettings.personId} = ${people.id}), ${fallback ? 1 : 0}) = 1`;
};

/**
 * Conditions for the directory filters. Searching or filtering on a contact field only matches
 * people who show it, unless the caller may see hidden fields, so filters never reveal them.
 */
export function directoryConditions(
  db: Queryable,
  access: AccessLike,
  churchId: string,
  query: Omit<DirectoryQuery, 'page' | 'limit'>,
  today: string,
): SQL[] {
  const seesHidden = has(access, 'people.private.view');
  const visible = (column: 'show_phone' | 'show_email' | 'show_birthday', condition: SQL) =>
    seesHidden ? condition : (and(condition, showsSql(column)) ?? condition);
  const conditions: SQL[] = [eq(people.churchId, churchId)];
  if (query.status) conditions.push(eq(people.membershipStatus, query.status));
  if (query.gender) conditions.push(eq(people.gender, query.gender));
  if (query.q) {
    const pattern = likePattern(query.q);
    const search = or(
      like(people.firstName, pattern),
      like(people.lastName, pattern),
      like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
      visible('show_email', like(people.email, pattern)),
      visible('show_phone', like(people.phone, pattern)),
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
  if (query.householdId) {
    conditions.push(
      inArray(
        people.id,
        db
          .select({ id: householdMembers.personId })
          .from(householdMembers)
          .where(eq(householdMembers.householdId, query.householdId)),
      ),
    );
  }
  if (query.tagId) {
    conditions.push(
      inArray(
        people.id,
        db
          .select({ id: personTagAssignments.personId })
          .from(personTagAssignments)
          .where(eq(personTagAssignments.tagId, query.tagId)),
      ),
    );
  }
  if (query.areaId) conditions.push(sql`${effectiveAreaSql} = ${query.areaId}`);
  if (query.hasAccount !== undefined) {
    conditions.push(query.hasAccount ? isNotNull(people.userId) : sql`${people.userId} is null`);
  }
  if (query.fieldId && query.fieldValue !== undefined) {
    conditions.push(
      inArray(
        people.id,
        db
          .select({ id: customFieldValues.personId })
          .from(customFieldValues)
          .where(
            and(
              eq(customFieldValues.fieldId, query.fieldId),
              eq(customFieldValues.value, query.fieldValue),
            ),
          ),
      ),
    );
  }
  if (query.minAge !== undefined) {
    conditions.push(
      visible('show_birthday', lte(people.birthDate, yearsBefore(today, query.minAge))),
    );
  }
  if (query.maxAge !== undefined) {
    conditions.push(
      visible('show_birthday', gt(people.birthDate, yearsBefore(today, query.maxAge + 1))),
    );
  }
  if (query.celebration) {
    const birthday = visible(
      'show_birthday',
      sql`${daysUntilSql(people.birthDate, today)} <= ${query.withinDays}`,
    );
    const anniversary = sql`${daysUntilSql(people.weddingDate, today)} <= ${query.withinDays}`;
    conditions.push(
      query.celebration === 'birthday'
        ? birthday
        : query.celebration === 'anniversary'
          ? anniversary
          : (or(birthday, anniversary) ?? birthday),
    );
  }
  return conditions;
}

/** Privacy choices of several people; people without a row get the defaults. */
export function privacyByPerson(
  db: Queryable,
  personIds: readonly string[],
): Map<string, PersonPrivacy> {
  const result = new Map<string, PersonPrivacy>();
  if (personIds.length === 0) return result;
  for (const row of db
    .select()
    .from(personPrivacySettings)
    .where(inArray(personPrivacySettings.personId, [...personIds]))
    .all()) {
    result.set(row.personId, {
      showPhone: row.showPhone,
      showEmail: row.showEmail,
      showAddress: row.showAddress,
      showBirthday: row.showBirthday,
    });
  }
  return result;
}

export const privacyOf = (map: Map<string, PersonPrivacy>, personId: string): PersonPrivacy =>
  map.get(personId) ?? { ...DEFAULT_PERSON_PRIVACY };

const FIELD_FLAG: Record<PersonPrivacyField, keyof PersonPrivacy> = {
  phone: 'showPhone',
  email: 'showEmail',
  address: 'showAddress',
  birthday: 'showBirthday',
};

/** Contact fields the caller does not see because the person hid them. */
export const hiddenFieldsFor = (
  access: AccessLike,
  person: Pick<PersonRow, 'id' | 'userId'>,
  privacy: PersonPrivacy,
): PersonPrivacyField[] =>
  canSeeHiddenContact(access, person)
    ? []
    : PERSON_PRIVACY_FIELDS.filter((field) => !privacy[FIELD_FLAG[field]]);

/** Area ids the user coordinates in the church. */
export function coordinatedAreaIdsOf(db: Queryable, churchId: string, userId: string): string[] {
  return db
    .select({ areaId: areaCoordinators.areaId })
    .from(areaCoordinators)
    .where(and(eq(areaCoordinators.churchId, churchId), eq(areaCoordinators.userId, userId)))
    .all()
    .map((row) => row.areaId);
}

export type HouseholdLink = {
  householdId: string;
  householdName: string;
  relationship: HouseholdRelationship;
  householdAreaId: string | null;
};

/** Household membership of several people. */
export function householdLinksByPerson(
  db: Queryable,
  personIds: readonly string[],
): Map<string, HouseholdLink> {
  const result = new Map<string, HouseholdLink>();
  if (personIds.length === 0) return result;
  for (const row of db
    .select({
      personId: householdMembers.personId,
      householdId: households.id,
      householdName: households.name,
      relationship: householdMembers.relationship,
      householdAreaId: households.areaId,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(inArray(householdMembers.personId, [...personIds]))
    .all()) {
    result.set(row.personId, row);
  }
  return result;
}

/** The person's own area assignments (overrides of the household area). */
export function personAreaOverrides(
  db: Queryable,
  personIds: readonly string[],
): Map<string, string> {
  if (personIds.length === 0) return new Map();
  return new Map(
    db
      .select({ personId: personAreas.personId, areaId: personAreas.areaId })
      .from(personAreas)
      .where(inArray(personAreas.personId, [...personIds]))
      .all()
      .map((row) => [row.personId, row.areaId]),
  );
}

export function tagIdsByPerson(db: Queryable, personIds: readonly string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (personIds.length === 0) return result;
  for (const row of db
    .select({ personId: personTagAssignments.personId, tagId: personTagAssignments.tagId })
    .from(personTagAssignments)
    .where(inArray(personTagAssignments.personId, [...personIds]))
    .all()) {
    const list = result.get(row.personId) ?? [];
    list.push(row.tagId);
    result.set(row.personId, list);
  }
  return result;
}

/** The effective area of one person. */
export function effectiveAreaOf(
  db: Queryable,
  personId: string,
): { areaId: string | null; source: 'person' | 'household' | null } {
  const override = personAreaOverrides(db, [personId]).get(personId);
  if (override) return { areaId: override, source: 'person' };
  const household = householdLinksByPerson(db, [personId]).get(personId);
  if (household?.householdAreaId) return { areaId: household.householdAreaId, source: 'household' };
  return { areaId: null, source: null };
}

export function groupIdsOfPerson(db: Queryable, personId: string): string[] {
  return db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.personId, personId))
    .all()
    .map((row) => row.groupId);
}

/** Directory rows with household, area and tags, with hidden contact fields stripped. */
export function hydrateDirectory(
  db: Queryable,
  access: AccessLike,
  rows: readonly PersonRow[],
): DirectoryPerson[] {
  const ids = rows.map((row) => row.id);
  const privacy = privacyByPerson(db, ids);
  const links = householdLinksByPerson(db, ids);
  const overrides = personAreaOverrides(db, ids);
  const tags = tagIdsByPerson(db, ids);
  return rows.map((row) => {
    const link = links.get(row.id);
    const person: DirectoryPerson = {
      id: row.id,
      churchId: row.churchId,
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      birthDate: row.birthDate,
      email: row.email,
      phone: row.phone,
      address: row.address,
      photoUrl: row.photoUrl,
      membershipStatus: row.membershipStatus,
      joinedAt: row.joinedAt,
      notes: row.notes,
      userId: row.userId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      weddingDate: row.weddingDate,
      householdId: link?.householdId ?? null,
      householdName: link?.householdName ?? null,
      relationship: link?.relationship ?? null,
      areaId: overrides.get(row.id) ?? link?.householdAreaId ?? null,
      tagIds: tags.get(row.id) ?? [],
      hasAccount: row.userId !== null,
    };
    return applyPersonPrivacy(access, person, privacyOf(privacy, row.id));
  });
}

export const hydrateDirectoryOne = (
  db: Queryable,
  access: AccessLike,
  row: PersonRow,
): DirectoryPerson => hydrateDirectory(db, access, [row])[0] as DirectoryPerson;

/** CSV for spreadsheets: quoted cells, a BOM for Excel, and formula injection neutralised. */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** Sets the download headers for a CSV body and returns it. */
export const sendCsv = (
  set: { headers: Record<string, unknown> },
  filename: string,
  body: string,
): string => {
  set.headers['content-type'] = 'text/csv; charset=utf-8';
  set.headers['content-disposition'] =
    `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`;
  set.headers['cache-control'] = 'no-store';
  return body;
};
