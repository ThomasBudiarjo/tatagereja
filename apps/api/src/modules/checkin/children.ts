import {
  CHECKIN_LIMITS,
  authorizedPickupInputSchema,
  canEditChildCare,
  canOperateCheckin,
  checkinChildListQuerySchema,
  childAge,
  childAlertInputSchema,
  childAlertParamsSchema,
  childAttendanceQuerySchema,
  childParamsSchema,
  childPickupParamsSchema,
  childProfileInputSchema,
  churchParamsSchema,
  fullName,
  kioskSearchQuerySchema,
  newCheckinChildInputSchema,
  type AccessLike,
  type AuthorizedPickupInput,
  type CheckinChildListItem,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  like,
  max,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ChurchRow, PersonRow } from '../../db/schema';
import {
  checkinAuthorizedPickups,
  checkinChildAlerts,
  checkinChildProfiles,
  checkinClasses,
  checkins,
  checkinSessions,
  householdMembers,
  households,
  people,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { onVisibleContact } from '../../services/people';
import { changes, recordAudit, redact } from '../../services/audit';
import {
  activeAlertsByChild,
  buildHouseholds,
  checkinSettingsOf,
  classRowsOf,
  guardiansOf,
  householdLinkOf,
  isGuardianOf,
  loadClassRow,
  loadPerson,
  loadSessionRow,
  openCheckinsByChild,
  toCheckinChild,
  toChildAlert,
  toPickup,
  todayIn,
} from '../../services/checkin';

const operate = { module: 'checkin', permission: ['checkin.operate', 'checkin.manage'] } as const;
const manage = { module: 'checkin', permission: 'checkin.manage' } as const;

/** Digits of a phone column, for matching the last four digits typed at the kiosk. */
const digitsOf = (column: SQL | typeof people.phone | typeof households.phone) =>
  sql`replace(replace(replace(replace(replace(replace(coalesce(${column}, ''), ' ', ''), '-', ''), '+', ''), '.', ''), '(', ''), ')', '')`;

const childName = (person: Pick<PersonRow, 'firstName' | 'lastName'>) => fullName(person);

/**
 * Children (people young enough, household children, or anyone with a check-in profile or
 * history), their alerts, authorized pick-ups and attendance, and the kiosk family search.
 * Guardians manage their own children's alerts and pick-ups without a permission.
 */
export const checkinChildrenRouter = (deps: Deps) => {
  const { db } = deps;

  /**
   * Whether a person counts as a child for check-in, the rule the children list uses: young
   * enough, a child of a household without a birth date, or with a check-in profile or history.
   */
  const isCheckinChild = (church: ChurchRow, person: PersonRow) => {
    const age = childAge(person.birthDate, todayIn(church.timezone));
    if (age !== null && age <= checkinSettingsOf(church).childMaxAge) return true;
    if (age === null && householdLinkOf(db, church.id, person.id)?.relationship === 'child') {
      return true;
    }
    const profile = db
      .select({ id: checkinChildProfiles.personId })
      .from(checkinChildProfiles)
      .where(
        and(
          eq(checkinChildProfiles.churchId, church.id),
          eq(checkinChildProfiles.personId, person.id),
        ),
      )
      .get();
    if (profile) return true;
    return !!db
      .select({ id: checkins.id })
      .from(checkins)
      .where(and(eq(checkins.churchId, church.id), eq(checkins.childPersonId, person.id)))
      .get();
  };

  /**
   * Loads a child the caller may see: volunteers see the children of the church (not adults,
   * whose records belong to the directory), guardians their own.
   */
  const loadChild = (church: ChurchRow, access: AccessLike, personId: string) => {
    const person = loadPerson(db, church.id, personId, 'Child');
    const isGuardian = isGuardianOf(db, church.id, access.personId, person.id);
    if (!isGuardian && !(canOperateCheckin(access) && isCheckinChild(church, person))) {
      throw notFound('Child');
    }
    return { person, isGuardian };
  };

  /** Like `loadChild`, and the caller must be a guardian or hold `checkin.manage`. */
  const loadEditableChild = (church: ChurchRow, access: AccessLike, personId: string) => {
    const child = loadChild(church, access, personId);
    if (!canEditChildCare(access, child)) {
      throw forbidden("Only the child's guardians or a coordinator can change this");
    }
    return child;
  };

  const listItems = (
    church: ChurchRow,
    rows: (Pick<
      PersonRow,
      'id' | 'firstName' | 'lastName' | 'photoUrl' | 'membershipStatus' | 'birthDate'
    > & { householdName: string | null })[],
    sessionId: string | null,
  ): CheckinChildListItem[] => {
    const ids = rows.map((row) => row.id);
    const alerts = activeAlertsByChild(db, church.id, ids);
    const profiles = new Map(
      ids.length === 0
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
                inArray(checkinChildProfiles.personId, ids),
              ),
            )
            .all()
            .map((row) => [row.personId, row.defaultClassId]),
    );
    const open = openCheckinsByChild(db, church.id, sessionId, ids);
    const classes = classRowsOf(db, church.id, false);
    const today = todayIn(church.timezone);
    return rows.map((row) => ({
      ...toCheckinChild(row, {
        today,
        classes,
        defaultClassId: profiles.get(row.id) ?? null,
        alerts: alerts.get(row.id) ?? [],
        currentCheckinId: open.get(row.id) ?? null,
      }),
      householdName: row.householdName,
    }));
  };

  const childRowQuery = () =>
    db
      .select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
        photoUrl: people.photoUrl,
        membershipStatus: people.membershipStatus,
        birthDate: people.birthDate,
        householdName: households.name,
      })
      .from(people)
      .leftJoin(householdMembers, eq(householdMembers.personId, people.id))
      .leftJoin(households, eq(households.id, householdMembers.householdId));

  const oneItem = (church: ChurchRow, personId: string) => {
    const row = childRowQuery()
      .where(and(eq(people.id, personId), eq(people.churchId, church.id)))
      .get();
    if (!row) throw notFound('Child');
    return listItems(church, [row], null)[0]!;
  };

  const loadAlert = (churchId: string, personId: string, alertId: string) => {
    const row = db
      .select()
      .from(checkinChildAlerts)
      .where(
        and(
          eq(checkinChildAlerts.id, alertId),
          eq(checkinChildAlerts.churchId, churchId),
          eq(checkinChildAlerts.personId, personId),
        ),
      )
      .get();
    if (!row) throw notFound('Alert');
    return row;
  };

  const loadPickup = (churchId: string, personId: string, pickupId: string) => {
    const row = db
      .select()
      .from(checkinAuthorizedPickups)
      .where(
        and(
          eq(checkinAuthorizedPickups.id, pickupId),
          eq(checkinAuthorizedPickups.churchId, churchId),
          eq(checkinAuthorizedPickups.childPersonId, personId),
        ),
      )
      .get();
    if (!row) throw notFound('Pick-up person');
    return row;
  };

  /**
   * The stored values of a pick-up entry; a chosen person lends their name. Their phone is not
   * copied, so a guardian cannot read a number the person keeps private in the directory.
   */
  const pickupValues = (churchId: string, childId: string, body: AuthorizedPickupInput) => {
    if (body.pickupPersonId === childId) {
      throw conflict('A child cannot be their own pick-up person');
    }
    const person = body.pickupPersonId ? loadPerson(db, churchId, body.pickupPersonId) : null;
    return {
      pickupPersonId: person?.id ?? null,
      name: body.name ?? (person ? fullName(person) : ''),
      relationship: body.relationship,
      phone: body.phone,
      notes: body.notes,
    };
  };

  const alertSnapshot = (row: {
    kind: string;
    severity: string;
    description: string;
    isActive: boolean;
  }) =>
    redact(
      {
        kind: row.kind,
        severity: row.severity,
        description: row.description,
        isActive: row.isActive,
      },
      ['description'],
    );

  return new Elysia({ prefix: '/churches/:churchId/checkin' })
    .use(authPlugin(deps))
    .get(
      '/households',
      ({ church, access, query }) => {
        if (query.sessionId) loadSessionRow(db, church.id, query.sessionId);
        let match: SQL | undefined;
        if (query.phoneLast4) {
          const suffix = `%${query.phoneLast4}`;
          match = or(
            like(digitsOf(households.phone), suffix),
            exists(
              db
                .select({ one: sql`1` })
                .from(householdMembers)
                .innerJoin(people, eq(people.id, householdMembers.personId))
                .where(
                  and(
                    eq(householdMembers.householdId, households.id),
                    onVisibleContact(access, 'show_phone', like(digitsOf(people.phone), suffix)),
                  ),
                ),
            ),
          );
        } else {
          const pattern = likePattern(query.q);
          match = or(
            like(households.name, pattern),
            exists(
              db
                .select({ one: sql`1` })
                .from(householdMembers)
                .innerJoin(people, eq(people.id, householdMembers.personId))
                .where(
                  and(
                    eq(householdMembers.householdId, households.id),
                    or(
                      like(people.lastName, pattern),
                      like(
                        sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`,
                        pattern,
                      ),
                    ),
                  ),
                ),
            ),
          );
        }
        const ids = db
          .select({ id: households.id })
          .from(households)
          .where(and(eq(households.churchId, church.id), match))
          .orderBy(asc(households.name))
          .limit(CHECKIN_LIMITS.kioskResultsMax * 3)
          .all()
          .map((row) => row.id);
        return {
          items: buildHouseholds(db, church, access, ids, query.sessionId ?? null).slice(
            0,
            CHECKIN_LIMITS.kioskResultsMax,
          ),
        };
      },
      { church: operate, params: churchParamsSchema, query: kioskSearchQuerySchema },
    )
    .get(
      '/children',
      ({ church, query }) => {
        if (query.sessionId) loadSessionRow(db, church.id, query.sessionId);
        const settings = checkinSettingsOf(church);
        const today = todayIn(church.timezone);
        const cutoff = `${Number(today.slice(0, 4)) - settings.childMaxAge - 1}${today.slice(4)}`;
        const hasProfile = exists(
          db
            .select({ one: sql`1` })
            .from(checkinChildProfiles)
            .where(eq(checkinChildProfiles.personId, people.id)),
        );
        const hasHistory = exists(
          db
            .select({ one: sql`1` })
            .from(checkins)
            .where(eq(checkins.childPersonId, people.id)),
        );
        const isChild = or(
          sql`${people.birthDate} > ${cutoff}`,
          and(isNull(people.birthDate), eq(householdMembers.relationship, 'child')),
          hasProfile,
          hasHistory,
        );
        const conditions: SQL[] = [eq(people.churchId, church.id)];
        if (isChild) conditions.push(isChild);
        if (query.q) {
          const pattern = likePattern(query.q);
          const text = or(
            like(people.firstName, pattern),
            like(people.lastName, pattern),
            like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
            like(households.name, pattern),
          );
          if (text) conditions.push(text);
        }
        if (query.alerts) {
          conditions.push(
            exists(
              db
                .select({ one: sql`1` })
                .from(checkinChildAlerts)
                .where(
                  and(
                    eq(checkinChildAlerts.personId, people.id),
                    eq(checkinChildAlerts.isActive, true),
                  ),
                ),
            ),
          );
        }
        if (query.classId) {
          conditions.push(
            exists(
              db
                .select({ one: sql`1` })
                .from(checkinChildProfiles)
                .where(
                  and(
                    eq(checkinChildProfiles.personId, people.id),
                    eq(checkinChildProfiles.defaultClassId, query.classId),
                  ),
                ),
            ),
          );
        }
        const where = and(...conditions);
        const total =
          db
            .select({ value: count() })
            .from(people)
            .leftJoin(householdMembers, eq(householdMembers.personId, people.id))
            .leftJoin(households, eq(households.id, householdMembers.householdId))
            .where(where)
            .get()?.value ?? 0;
        const rows = childRowQuery()
          .where(where)
          .orderBy(asc(people.firstName), asc(people.lastName))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: listItems(church, rows, query.sessionId ?? null),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      { church: operate, params: churchParamsSchema, query: checkinChildListQuerySchema },
    )
    .post(
      '/children',
      ({ church, auth, audit, body, set }) => {
        if (body.defaultClassId) loadClassRow(db, church.id, body.defaultClassId);
        const now = nowIso();
        const personId = newId();
        db.transaction((tx) => {
          tx.insert(people)
            .values({
              id: personId,
              churchId: church.id,
              firstName: body.firstName,
              lastName: body.lastName,
              gender: body.gender,
              birthDate: body.birthDate,
              membershipStatus: 'visitor',
              createdAt: now,
              updatedAt: now,
            })
            .run();
          tx.insert(checkinChildProfiles)
            .values({
              personId,
              churchId: church.id,
              defaultClassId: body.defaultClassId,
              updatedBy: auth.user.id,
              updatedAt: now,
            })
            .run();
          if (body.guardianName) {
            tx.insert(checkinAuthorizedPickups)
              .values({
                id: newId(),
                churchId: church.id,
                childPersonId: personId,
                name: body.guardianName,
                relationship: 'Orang tua / wali',
                phone: body.guardianPhone,
                createdBy: auth.user.id,
                createdAt: now,
                updatedAt: now,
              })
              .run();
          }
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_child.create',
            entityType: 'person',
            entityId: personId,
            summary: `Registered ${childName(body)} as a first-time child`,
          });
        });
        set.status = 201;
        return { child: oneItem(church, personId) };
      },
      { church: operate, params: churchParamsSchema, body: newCheckinChildInputSchema },
    )
    .get(
      '/children/:personId',
      ({ church, access, params }) => {
        const { person, isGuardian } = loadChild(church, access, params.personId);
        const link = db
          .select({ householdId: householdMembers.householdId })
          .from(householdMembers)
          .where(
            and(eq(householdMembers.churchId, church.id), eq(householdMembers.personId, person.id)),
          )
          .get();
        const history = db
          .select({ value: count(), last: max(checkins.checkedInAt) })
          .from(checkins)
          .where(and(eq(checkins.churchId, church.id), eq(checkins.childPersonId, person.id)))
          .get();
        return {
          child: oneItem(church, person.id),
          householdId: link?.householdId ?? null,
          guardians: guardiansOf(db, church.id, person.id).map(
            ({ userId: _userId, ...guardian }) => guardian,
          ),
          pickups: db
            .select()
            .from(checkinAuthorizedPickups)
            .where(
              and(
                eq(checkinAuthorizedPickups.churchId, church.id),
                eq(checkinAuthorizedPickups.childPersonId, person.id),
              ),
            )
            .orderBy(asc(checkinAuthorizedPickups.name))
            .all()
            .map(toPickup),
          alerts: db
            .select()
            .from(checkinChildAlerts)
            .where(
              and(
                eq(checkinChildAlerts.churchId, church.id),
                eq(checkinChildAlerts.personId, person.id),
              ),
            )
            .orderBy(desc(checkinChildAlerts.isActive), desc(checkinChildAlerts.updatedAt))
            .all()
            .map(toChildAlert),
          attendanceCount: history?.value ?? 0,
          lastCheckedInAt: history?.last ?? null,
          isGuardian,
          canEdit: canEditChildCare(access, { isGuardian }),
        };
      },
      { church: 'checkin', params: childParamsSchema },
    )
    .put(
      '/children/:personId/profile',
      ({ church, auth, audit, params, body }) => {
        const person = loadPerson(db, church.id, params.personId, 'Child');
        if (body.defaultClassId) loadClassRow(db, church.id, body.defaultClassId);
        const before = db
          .select({ defaultClassId: checkinChildProfiles.defaultClassId })
          .from(checkinChildProfiles)
          .where(eq(checkinChildProfiles.personId, person.id))
          .get();
        const now = nowIso();
        db.transaction((tx) => {
          tx.insert(checkinChildProfiles)
            .values({
              personId: person.id,
              churchId: church.id,
              defaultClassId: body.defaultClassId,
              updatedBy: auth.user.id,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: checkinChildProfiles.personId,
              set: { defaultClassId: body.defaultClassId, updatedBy: auth.user.id, updatedAt: now },
            })
            .run();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_child.profile',
            entityType: 'person',
            entityId: person.id,
            summary: `Changed the usual class of ${childName(person)}`,
            ...changes({ defaultClassId: before?.defaultClassId ?? null }, body),
          });
        });
        return { child: oneItem(church, person.id) };
      },
      { church: manage, params: childParamsSchema, body: childProfileInputSchema },
    )
    .post(
      '/children/:personId/alerts',
      ({ church, access, auth, audit, params, body, set }) => {
        const { person } = loadEditableChild(church, access, params.personId);
        const existing =
          db
            .select({ value: count() })
            .from(checkinChildAlerts)
            .where(eq(checkinChildAlerts.personId, person.id))
            .get()?.value ?? 0;
        if (existing >= CHECKIN_LIMITS.alertsPerChildMax) {
          throw conflict('This child has too many alerts. Remove an old one first');
        }
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(checkinChildAlerts)
            .values({
              id: newId(),
              churchId: church.id,
              personId: person.id,
              ...body,
              createdBy: auth.user.id,
              updatedBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_alert.create',
            entityType: 'checkin_alert',
            entityId: created.id,
            summary: `Added an alert for ${childName(person)}`,
            after: alertSnapshot(created),
          });
          return created;
        });
        set.status = 201;
        return { alert: toChildAlert(row) };
      },
      { church: 'checkin', params: childParamsSchema, body: childAlertInputSchema },
    )
    .patch(
      '/children/:personId/alerts/:alertId',
      ({ church, access, auth, audit, params, body }) => {
        const { person } = loadEditableChild(church, access, params.personId);
        const row = loadAlert(church.id, person.id, params.alertId);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(checkinChildAlerts)
            .set({ ...body, updatedBy: auth.user.id, updatedAt: nowIso() })
            .where(eq(checkinChildAlerts.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Alert');
          const diff = changes(alertSnapshot(row), alertSnapshot(next));
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_alert.update',
            entityType: 'checkin_alert',
            entityId: row.id,
            summary: `Updated an alert for ${childName(person)}`,
            // The description is redacted on both sides, so record that it changed.
            ...(row.description !== next.description
              ? {
                  before: { ...diff.before, description: '[redacted]' },
                  after: { ...diff.after, description: '[redacted]' },
                }
              : diff),
          });
          return next;
        });
        return { alert: toChildAlert(updated) };
      },
      { church: 'checkin', params: childAlertParamsSchema, body: childAlertInputSchema },
    )
    .delete(
      '/children/:personId/alerts/:alertId',
      ({ church, access, audit, params }) => {
        const { person } = loadEditableChild(church, access, params.personId);
        const row = loadAlert(church.id, person.id, params.alertId);
        db.transaction((tx) => {
          tx.delete(checkinChildAlerts).where(eq(checkinChildAlerts.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_alert.delete',
            entityType: 'checkin_alert',
            entityId: row.id,
            summary: `Removed an alert for ${childName(person)}`,
            before: alertSnapshot(row),
          });
        });
        return { ok: true as const };
      },
      { church: 'checkin', params: childAlertParamsSchema },
    )
    .post(
      '/children/:personId/pickups',
      ({ church, access, auth, audit, params, body, set }) => {
        const { person } = loadEditableChild(church, access, params.personId);
        const existing = db
          .select({ pickupPersonId: checkinAuthorizedPickups.pickupPersonId })
          .from(checkinAuthorizedPickups)
          .where(eq(checkinAuthorizedPickups.childPersonId, person.id))
          .all();
        if (existing.length >= CHECKIN_LIMITS.pickupsPerChildMax) {
          throw conflict('This child already has the most pick-up people allowed');
        }
        if (
          body.pickupPersonId &&
          existing.some((item) => item.pickupPersonId === body.pickupPersonId)
        ) {
          throw conflict('This person is already on the pick-up list');
        }
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(checkinAuthorizedPickups)
            .values({
              id: newId(),
              churchId: church.id,
              childPersonId: person.id,
              ...pickupValues(church.id, person.id, body),
              createdBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_pickup.create',
            entityType: 'checkin_pickup',
            entityId: created.id,
            summary: `Allowed ${created.name} to pick up ${childName(person)}`,
            after: redact(toPickup(created), ['phone', 'notes']),
          });
          return created;
        });
        set.status = 201;
        return { pickup: toPickup(row) };
      },
      { church: 'checkin', params: childParamsSchema, body: authorizedPickupInputSchema },
    )
    .patch(
      '/children/:personId/pickups/:pickupId',
      ({ church, access, audit, params, body }) => {
        const { person } = loadEditableChild(church, access, params.personId);
        const row = loadPickup(church.id, person.id, params.pickupId);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(checkinAuthorizedPickups)
            .set({ ...pickupValues(church.id, person.id, body), updatedAt: nowIso() })
            .where(eq(checkinAuthorizedPickups.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Pick-up person');
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_pickup.update',
            entityType: 'checkin_pickup',
            entityId: row.id,
            summary: `Updated ${next.name} on the pick-up list of ${childName(person)}`,
            ...changes(
              redact(toPickup(row), ['phone', 'notes']),
              redact(toPickup(next), ['phone', 'notes']),
            ),
          });
          return next;
        });
        return { pickup: toPickup(updated) };
      },
      { church: 'checkin', params: childPickupParamsSchema, body: authorizedPickupInputSchema },
    )
    .delete(
      '/children/:personId/pickups/:pickupId',
      ({ church, access, audit, params }) => {
        const { person } = loadEditableChild(church, access, params.personId);
        const row = loadPickup(church.id, person.id, params.pickupId);
        db.transaction((tx) => {
          tx.delete(checkinAuthorizedPickups).where(eq(checkinAuthorizedPickups.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin_pickup.delete',
            entityType: 'checkin_pickup',
            entityId: row.id,
            summary: `Removed ${row.name} from the pick-up list of ${childName(person)}`,
          });
        });
        return { ok: true as const };
      },
      { church: 'checkin', params: childPickupParamsSchema },
    )
    .get(
      '/children/:personId/attendance',
      ({ church, access, params, query }) => {
        const { person } = loadChild(church, access, params.personId);
        const where = and(eq(checkins.churchId, church.id), eq(checkins.childPersonId, person.id));
        const total = db.select({ value: count() }).from(checkins).where(where).get()?.value ?? 0;
        const items = db
          .select({
            id: checkins.id,
            sessionId: checkins.sessionId,
            sessionName: checkinSessions.name,
            date: checkinSessions.date,
            className: checkinClasses.name,
            checkedInAt: checkins.checkedInAt,
            checkedOutAt: checkins.checkedOutAt,
            pickupName: checkins.pickupName,
          })
          .from(checkins)
          .innerJoin(checkinSessions, eq(checkinSessions.id, checkins.sessionId))
          .innerJoin(checkinClasses, eq(checkinClasses.id, checkins.classId))
          .where(where)
          .orderBy(desc(checkinSessions.date), desc(checkins.checkedInAt))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return { items, total, page: query.page, limit: query.limit };
      },
      { church: 'checkin', params: childParamsSchema, query: childAttendanceQuerySchema },
    );
};
