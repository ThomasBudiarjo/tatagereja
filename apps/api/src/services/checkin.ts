import {
  type AccessLike,
  GUARDIAN_RELATIONSHIPS,
  checkinSettingsSchema,
  childAge,
  dateTimeFormat,
  isRatioExceeded,
  phoneLast4,
  suggestClass,
  type Checkin,
  type CheckinChild,
  type CheckinClass,
  type CheckinHousehold,
  type CheckinSession,
  type CheckinSettings,
  type ChildAlert,
  type PersonSummary,
  type SessionClassStat,
} from '@tatagereja/shared';
import { and, asc, count, countDistinct, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Queryable } from '../db/client';
import type {
  CheckinAuthorizedPickupRow,
  CheckinChildAlertRow,
  CheckinClassRow,
  CheckinRow,
  CheckinSessionRow,
  ChurchRow,
} from '../db/schema';
import {
  attendanceRecords,
  attendanceSessions,
  checkinChildAlerts,
  checkinChildProfiles,
  checkinClasses,
  checkinClassTeachers,
  checkins,
  checkinSessions,
  householdMembers,
  households,
  people,
  worshipServices,
} from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import { generateCode, newId } from '../lib/tokens';
import { syncRecordTimes } from './attendance';
import { moduleSettings } from './modules';
import { withPrivacy } from './people';

/*
 * Kids check-in helpers shared by the checkin routers: settings, guardianship from the people
 * module's households, security codes, serializers and the attendance feed.
 */

export const checkinSettingsOf = (church: Pick<ChurchRow, 'settings'>): CheckinSettings =>
  moduleSettings(church, 'checkin', checkinSettingsSchema);

/** Today's date (YYYY-MM-DD) in the church time zone. */
export const todayIn = (timezone: string): string => {
  try {
    return dateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const personColumns = {
  id: people.id,
  firstName: people.firstName,
  lastName: people.lastName,
  photoUrl: people.photoUrl,
  membershipStatus: people.membershipStatus,
};

/** Person summaries by id, scoped to the church. */
export const peopleById = (
  db: Queryable,
  churchId: string,
  ids: readonly string[],
): Map<string, PersonSummary> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  return new Map(
    db
      .select(personColumns)
      .from(people)
      .where(and(eq(people.churchId, churchId), inArray(people.id, unique)))
      .all()
      .map((person) => [person.id, person]),
  );
};

export const loadPerson = (db: Queryable, churchId: string, id: string, what = 'Person') => {
  const person = db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.churchId, churchId)))
    .get();
  if (!person) throw notFound(what);
  return person;
};

export const loadClassRow = (db: Queryable, churchId: string, id: string): CheckinClassRow => {
  const row = db
    .select()
    .from(checkinClasses)
    .where(and(eq(checkinClasses.id, id), eq(checkinClasses.churchId, churchId)))
    .get();
  if (!row) throw notFound('Class');
  return row;
};

export const loadSessionRow = (db: Queryable, churchId: string, id: string): CheckinSessionRow => {
  const row = db
    .select()
    .from(checkinSessions)
    .where(and(eq(checkinSessions.id, id), eq(checkinSessions.churchId, churchId)))
    .get();
  if (!row) throw notFound('Session');
  return row;
};

export const loadCheckinRow = (db: Queryable, churchId: string, id: string): CheckinRow => {
  const row = db
    .select()
    .from(checkins)
    .where(and(eq(checkins.id, id), eq(checkins.churchId, churchId)))
    .get();
  if (!row) throw notFound('Check-in');
  return row;
};

// ---------------------------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------------------------

export const toChildAlert = (row: CheckinChildAlertRow): ChildAlert => ({
  id: row.id,
  personId: row.personId,
  kind: row.kind,
  severity: row.severity,
  description: row.description,
  isActive: row.isActive,
  updatedAt: row.updatedAt,
});

export const toPickup = (row: CheckinAuthorizedPickupRow) => ({
  id: row.id,
  childPersonId: row.childPersonId,
  pickupPersonId: row.pickupPersonId,
  name: row.name,
  relationship: row.relationship,
  phone: row.phone,
  notes: row.notes,
});

/** Active alerts per child, most severe first. */
export const activeAlertsByChild = (
  db: Queryable,
  churchId: string,
  personIds: readonly string[],
): Map<string, ChildAlert[]> => {
  const byChild = new Map<string, ChildAlert[]>();
  const unique = [...new Set(personIds)];
  if (unique.length === 0) return byChild;
  for (const row of db
    .select()
    .from(checkinChildAlerts)
    .where(
      and(
        eq(checkinChildAlerts.churchId, churchId),
        inArray(checkinChildAlerts.personId, unique),
        eq(checkinChildAlerts.isActive, true),
      ),
    )
    .orderBy(
      desc(
        sql`case ${checkinChildAlerts.severity} when 'critical' then 3 when 'warning' then 2 else 1 end`,
      ),
      desc(checkinChildAlerts.updatedAt),
    )
    .all()) {
    const list = byChild.get(row.personId) ?? [];
    list.push(toChildAlert(row));
    byChild.set(row.personId, list);
  }
  return byChild;
};

/** Classes with their teachers, in display order. */
export const hydrateClasses = (db: Queryable, rows: CheckinClassRow[]): CheckinClass[] => {
  if (rows.length === 0) return [];
  const teachers = new Map<string, CheckinClass['teachers']>();
  for (const row of db
    .select({
      classId: checkinClassTeachers.classId,
      isLead: checkinClassTeachers.isLead,
      person: personColumns,
    })
    .from(checkinClassTeachers)
    .innerJoin(people, eq(people.id, checkinClassTeachers.personId))
    .where(
      inArray(
        checkinClassTeachers.classId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(desc(checkinClassTeachers.isLead), asc(people.firstName))
    .all()) {
    const list = teachers.get(row.classId) ?? [];
    list.push({ ...row.person, isLead: row.isLead });
    teachers.set(row.classId, list);
  }
  return rows.map((row) => ({
    id: row.id,
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
    teachers: teachers.get(row.id) ?? [],
  }));
};

export const classRowsOf = (db: Queryable, churchId: string, includeInactive = true) =>
  db
    .select()
    .from(checkinClasses)
    .where(
      includeInactive
        ? eq(checkinClasses.churchId, churchId)
        : and(eq(checkinClasses.churchId, churchId), eq(checkinClasses.isActive, true)),
    )
    .orderBy(asc(checkinClasses.sortOrder), asc(checkinClasses.name))
    .all();

/** Sessions with their live counts. */
export const hydrateSessions = (db: Queryable, rows: CheckinSessionRow[]): CheckinSession[] => {
  if (rows.length === 0) return [];
  const counts = new Map(
    db
      .select({
        sessionId: checkins.sessionId,
        total: count(),
        present: sql<number>`sum(case when ${checkins.status} = 'checked_in' then 1 else 0 end)`,
      })
      .from(checkins)
      .where(
        inArray(
          checkins.sessionId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(checkins.sessionId)
      .all()
      .map((row) => [row.sessionId, row]),
  );
  const serviceIds = [
    ...new Set(rows.flatMap((row) => (row.worshipServiceId ? [row.worshipServiceId] : []))),
  ];
  const services = new Map(
    serviceIds.length === 0
      ? []
      : db
          .select({ id: worshipServices.id, title: worshipServices.title })
          .from(worshipServices)
          .where(
            and(
              eq(worshipServices.churchId, rows[0]!.churchId),
              inArray(worshipServices.id, serviceIds),
            ),
          )
          .all()
          .map((row) => [row.id, row.title]),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    date: row.date,
    worshipServiceId: row.worshipServiceId,
    serviceTitle: row.worshipServiceId ? (services.get(row.worshipServiceId) ?? null) : null,
    attendanceSessionId: row.attendanceSessionId,
    status: row.status,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    checkedInCount: Number(counts.get(row.id)?.present ?? 0),
    totalCount: counts.get(row.id)?.total ?? 0,
  }));
};

export const hydrateSession = (db: Queryable, row: CheckinSessionRow): CheckinSession =>
  hydrateSessions(db, [row])[0]!;

/** Headcount, teachers, alerts and ratio per class of a session (active classes and any used). */
export const sessionClassStats = (
  db: Queryable,
  churchId: string,
  sessionId: string,
): SessionClassStat[] => {
  const rows = db
    .select({
      classId: checkins.classId,
      childPersonId: checkins.childPersonId,
      status: checkins.status,
    })
    .from(checkins)
    .where(and(eq(checkins.churchId, churchId), eq(checkins.sessionId, sessionId)))
    .all();
  const usedClassIds = new Set(rows.map((row) => row.classId));
  const classes = classRowsOf(db, churchId).filter(
    (item) => item.isActive || usedClassIds.has(item.id),
  );
  const teacherCounts = new Map(
    db
      .select({ classId: checkinClassTeachers.classId, value: count() })
      .from(checkinClassTeachers)
      .where(eq(checkinClassTeachers.churchId, churchId))
      .groupBy(checkinClassTeachers.classId)
      .all()
      .map((row) => [row.classId, row.value]),
  );
  const present = rows.filter((row) => row.status === 'checked_in');
  const alerts = activeAlertsByChild(
    db,
    churchId,
    present.map((row) => row.childPersonId),
  );
  return classes.map((item) => {
    const inClass = present.filter((row) => row.classId === item.id);
    const teacherCount = teacherCounts.get(item.id) ?? 0;
    return {
      classId: item.id,
      name: item.name,
      color: item.color,
      location: item.location,
      capacity: item.capacity,
      maxChildrenPerTeacher: item.maxChildrenPerTeacher,
      presentCount: inClass.length,
      totalCount: rows.filter((row) => row.classId === item.id).length,
      teacherCount,
      alertCount: inClass.filter((row) => (alerts.get(row.childPersonId) ?? []).length > 0).length,
      ratioExceeded: isRatioExceeded(inClass.length, teacherCount, item.maxChildrenPerTeacher),
    };
  });
};

/**
 * Check-ins with child, guardian, class and active alerts. `revealCode` decides per row whether
 * the security code is returned (guardians, labels and coordinators only).
 */
export const hydrateCheckins = (
  db: Queryable,
  churchId: string,
  rows: CheckinRow[],
  revealCode: (row: CheckinRow) => boolean,
): Checkin[] => {
  if (rows.length === 0) return [];
  const persons = peopleById(db, churchId, [
    ...rows.map((row) => row.childPersonId),
    ...rows.flatMap((row) => (row.guardianPersonId ? [row.guardianPersonId] : [])),
  ]);
  const classNames = new Map(
    db
      .select({ id: checkinClasses.id, name: checkinClasses.name })
      .from(checkinClasses)
      .where(inArray(checkinClasses.id, [...new Set(rows.map((row) => row.classId))]))
      .all()
      .map((row) => [row.id, row.name]),
  );
  const alerts = activeAlertsByChild(
    db,
    churchId,
    rows.map((row) => row.childPersonId),
  );
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    classId: row.classId,
    className: classNames.get(row.classId) ?? '',
    child: persons.get(row.childPersonId) ?? {
      id: row.childPersonId,
      firstName: '?',
      lastName: null,
      photoUrl: null,
      membershipStatus: 'visitor',
    },
    guardian: row.guardianPersonId ? (persons.get(row.guardianPersonId) ?? null) : null,
    securityCode: revealCode(row) ? row.securityCode : null,
    method: row.method,
    status: row.status,
    checkedInAt: row.checkedInAt,
    checkedOutAt: row.checkedOutAt,
    pickupName: row.pickupName,
    overridden: row.overrideReason !== null,
    labelPrintedAt: row.labelPrintedAt,
    alerts: alerts.get(row.childPersonId) ?? [],
  }));
};

// ---------------------------------------------------------------------------------------------
// Households and guardianship
// ---------------------------------------------------------------------------------------------

const isGuardianRelationship = (relationship: string) =>
  (GUARDIAN_RELATIONSHIPS as readonly string[]).includes(relationship);

/** The household a person belongs to, with their relationship in it. */
export const householdLinkOf = (db: Queryable, churchId: string, personId: string) =>
  db
    .select({
      householdId: householdMembers.householdId,
      relationship: householdMembers.relationship,
    })
    .from(householdMembers)
    .where(and(eq(householdMembers.churchId, churchId), eq(householdMembers.personId, personId)))
    .get() ?? null;

/** Guardians (head, spouse, parent) of a child's household. */
export const guardiansOf = (
  db: Queryable,
  churchId: string,
  childPersonId: string,
): (PersonSummary & { userId: string | null })[] => {
  const link = householdLinkOf(db, churchId, childPersonId);
  if (!link || link.relationship !== 'child') return [];
  return db
    .select({ ...personColumns, userId: people.userId })
    .from(householdMembers)
    .innerJoin(people, eq(people.id, householdMembers.personId))
    .where(
      and(
        eq(householdMembers.churchId, churchId),
        eq(householdMembers.householdId, link.householdId),
        inArray(householdMembers.relationship, [...GUARDIAN_RELATIONSHIPS]),
      ),
    )
    .orderBy(desc(householdMembers.isPrimaryContact), asc(people.firstName))
    .all();
};

/** Whether `guardianPersonId` is a guardian in the household where the child is a child. */
export const isGuardianOf = (
  db: Queryable,
  churchId: string,
  guardianPersonId: string | null,
  childPersonId: string,
): boolean => {
  if (!guardianPersonId || guardianPersonId === childPersonId) return false;
  const guardian = householdLinkOf(db, churchId, guardianPersonId);
  if (!guardian || !isGuardianRelationship(guardian.relationship)) return false;
  const child = householdLinkOf(db, churchId, childPersonId);
  return child?.householdId === guardian.householdId && child.relationship === 'child';
};

/** Linked accounts of a child's guardians, for pickup and check-in notices. */
export const guardianUserIds = (db: Queryable, churchId: string, childPersonId: string) =>
  guardiansOf(db, churchId, childPersonId).flatMap((guardian) =>
    guardian.userId ? [guardian.userId] : [],
  );

/**
 * Families ready for check-in: guardians, children young enough (or without a birth date) with
 * their alerts and suggested class, and whether each is already checked in to `sessionId`.
 * Households without children are left out.
 */
export const buildHouseholds = (
  db: Queryable,
  church: ChurchRow,
  access: AccessLike,
  householdIds: readonly string[],
  sessionId: string | null,
): CheckinHousehold[] => {
  const ids = [...new Set(householdIds)];
  if (ids.length === 0) return [];
  const settings = checkinSettingsOf(church);
  const today = todayIn(church.timezone);
  const homes = db
    .select({ id: households.id, name: households.name, phone: households.phone })
    .from(households)
    .where(and(eq(households.churchId, church.id), inArray(households.id, ids)))
    .orderBy(asc(households.name))
    .all();
  const members = db
    .select({
      householdId: householdMembers.householdId,
      relationship: householdMembers.relationship,
      isPrimaryContact: householdMembers.isPrimaryContact,
      person: { ...personColumns, birthDate: people.birthDate, phone: people.phone },
    })
    .from(householdMembers)
    .innerJoin(people, eq(people.id, householdMembers.personId))
    .where(
      and(eq(householdMembers.churchId, church.id), inArray(householdMembers.householdId, ids)),
    )
    .orderBy(desc(householdMembers.isPrimaryContact), asc(people.birthDate), asc(people.firstName))
    .all();
  const children = members.filter((member) => {
    if (member.relationship !== 'child') return false;
    const age = childAge(member.person.birthDate, today);
    return age === null || age <= settings.childMaxAge;
  });
  const childIds = children.map((member) => member.person.id);
  const alerts = activeAlertsByChild(db, church.id, childIds);
  const profiles = new Map(
    childIds.length === 0
      ? []
      : db
          .select({
            personId: checkinChildProfiles.personId,
            defaultClassId: checkinChildProfiles.defaultClassId,
          })
          .from(checkinChildProfiles)
          .where(
            and(
              eq(checkinChildProfiles.churchId, church.id),
              inArray(checkinChildProfiles.personId, childIds),
            ),
          )
          .all()
          .map((row) => [row.personId, row.defaultClassId]),
  );
  // A guardian who hides their phone in the directory is not shown by its last digits either.
  const phones = new Map(
    withPrivacy(
      db,
      access,
      members.map(({ person }) => ({ id: person.id, phone: person.phone })),
    ).map((person) => [person.id, person.phone]),
  );
  const open = openCheckinsByChild(db, church.id, sessionId, childIds);
  const classes = classRowsOf(db, church.id, false);
  return homes
    .map((home) => {
      const own = members.filter((member) => member.householdId === home.id);
      const guardians = own.filter((member) => isGuardianRelationship(member.relationship));
      const phone =
        phoneLast4(home.phone) ??
        guardians.map((member) => phoneLast4(phones.get(member.person.id) ?? null)).find(Boolean) ??
        null;
      return {
        householdId: home.id,
        name: home.name,
        phoneLast4: phone,
        guardians: guardians.map(({ person }) => summaryOf(person)),
        children: children
          .filter((member) => member.householdId === home.id)
          .map(({ person }) =>
            toCheckinChild(person, {
              today,
              classes,
              defaultClassId: profiles.get(person.id) ?? null,
              alerts: alerts.get(person.id) ?? [],
              currentCheckinId: open.get(person.id) ?? null,
            }),
          ),
      };
    })
    .filter((home) => home.children.length > 0);
};

const summaryOf = (person: PersonSummary): PersonSummary => ({
  id: person.id,
  firstName: person.firstName,
  lastName: person.lastName,
  photoUrl: person.photoUrl,
  membershipStatus: person.membershipStatus,
});

export const toCheckinChild = (
  person: PersonSummary & { birthDate: string | null },
  context: {
    today: string;
    classes: CheckinClassRow[];
    defaultClassId: string | null;
    alerts: ChildAlert[];
    currentCheckinId: string | null;
  },
): CheckinChild => {
  const age = childAge(person.birthDate, context.today);
  return {
    ...summaryOf(person),
    birthDate: person.birthDate,
    age,
    defaultClassId: context.defaultClassId,
    suggestedClassId: suggestClass(context.classes, age, context.defaultClassId)?.id ?? null,
    alerts: context.alerts,
    currentCheckinId: context.currentCheckinId,
  };
};

/** Open check-in ids per child in a session. */
export const openCheckinsByChild = (
  db: Queryable,
  churchId: string,
  sessionId: string | null,
  childIds: readonly string[],
): Map<string, string> => {
  if (!sessionId || childIds.length === 0) return new Map();
  return new Map(
    db
      .select({ id: checkins.id, childPersonId: checkins.childPersonId })
      .from(checkins)
      .where(
        and(
          eq(checkins.churchId, churchId),
          eq(checkins.sessionId, sessionId),
          eq(checkins.status, 'checked_in'),
          inArray(checkins.childPersonId, [...childIds]),
        ),
      )
      .all()
      .map((row) => [row.childPersonId, row.id]),
  );
};

// ---------------------------------------------------------------------------------------------
// Security codes and the attendance feed
// ---------------------------------------------------------------------------------------------

/**
 * A CSPRNG code from the unambiguous alphabet that no check-in of the session uses yet.
 * `taken` holds codes handed out earlier in the same request.
 */
export const uniqueSecurityCode = (
  db: Queryable,
  sessionId: string,
  taken: Set<string>,
  length: number,
): string => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = generateCode(length);
    if (taken.has(code)) continue;
    const used = db
      .select({ id: checkins.id })
      .from(checkins)
      .where(and(eq(checkins.sessionId, sessionId), eq(checkins.securityCode, code)))
      .get();
    if (!used) {
      taken.add(code);
      return code;
    }
  }
  throw conflict('Could not create a unique security code. Try again');
};

/** The UTC instant of a wall-clock `date` and `time` (HH:MM) in `timeZone`. */
export const zonedIso = (date: string, time: string, timeZone: string): string => {
  const guess = new Date(`${date}T${time}:00Z`);
  try {
    const parts = dateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(guess);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((item) => item.type === type)?.value ?? 0);
    const wall = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    );
    return new Date(guess.getTime() - (wall - guess.getTime())).toISOString();
  } catch {
    return guess.toISOString();
  }
};

/**
 * When the session took place, for attendance: the linked service's start, the moment it was
 * opened when that was on the session's date, or 09:00 local time on that date (a session
 * opened ahead of time or recorded afterwards still counts for its own Sunday).
 */
const sessionMoment = (db: Queryable, session: CheckinSessionRow, timezone: string): string => {
  if (session.worshipServiceId) {
    const service = db
      .select({ startsAt: worshipServices.startsAt })
      .from(worshipServices)
      .where(
        and(
          eq(worshipServices.id, session.worshipServiceId),
          eq(worshipServices.churchId, session.churchId),
        ),
      )
      .get();
    if (service) return service.startsAt;
  }
  const openedOn = (() => {
    try {
      return dateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(session.openedAt));
    } catch {
      return session.openedAt.slice(0, 10);
    }
  })();
  return openedOn === session.date ? session.openedAt : zonedIso(session.date, '09:00', timezone);
};

/**
 * Copies a session's children to an attendance session (roster mode, everyone present) so
 * Sekolah Minggu attendance shows up in the attendance stats. Idempotent: re-closing a reopened
 * session adds the children checked in since.
 */
export const syncAttendance = (
  db: Queryable,
  session: CheckinSessionRow,
  timezone: string,
  userId: string,
): string => {
  const now = nowIso();
  const title = `Sekolah Minggu · ${session.name}`;
  const sessionAt = sessionMoment(db, session, timezone);
  const childIds = [
    ...new Set(
      db
        .select({ childPersonId: checkins.childPersonId })
        .from(checkins)
        .where(eq(checkins.sessionId, session.id))
        .all()
        .map((row) => row.childPersonId),
    ),
  ];
  let attendanceId = session.attendanceSessionId;
  const existing = attendanceId
    ? db
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.id, attendanceId),
            eq(attendanceSessions.churchId, session.churchId),
          ),
        )
        .get()
    : undefined;
  if (existing) {
    db.update(attendanceSessions)
      .set({ title, sessionAt, headcountChildren: childIds.length, updatedAt: now })
      .where(eq(attendanceSessions.id, existing.id))
      .run();
    syncRecordTimes(db, existing.id, sessionAt);
  } else {
    attendanceId = newId();
    db.insert(attendanceSessions)
      .values({
        id: attendanceId,
        churchId: session.churchId,
        title,
        sessionAt,
        mode: 'roster',
        headcountChildren: childIds.length,
        notes: null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  const id = attendanceId as string;
  if (childIds.length > 0) {
    db.insert(attendanceRecords)
      .values(
        childIds.map((personId) => ({
          id: newId(),
          sessionId: id,
          personId,
          churchId: session.churchId,
          status: 'present' as const,
          sessionAt,
          note: null,
          recordedBy: userId,
          recordedAt: now,
        })),
      )
      .onConflictDoNothing()
      .run();
  }
  return id;
};

/**
 * Undoes `syncAttendance` for one child whose check-in was removed, unless the child has
 * another check-in in the session. Keeps the attendance headcount in step.
 */
export const removeFromAttendance = (
  db: Queryable,
  session: CheckinSessionRow,
  childPersonId: string,
) => {
  if (!session.attendanceSessionId) return;
  const other = db
    .select({ id: checkins.id })
    .from(checkins)
    .where(and(eq(checkins.sessionId, session.id), eq(checkins.childPersonId, childPersonId)))
    .get();
  if (other) return;
  db.delete(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.churchId, session.churchId),
        eq(attendanceRecords.sessionId, session.attendanceSessionId),
        eq(attendanceRecords.personId, childPersonId),
      ),
    )
    .run();
  const children =
    db
      .select({ value: countDistinct(checkins.childPersonId) })
      .from(checkins)
      .where(eq(checkins.sessionId, session.id))
      .get()?.value ?? 0;
  db.update(attendanceSessions)
    .set({ headcountChildren: children, updatedAt: nowIso() })
    .where(
      and(
        eq(attendanceSessions.id, session.attendanceSessionId),
        eq(attendanceSessions.churchId, session.churchId),
      ),
    )
    .run();
};
