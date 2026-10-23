import {
  PAYMENT_METHOD_LABELS,
  canEditOfferingBatch,
  canReturnOfferingBatch,
  canVerifyOfferingBatch,
  canVoidOfferingBatch,
  churchIdParamsSchema,
  churchParamsSchema,
  localize,
  offeringBatchInputSchema,
  offeringBatchListQuerySchema,
  offeringServiceQuerySchema,
  returnOfferingBatchBodySchema,
  shiftDate,
  voidFinanceBodySchema,
  type AccessLike,
  type OfferingBatchInput,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, gte, like, lt, lte, ne, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, OfferingBatchRow } from '../../db/schema';
import {
  churchMemberships,
  offeringBatchLines,
  offeringBatches,
  worshipServices,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { HttpError, conflict, forbidden, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit } from '../../services/audit';
import {
  assertPeriodOpen,
  dayIn,
  loadPostingTargets,
  postEntry,
  voidEntriesOf,
} from '../../services/finance';
import { moduleEnabled } from '../../services/modules';
import { notify } from '../../services/notifications';
import { hydrateBatches } from './serializers';

const VIEWERS = ['finance.view', 'finance.record', 'finance.approve'] as const;

/** What the audit log keeps of a count: totals per line, not the banknote detail. */
const snapshot = (
  row: OfferingBatchRow,
  lines: { fundId: string; method: string; accountId?: string | null; amount: number }[],
) => ({
  serviceDate: row.serviceDate,
  serviceLabel: row.serviceLabel,
  accountId: row.accountId,
  status: row.status,
  totalAmount: row.totalAmount,
  counter1: row.counter1Name ?? row.counter1UserId,
  counter2: row.counter2Name ?? row.counter2UserId,
  lines: lines.map((line) => ({
    fundId: line.fundId,
    method: line.method,
    accountId: line.accountId ?? null,
    amount: line.amount,
  })),
});

/** Cash stays in the batch account; transfers and QRIS may name the account they landed in. */
const lineAccountOf = (line: { method: string; accountId?: string | null }) =>
  line.method === 'cash' ? null : (line.accountId ?? null);

/** Adds a user to the people who changed a count (none of them may verify it). */
const withEditor = (editors: readonly string[], userId: string) =>
  editors.includes(userId) ? [...editors] : [...editors, userId];

const serviceName = (row: Pick<OfferingBatchRow, 'serviceLabel' | 'serviceDate'>) =>
  row.serviceLabel ? `${row.serviceLabel} (${row.serviceDate})` : `Ibadah ${row.serviceDate}`;

export const offeringsRouter = (deps: Deps) => {
  const { db } = deps;

  const loadBatch = (churchId: string, id: string): OfferingBatchRow => {
    const row = db
      .select()
      .from(offeringBatches)
      .where(and(eq(offeringBatches.id, id), eq(offeringBatches.churchId, churchId)))
      .get();
    if (!row) throw notFound('Offering count');
    return row;
  };

  const linesOf = (tx: Queryable, batchId: string) =>
    tx
      .select()
      .from(offeringBatchLines)
      .where(eq(offeringBatchLines.batchId, batchId))
      .orderBy(asc(offeringBatchLines.position))
      .all();

  const hydrateOne = (churchId: string, access: AccessLike, row: OfferingBatchRow) => {
    const [batch] = hydrateBatches(db, churchId, access, [row]);
    if (!batch) throw notFound('Offering count');
    return batch;
  };

  /** Every reference in the body must belong to the church. */
  const validate = (churchId: string, body: OfferingBatchInput) => {
    for (const line of body.lines) {
      loadPostingTargets(
        db,
        churchId,
        {
          fundId: line.fundId,
          accountId: lineAccountOf(line) ?? body.accountId,
          categoryId: line.categoryId,
        },
        'income',
      );
    }
    for (const userId of [body.counter1UserId, body.counter2UserId]) {
      if (!userId) continue;
      const member = db
        .select({ id: churchMemberships.id })
        .from(churchMemberships)
        .where(and(eq(churchMemberships.churchId, churchId), eq(churchMemberships.userId, userId)))
        .get();
      if (!member) throw notFound('Counter');
    }
    if (body.worshipServiceId) {
      const service = db
        .select({ id: worshipServices.id })
        .from(worshipServices)
        .where(
          and(
            eq(worshipServices.id, body.worshipServiceId),
            eq(worshipServices.churchId, churchId),
          ),
        )
        .get();
      if (!service) throw notFound('Service');
    }
  };

  const writeLines = (
    tx: Queryable,
    churchId: string,
    batchId: string,
    body: OfferingBatchInput,
  ) => {
    tx.delete(offeringBatchLines).where(eq(offeringBatchLines.batchId, batchId)).run();
    tx.insert(offeringBatchLines)
      .values(
        body.lines.map((line, position) => ({
          id: newId(),
          churchId,
          batchId,
          fundId: line.fundId,
          categoryId: line.categoryId,
          method: line.method,
          accountId: lineAccountOf(line),
          amount: line.amount,
          denominations: line.method === 'cash' ? line.denominations : {},
          note: line.note,
          position,
        })),
      )
      .run();
  };

  const notifyVerifiers = (
    tx: Queryable,
    church: ChurchRow,
    row: OfferingBatchRow,
    actorId: string,
  ) =>
    notify(tx, {
      churchId: church.id,
      audience: { kind: 'permission', permission: 'finance.approve' },
      excludeUserIds: [
        actorId,
        row.counter1UserId,
        row.counter2UserId,
        row.createdBy,
        ...row.editorUserIds,
      ].filter((id): id is string => !!id),
      type: 'finance.offering_submitted',
      title: {
        id: 'Hitungan persembahan menunggu verifikasi',
        en: 'An offering count is waiting for verification',
      },
      body: serviceName(row),
      link: `/c/${church.id}/finance/offerings/${row.id}`,
      entityType: 'offering_batch',
      entityId: row.id,
    });

  const submitFields = (userId: string) => ({
    status: 'submitted' as const,
    submittedAt: nowIso(),
    submittedBy: userId,
  });

  return new Elysia({ prefix: '/churches/:churchId/finance/offerings' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const conditions: SQL[] = [eq(offeringBatches.churchId, church.id)];
        if (query.status) conditions.push(eq(offeringBatches.status, query.status));
        if (query.from) conditions.push(gte(offeringBatches.serviceDate, query.from));
        if (query.to) conditions.push(lte(offeringBatches.serviceDate, query.to));
        if (query.q) {
          const match = or(
            like(offeringBatches.serviceLabel, likePattern(query.q)),
            like(offeringBatches.counter1Name, likePattern(query.q)),
            like(offeringBatches.counter2Name, likePattern(query.q)),
          );
          if (match) conditions.push(match);
        }
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(offeringBatches).where(where).get()?.value ?? 0;
        const order = {
          serviceDate: [asc(offeringBatches.serviceDate), asc(offeringBatches.createdAt)],
          '-serviceDate': [desc(offeringBatches.serviceDate), desc(offeringBatches.createdAt)],
          totalAmount: [asc(offeringBatches.totalAmount)],
          '-totalAmount': [desc(offeringBatches.totalAmount)],
        }[query.sort];
        const rows = db
          .select()
          .from(offeringBatches)
          .where(where)
          .orderBy(...order)
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateBatches(db, church.id, access, rows),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { module: 'finance', permission: VIEWERS },
        params: churchParamsSchema,
        query: offeringBatchListQuerySchema,
      },
    )
    .get(
      '/services',
      ({ church, query }) => {
        if (!moduleEnabled(church, 'worship')) return { items: [] };
        // Services are stored in UTC; keep the ones that fall on the day in the church time zone.
        const rows = db
          .select()
          .from(worshipServices)
          .where(
            and(
              eq(worshipServices.churchId, church.id),
              ne(worshipServices.status, 'cancelled'),
              gte(worshipServices.startsAt, shiftDate(query.date, -1)),
              lt(worshipServices.startsAt, shiftDate(query.date, 2)),
            ),
          )
          .orderBy(asc(worshipServices.startsAt))
          .all()
          .filter((row) => dayIn(row.startsAt, church.timezone) === query.date);
        return {
          items: rows.map((row) => ({
            id: row.id,
            title: row.title,
            startsAt: row.startsAt,
            location: row.location,
          })),
        };
      },
      {
        church: { module: 'finance', permission: 'finance.record' },
        params: churchParamsSchema,
        query: offeringServiceQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, access, auth, audit, body, set }) => {
        validate(church.id, body);
        assertPeriodOpen(db, church.id, body.serviceDate);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const inserted = tx
            .insert(offeringBatches)
            .values({
              id: newId(),
              churchId: church.id,
              serviceDate: body.serviceDate,
              worshipServiceId: body.worshipServiceId,
              serviceLabel: body.serviceLabel,
              accountId: body.accountId,
              status: 'draft',
              totalAmount: body.lines.reduce((sum, line) => sum + line.amount, 0),
              counter1UserId: body.counter1UserId,
              counter1Name: body.counter1Name,
              counter2UserId: body.counter2UserId,
              counter2Name: body.counter2Name,
              notes: body.notes,
              ...(body.submit ? submitFields(auth.user.id) : {}),
              createdBy: auth.user.id,
              updatedBy: auth.user.id,
              editorUserIds: [auth.user.id],
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          writeLines(tx, church.id, inserted.id, body);
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'offering_batch.create',
            entityType: 'offering_batch',
            entityId: inserted.id,
            summary: `Counted the offering of ${serviceName(inserted)}`,
            after: snapshot(inserted, body.lines),
          });
          if (body.submit) notifyVerifiers(tx, church, inserted, auth.user.id);
          return inserted;
        });
        set.status = 201;
        return { batch: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: 'finance.record' },
        params: churchParamsSchema,
        body: offeringBatchInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => ({
        batch: hydrateOne(church.id, access, loadBatch(church.id, params.id)),
      }),
      {
        church: { module: 'finance', permission: VIEWERS },
        params: churchIdParamsSchema,
      },
    )
    .patch(
      '/:id',
      ({ church, access, auth, audit, params, body }) => {
        const batch = loadBatch(church.id, params.id);
        if (!canEditOfferingBatch(access, batch)) {
          throw conflict('Only offering counts that are still being counted can be edited');
        }
        validate(church.id, body);
        assertPeriodOpen(db, church.id, batch.serviceDate, body.serviceDate);
        const row = db.transaction((tx) => {
          const before = snapshot(batch, linesOf(tx, batch.id));
          const updated = tx
            .update(offeringBatches)
            .set({
              serviceDate: body.serviceDate,
              worshipServiceId: body.worshipServiceId,
              serviceLabel: body.serviceLabel,
              accountId: body.accountId,
              totalAmount: body.lines.reduce((sum, line) => sum + line.amount, 0),
              counter1UserId: body.counter1UserId,
              counter1Name: body.counter1Name,
              counter2UserId: body.counter2UserId,
              counter2Name: body.counter2Name,
              notes: body.notes,
              ...(body.submit ? submitFields(auth.user.id) : {}),
              updatedBy: auth.user.id,
              editorUserIds: withEditor(batch.editorUserIds, auth.user.id),
              updatedAt: nowIso(),
            })
            .where(eq(offeringBatches.id, batch.id))
            .returning()
            .get();
          if (!updated) throw notFound('Offering count');
          writeLines(tx, church.id, batch.id, body);
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'offering_batch.update',
            entityType: 'offering_batch',
            entityId: batch.id,
            summary: `Updated the offering count of ${serviceName(updated)}`,
            before,
            after: snapshot(updated, body.lines),
          });
          if (body.submit) notifyVerifiers(tx, church, updated, auth.user.id);
          return updated;
        });
        return { batch: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: 'finance.record' },
        params: churchIdParamsSchema,
        body: offeringBatchInputSchema,
      },
    )
    .post(
      '/:id/submit',
      ({ church, access, auth, audit, params }) => {
        const batch = loadBatch(church.id, params.id);
        if (!canEditOfferingBatch(access, batch)) {
          throw conflict('This offering count was already submitted');
        }
        assertPeriodOpen(db, church.id, batch.serviceDate);
        const row = db.transaction((tx) => {
          const updated = tx
            .update(offeringBatches)
            .set({
              ...submitFields(auth.user.id),
              editorUserIds: withEditor(batch.editorUserIds, auth.user.id),
              updatedAt: nowIso(),
            })
            .where(eq(offeringBatches.id, batch.id))
            .returning()
            .get();
          if (!updated) throw notFound('Offering count');
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'offering_batch.submit',
            entityType: 'offering_batch',
            entityId: batch.id,
            summary: `Submitted the offering count of ${serviceName(batch)} for verification`,
            before: { status: batch.status },
            after: { status: updated.status },
          });
          notifyVerifiers(tx, church, updated, auth.user.id);
          return updated;
        });
        return { batch: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: 'finance.record' },
        params: churchIdParamsSchema,
      },
    )
    .post(
      '/:id/return',
      ({ church, access, auth, audit, params, body }) => {
        const batch = loadBatch(church.id, params.id);
        if (!canReturnOfferingBatch(access, batch)) {
          throw conflict('Only offering counts waiting for verification can be returned');
        }
        assertPeriodOpen(db, church.id, batch.serviceDate);
        const row = db.transaction((tx) => {
          const updated = tx
            .update(offeringBatches)
            .set({
              status: 'draft',
              submittedAt: null,
              notes: body.reason
                ? [batch.notes, `Dikembalikan: ${body.reason}`].filter(Boolean).join('\n')
                : batch.notes,
              updatedAt: nowIso(),
            })
            .where(eq(offeringBatches.id, batch.id))
            .returning()
            .get();
          if (!updated) throw notFound('Offering count');
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'offering_batch.return',
            entityType: 'offering_batch',
            entityId: batch.id,
            summary: `Returned the offering count of ${serviceName(batch)} for correction`,
            before: { status: batch.status },
            after: { status: updated.status, reason: body.reason },
          });
          const recipients = [batch.submittedBy, batch.createdBy].filter(
            (id): id is string => !!id && id !== auth.user.id,
          );
          if (recipients.length > 0) {
            notify(tx, {
              churchId: church.id,
              userIds: recipients,
              type: 'finance.offering_returned',
              title: {
                id: 'Hitungan persembahan dikembalikan',
                en: 'An offering count was sent back',
              },
              body: body.reason ? `${serviceName(batch)}: ${body.reason}` : serviceName(batch),
              link: `/c/${church.id}/finance/offerings/${batch.id}`,
              entityType: 'offering_batch',
              entityId: batch.id,
            });
          }
          return updated;
        });
        return { batch: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: ['finance.record', 'finance.approve'] },
        params: churchIdParamsSchema,
        body: returnOfferingBatchBodySchema,
      },
    )
    .post(
      '/:id/verify',
      ({ church, access, auth, audit, params }) => {
        const batch = loadBatch(church.id, params.id);
        if (batch.status !== 'submitted') {
          throw conflict('Only offering counts waiting for verification can be verified');
        }
        if (!canVerifyOfferingBatch(access, batch)) {
          throw new HttpError(
            403,
            'SELF_APPROVAL',
            'A count is verified by someone who did not count, submit or edit it',
          );
        }
        assertPeriodOpen(db, church.id, batch.serviceDate);
        const row = db.transaction((tx) => {
          const now = nowIso();
          const updated = tx
            .update(offeringBatches)
            .set({ status: 'verified', verifiedBy: auth.user.id, verifiedAt: now, updatedAt: now })
            .where(and(eq(offeringBatches.id, batch.id), eq(offeringBatches.status, 'submitted')))
            .returning()
            .get();
          if (!updated) throw conflict('This offering count changed; reload it');
          for (const line of linesOf(tx, batch.id)) {
            if (line.amount === 0) continue;
            postEntry(tx, {
              churchId: church.id,
              entryDate: batch.serviceDate,
              accountId: line.accountId ?? batch.accountId,
              fundId: line.fundId,
              categoryId: line.categoryId,
              amount: line.amount,
              description: `Persembahan ${serviceName(batch)} · ${localize(PAYMENT_METHOD_LABELS[line.method], 'id')}`,
              sourceType: 'offering',
              sourceId: batch.id,
              createdBy: auth.user.id,
            });
          }
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'offering_batch.verify',
            entityType: 'offering_batch',
            entityId: batch.id,
            summary: `Verified and posted the offering of ${serviceName(batch)}`,
            before: { status: batch.status },
            after: { status: updated.status, totalAmount: updated.totalAmount },
          });
          return updated;
        });
        return { batch: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: 'finance.approve' },
        params: churchIdParamsSchema,
      },
    )
    .post(
      '/:id/void',
      ({ church, access, auth, audit, params, body }) => {
        const batch = loadBatch(church.id, params.id);
        if (batch.status === 'voided') throw conflict('This offering count is already voided');
        if (!canVoidOfferingBatch(access, batch)) {
          throw forbidden('You cannot void this offering count');
        }
        assertPeriodOpen(db, church.id, batch.serviceDate);
        const row = db.transaction((tx) => {
          const now = nowIso();
          const updated = tx
            .update(offeringBatches)
            .set({
              status: 'voided',
              voidedAt: now,
              voidedBy: auth.user.id,
              voidReason: body.reason,
              updatedAt: now,
            })
            .where(eq(offeringBatches.id, batch.id))
            .returning()
            .get();
          if (!updated) throw notFound('Offering count');
          const voided = voidEntriesOf(
            tx,
            church.id,
            { type: 'offering', id: batch.id },
            auth.user.id,
            body.reason,
          );
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'offering_batch.void',
            entityType: 'offering_batch',
            entityId: batch.id,
            summary: `Voided the offering count of ${serviceName(batch)}`,
            before: { status: batch.status, totalAmount: batch.totalAmount },
            after: { status: updated.status, voidReason: body.reason, voidedEntries: voided },
          });
          return updated;
        });
        return { batch: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: ['finance.record', 'finance.manage'] },
        params: churchIdParamsSchema,
        body: voidFinanceBodySchema,
      },
    );
};
