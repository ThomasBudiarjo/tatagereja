import {
  GENDERS,
  PEOPLE_AGE_BANDS,
  PERSON_MEMBERSHIP_STATUSES,
  ageOn,
  canSeeHiddenContact,
  daysUntilAnniversary,
  peopleAgeBandOf,
  type AccessLike,
  type PeopleStats,
  type UpcomingCelebration,
} from '@tatagereja/shared';
import { and, count, eq, inArray } from 'drizzle-orm';
import type { Queryable } from '../db/client';
import { households, people } from '../db/schema';
import { privacyByPerson, privacyOf } from './people';
import { effectiveAreaByPerson } from './people-households';

const CELEBRATION_DAYS = 7;
const CELEBRATIONS_MAX = 12;

/** Adds `days` to a YYYY-MM-DD date. */
const addDaysTo = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
};

/**
 * Directory counts for the whole church, or for one area. Birthdays of people who hide them are
 * left out of the celebrations unless the caller may see hidden fields.
 */
export function peopleStats(
  db: Queryable,
  access: AccessLike,
  churchId: string,
  today: string,
  areaId?: string,
): PeopleStats {
  let rows = db
    .select({
      id: people.id,
      userId: people.userId,
      firstName: people.firstName,
      lastName: people.lastName,
      photoUrl: people.photoUrl,
      membershipStatus: people.membershipStatus,
      gender: people.gender,
      birthDate: people.birthDate,
      weddingDate: people.weddingDate,
      createdAt: people.createdAt,
    })
    .from(people)
    .where(eq(people.churchId, churchId))
    .all();
  if (areaId) {
    const areaOf = effectiveAreaByPerson(db, churchId);
    rows = rows.filter((row) => areaOf.get(row.id) === areaId);
  }
  const householdCount =
    db
      .select({ value: count() })
      .from(households)
      .where(
        areaId
          ? and(eq(households.churchId, churchId), eq(households.areaId, areaId))
          : eq(households.churchId, churchId),
      )
      .get()?.value ?? 0;

  const tally = <K extends string>(
    keys: readonly K[],
    keyOf: (row: (typeof rows)[number]) => K,
  ) => {
    const counts = new Map<string, number>(keys.map((key) => [key, 0]));
    for (const row of rows) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1);
    return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
  };

  const privacy = privacyByPerson(
    db,
    rows.map((row) => row.id),
  );
  const celebrations: UpcomingCelebration[] = [];
  const monthStart = `${today.slice(0, 7)}-01`;
  for (const row of rows) {
    const summary = {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      photoUrl: row.photoUrl,
      membershipStatus: row.membershipStatus,
    };
    const showBirthday =
      canSeeHiddenContact(access, row) || privacyOf(privacy, row.id).showBirthday;
    if (row.birthDate && showBirthday) {
      const inDays = daysUntilAnniversary(row.birthDate, today);
      if (inDays <= CELEBRATION_DAYS) {
        const date = addDaysTo(today, inDays);
        celebrations.push({
          person: summary,
          kind: 'birthday',
          date,
          inDays,
          years: ageOn(row.birthDate, date),
        });
      }
    }
    if (row.weddingDate) {
      const inDays = daysUntilAnniversary(row.weddingDate, today);
      if (inDays <= CELEBRATION_DAYS) {
        const date = addDaysTo(today, inDays);
        celebrations.push({
          person: summary,
          kind: 'anniversary',
          date,
          inDays,
          years: ageOn(row.weddingDate, date),
        });
      }
    }
  }
  celebrations.sort(
    (a, b) => a.inDays - b.inDays || a.person.firstName.localeCompare(b.person.firstName),
  );

  return {
    people: rows.length,
    households: householdCount,
    byStatus: tally(PERSON_MEMBERSHIP_STATUSES, (row) => row.membershipStatus),
    byGender: tally(GENDERS, (row) => row.gender),
    byAge: tally(PEOPLE_AGE_BANDS, (row) =>
      peopleAgeBandOf(
        canSeeHiddenContact(access, row) || privacyOf(privacy, row.id).showBirthday
          ? row.birthDate
          : null,
        today,
      ),
    ),
    newThisMonth: rows.filter((row) => row.createdAt.slice(0, 10) >= monthStart).length,
    celebrations: celebrations.slice(0, CELEBRATIONS_MAX),
  };
}

/** Ids of people in the church, checked: returns those that exist. */
export function existingPersonIds(
  db: Queryable,
  churchId: string,
  personIds: readonly string[],
): string[] {
  if (personIds.length === 0) return [];
  return db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.churchId, churchId), inArray(people.id, [...personIds])))
    .all()
    .map((row) => row.id);
}
