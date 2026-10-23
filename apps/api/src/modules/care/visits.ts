import {
  canChangeCareConfidentiality,
  canManageCareCase,
  canManageCareVisit,
  canReadCareCase,
  canReadCareVisit,
  careVisitInputSchema,
  careVisitListQuerySchema,
  churchIdParamsSchema,
  churchParamsSchema,
  fullName,
  has,
  type AccessLike,
  type CareVisitInput,
} from '@tatagereja/shared';
import { and, count, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { CareVisitRow } from '../../db/schema';
import { careCases, careVisitVisitors, careVisits, people } from '../../db/schema';
import type { Deps } from '../../deps';
import { forbidden, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit, redact } from '../../services/audit';
import {
  caregiverIdsOf,
  loadHouseholdInChurch,
  loadPersonInChurch,
  readableVisitCondition,
  redactedChanges,
} from '../../services/care';
import { hydrateVisits, visitorIdsByVisit } from './serializers';

const SECRET_FIELDS = ['summary', 'followUpNote'];
/** Who was visited and where stay out of the audit log for confidential visits. */
const CONFIDENTIAL_FIELDS = [...SECRET_FIELDS, 'personId', 'householdId', 'location'];

const secretFields = (row: Pick<CareVisitRow, 'confidentiality'>) =>
  row.confidentiality === 'confidential' ? CONFIDENTIAL_FIELDS : SECRET_FIELDS;

const auditable = (row: CareVisitRow, visitorPersonIds: readonly string[]) => ({
  caseId: row.caseId,
  personId: row.personId,
  householdId: row.householdId,
  visitDate: row.visitDate,
  location: row.location,
  summary: row.summary,
  confidentiality: row.confidentiality,
  followUpNeeded: row.followUpNeeded,
  followUpNote: row.followUpNote,
  otherVisitors: row.otherVisitors,
  visitorPersonIds: [...visitorPersonIds].sort(),
});

export const careVisitsRouter = (deps: Deps) => {
  const { db } = deps;

  const loadCase = (churchId: string, id: string) => {
    const row = db
      .select()
      .from(careCases)
      .where(and(eq(careCases.id, id), eq(careCases.churchId, churchId)))
      .get();
    if (!row) throw notFound('Care case');
    return { row, caregiverIds: caregiverIdsOf(db, row.id) };
  };

  /** Loads a visit the caller may read; anything else is 404. */
  const loadReadable = (churchId: string, access: AccessLike, id: string) => {
    const row = db
      .select()
      .from(careVisits)
      .where(and(eq(careVisits.id, id), eq(careVisits.churchId, churchId)))
      .get();
    if (!row) throw notFound('Visit');
    const visitorPersonIds = visitorIdsByVisit(db, [row.id]).get(row.id) ?? [];
    const caseCaregivers = row.caseId ? caregiverIdsOf(db, row.caseId) : [];
    if (!canReadCareVisit(access, { ...row, visitorPersonIds }, caseCaregivers)) {
      throw notFound('Visit');
    }
    return { row, visitorPersonIds, caseCaregivers };
  };

  /**
   * Checks the people and case a visit names. A visit for a case needs the right to manage that
   * case and inherits its confidentiality; other new visits need `care.manage`. When editing
   * (`existing`), the edit itself is already authorised and keeping the same case is allowed.
   */
  const resolve = (
    churchId: string,
    access: AccessLike,
    body: CareVisitInput,
    existing?: CareVisitRow,
  ) => {
    let confidentiality = body.confidentiality;
    let personId = body.personId;
    if (body.caseId) {
      const linked = loadCase(churchId, body.caseId);
      if (body.caseId !== existing?.caseId) {
        if (!canReadCareCase(access, linked.row, linked.caregiverIds)) {
          throw notFound('Care case');
        }
        if (!canManageCareCase(access, linked.row, linked.caregiverIds)) {
          throw forbidden('You cannot record visits for this care case');
        }
      }
      if (linked.row.confidentiality === 'confidential') confidentiality = 'confidential';
      personId = personId ?? linked.row.personId;
    } else if (!existing && !has(access, 'care.manage')) {
      throw forbidden('You cannot record visits');
    }
    if (personId) loadPersonInChurch(db, churchId, personId);
    if (body.householdId) loadHouseholdInChurch(db, churchId, body.householdId);
    const visitorPersonIds = [...new Set(body.visitorPersonIds)];
    if (visitorPersonIds.length > 0) {
      const found = db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.churchId, churchId), inArray(people.id, visitorPersonIds)))
        .all();
      if (found.length !== visitorPersonIds.length) throw notFound('Person');
    }
    return { confidentiality, personId, visitorPersonIds };
  };

  const subjectName = (row: CareVisitRow) => {
    if (row.confidentiality === 'confidential') return 'a confidential visit';
    const person = row.personId
      ? db
          .select({ firstName: people.firstName, lastName: people.lastName })
          .from(people)
          .where(eq(people.id, row.personId))
          .get()
      : null;
    return person ? `the visit to ${fullName(person)}` : 'a visit';
  };

  const writeVisitors = (
    tx: Queryable,
    visitId: string,
    churchId: string,
    personIds: readonly string[],
  ) => {
    tx.delete(careVisitVisitors).where(eq(careVisitVisitors.visitId, visitId)).run();
    if (personIds.length > 0) {
      tx.insert(careVisitVisitors)
        .values(personIds.map((personId) => ({ visitId, personId, churchId })))
        .run();
    }
  };

  const hydrateOne = (
    churchId: string,
    access: AccessLike,
    row: CareVisitRow,
    withSummary: boolean,
  ) => {
    const [visit] = hydrateVisits(db, churchId, access, [row], { withSummary });
    if (!visit) throw notFound('Visit');
    return visit;
  };

  return new Elysia({ prefix: '/churches/:churchId/care/visits' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const conditions: SQL[] = [eq(careVisits.churchId, church.id)];
        const readable = readableVisitCondition(db, access);
        if (readable) conditions.push(readable);
        if (query.personId) conditions.push(eq(careVisits.personId, query.personId));
        if (query.householdId) conditions.push(eq(careVisits.householdId, query.householdId));
        if (query.caseId) conditions.push(eq(careVisits.caseId, query.caseId));
        if (query.from) conditions.push(gte(careVisits.visitDate, query.from));
        if (query.to) conditions.push(lte(careVisits.visitDate, query.to));
        if (query.followUpNeeded !== undefined) {
          conditions.push(eq(careVisits.followUpNeeded, query.followUpNeeded));
        }
        if (query.mine) {
          const mine = or(
            eq(careVisits.createdBy, access.userId),
            access.personId
              ? inArray(
                  careVisits.id,
                  db
                    .select({ id: careVisitVisitors.visitId })
                    .from(careVisitVisitors)
                    .where(eq(careVisitVisitors.personId, access.personId)),
                )
              : undefined,
          );
          if (mine) conditions.push(mine);
        }
        if (query.q) {
          // Names and places only: summaries are never searched.
          const pattern = likePattern(query.q);
          const match = or(
            like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
            like(careVisits.location, pattern),
          );
          if (match) conditions.push(match);
        }
        const where = and(...conditions);
        const total =
          db
            .select({ value: count() })
            .from(careVisits)
            .leftJoin(people, eq(people.id, careVisits.personId))
            .where(where)
            .get()?.value ?? 0;
        const rows = db
          .select({ row: careVisits })
          .from(careVisits)
          .leftJoin(people, eq(people.id, careVisits.personId))
          .where(where)
          .orderBy(desc(careVisits.visitDate), desc(careVisits.createdAt))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all()
          .map((entry) => entry.row);
        return {
          items: hydrateVisits(db, church.id, access, rows),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      { church: 'care', params: churchParamsSchema, query: careVisitListQuerySchema },
    )
    .post(
      '/',
      ({ church, access, auth, audit, body, set }) => {
        const resolved = resolve(church.id, access, body);
        const now = nowIso();
        const created = db.transaction((tx) => {
          const row = tx
            .insert(careVisits)
            .values({
              id: newId(),
              churchId: church.id,
              caseId: body.caseId,
              personId: resolved.personId,
              householdId: body.householdId,
              visitDate: body.visitDate,
              location: body.location,
              summary: body.summary,
              confidentiality: resolved.confidentiality,
              followUpNeeded: body.followUpNeeded,
              followUpNote: body.followUpNeeded ? body.followUpNote : null,
              otherVisitors: body.otherVisitors,
              createdBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          writeVisitors(tx, row.id, church.id, resolved.visitorPersonIds);
          if (row.caseId) {
            tx.update(careCases).set({ updatedAt: now }).where(eq(careCases.id, row.caseId)).run();
          }
          recordAudit(tx, audit, {
            module: 'care',
            action: 'care_visit.create',
            entityType: 'care_visit',
            entityId: row.id,
            summary: `Recorded ${subjectName(row)}`,
            after: redact(auditable(row, resolved.visitorPersonIds), secretFields(row)),
          });
          return row;
        });
        set.status = 201;
        return { visit: hydrateOne(church.id, access, created, true) };
      },
      { church: 'care', params: churchParamsSchema, body: careVisitInputSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const { row } = loadReadable(church.id, access, params.id);
        return { visit: hydrateOne(church.id, access, row, true) };
      },
      { church: 'care', params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, audit, params, body }) => {
        const { row, visitorPersonIds, caseCaregivers } = loadReadable(
          church.id,
          access,
          params.id,
        );
        if (!canManageCareVisit(access, row, caseCaregivers)) {
          throw forbidden('You cannot change this visit');
        }
        const resolved = resolve(church.id, access, body, row);
        if (!canChangeCareConfidentiality(access, row.confidentiality, resolved.confidentiality)) {
          throw forbidden('Only holders of confidential care access can lower confidentiality');
        }
        const now = nowIso();
        const updated = db.transaction((tx) => {
          const next = tx
            .update(careVisits)
            .set({
              caseId: body.caseId,
              personId: resolved.personId,
              householdId: body.householdId,
              visitDate: body.visitDate,
              location: body.location,
              summary: body.summary,
              confidentiality: resolved.confidentiality,
              followUpNeeded: body.followUpNeeded,
              followUpNote: body.followUpNeeded ? body.followUpNote : null,
              otherVisitors: body.otherVisitors,
              updatedAt: now,
            })
            .where(eq(careVisits.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Visit');
          writeVisitors(tx, row.id, church.id, resolved.visitorPersonIds);
          recordAudit(tx, audit, {
            module: 'care',
            action: 'care_visit.update',
            entityType: 'care_visit',
            entityId: row.id,
            summary: `Updated ${subjectName(next.confidentiality === 'confidential' ? next : row)}`,
            ...redactedChanges(
              auditable(row, visitorPersonIds),
              auditable(next, resolved.visitorPersonIds),
              secretFields(next.confidentiality === 'confidential' ? next : row),
            ),
          });
          return next;
        });
        return { visit: hydrateOne(church.id, access, updated, true) };
      },
      { church: 'care', params: churchIdParamsSchema, body: careVisitInputSchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        const { row, visitorPersonIds, caseCaregivers } = loadReadable(
          church.id,
          access,
          params.id,
        );
        if (!canManageCareVisit(access, row, caseCaregivers)) {
          throw forbidden('You cannot delete this visit');
        }
        db.transaction((tx) => {
          tx.delete(careVisits).where(eq(careVisits.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'care',
            action: 'care_visit.delete',
            entityType: 'care_visit',
            entityId: row.id,
            summary: `Deleted ${subjectName(row)}`,
            before: redact(auditable(row, visitorPersonIds), secretFields(row)),
          });
        });
        return { ok: true as const };
      },
      { church: 'care', params: churchIdParamsSchema },
    );
};
