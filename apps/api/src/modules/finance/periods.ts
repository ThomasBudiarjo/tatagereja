import {
  financePeriodListQuerySchema,
  financePeriodParamsSchema,
  monthRange,
  periodKey,
  reopenPeriodBodySchema,
  type FinancePeriod,
} from '@tatagereja/shared';
import { and, count, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow } from '../../db/schema';
import { financeEntries, financePeriods, offeringBatches } from '../../db/schema';
import type { Deps } from '../../deps';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit } from '../../services/audit';
import { liveEntry, periodLabel, sumOf, todayIn, userNames } from '../../services/finance';
import { notify } from '../../services/notifications';

/** One month of the books with its totals and what still blocks closing it. */
function periodOf(db: Queryable, churchId: string, year: number, month: number): FinancePeriod {
  const row = db
    .select()
    .from(financePeriods)
    .where(
      and(
        eq(financePeriods.churchId, churchId),
        eq(financePeriods.year, year),
        eq(financePeriods.month, month),
      ),
    )
    .get();
  const range = monthRange(year, month);
  const totals = db
    .select({
      // Transfers move money between accounts; they are neither income nor expense.
      income: sumOf(
        sql`case when ${financeEntries.sourceType} != 'transfer' and ${financeEntries.amount} > 0 then ${financeEntries.amount} else 0 end`,
      ),
      expense: sumOf(
        sql`case when ${financeEntries.sourceType} != 'transfer' and ${financeEntries.amount} < 0 then -${financeEntries.amount} else 0 end`,
      ),
      entries: count(),
    })
    .from(financeEntries)
    .where(
      and(
        eq(financeEntries.churchId, churchId),
        liveEntry,
        gte(financeEntries.entryDate, range.from),
        lte(financeEntries.entryDate, range.to),
      ),
    )
    .get();
  const pending =
    db
      .select({ value: count() })
      .from(offeringBatches)
      .where(
        and(
          eq(offeringBatches.churchId, churchId),
          inArray(offeringBatches.status, ['draft', 'submitted']),
          gte(offeringBatches.serviceDate, range.from),
          lte(offeringBatches.serviceDate, range.to),
        ),
      )
      .get()?.value ?? 0;
  const names = userNames(db, [row?.closedBy, row?.reopenedBy]);
  return {
    year,
    month,
    status: row?.status ?? 'open',
    closedAt: row?.closedAt ?? null,
    closedByName: row?.closedBy ? (names.get(row.closedBy) ?? null) : null,
    reopenedAt: row?.reopenedAt ?? null,
    reopenedByName: row?.reopenedBy ? (names.get(row.reopenedBy) ?? null) : null,
    reopenReason: row?.reopenReason ?? null,
    income: totals?.income ?? 0,
    expense: totals?.expense ?? 0,
    entryCount: totals?.entries ?? 0,
    pendingBatches: pending,
  };
}

export const periodsRouter = (deps: Deps) => {
  const { db } = deps;

  const assertNotFuture = (church: ChurchRow, year: number, month: number) => {
    const today = todayIn(church.timezone);
    if (periodKey(year, month) > today.slice(0, 7)) {
      throw badRequest('A month can only be closed once it has started');
    }
  };

  return new Elysia({ prefix: '/churches/:churchId/finance/periods' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => ({
        year: query.year,
        items: Array.from({ length: 12 }, (_, index) =>
          periodOf(db, church.id, query.year, index + 1),
        ),
      }),
      {
        church: { module: 'finance', permission: ['finance.view', 'finance.manage'] },
        params: financePeriodParamsSchema.pick({ churchId: true }),
        query: financePeriodListQuerySchema,
      },
    )
    .post(
      '/:year/:month/close',
      ({ church, auth, audit, params }) => {
        assertNotFuture(church, params.year, params.month);
        const current = periodOf(db, church.id, params.year, params.month);
        if (current.status === 'closed') throw conflict('This month is already closed');
        if (current.pendingBatches > 0) {
          throw conflict(
            `Verify or void the ${current.pendingBatches} offering count(s) of ${periodLabel(params.year, params.month)} first`,
          );
        }
        db.transaction((tx) => {
          const now = nowIso();
          tx.insert(financePeriods)
            .values({
              id: newId(),
              churchId: church.id,
              year: params.year,
              month: params.month,
              status: 'closed',
              closedBy: auth.user.id,
              closedAt: now,
            })
            .onConflictDoUpdate({
              target: [financePeriods.churchId, financePeriods.year, financePeriods.month],
              set: { status: 'closed', closedBy: auth.user.id, closedAt: now },
            })
            .run();
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'finance.period_close',
            entityType: 'finance_period',
            entityId: periodKey(params.year, params.month),
            summary: `Closed the books for ${periodLabel(params.year, params.month)}`,
            before: { status: current.status },
            after: { status: 'closed', income: current.income, expense: current.expense },
          });
        });
        return { period: periodOf(db, church.id, params.year, params.month) };
      },
      {
        church: { module: 'finance', permission: 'finance.manage' },
        params: financePeriodParamsSchema,
      },
    )
    .post(
      '/:year/:month/reopen',
      ({ church, auth, audit, params, body }) => {
        const current = periodOf(db, church.id, params.year, params.month);
        if (current.status !== 'closed') throw conflict('Only a closed month can be reopened');
        db.transaction((tx) => {
          const updated = tx
            .update(financePeriods)
            .set({
              status: 'reopened',
              reopenedBy: auth.user.id,
              reopenedAt: nowIso(),
              reopenReason: body.reason,
            })
            .where(
              and(
                eq(financePeriods.churchId, church.id),
                eq(financePeriods.year, params.year),
                eq(financePeriods.month, params.month),
              ),
            )
            .returning()
            .get();
          if (!updated) throw notFound('Period');
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'finance.period_reopen',
            entityType: 'finance_period',
            entityId: periodKey(params.year, params.month),
            summary: `Reopened the books for ${periodLabel(params.year, params.month)}`,
            before: { status: 'closed' },
            after: { status: 'reopened', reason: body.reason },
          });
          notify(tx, {
            churchId: church.id,
            audience: { kind: 'permission', permission: 'finance.manage' },
            excludeUserIds: [auth.user.id],
            type: 'finance.period_reopened',
            title: {
              id: `Tutup buku ${periodKey(params.year, params.month)} dibuka kembali`,
              en: `The closed books of ${periodKey(params.year, params.month)} were reopened`,
            },
            body: body.reason,
            link: `/c/${church.id}/finance/periods?year=${params.year}`,
            entityType: 'finance_period',
            entityId: periodKey(params.year, params.month),
          });
        });
        return { period: periodOf(db, church.id, params.year, params.month) };
      },
      {
        church: { module: 'finance', permission: 'finance.manage' },
        params: financePeriodParamsSchema,
        body: reopenPeriodBodySchema,
      },
    );
};
