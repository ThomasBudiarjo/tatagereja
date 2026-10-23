import {
  canAdministerCareCase,
  canChangeCareConfidentiality,
  canCompleteCareTask,
  canEditCareTask,
  canManageCareCase,
  canManageCareVisit,
  canManageFollowUp,
  canManagePrayerRequest,
  canModeratePrayer,
  canReadCareCase,
  canSeePrayerRequester,
  fullName,
  isCareTaskOverdue,
  type AccessLike,
  type CareCase,
  type CareCaseSummary,
  type CareNote,
  type CareTask,
  type CareVisit,
  type DiakoniaAid,
  type HouseholdRef,
  type PersonSummary,
  type PrayerRequest,
  type VisitorFollowUp,
} from '@tatagereja/shared';
import { and, count, eq, inArray } from 'drizzle-orm';
import type { Queryable } from '../../db/client';
import type {
  CareCaseRow,
  CareNoteRow,
  CareTaskRow,
  CareVisitRow,
  DiakoniaAidRow,
  PersonRow,
  PrayerRequestRow,
  VisitorFollowUpRow,
} from '../../db/schema';
import {
  careCases,
  careNotes,
  careTasks,
  careVisitVisitors,
  households,
  people,
  prayerRequestPrayers,
  users,
} from '../../db/schema';
import { toPersonSummary } from '../../serializers';
import { caregiverIdsByCase, caregiverSummaries } from '../../services/care';
import { withPrivacy } from '../../services/people';

const unique = (ids: readonly (string | null | undefined)[]): string[] => [
  ...new Set(ids.filter((id): id is string => !!id)),
];

/** People by id, limited to the church. */
export function peopleById(
  db: Queryable,
  churchId: string,
  ids: readonly (string | null | undefined)[],
): Map<string, PersonRow> {
  const wanted = unique(ids);
  if (wanted.length === 0) return new Map();
  return new Map(
    db
      .select()
      .from(people)
      .where(and(eq(people.churchId, churchId), inArray(people.id, wanted)))
      .all()
      .map((row) => [row.id, row]),
  );
}

const personSummaries = (
  db: Queryable,
  churchId: string,
  ids: readonly (string | null | undefined)[],
): Map<string, PersonSummary> =>
  new Map([...peopleById(db, churchId, ids)].map(([id, row]) => [id, toPersonSummary(row)]));

function householdsById(
  db: Queryable,
  churchId: string,
  ids: readonly (string | null | undefined)[],
): Map<string, HouseholdRef> {
  const wanted = unique(ids);
  if (wanted.length === 0) return new Map();
  return new Map(
    db
      .select({ id: households.id, name: households.name })
      .from(households)
      .where(and(eq(households.churchId, churchId), inArray(households.id, wanted)))
      .all()
      .map((row) => [row.id, row]),
  );
}

// ---------------------------------------------------------------------------------------------
// Cases and notes
// ---------------------------------------------------------------------------------------------

/** List rows: never the description, next action note or notes. */
export function hydrateCases(
  db: Queryable,
  churchId: string,
  rows: CareCaseRow[],
): CareCaseSummary[] {
  if (rows.length === 0) return [];
  const caseIds = rows.map((row) => row.id);
  const persons = personSummaries(
    db,
    churchId,
    rows.map((row) => row.personId),
  );
  const homes = householdsById(
    db,
    churchId,
    rows.map((row) => row.householdId),
  );
  const caregiverIds = caregiverIdsByCase(db, caseIds);
  const caregivers = caregiverSummaries(db, [...caregiverIds.values()].flat());
  const noteCounts = new Map(
    db
      .select({ caseId: careNotes.caseId, value: count() })
      .from(careNotes)
      .where(inArray(careNotes.caseId, caseIds))
      .groupBy(careNotes.caseId)
      .all()
      .map((row) => [row.caseId, row.value]),
  );
  return rows.map((row) => ({
    id: row.id,
    person: row.personId ? (persons.get(row.personId) ?? null) : null,
    household: row.householdId ? (homes.get(row.householdId) ?? null) : null,
    category: row.category,
    priority: row.priority,
    status: row.status,
    confidentiality: row.confidentiality,
    title: row.title,
    nextActionDate: row.nextActionDate,
    caregivers: (caregiverIds.get(row.id) ?? []).flatMap((userId) => {
      const caregiver = caregivers.get(userId);
      return caregiver ? [caregiver] : [];
    }),
    noteCount: noteCounts.get(row.id) ?? 0,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  }));
}

/** The case detail; call only after `canReadCareCase` passed. */
export function toCareCaseDetail(
  db: Queryable,
  churchId: string,
  access: AccessLike,
  row: CareCaseRow,
): CareCase {
  const [summary] = hydrateCases(db, churchId, [row]);
  if (!summary) throw new Error('Case did not hydrate');
  const caregiverIds = summary.caregivers.map((caregiver) => caregiver.userId);
  const openedBy = row.openedBy
    ? (caregiverSummaries(db, [row.openedBy]).get(row.openedBy) ?? null)
    : null;
  return {
    ...summary,
    description: row.description,
    nextActionNote: row.nextActionNote,
    closedAt: row.closedAt,
    closedReason: row.closedReason,
    openedBy,
    canManage: canManageCareCase(access, row, caregiverIds),
    canAdminister: canAdministerCareCase(access, row, caregiverIds),
    canLowerConfidentiality: canChangeCareConfidentiality(access, row.confidentiality, 'normal'),
  };
}

export function hydrateNotes(
  db: Queryable,
  access: AccessLike,
  canManage: boolean,
  rows: CareNoteRow[],
): CareNote[] {
  const authors = caregiverSummaries(
    db,
    rows.map((row) => row.authorUserId),
  );
  return rows.map((row) => ({
    id: row.id,
    caseId: row.caseId,
    kind: row.kind,
    body: row.body,
    author: row.authorUserId ? (authors.get(row.authorUserId) ?? null) : null,
    canEdit: canManage && row.kind !== 'status_change' && row.authorUserId === access.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

// ---------------------------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------------------------

/** Visitor person ids per visit. */
export function visitorIdsByVisit(
  db: Queryable,
  visitIds: readonly string[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (visitIds.length === 0) return result;
  for (const row of db
    .select({ visitId: careVisitVisitors.visitId, personId: careVisitVisitors.personId })
    .from(careVisitVisitors)
    .where(inArray(careVisitVisitors.visitId, [...visitIds]))
    .all()) {
    const list = result.get(row.visitId) ?? [];
    list.push(row.personId);
    result.set(row.visitId, list);
  }
  return result;
}

/** Visits; `withSummary` only for the detail of a visit the caller may read. */
export function hydrateVisits(
  db: Queryable,
  churchId: string,
  access: AccessLike,
  rows: CareVisitRow[],
  { withSummary = false }: { withSummary?: boolean } = {},
): CareVisit[] {
  if (rows.length === 0) return [];
  const visitorIds = visitorIdsByVisit(
    db,
    rows.map((row) => row.id),
  );
  const persons = personSummaries(db, churchId, [
    ...rows.map((row) => row.personId),
    ...[...visitorIds.values()].flat(),
  ]);
  const homes = householdsById(
    db,
    churchId,
    rows.map((row) => row.householdId),
  );
  const creators = caregiverSummaries(
    db,
    rows.map((row) => row.createdBy),
  );
  const caseCaregivers = caregiverIdsByCase(
    db,
    rows.map((row) => row.caseId),
  );
  return rows.map((row) => ({
    id: row.id,
    caseId: row.caseId,
    person: row.personId ? (persons.get(row.personId) ?? null) : null,
    household: row.householdId ? (homes.get(row.householdId) ?? null) : null,
    visitDate: row.visitDate,
    location: row.location,
    summary: withSummary ? row.summary : null,
    confidentiality: row.confidentiality,
    followUpNeeded: row.followUpNeeded,
    followUpNote: row.followUpNote,
    visitors: (visitorIds.get(row.id) ?? []).flatMap((personId) => {
      const person = persons.get(personId);
      return person ? [person] : [];
    }),
    otherVisitors: row.otherVisitors,
    createdBy: row.createdBy ? (creators.get(row.createdBy) ?? null) : null,
    canManage: canManageCareVisit(
      access,
      row,
      row.caseId ? (caseCaregivers.get(row.caseId) ?? []) : [],
    ),
    createdAt: row.createdAt,
  }));
}

// ---------------------------------------------------------------------------------------------
// Prayer requests
// ---------------------------------------------------------------------------------------------

export function hydratePrayerRequests(
  db: Queryable,
  churchId: string,
  access: AccessLike,
  rows: PrayerRequestRow[],
): PrayerRequest[] {
  if (rows.length === 0) return [];
  const persons = peopleById(
    db,
    churchId,
    rows.map((row) => row.personId),
  );
  const submitters = new Map(
    db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, unique(rows.map((row) => row.submittedBy))))
      .all()
      .map((row) => [row.id, row]),
  );
  const mine = new Set(
    db
      .select({ requestId: prayerRequestPrayers.requestId })
      .from(prayerRequestPrayers)
      .where(
        and(
          eq(prayerRequestPrayers.userId, access.userId),
          inArray(
            prayerRequestPrayers.requestId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .all()
      .map((row) => row.requestId),
  );
  const moderator = canModeratePrayer(access);
  return rows.map((row) => {
    const isMine = row.submittedBy === access.userId;
    const showRequester = canSeePrayerRequester(access, row);
    const person = row.personId ? persons.get(row.personId) : undefined;
    const submitter = row.submittedBy ? submitters.get(row.submittedBy) : undefined;
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      visibility: row.visibility,
      isAnonymous: row.isAnonymous,
      requesterName: showRequester ? (person ? fullName(person) : (submitter?.name ?? null)) : null,
      requesterAvatarUrl: showRequester ? (person?.photoUrl ?? submitter?.avatarUrl ?? null) : null,
      moderationStatus: row.moderationStatus,
      moderationNote: isMine || moderator ? row.moderationNote : null,
      prayedCount: row.prayedCount,
      prayedByMe: mine.has(row.id),
      answeredAt: row.answeredAt,
      testimony: row.testimony,
      isMine,
      canManage: canManagePrayerRequest(access, row),
      canModerate: moderator && row.visibility === 'church',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Visitor follow-up and tasks
// ---------------------------------------------------------------------------------------------

export function hydrateFollowUps(
  db: Queryable,
  churchId: string,
  access: AccessLike,
  today: string,
  rows: VisitorFollowUpRow[],
): VisitorFollowUp[] {
  if (rows.length === 0) return [];
  const persons = peopleById(
    db,
    churchId,
    rows.map((row) => row.personId),
  );
  const assignees = caregiverSummaries(
    db,
    rows.map((row) => row.assignedUserId),
  );
  // Contact details follow each person's directory privacy choices.
  const contacts = new Map<string, { phone: string | null; email: string | null }>(
    withPrivacy(
      db,
      access,
      [...persons.values()].map((person) => ({
        id: person.id,
        userId: person.userId,
        phone: person.phone,
        email: person.email,
      })),
    ).map((contact): [string, { phone: string | null; email: string | null }] => [
      contact.id,
      contact,
    ]),
  );
  const openTasks = new Map<string, { count: number; next: string | null; overdue: boolean }>();
  for (const task of db
    .select({ followUpId: careTasks.followUpId, dueDate: careTasks.dueDate })
    .from(careTasks)
    .where(
      and(
        eq(careTasks.status, 'open'),
        inArray(
          careTasks.followUpId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .all()) {
    if (!task.followUpId) continue;
    const entry = openTasks.get(task.followUpId) ?? { count: 0, next: null, overdue: false };
    entry.count += 1;
    if (task.dueDate && (!entry.next || task.dueDate < entry.next)) entry.next = task.dueDate;
    if (task.dueDate && task.dueDate < today) entry.overdue = true;
    openTasks.set(task.followUpId, entry);
  }
  return rows.flatMap((row) => {
    const person = persons.get(row.personId);
    if (!person) return [];
    const tasks = openTasks.get(row.id);
    return [
      {
        id: row.id,
        person: toPersonSummary(person),
        phone: contacts.get(person.id)?.phone ?? null,
        email: contacts.get(person.id)?.email ?? null,
        stage: row.stage,
        source: row.source,
        firstVisitDate: row.firstVisitDate,
        assignee: row.assignedUserId ? (assignees.get(row.assignedUserId) ?? null) : null,
        notes: row.notes,
        closedReason: row.closedReason,
        stageChangedAt: row.stageChangedAt,
        openTaskCount: tasks?.count ?? 0,
        nextDueDate: tasks?.next ?? null,
        hasOverdueTask: tasks?.overdue ?? false,
        canManage: canManageFollowUp(access, row),
        createdAt: row.createdAt,
      },
    ];
  });
}

export function hydrateTasks(
  db: Queryable,
  churchId: string,
  access: AccessLike,
  today: string,
  rows: CareTaskRow[],
): CareTask[] {
  if (rows.length === 0) return [];
  const persons = personSummaries(
    db,
    churchId,
    rows.map((row) => row.personId),
  );
  const assignees = caregiverSummaries(
    db,
    rows.map((row) => row.assignedUserId),
  );
  const caseIds = unique(rows.map((row) => row.caseId));
  const cases = new Map(
    caseIds.length === 0
      ? []
      : db
          .select({
            id: careCases.id,
            title: careCases.title,
            confidentiality: careCases.confidentiality,
          })
          .from(careCases)
          .where(inArray(careCases.id, caseIds))
          .all()
          .map((row) => [row.id, row]),
  );
  const caregivers = caregiverIdsByCase(db, caseIds);
  return rows.map((row) => {
    const linked = row.caseId ? cases.get(row.caseId) : undefined;
    const readable = !!linked && canReadCareCase(access, linked, caregivers.get(linked.id) ?? []);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      dueDate: row.dueDate,
      status: row.status,
      isOverdue: isCareTaskOverdue(row, today),
      assignee: row.assignedUserId ? (assignees.get(row.assignedUserId) ?? null) : null,
      followUpId: row.followUpId,
      caseId: row.caseId,
      caseTitle: readable && linked ? linked.title : null,
      person: row.personId ? (persons.get(row.personId) ?? null) : null,
      completedAt: row.completedAt,
      canEdit: canEditCareTask(access, row),
      canComplete: canCompleteCareTask(access, row),
      createdAt: row.createdAt,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Diakonia
// ---------------------------------------------------------------------------------------------

export function hydrateAid(db: Queryable, churchId: string, rows: DiakoniaAidRow[]): DiakoniaAid[] {
  if (rows.length === 0) return [];
  const persons = personSummaries(
    db,
    churchId,
    rows.map((row) => row.personId),
  );
  const homes = householdsById(
    db,
    churchId,
    rows.map((row) => row.householdId),
  );
  const creators = caregiverSummaries(
    db,
    rows.map((row) => row.createdBy),
  );
  return rows.map((row) => ({
    id: row.id,
    person: row.personId ? (persons.get(row.personId) ?? null) : null,
    household: row.householdId ? (homes.get(row.householdId) ?? null) : null,
    caseId: row.caseId,
    recipientName: row.recipientName,
    category: row.category,
    form: row.form,
    description: row.description,
    amount: row.amount,
    givenAt: row.givenAt,
    financeReference: row.financeReference,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdBy: row.createdBy ? (creators.get(row.createdBy) ?? null) : null,
    createdAt: row.createdAt,
  }));
}
