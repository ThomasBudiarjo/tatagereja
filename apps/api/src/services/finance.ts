import { financePeriodOf, periodKey, type FinanceCategoryKind } from '@tatagereja/shared';
import { and, eq, inArray, isNull, like, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Queryable } from '../db/client';
import type {
  FinanceAccountRow,
  FinanceCategoryRow,
  FinanceEntryRow,
  FinanceFundRow,
} from '../db/schema';
import {
  financeAccounts,
  financeCategories,
  financeContributions,
  financeEntries,
  financeFunds,
  financePeriods,
  people,
  users,
} from '../db/schema';
import { HttpError, badRequest, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';

/*
 * Ledger rules shared by the finance routers. Every movement of money is a row in
 * `finance_entries`; balances and reports only read that table. Entries are voided, never
 * deleted, and nothing dated in a closed month changes until the month is reopened.
 */

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "October 2026" for messages. */
export const periodLabel = (year: number, month: number): string =>
  `${MONTHS_EN[month - 1] ?? month} ${year}`;

/** Today's calendar day (YYYY-MM-DD) in the church time zone. */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** A coalesced integer sum, so empty sets read as 0 instead of null. */
export const sumOf = (column: SQL | SQLiteColumn) =>
  sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

/** Income (positive amounts) and expense (negative amounts, as a positive number). */
export const incomeSum = sumOf(
  sql`case when ${financeEntries.amount} > 0 then ${financeEntries.amount} else 0 end`,
);
export const expenseSum = sumOf(
  sql`case when ${financeEntries.amount} < 0 then -${financeEntries.amount} else 0 end`,
);

/** Entries that count: not voided. */
export const liveEntry = isNull(financeEntries.voidedAt);

/** Throws 409 PERIOD_CLOSED when the date falls in a closed month. */
export function assertPeriodOpen(db: Queryable, churchId: string, ...dates: (string | null)[]) {
  for (const date of dates) {
    if (!date) continue;
    const { year, month } = financePeriodOf(date);
    const period = db
      .select({ status: financePeriods.status })
      .from(financePeriods)
      .where(
        and(
          eq(financePeriods.churchId, churchId),
          eq(financePeriods.year, year),
          eq(financePeriods.month, month),
        ),
      )
      .get();
    if (period?.status === 'closed') {
      throw new HttpError(
        409,
        'PERIOD_CLOSED',
        `The books for ${periodLabel(year, month)} are closed. Reopen the period to change entries dated in it.`,
      );
    }
  }
}

export function loadFund(db: Queryable, churchId: string, id: string): FinanceFundRow {
  const row = db
    .select()
    .from(financeFunds)
    .where(and(eq(financeFunds.id, id), eq(financeFunds.churchId, churchId)))
    .get();
  if (!row) throw notFound('Fund');
  return row;
}

export function loadAccount(db: Queryable, churchId: string, id: string): FinanceAccountRow {
  const row = db
    .select()
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, id), eq(financeAccounts.churchId, churchId)))
    .get();
  if (!row) throw notFound('Account');
  return row;
}

export function loadCategory(
  db: Queryable,
  churchId: string,
  id: string,
  kind?: FinanceCategoryKind,
): FinanceCategoryRow {
  const row = db
    .select()
    .from(financeCategories)
    .where(and(eq(financeCategories.id, id), eq(financeCategories.churchId, churchId)))
    .get();
  if (!row) throw notFound('Category');
  if (kind && row.kind !== kind) {
    throw badRequest(
      kind === 'income' ? 'Choose an income category' : 'Choose an expense category',
    );
  }
  return row;
}

/** Loads a fund, account and optional category for a new posting; inactive ones are refused. */
export function loadPostingTargets(
  db: Queryable,
  churchId: string,
  ids: { fundId: string; accountId: string; categoryId?: string | null },
  kind?: FinanceCategoryKind,
) {
  const fund = loadFund(db, churchId, ids.fundId);
  const account = loadAccount(db, churchId, ids.accountId);
  const category = ids.categoryId ? loadCategory(db, churchId, ids.categoryId, kind) : null;
  if (!fund.isActive) throw badRequest(`The fund ${fund.name} is no longer active`);
  if (!account.isActive) throw badRequest(`The account ${account.name} is no longer active`);
  if (category && !category.isActive) {
    throw badRequest(`The category ${category.name} is no longer active`);
  }
  return { fund, account, category };
}

export type PostingInput = {
  churchId: string;
  entryDate: string;
  accountId: string;
  fundId: string;
  categoryId: string | null;
  amount: number;
  description: string;
  sourceType: FinanceEntryRow['sourceType'];
  sourceId: string | null;
  createdBy: string | null;
};

/** Writes one ledger entry. Call inside the transaction of the change it records. */
export function postEntry(db: Queryable, input: PostingInput): FinanceEntryRow {
  if (input.amount === 0) throw badRequest('The amount cannot be zero');
  return db
    .insert(financeEntries)
    .values({
      id: newId(),
      ...input,
      description: input.description.slice(0, 200),
      createdAt: nowIso(),
    })
    .returning()
    .get();
}

/** Voids the live entries a source posted. Returns how many were voided. */
export function voidEntriesOf(
  db: Queryable,
  churchId: string,
  source: { type: FinanceEntryRow['sourceType']; id: string },
  userId: string,
  reason: string,
): number {
  const rows = db
    .update(financeEntries)
    .set({ voidedAt: nowIso(), voidedBy: userId, voidReason: reason })
    .where(
      and(
        eq(financeEntries.churchId, churchId),
        eq(financeEntries.sourceType, source.type),
        eq(financeEntries.sourceId, source.id),
        liveEntry,
      ),
    )
    .returning({ id: financeEntries.id })
    .all();
  return rows.length;
}

/** Balance of each account: opening balance plus every live entry. */
export function accountBalances(db: Queryable, churchId: string): Map<string, number> {
  const balances = new Map<string, number>();
  for (const account of db
    .select({ id: financeAccounts.id, opening: financeAccounts.openingBalance })
    .from(financeAccounts)
    .where(eq(financeAccounts.churchId, churchId))
    .all()) {
    balances.set(account.id, account.opening);
  }
  for (const row of db
    .select({ accountId: financeEntries.accountId, total: sumOf(financeEntries.amount) })
    .from(financeEntries)
    .where(and(eq(financeEntries.churchId, churchId), liveEntry))
    .groupBy(financeEntries.accountId)
    .all()) {
    balances.set(row.accountId, (balances.get(row.accountId) ?? 0) + row.total);
  }
  return balances;
}

/**
 * Balance of each fund: the sum of its live entries. Opening balances belong to accounts and
 * are not assigned to a fund.
 */
export function fundBalances(db: Queryable, churchId: string): Map<string, number> {
  return new Map(
    db
      .select({ fundId: financeEntries.fundId, total: sumOf(financeEntries.amount) })
      .from(financeEntries)
      .where(and(eq(financeEntries.churchId, churchId), liveEntry))
      .groupBy(financeEntries.fundId)
      .all()
      .map((row) => [row.fundId, row.total]),
  );
}

/** The next receipt number of the year, e.g. `KW-2026-00042`. Call inside the transaction. */
export function nextReceiptNumber(db: Queryable, churchId: string, date: string): string {
  const year = date.slice(0, 4);
  const prefix = `KW-${year}-`;
  const last = db
    .select({ value: sql<string | null>`max(${financeContributions.receiptNumber})` })
    .from(financeContributions)
    .where(
      and(
        eq(financeContributions.churchId, churchId),
        like(financeContributions.receiptNumber, `${prefix}%`),
      ),
    )
    .get()?.value;
  const sequence = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(sequence).padStart(5, '0')}`;
}

/** Display names of users, for "verified by" and "requested by". */
export function userNames(db: Queryable, ids: (string | null | undefined)[]): Map<string, string> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  return new Map(
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, unique))
      .all()
      .map((row) => [row.id, row.name]),
  );
}

/** Loads a person of the church (donor, reimbursed person) or answers 404. */
export function loadPersonInChurch(db: Queryable, churchId: string, personId: string) {
  const person = db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.churchId, churchId)))
    .get();
  if (!person) throw notFound('Person');
  return person;
}

/** Month keys (`YYYY-MM`) from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const start = financePeriodOf(from);
  const end = financePeriodOf(to);
  const keys: string[] = [];
  let { year, month } = start;
  while (year < end.year || (year === end.year && month <= end.month)) {
    keys.push(periodKey(year, month));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/** Shifts a `YYYY-MM-DD` day by whole months, clamping to the month's last day. */
export function addMonths(date: string, months: number): string {
  const { year, month } = financePeriodOf(date);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  const last = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const day = Math.min(Number(date.slice(8, 10)), last);
  return `${periodKey(nextYear, nextMonth)}-${String(day).padStart(2, '0')}`;
}

/**
 * CSV for spreadsheets: quoted where needed, and text that starts like a formula is prefixed
 * with an apostrophe so a spreadsheet never executes it.
 */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** Headers for a CSV download. */
export const csvHeaders = (filename: string) => ({
  'content-type': 'text/csv; charset=utf-8',
  'content-disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
});
