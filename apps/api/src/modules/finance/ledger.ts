import {
  FINANCE_ENTRY_SOURCE_LABELS,
  LIMITS,
  canApproveExpense,
  canVerifyOfferingBatch,
  churchIdParamsSchema,
  churchParamsSchema,
  financeAdjustmentInputSchema,
  financeEntryListQuerySchema,
  financeTransferInputSchema,
  financeTransferListQuerySchema,
  localize,
  monthRange,
  voidFinanceBodySchema,
  type AccessLike,
  type FinancePending,
  type FinanceSummary,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, gt, gte, like, lt, lte, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, FinanceEntryRow } from '../../db/schema';
import {
  expenseRequests,
  financeEntries,
  financeTransfers,
  offeringBatches,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit } from '../../services/audit';
import {
  addMonths,
  assertPeriodOpen,
  csvHeaders,
  enforceExportLimit,
  expenseSum,
  incomeSum,
  liveEntry,
  loadAccount,
  loadPostingTargets,
  monthsBetween,
  postEntry,
  toCsv,
  todayIn,
  voidEntriesOf,
} from '../../services/finance';
import { hydrateEntries, hydrateTransfers } from './serializers';
import { loadSetup } from './setup';

/** Income and expense of live entries, transfers left out (they move money, not earn it). */
const earningsBetween = (db: Queryable, churchId: string, from: string, to: string) =>
  db
    .select({ income: incomeSum, expense: expenseSum })
    .from(financeEntries)
    .where(
      and(
        eq(financeEntries.churchId, churchId),
        liveEntry,
        gte(financeEntries.entryDate, from),
        lte(financeEntries.entryDate, to),
        or(
          eq(financeEntries.sourceType, 'offering'),
          eq(financeEntries.sourceType, 'contribution'),
          eq(financeEntries.sourceType, 'expense'),
          eq(financeEntries.sourceType, 'adjustment'),
        ),
      ),
    )
    .get() ?? { income: 0, expense: 0 };

/** Counts the caller can act on now: offering counts to verify and requests to decide. */
export function pendingFor(db: Queryable, churchId: string, access: AccessLike): FinancePending {
  const batches = db
    .select()
    .from(offeringBatches)
    .where(and(eq(offeringBatches.churchId, churchId), eq(offeringBatches.status, 'submitted')))
    .all()
    .filter((row) => canVerifyOfferingBatch(access, row)).length;
  const expenses = db
    .select({
      requestedBy: expenseRequests.requestedBy,
      editorUserIds: expenseRequests.editorUserIds,
    })
    .from(expenseRequests)
    .where(and(eq(expenseRequests.churchId, churchId), eq(expenseRequests.status, 'submitted')))
    .all()
    .filter((row) => canApproveExpense(access, row)).length;
  return { batches, expenses, total: batches + expenses };
}

/** Running balance after each live entry of one account, in posting order. */
function runningBalances(db: Queryable, churchId: string, accountId: string, opening: number) {
  const balances = new Map<string, number>();
  let balance = opening;
  for (const row of db
    .select({ id: financeEntries.id, amount: financeEntries.amount })
    .from(financeEntries)
    .where(
      and(
        eq(financeEntries.churchId, churchId),
        eq(financeEntries.accountId, accountId),
        liveEntry,
      ),
    )
    .orderBy(asc(financeEntries.entryDate), asc(financeEntries.createdAt), asc(financeEntries.id))
    .all()) {
    balance += row.amount;
    balances.set(row.id, balance);
  }
  return balances;
}

export function financeSummary(
  db: Queryable,
  church: ChurchRow,
  access: AccessLike,
): FinanceSummary {
  const setup = loadSetup(db, church.id, access);
  const today = todayIn(church.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthOf = (key: string) => monthRange(Number(key.slice(0, 4)), Number(key.slice(5, 7)));
  const thisMonth = monthOf(monthStart);
  const lastMonth = monthOf(addMonths(monthStart, -1));
  const current = earningsBetween(db, church.id, thisMonth.from, thisMonth.to);
  const previous = earningsBetween(db, church.id, lastMonth.from, lastMonth.to);
  const trend = monthsBetween(addMonths(monthStart, -5), today).map((month) => {
    const range = monthOf(month);
    const totals = earningsBetween(db, church.id, range.from, range.to);
    return { month, income: totals.income, expense: totals.expense };
  });
  const recent = db
    .select()
    .from(financeEntries)
    .where(and(eq(financeEntries.churchId, church.id), liveEntry))
    .orderBy(desc(financeEntries.entryDate), desc(financeEntries.createdAt))
    .limit(8)
    .all();
  const countWhere = (
    where: SQL | undefined,
    table: typeof offeringBatches | typeof expenseRequests,
  ) => db.select({ value: count() }).from(table).where(where).get()?.value ?? 0;
  return {
    currency: church.currency,
    totalBalance: setup.accounts.reduce((sum, account) => sum + (account.balance ?? 0), 0),
    accounts: setup.accounts,
    funds: setup.funds,
    monthIncome: current.income,
    monthExpense: current.expense,
    previousMonthIncome: previous.income,
    previousMonthExpense: previous.expense,
    trend,
    pendingBatches: countWhere(
      and(eq(offeringBatches.churchId, church.id), eq(offeringBatches.status, 'submitted')),
      offeringBatches,
    ),
    pendingExpenses: countWhere(
      and(eq(expenseRequests.churchId, church.id), eq(expenseRequests.status, 'submitted')),
      expenseRequests,
    ),
    approvedExpenses: countWhere(
      and(eq(expenseRequests.churchId, church.id), eq(expenseRequests.status, 'approved')),
      expenseRequests,
    ),
    recentEntries: hydrateEntries(db, church.id, recent),
  };
}

export const ledgerRouter = (deps: Deps) => {
  const { db } = deps;

  const loadEntry = (churchId: string, id: string): FinanceEntryRow => {
    const row = db
      .select()
      .from(financeEntries)
      .where(and(eq(financeEntries.id, id), eq(financeEntries.churchId, churchId)))
      .get();
    if (!row) throw notFound('Entry');
    return row;
  };

  const loadTransfer = (churchId: string, id: string) => {
    const row = db
      .select()
      .from(financeTransfers)
      .where(and(eq(financeTransfers.id, id), eq(financeTransfers.churchId, churchId)))
      .get();
    if (!row) throw notFound('Transfer');
    return row;
  };

  return (
    new Elysia({ prefix: '/churches/:churchId/finance' })
      .use(authPlugin(deps))
      .get('/summary', ({ church, access }) => financeSummary(db, church, access), {
        church: { module: 'finance', permission: 'finance.view' },
        params: churchParamsSchema,
      })
      .get('/pending', ({ church, access }) => pendingFor(db, church.id, access), {
        church: { module: 'finance', permission: 'finance.approve' },
        params: churchParamsSchema,
      })
      .get(
        '/entries',
        ({ church, auth, query, set }) => {
          const conditions: SQL[] = [eq(financeEntries.churchId, church.id)];
          if (!query.includeVoided) conditions.push(liveEntry);
          if (query.from) conditions.push(gte(financeEntries.entryDate, query.from));
          if (query.to) conditions.push(lte(financeEntries.entryDate, query.to));
          if (query.accountId) conditions.push(eq(financeEntries.accountId, query.accountId));
          if (query.fundId) conditions.push(eq(financeEntries.fundId, query.fundId));
          if (query.categoryId) conditions.push(eq(financeEntries.categoryId, query.categoryId));
          if (query.sourceType) conditions.push(eq(financeEntries.sourceType, query.sourceType));
          if (query.direction === 'in') conditions.push(gt(financeEntries.amount, 0));
          if (query.direction === 'out') conditions.push(lt(financeEntries.amount, 0));
          if (query.q) conditions.push(like(financeEntries.description, likePattern(query.q)));
          const where = and(...conditions);
          const ordered = db
            .select()
            .from(financeEntries)
            .where(where)
            .orderBy(
              desc(financeEntries.entryDate),
              desc(financeEntries.createdAt),
              desc(financeEntries.id),
            );

          const account = query.accountId ? loadAccount(db, church.id, query.accountId) : null;
          const running = account
            ? runningBalances(db, church.id, account.id, account.openingBalance)
            : undefined;

          if (query.format === 'csv') {
            enforceExportLimit(deps.limiters, church.id, auth.user.id);
            const items = hydrateEntries(
              db,
              church.id,
              ordered.limit(LIMITS.csvRowsMax).all(),
              running,
            );
            Object.assign(
              set.headers,
              csvHeaders(`jurnal-${query.from ?? 'awal'}-${query.to ?? 'kini'}.csv`),
            );
            return toCsv([
              [
                'Tanggal',
                'Keterangan',
                'Rekening',
                'Kas',
                'Mata anggaran',
                'Sumber',
                'Masuk',
                'Keluar',
                'Saldo',
                'Dibatalkan',
              ],
              ...items.map((item) => [
                item.entryDate,
                item.description,
                item.accountName,
                item.fundName,
                item.categoryName,
                localize(FINANCE_ENTRY_SOURCE_LABELS[item.sourceType], 'id'),
                item.amount > 0 ? item.amount : null,
                item.amount < 0 ? -item.amount : null,
                item.runningBalance,
                item.voidedAt ? item.voidReason : null,
              ]),
            ]);
          }

          const total =
            db.select({ value: count() }).from(financeEntries).where(where).get()?.value ?? 0;
          const rows = ordered.limit(query.limit).offset(offsetOf(query)).all();
          return {
            items: hydrateEntries(db, church.id, rows, running),
            total,
            page: query.page,
            limit: query.limit,
          };
        },
        {
          church: { module: 'finance', permission: 'finance.view' },
          params: churchParamsSchema,
          query: financeEntryListQuerySchema,
        },
      )
      .post(
        '/adjustments',
        ({ church, auth, audit, body, set }) => {
          loadPostingTargets(db, church.id, body);
          assertPeriodOpen(db, church.id, body.entryDate);
          const row = db.transaction((tx) => {
            const entry = postEntry(tx, {
              churchId: church.id,
              entryDate: body.entryDate,
              accountId: body.accountId,
              fundId: body.fundId,
              categoryId: body.categoryId,
              amount: body.amount,
              description: body.description,
              sourceType: 'adjustment',
              sourceId: null,
              createdBy: auth.user.id,
            });
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'entry.adjust',
              entityType: 'finance_entry',
              entityId: entry.id,
              summary: `Posted an adjustment: ${body.description}`,
              after: body,
            });
            return entry;
          });
          set.status = 201;
          const [entry] = hydrateEntries(db, church.id, [row]);
          return { entry };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchParamsSchema,
          body: financeAdjustmentInputSchema,
        },
      )
      .post(
        '/entries/:id/void',
        ({ church, auth, audit, params, body }) => {
          const entry = loadEntry(church.id, params.id);
          if (entry.sourceType !== 'adjustment') {
            throw badRequest(
              'Void the offering, contribution, expense or transfer this entry came from',
            );
          }
          if (entry.voidedAt) throw conflict('This entry is already voided');
          assertPeriodOpen(db, church.id, entry.entryDate);
          const row = db.transaction((tx) => {
            const updated = tx
              .update(financeEntries)
              .set({ voidedAt: nowIso(), voidedBy: auth.user.id, voidReason: body.reason })
              .where(eq(financeEntries.id, entry.id))
              .returning()
              .get();
            if (!updated) throw notFound('Entry');
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'entry.void',
              entityType: 'finance_entry',
              entityId: entry.id,
              summary: `Voided the adjustment ${entry.description}`,
              before: { amount: entry.amount, voidedAt: null },
              after: { amount: entry.amount, voidedAt: updated.voidedAt, voidReason: body.reason },
            });
            return updated;
          });
          const [hydrated] = hydrateEntries(db, church.id, [row]);
          return { entry: hydrated };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
          body: voidFinanceBodySchema,
        },
      )
      // ---- Transfers between accounts ----------------------------------------------------------
      .get(
        '/transfers',
        ({ church, query }) => {
          const conditions: SQL[] = [eq(financeTransfers.churchId, church.id)];
          if (query.from) conditions.push(gte(financeTransfers.transferDate, query.from));
          if (query.to) conditions.push(lte(financeTransfers.transferDate, query.to));
          if (query.accountId) {
            const either = or(
              eq(financeTransfers.fromAccountId, query.accountId),
              eq(financeTransfers.toAccountId, query.accountId),
            );
            if (either) conditions.push(either);
          }
          const where = and(...conditions);
          const total =
            db.select({ value: count() }).from(financeTransfers).where(where).get()?.value ?? 0;
          const rows = db
            .select()
            .from(financeTransfers)
            .where(where)
            .orderBy(desc(financeTransfers.transferDate), desc(financeTransfers.createdAt))
            .limit(query.limit)
            .offset(offsetOf(query))
            .all();
          return {
            items: hydrateTransfers(db, church.id, rows),
            total,
            page: query.page,
            limit: query.limit,
          };
        },
        {
          church: { module: 'finance', permission: 'finance.view' },
          params: churchParamsSchema,
          query: financeTransferListQuerySchema,
        },
      )
      .post(
        '/transfers',
        ({ church, auth, audit, body, set }) => {
          const from = loadPostingTargets(db, church.id, {
            fundId: body.fundId,
            accountId: body.fromAccountId,
          });
          const to = loadPostingTargets(db, church.id, {
            fundId: body.fundId,
            accountId: body.toAccountId,
          });
          assertPeriodOpen(db, church.id, body.transferDate);
          const row = db.transaction((tx) => {
            const transfer = tx
              .insert(financeTransfers)
              .values({
                id: newId(),
                churchId: church.id,
                ...body,
                createdBy: auth.user.id,
                createdAt: nowIso(),
              })
              .returning()
              .get();
            const description = body.note ?? `${from.account.name} → ${to.account.name}`;
            for (const [accountId, amount] of [
              [from.account.id, -body.amount],
              [to.account.id, body.amount],
            ] as const) {
              postEntry(tx, {
                churchId: church.id,
                entryDate: body.transferDate,
                accountId,
                fundId: body.fundId,
                categoryId: null,
                amount,
                description: `Pemindahan dana: ${description}`,
                sourceType: 'transfer',
                sourceId: transfer.id,
                createdBy: auth.user.id,
              });
            }
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'transfer.create',
              entityType: 'finance_transfer',
              entityId: transfer.id,
              summary: `Moved money from ${from.account.name} to ${to.account.name}`,
              after: body,
            });
            return transfer;
          });
          set.status = 201;
          const [transfer] = hydrateTransfers(db, church.id, [row]);
          return { transfer };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchParamsSchema,
          body: financeTransferInputSchema,
        },
      )
      .post(
        '/transfers/:id/void',
        ({ church, auth, audit, params, body }) => {
          const transfer = loadTransfer(church.id, params.id);
          if (transfer.voidedAt) throw conflict('This transfer is already voided');
          assertPeriodOpen(db, church.id, transfer.transferDate);
          const row = db.transaction((tx) => {
            const updated = tx
              .update(financeTransfers)
              .set({ voidedAt: nowIso(), voidedBy: auth.user.id, voidReason: body.reason })
              .where(eq(financeTransfers.id, transfer.id))
              .returning()
              .get();
            if (!updated) throw notFound('Transfer');
            voidEntriesOf(
              tx,
              church.id,
              { type: 'transfer', id: transfer.id },
              auth.user.id,
              body.reason,
            );
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'transfer.void',
              entityType: 'finance_transfer',
              entityId: transfer.id,
              summary: `Voided a transfer of ${transfer.transferDate}`,
              before: { voidedAt: null },
              after: { voidedAt: updated.voidedAt, voidReason: body.reason },
            });
            return updated;
          });
          const [hydrated] = hydrateTransfers(db, church.id, [row]);
          return { transfer: hydrated };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
          body: voidFinanceBodySchema,
        },
      )
  );
};
