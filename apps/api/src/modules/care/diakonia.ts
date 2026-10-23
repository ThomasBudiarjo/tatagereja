import {
  canReadCareCase,
  churchIdParamsSchema,
  churchParamsSchema,
  diakoniaAidInputSchema,
  diakoniaAidListQuerySchema,
  fullName,
  voidDiakoniaAidBodySchema,
  type AccessLike,
  type DiakoniaAidInput,
} from '@tatagereja/shared';
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  isNull,
  like,
  lte,
  or,
  sql,
  sum,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { DiakoniaAidRow } from '../../db/schema';
import { careCases, diakoniaAid, people } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit, redact } from '../../services/audit';
import {
  caregiverIdsOf,
  loadHouseholdInChurch,
  loadPersonInChurch,
  redactedChanges,
} from '../../services/care';
import { hydrateAid } from './serializers';

const VIEWERS = ['diakonia.view', 'diakonia.manage'] as const;

const SECRET_FIELDS = ['description'];

const auditable = (row: DiakoniaAidRow) => ({
  personId: row.personId,
  householdId: row.householdId,
  caseId: row.caseId,
  recipientName: row.recipientName,
  category: row.category,
  form: row.form,
  description: row.description,
  amount: row.amount,
  givenAt: row.givenAt,
  financeReference: row.financeReference,
  voidReason: row.voidReason,
});

export const diakoniaRouter = (deps: Deps) => {
  const { db } = deps;

  const loadAid = (churchId: string, id: string) => {
    const row = db
      .select()
      .from(diakoniaAid)
      .where(and(eq(diakoniaAid.id, id), eq(diakoniaAid.churchId, churchId)))
      .get();
    if (!row) throw notFound('Aid record');
    return row;
  };

  const hydrateOne = (churchId: string, row: DiakoniaAidRow) => {
    const [aid] = hydrateAid(db, churchId, [row]);
    if (!aid) throw notFound('Aid record');
    return aid;
  };

  /** Checks the recipient and the case; a case the caller may not read does not exist for them. */
  const resolve = (
    churchId: string,
    access: AccessLike,
    body: DiakoniaAidInput,
    existing?: DiakoniaAidRow,
  ) => {
    const person = body.personId ? loadPersonInChurch(db, churchId, body.personId) : null;
    if (body.householdId) loadHouseholdInChurch(db, churchId, body.householdId);
    // Keeping the case a record already names needs no access to it (corrections by treasurers).
    if (body.caseId && body.caseId !== existing?.caseId) {
      const linked = db
        .select()
        .from(careCases)
        .where(and(eq(careCases.id, body.caseId), eq(careCases.churchId, churchId)))
        .get();
      if (!linked || !canReadCareCase(access, linked, caregiverIdsOf(db, linked.id))) {
        throw notFound('Care case');
      }
    }
    return {
      personId: person?.id ?? null,
      householdId: body.householdId,
      caseId: body.caseId,
      recipientName: body.recipientName,
      category: body.category,
      form: body.form,
      description: body.description,
      amount: body.amount,
      givenAt: body.givenAt,
      financeReference: body.financeReference,
      label: person ? fullName(person) : (body.recipientName ?? 'a household'),
    };
  };

  const recipientLabel = (row: DiakoniaAidRow) => {
    if (row.personId) {
      const person = db
        .select({ firstName: people.firstName, lastName: people.lastName })
        .from(people)
        .where(eq(people.id, row.personId))
        .get();
      if (person) return fullName(person);
    }
    return row.recipientName ?? 'a household';
  };

  return new Elysia({ prefix: '/churches/:churchId/care/diakonia' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => {
        const conditions: SQL[] = [eq(diakoniaAid.churchId, church.id)];
        if (!query.includeVoided) conditions.push(isNull(diakoniaAid.voidedAt));
        if (query.category) conditions.push(eq(diakoniaAid.category, query.category));
        if (query.form) conditions.push(eq(diakoniaAid.form, query.form));
        if (query.personId) conditions.push(eq(diakoniaAid.personId, query.personId));
        if (query.caseId) conditions.push(eq(diakoniaAid.caseId, query.caseId));
        if (query.from) conditions.push(gte(diakoniaAid.givenAt, query.from));
        if (query.to) conditions.push(lte(diakoniaAid.givenAt, query.to));
        if (query.q) {
          const pattern = likePattern(query.q);
          const match = or(
            like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
            like(diakoniaAid.recipientName, pattern),
            like(diakoniaAid.financeReference, pattern),
          );
          if (match) conditions.push(match);
        }
        const where = and(...conditions);
        const totals = db
          .select({
            value: count(),
            amount: sum(
              sql`case when ${diakoniaAid.voidedAt} is null then ${diakoniaAid.amount} else 0 end`,
            ),
            live: sum(sql`case when ${diakoniaAid.voidedAt} is null then 1 else 0 end`),
            recipients: countDistinct(
              sql`case when ${diakoniaAid.voidedAt} is null then coalesce(${diakoniaAid.personId}, ${diakoniaAid.householdId}, ${diakoniaAid.recipientName}) end`,
            ),
          })
          .from(diakoniaAid)
          .leftJoin(people, eq(people.id, diakoniaAid.personId))
          .where(where)
          .get();
        const rows = db
          .select({ row: diakoniaAid })
          .from(diakoniaAid)
          .leftJoin(people, eq(people.id, diakoniaAid.personId))
          .where(where)
          .orderBy(desc(diakoniaAid.givenAt), desc(diakoniaAid.createdAt))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all()
          .map((entry) => entry.row);
        return {
          items: hydrateAid(db, church.id, rows),
          total: totals?.value ?? 0,
          page: query.page,
          limit: query.limit,
          summary: {
            count: Number(totals?.live ?? 0),
            amount: Number(totals?.amount ?? 0),
            recipients: totals?.recipients ?? 0,
          },
        };
      },
      {
        church: { module: 'care', permission: VIEWERS },
        params: churchParamsSchema,
        query: diakoniaAidListQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, access, auth, audit, body, set }) => {
        const { label, ...values } = resolve(church.id, access, body);
        const now = nowIso();
        const created = db.transaction((tx) => {
          const row = tx
            .insert(diakoniaAid)
            .values({
              id: newId(),
              churchId: church.id,
              ...values,
              createdBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'care',
            action: 'diakonia_aid.create',
            entityType: 'diakonia_aid',
            entityId: row.id,
            summary: `Recorded diakonia aid for ${label}`,
            after: redact(auditable(row), SECRET_FIELDS),
          });
          return row;
        });
        set.status = 201;
        return { aid: hydrateOne(church.id, created) };
      },
      {
        church: { module: 'care', permission: 'diakonia.manage' },
        params: churchParamsSchema,
        body: diakoniaAidInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, params }) => ({ aid: hydrateOne(church.id, loadAid(church.id, params.id)) }),
      { church: { module: 'care', permission: VIEWERS }, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, audit, params, body }) => {
        const row = loadAid(church.id, params.id);
        if (row.voidedAt) throw conflict('A voided aid record cannot be changed');
        const { label, ...values } = resolve(church.id, access, body, row);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(diakoniaAid)
            .set({ ...values, updatedAt: nowIso() })
            .where(eq(diakoniaAid.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Aid record');
          recordAudit(tx, audit, {
            module: 'care',
            action: 'diakonia_aid.update',
            entityType: 'diakonia_aid',
            entityId: row.id,
            summary: `Corrected diakonia aid for ${label}`,
            ...redactedChanges(auditable(row), auditable(next), SECRET_FIELDS),
          });
          return next;
        });
        return { aid: hydrateOne(church.id, updated) };
      },
      {
        church: { module: 'care', permission: 'diakonia.manage' },
        params: churchIdParamsSchema,
        body: diakoniaAidInputSchema,
      },
    )
    .post(
      '/:id/void',
      ({ church, auth, audit, params, body }) => {
        const row = loadAid(church.id, params.id);
        if (row.voidedAt) throw conflict('This aid record is already voided');
        const now = nowIso();
        const updated = db.transaction((tx) => {
          const next = tx
            .update(diakoniaAid)
            .set({ voidedAt: now, voidedBy: auth.user.id, voidReason: body.reason, updatedAt: now })
            .where(eq(diakoniaAid.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Aid record');
          recordAudit(tx, audit, {
            module: 'care',
            action: 'diakonia_aid.void',
            entityType: 'diakonia_aid',
            entityId: row.id,
            summary: `Voided diakonia aid for ${recipientLabel(row)}`,
            before: { voidedAt: null },
            after: { voidedAt: now, voidReason: body.reason },
          });
          return next;
        });
        return { aid: hydrateOne(church.id, updated) };
      },
      {
        church: { module: 'care', permission: 'diakonia.manage' },
        params: churchIdParamsSchema,
        body: voidDiakoniaAidBodySchema,
      },
    );
};
