import {
  has,
  isCareTeam,
  type AccessLike,
  type CareConfidentiality,
  type Caregiver,
} from '@tatagereja/shared';
import { and, eq, inArray, isNotNull, isNull, lte, ne, or, type SQL } from 'drizzle-orm';
import type { Queryable } from '../db/client';
import type { ChurchRow, PersonRow } from '../db/schema';
import {
  careCaseCaregivers,
  careCases,
  careTasks,
  careVisitVisitors,
  careVisits,
  churchMemberships,
  households,
  people,
  users,
} from '../db/schema';
import { notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import { changes, redact } from './audit';
import { notify } from './notifications';

/** Today's date (`YYYY-MM-DD`) in the church time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Adds days to a `YYYY-MM-DD` date. */
export const addDaysToDate = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/** The first day of the month of a `YYYY-MM-DD` date. */
export const monthStart = (date: string): string => `${date.slice(0, 7)}-01`;

/** Generic wording for anything about a confidential case: no titles, names or notes. */
export const CONFIDENTIAL_LABEL = 'Pendampingan rahasia';

export function loadPersonInChurch(db: Queryable, churchId: string, personId: string): PersonRow {
  const person = db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.churchId, churchId)))
    .get();
  if (!person) throw notFound('Person');
  return person;
}

export function loadHouseholdInChurch(db: Queryable, churchId: string, householdId: string) {
  const household = db
    .select({ id: households.id, name: households.name })
    .from(households)
    .where(and(eq(households.id, householdId), eq(households.churchId, churchId)))
    .get();
  if (!household) throw notFound('Household');
  return household;
}

/** Throws 404 unless every id is an active member of the church. */
export function assertActiveMembers(
  db: Queryable,
  churchId: string,
  userIds: readonly string[],
): void {
  const wanted = [...new Set(userIds)];
  if (wanted.length === 0) return;
  const found = db
    .select({ userId: churchMemberships.userId })
    .from(churchMemberships)
    .where(
      and(
        eq(churchMemberships.churchId, churchId),
        eq(churchMemberships.status, 'active'),
        inArray(churchMemberships.userId, wanted),
      ),
    )
    .all();
  if (found.length !== wanted.length) throw notFound('Member');
}

/** Display name and avatar of users, keyed by id. */
export function caregiverSummaries(
  db: Queryable,
  userIds: readonly (string | null)[],
): Map<string, Caregiver> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  return new Map(
    db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, ids))
      .all()
      .map((row) => [row.id, { userId: row.id, name: row.name, avatarUrl: row.avatarUrl }]),
  );
}

/** Caregiver user ids per case. */
export function caregiverIdsByCase(
  db: Queryable,
  caseIds: readonly (string | null)[],
): Map<string, string[]> {
  const ids = [...new Set(caseIds.filter((id): id is string => !!id))];
  const result = new Map<string, string[]>();
  if (ids.length === 0) return result;
  for (const row of db
    .select({ caseId: careCaseCaregivers.caseId, userId: careCaseCaregivers.userId })
    .from(careCaseCaregivers)
    .where(inArray(careCaseCaregivers.caseId, ids))
    .all()) {
    const list = result.get(row.caseId) ?? [];
    list.push(row.userId);
    result.set(row.caseId, list);
  }
  return result;
}

export const caregiverIdsOf = (db: Queryable, caseId: string): string[] =>
  caregiverIdsByCase(db, [caseId]).get(caseId) ?? [];

/** Ids of the cases the caller is assigned to, as a subquery. */
const myCaseIds = (db: Queryable, userId: string) =>
  db
    .select({ id: careCaseCaregivers.caseId })
    .from(careCaseCaregivers)
    .where(eq(careCaseCaregivers.userId, userId));

/**
 * The cases the caller may read, as a SQL condition (undefined means every case of the church).
 * Mirrors `canReadCareCase`.
 */
export function readableCaseCondition(db: Queryable, access: AccessLike): SQL | undefined {
  if (has(access, 'care.confidential')) return undefined;
  const assigned = inArray(careCases.id, myCaseIds(db, access.userId));
  if (isCareTeam(access)) return or(eq(careCases.confidentiality, 'normal'), assigned);
  return assigned;
}

/** The visits the caller may read, as a SQL condition. Mirrors `canReadCareVisit`. */
export function readableVisitCondition(db: Queryable, access: AccessLike): SQL | undefined {
  if (has(access, 'care.confidential')) return undefined;
  const own: SQL[] = [
    eq(careVisits.createdBy, access.userId),
    inArray(careVisits.caseId, myCaseIds(db, access.userId)),
  ];
  if (access.personId) {
    own.push(
      inArray(
        careVisits.id,
        db
          .select({ id: careVisitVisitors.visitId })
          .from(careVisitVisitors)
          .where(eq(careVisitVisitors.personId, access.personId)),
      ),
    );
  }
  if (isCareTeam(access)) own.push(eq(careVisits.confidentiality, 'normal'));
  return or(...own);
}

/** Whether a case of this confidentiality may be named in a notification body. */
export const caseLabel = (row: { confidentiality: CareConfidentiality; title: string }) =>
  row.confidentiality === 'confidential' ? CONFIDENTIAL_LABEL : row.title;

/**
 * Sends the reminders that are due: next actions of active cases (to their caregivers, or the
 * person who opened the case) and open tasks (to their assignee), once each. Called when care
 * screens load, so reminders need no background job. Returns the number of reminders sent.
 */
export function sendDueCareReminders(db: Queryable, church: Pick<ChurchRow, 'id' | 'timezone'>) {
  const today = todayIn(church.timezone);
  let sent = 0;

  const dueCases = db
    .select()
    .from(careCases)
    .where(
      and(
        eq(careCases.churchId, church.id),
        ne(careCases.status, 'closed'),
        isNotNull(careCases.nextActionDate),
        lte(careCases.nextActionDate, today),
        isNull(careCases.reminderSentAt),
      ),
    )
    .limit(200)
    .all();
  const dueTasks = db
    .select()
    .from(careTasks)
    .where(
      and(
        eq(careTasks.churchId, church.id),
        eq(careTasks.status, 'open'),
        isNotNull(careTasks.assignedUserId),
        isNotNull(careTasks.dueDate),
        lte(careTasks.dueDate, today),
        isNull(careTasks.reminderSentAt),
      ),
    )
    .limit(200)
    .all();
  if (dueCases.length === 0 && dueTasks.length === 0) return 0;

  const caregivers = caregiverIdsByCase(
    db,
    dueCases.map((row) => row.id),
  );
  const taskCaseIds = [...new Set(dueTasks.flatMap((row) => (row.caseId ? [row.caseId] : [])))];
  const confidentialTaskCases = new Set(
    taskCaseIds.length === 0
      ? []
      : db
          .select({ id: careCases.id })
          .from(careCases)
          .where(
            and(inArray(careCases.id, taskCaseIds), eq(careCases.confidentiality, 'confidential')),
          )
          .all()
          .map((row) => row.id),
  );

  const now = nowIso();
  for (const row of dueCases) {
    // Claim the reminder first so concurrent requests send it once.
    const claimed = db
      .update(careCases)
      .set({ reminderSentAt: now })
      .where(and(eq(careCases.id, row.id), isNull(careCases.reminderSentAt)))
      .returning({ id: careCases.id })
      .get();
    if (!claimed) continue;
    const recipients = caregivers.get(row.id) ?? (row.openedBy ? [row.openedBy] : []);
    sent += notify(db, {
      churchId: church.id,
      userIds: recipients,
      type: 'care.reminder',
      title:
        row.nextActionDate === today
          ? 'Langkah pendampingan hari ini'
          : 'Langkah pendampingan terlambat',
      body: caseLabel(row),
      link: `/c/${church.id}/care/cases/${row.id}`,
      entityType: 'care_case',
      entityId: row.id,
    });
  }
  for (const row of dueTasks) {
    const claimed = db
      .update(careTasks)
      .set({ reminderSentAt: now })
      .where(and(eq(careTasks.id, row.id), isNull(careTasks.reminderSentAt)))
      .returning({ id: careTasks.id })
      .get();
    if (!claimed || !row.assignedUserId) continue;
    const confidential = !!row.caseId && confidentialTaskCases.has(row.caseId);
    sent += notify(db, {
      churchId: church.id,
      userIds: [row.assignedUserId],
      type: 'care.reminder',
      title:
        row.dueDate === today ? 'Tugas tindak lanjut hari ini' : 'Tugas tindak lanjut terlambat',
      body: confidential ? CONFIDENTIAL_LABEL : row.title,
      link: `/c/${church.id}/care/tasks`,
      entityType: 'care_task',
      entityId: row.id,
    });
  }
  return sent;
}

/**
 * `changes()` for snapshots with confidential fields: compares the real values, so an edited
 * note still shows up as changed, then redacts those fields on both sides.
 */
export function redactedChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: readonly string[],
) {
  const diff = changes(before, after);
  return {
    before: diff.before ? redact(diff.before, keys) : null,
    after: diff.after ? redact(diff.after, keys) : null,
  };
}
