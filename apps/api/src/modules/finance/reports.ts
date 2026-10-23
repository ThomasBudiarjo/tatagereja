import {
  FINANCE_REPORT_LABELS,
  financeReportParamsSchema,
  financeReportQuerySchema,
  localize,
  shiftDate,
  type FinanceReport,
  type FinanceReportKind,
  type FinanceReportQuery,
  type FinanceReportRow,
} from '@tatagereja/shared';
import { and, asc, eq, gte, lt, lte, ne, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow } from '../../db/schema';
import { financeAccounts, financeCategories, financeEntries, financeFunds } from '../../db/schema';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import {
  csvHeaders,
  enforceExportLimit,
  expenseSum,
  incomeSum,
  liveEntry,
  loadAccount,
  loadFund,
  monthsBetween,
  sumOf,
  toCsv,
  todayIn,
} from '../../services/finance';
import { cachedReport } from '../../services/report-cache';

type Totals = { income: number; expense: number };

const row = (
  key: string,
  label: string,
  totals: Totals | undefined,
  extra?: Partial<FinanceReportRow>,
): FinanceReportRow => {
  const income = totals?.income ?? 0;
  const expense = totals?.expense ?? 0;
  return {
    key,
    label,
    income,
    expense,
    net: income - expense,
    opening: null,
    closing: null,
    ...extra,
  };
};

/** The Sunday that starts the week of a `YYYY-MM-DD` day. */
const weekStart = (date: string): string => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -weekday);
};

/** Builds one report from live ledger entries. Transfers only appear in the cash flow. */
export function buildReport(
  db: Queryable,
  church: ChurchRow,
  kind: FinanceReportKind,
  query: Pick<FinanceReportQuery, 'from' | 'to' | 'fundId' | 'accountId'>,
): FinanceReport {
  const conditions: SQL[] = [
    eq(financeEntries.churchId, church.id),
    liveEntry,
    gte(financeEntries.entryDate, query.from),
    lte(financeEntries.entryDate, query.to),
  ];
  if (query.fundId) conditions.push(eq(financeEntries.fundId, query.fundId));
  if (query.accountId) conditions.push(eq(financeEntries.accountId, query.accountId));
  const earnings = and(...conditions, ne(financeEntries.sourceType, 'transfer'));
  const totalsBy = (group: SQL, where: SQL | undefined) =>
    new Map(
      db
        .select({ key: sql<string | null>`${group}`, income: incomeSum, expense: expenseSum })
        .from(financeEntries)
        .where(where)
        .groupBy(group)
        .all()
        .map((item) => [item.key ?? '', { income: item.income, expense: item.expense }]),
    );

  // Months and weeks that have not started yet stay out of the series instead of reading as 0.
  const today = todayIn(church.timezone);
  const lastDay = query.to < today ? query.to : today;
  let rows: FinanceReportRow[] = [];
  switch (kind) {
    case 'income_expense': {
      const totals = totalsBy(sql`substr(${financeEntries.entryDate}, 1, 7)`, earnings);
      rows =
        query.from > lastDay
          ? []
          : monthsBetween(query.from, lastDay).map((month) => row(month, month, totals.get(month)));
      break;
    }
    case 'trend': {
      const totals = totalsBy(
        sql`date(${financeEntries.entryDate}, '-' || strftime('%w', ${financeEntries.entryDate}) || ' days')`,
        earnings,
      );
      for (let week = weekStart(query.from); week <= lastDay; week = shiftDate(week, 7)) {
        rows.push(row(week, week, totals.get(week)));
      }
      break;
    }
    case 'by_fund': {
      const totals = totalsBy(sql`${financeEntries.fundId}`, earnings);
      rows = db
        .select()
        .from(financeFunds)
        .where(eq(financeFunds.churchId, church.id))
        .orderBy(asc(financeFunds.sortOrder), asc(financeFunds.name))
        .all()
        .filter((fund) => (fund.isActive && !query.fundId) || totals.has(fund.id))
        .map((fund) => row(fund.id, fund.name, totals.get(fund.id)));
      break;
    }
    case 'by_category': {
      const totals = totalsBy(sql`${financeEntries.categoryId}`, earnings);
      rows = db
        .select()
        .from(financeCategories)
        .where(eq(financeCategories.churchId, church.id))
        .orderBy(
          asc(financeCategories.kind),
          asc(financeCategories.sortOrder),
          asc(financeCategories.name),
        )
        .all()
        .filter((category) => totals.has(category.id))
        .map((category) => row(category.id, category.name, totals.get(category.id)));
      const uncategorized = totals.get('');
      if (uncategorized) rows.push(row('uncategorized', '—', uncategorized));
      break;
    }
    case 'cash_flow': {
      const totals = totalsBy(sql`${financeEntries.accountId}`, and(...conditions));
      const before = query.fundId
        ? new Map<string, number>()
        : new Map(
            db
              .select({ accountId: financeEntries.accountId, total: sumOf(financeEntries.amount) })
              .from(financeEntries)
              .where(
                and(
                  eq(financeEntries.churchId, church.id),
                  liveEntry,
                  lt(financeEntries.entryDate, query.from),
                ),
              )
              .groupBy(financeEntries.accountId)
              .all()
              .map((item) => [item.accountId, item.total]),
          );
      rows = db
        .select()
        .from(financeAccounts)
        .where(eq(financeAccounts.churchId, church.id))
        .orderBy(asc(financeAccounts.name))
        .all()
        .filter(
          (account) =>
            (!query.accountId || account.id === query.accountId) &&
            (account.isActive || totals.has(account.id)),
        )
        .map((account) => {
          const totalsOf = totals.get(account.id);
          const net = (totalsOf?.income ?? 0) - (totalsOf?.expense ?? 0);
          const opening = query.fundId
            ? null
            : account.openingDate <= query.to
              ? account.openingBalance + (before.get(account.id) ?? 0)
              : 0;
          return row(account.id, account.name, totalsOf, {
            opening,
            closing: opening === null ? null : opening + net,
          });
        });
      break;
    }
  }
  const income = rows.reduce((sum, item) => sum + item.income, 0);
  const expense = rows.reduce((sum, item) => sum + item.expense, 0);
  return {
    kind,
    from: query.from,
    to: query.to,
    currency: church.currency,
    rows,
    totals: { income, expense, net: income - expense },
  };
}

export const reportsRouter = (deps: Deps) => {
  const { db } = deps;
  return new Elysia({ prefix: '/churches/:churchId/finance/reports' }).use(authPlugin(deps)).get(
    '/:kind',
    ({ church, auth, params, query, set }) => {
      if (query.fundId) loadFund(db, church.id, query.fundId);
      if (query.accountId) loadAccount(db, church.id, query.accountId);
      const report = cachedReport(
        deps,
        { churchId: church.id, userId: auth.user.id, limiter: 'finance.report' },
        `finance:${params.kind}:${JSON.stringify([query.from, query.to, query.fundId ?? null, query.accountId ?? null])}`,
        () => buildReport(db, church, params.kind, query),
      );
      if (query.format === 'csv') {
        enforceExportLimit(deps.limiters, church.id, auth.user.id);
        const cashFlow = params.kind === 'cash_flow';
        Object.assign(
          set.headers,
          csvHeaders(`laporan-${params.kind.replace('_', '-')}-${query.from}-${query.to}.csv`),
        );
        return toCsv([
          [
            localize(FINANCE_REPORT_LABELS[params.kind], 'id'),
            `${query.from} s.d. ${query.to}`,
            church.currency,
          ],
          [
            'Uraian',
            ...(cashFlow ? ['Saldo awal'] : []),
            'Penerimaan',
            'Pengeluaran',
            'Selisih',
            ...(cashFlow ? ['Saldo akhir'] : []),
          ],
          ...report.rows.map((item) => [
            item.label,
            ...(cashFlow ? [item.opening] : []),
            item.income,
            item.expense,
            item.net,
            ...(cashFlow ? [item.closing] : []),
          ]),
          [
            'Total',
            ...(cashFlow ? [null] : []),
            report.totals.income,
            report.totals.expense,
            report.totals.net,
            ...(cashFlow ? [null] : []),
          ],
        ]);
      }
      return report;
    },
    {
      church: { module: 'finance', permission: 'finance.reports' },
      params: financeReportParamsSchema,
      query: financeReportQuerySchema,
    },
  );
};
