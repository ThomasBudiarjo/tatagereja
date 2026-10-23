import {
  DEFAULT_CASH_ACCOUNT,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_FUNDS,
  DEFAULT_INCOME_CATEGORIES,
  churchIdParamsSchema,
  churchParamsSchema,
  financeAccountInputSchema,
  financeCategoryInputSchema,
  financeDefaultsBodySchema,
  financeDonorQuerySchema,
  financeFundInputSchema,
  has,
  hasAny,
  type AccessLike,
  type FinanceSetup,
  type Permission,
} from '@tatagereja/shared';
import { and, asc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Queryable } from '../../db/client';
import {
  churchMemberships,
  expenseRequests,
  financeAccounts,
  financeBudgets,
  financeCampaigns,
  financeCategories,
  financeContributions,
  financeEntries,
  financeFunds,
  financeTransfers,
  offeringBatchLines,
  offeringBatches,
  people,
  users,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, notFound } from '../../lib/errors';
import { likePattern } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { toPersonSummary } from '../../serializers';
import { changes, recordAudit } from '../../services/audit';
import {
  accountBalances,
  assertNoClosedPeriodFrom,
  fundBalances,
  loadAccount,
  loadCategory,
  loadFund,
} from '../../services/finance';
import { toAccount, toCategory, toFund } from './serializers';

/** Every finance permission: the setup lists are needed by everyone who works with money. */
export const FINANCE_ANY: readonly Permission[] = [
  'finance.view',
  'finance.record',
  'finance.approve',
  'finance.manage',
  'finance.reports',
];

/** Funds, accounts and categories; balances only for callers holding `finance.view`. */
export function loadSetup(db: Queryable, churchId: string, access: AccessLike): FinanceSetup {
  const showBalances = has(access, 'finance.view');
  const showOpening = hasAny(access, ['finance.view', 'finance.manage']);
  const accounts = showBalances ? accountBalances(db, churchId) : null;
  const funds = showBalances ? fundBalances(db, churchId) : null;
  return {
    funds: db
      .select()
      .from(financeFunds)
      .where(eq(financeFunds.churchId, churchId))
      .orderBy(asc(financeFunds.sortOrder), asc(financeFunds.name))
      .all()
      .map((row) => toFund(row, funds ? (funds.get(row.id) ?? 0) : null)),
    accounts: db
      .select()
      .from(financeAccounts)
      .where(eq(financeAccounts.churchId, churchId))
      .orderBy(asc(financeAccounts.name))
      .all()
      .map((row) => toAccount(row, accounts ? (accounts.get(row.id) ?? 0) : null, showOpening)),
    categories: db
      .select()
      .from(financeCategories)
      .where(eq(financeCategories.churchId, churchId))
      .orderBy(
        asc(financeCategories.kind),
        asc(financeCategories.sortOrder),
        asc(financeCategories.name),
      )
      .all()
      .map(toCategory),
  };
}

const sameName = (column: SQLiteColumn, name: string) => sql`lower(${column}) = lower(${name})`;

export const setupRouter = (deps: Deps) => {
  const { db } = deps;

  const assertUniqueFund = (churchId: string, name: string, exceptId?: string) => {
    const existing = db
      .select({ id: financeFunds.id })
      .from(financeFunds)
      .where(and(eq(financeFunds.churchId, churchId), sameName(financeFunds.name, name)))
      .get();
    if (existing && existing.id !== exceptId) throw conflict(`A fund named ${name} already exists`);
  };
  const assertUniqueAccount = (churchId: string, name: string, exceptId?: string) => {
    const existing = db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(and(eq(financeAccounts.churchId, churchId), sameName(financeAccounts.name, name)))
      .get();
    if (existing && existing.id !== exceptId) {
      throw conflict(`An account named ${name} already exists`);
    }
  };
  const assertUniqueCategory = (
    churchId: string,
    kind: 'income' | 'expense',
    name: string,
    exceptId?: string,
  ) => {
    const existing = db
      .select({ id: financeCategories.id })
      .from(financeCategories)
      .where(
        and(
          eq(financeCategories.churchId, churchId),
          eq(financeCategories.kind, kind),
          sameName(financeCategories.name, name),
        ),
      )
      .get();
    if (existing && existing.id !== exceptId) {
      throw conflict(`A category named ${name} already exists`);
    }
  };

  /** True when any row still points at it; such rows are deactivated instead of deleted. */
  const isUsed = (checks: { table: SQLiteTable; where: SQL | undefined }[]) =>
    checks.some(
      (check) =>
        !!db
          .select({ one: sql`1` })
          .from(check.table)
          .where(check.where)
          .limit(1)
          .get(),
    );

  return (
    new Elysia({ prefix: '/churches/:churchId/finance' })
      .use(authPlugin(deps))
      .get('/setup', ({ church, access }) => loadSetup(db, church.id, access), {
        church: { module: 'finance', permission: FINANCE_ANY },
        params: churchParamsSchema,
      })
      .post(
        '/setup/defaults',
        ({ church, access, audit, body }) => {
          const now = nowIso();
          const created = db.transaction((tx) => {
            const existing = loadSetup(tx, church.id, access);
            const fundNames = new Set(existing.funds.map((fund) => fund.name.toLowerCase()));
            const categoryNames = new Set(
              existing.categories.map(
                (category) => `${category.kind}:${category.name.toLowerCase()}`,
              ),
            );
            const funds = DEFAULT_FUNDS.filter((name) => !fundNames.has(name.toLowerCase()));
            const categories = [
              ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ kind: 'income' as const, name })),
              ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ kind: 'expense' as const, name })),
            ].filter((item) => !categoryNames.has(`${item.kind}:${item.name.toLowerCase()}`));
            if (funds.length > 0) {
              tx.insert(financeFunds)
                .values(
                  funds.map((name) => ({
                    id: newId(),
                    churchId: church.id,
                    name,
                    isRestricted: name !== 'Kas Umum',
                    sortOrder: DEFAULT_FUNDS.indexOf(name) * 10,
                    createdAt: now,
                    updatedAt: now,
                  })),
                )
                .run();
            }
            if (categories.length > 0) {
              tx.insert(financeCategories)
                .values(
                  categories.map((item, index) => ({
                    id: newId(),
                    churchId: church.id,
                    kind: item.kind,
                    name: item.name,
                    sortOrder: index * 10,
                    createdAt: now,
                    updatedAt: now,
                  })),
                )
                .run();
            }
            const needsCash = existing.accounts.length === 0;
            if (needsCash) {
              tx.insert(financeAccounts)
                .values({
                  id: newId(),
                  churchId: church.id,
                  name: DEFAULT_CASH_ACCOUNT,
                  type: 'cash',
                  openingBalance: body.cashOpeningBalance,
                  openingDate: body.openingDate,
                  createdAt: now,
                  updatedAt: now,
                })
                .run();
            }
            const summary = {
              funds,
              categories: categories.map((item) => item.name),
              cash: needsCash,
            };
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'finance.setup_defaults',
              entityType: 'finance_setup',
              summary: 'Created the suggested funds, categories and cash box',
              after: summary,
            });
            return summary;
          });
          return { ...loadSetup(db, church.id, access), created };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchParamsSchema,
          body: financeDefaultsBodySchema,
        },
      )
      // ---- Funds ---------------------------------------------------------------------------
      .post(
        '/funds',
        ({ church, access, audit, body, set }) => {
          assertUniqueFund(church.id, body.name);
          const now = nowIso();
          const row = db.transaction((tx) => {
            const inserted = tx
              .insert(financeFunds)
              .values({ id: newId(), churchId: church.id, ...body, createdAt: now, updatedAt: now })
              .returning()
              .get();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'fund.create',
              entityType: 'finance_fund',
              entityId: inserted.id,
              summary: `Created the fund ${inserted.name}`,
              after: body,
            });
            return inserted;
          });
          set.status = 201;
          return { fund: toFund(row, has(access, 'finance.view') ? 0 : null) };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchParamsSchema,
          body: financeFundInputSchema,
        },
      )
      .patch(
        '/funds/:id',
        ({ church, access, audit, params, body }) => {
          const fund = loadFund(db, church.id, params.id);
          assertUniqueFund(church.id, body.name, fund.id);
          const row = db.transaction((tx) => {
            const updated = tx
              .update(financeFunds)
              .set({ ...body, updatedAt: nowIso() })
              .where(eq(financeFunds.id, fund.id))
              .returning()
              .get();
            if (!updated) throw notFound('Fund');
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'fund.update',
              entityType: 'finance_fund',
              entityId: fund.id,
              summary: `Updated the fund ${updated.name}`,
              ...changes(fund, body),
            });
            return updated;
          });
          const balance = has(access, 'finance.view')
            ? (fundBalances(db, church.id).get(row.id) ?? 0)
            : null;
          return { fund: toFund(row, balance) };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
          body: financeFundInputSchema,
        },
      )
      .delete(
        '/funds/:id',
        ({ church, audit, params }) => {
          const fund = loadFund(db, church.id, params.id);
          const used = isUsed([
            { table: financeEntries, where: eq(financeEntries.fundId, fund.id) },
            { table: offeringBatchLines, where: eq(offeringBatchLines.fundId, fund.id) },
            { table: financeContributions, where: eq(financeContributions.fundId, fund.id) },
            { table: expenseRequests, where: eq(expenseRequests.fundId, fund.id) },
            { table: financeCampaigns, where: eq(financeCampaigns.fundId, fund.id) },
            { table: financeTransfers, where: eq(financeTransfers.fundId, fund.id) },
          ]);
          if (used) {
            throw conflict(
              `The fund ${fund.name} has transactions. Deactivate it instead of deleting it.`,
            );
          }
          db.transaction((tx) => {
            tx.delete(financeFunds).where(eq(financeFunds.id, fund.id)).run();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'fund.delete',
              entityType: 'finance_fund',
              entityId: fund.id,
              summary: `Deleted the fund ${fund.name}`,
              before: { name: fund.name, code: fund.code },
            });
          });
          return { ok: true as const };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
        },
      )
      // ---- Accounts ------------------------------------------------------------------------
      .post(
        '/accounts',
        ({ church, access, audit, body, set }) => {
          assertUniqueAccount(church.id, body.name);
          assertNoClosedPeriodFrom(db, church.id, body.openingDate);
          const now = nowIso();
          const row = db.transaction((tx) => {
            const inserted = tx
              .insert(financeAccounts)
              .values({ id: newId(), churchId: church.id, ...body, createdAt: now, updatedAt: now })
              .returning()
              .get();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'account.create',
              entityType: 'finance_account',
              entityId: inserted.id,
              summary: `Created the account ${inserted.name}`,
              after: body,
            });
            return inserted;
          });
          set.status = 201;
          return {
            account: toAccount(row, has(access, 'finance.view') ? row.openingBalance : null, true),
          };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchParamsSchema,
          body: financeAccountInputSchema,
        },
      )
      .patch(
        '/accounts/:id',
        ({ church, access, audit, params, body }) => {
          const account = loadAccount(db, church.id, params.id);
          assertUniqueAccount(church.id, body.name, account.id);
          // The opening balance is part of every later balance: it changes only while no month
          // from the opening date on has been closed.
          if (
            body.openingBalance !== account.openingBalance ||
            body.openingDate !== account.openingDate
          ) {
            assertNoClosedPeriodFrom(
              db,
              church.id,
              account.openingDate < body.openingDate ? account.openingDate : body.openingDate,
            );
          }
          const row = db.transaction((tx) => {
            const updated = tx
              .update(financeAccounts)
              .set({ ...body, updatedAt: nowIso() })
              .where(eq(financeAccounts.id, account.id))
              .returning()
              .get();
            if (!updated) throw notFound('Account');
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'account.update',
              entityType: 'finance_account',
              entityId: account.id,
              summary: `Updated the account ${updated.name}`,
              ...changes(account, body),
            });
            return updated;
          });
          const balance = has(access, 'finance.view')
            ? (accountBalances(db, church.id).get(row.id) ?? 0)
            : null;
          return { account: toAccount(row, balance, true) };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
          body: financeAccountInputSchema,
        },
      )
      .delete(
        '/accounts/:id',
        ({ church, audit, params }) => {
          const account = loadAccount(db, church.id, params.id);
          const used = isUsed([
            { table: financeEntries, where: eq(financeEntries.accountId, account.id) },
            { table: offeringBatches, where: eq(offeringBatches.accountId, account.id) },
            { table: offeringBatchLines, where: eq(offeringBatchLines.accountId, account.id) },
            { table: financeContributions, where: eq(financeContributions.accountId, account.id) },
            { table: expenseRequests, where: eq(expenseRequests.paidFromAccountId, account.id) },
            {
              table: financeTransfers,
              where: or(
                eq(financeTransfers.fromAccountId, account.id),
                eq(financeTransfers.toAccountId, account.id),
              ),
            },
          ]);
          if (used) {
            throw conflict(
              `The account ${account.name} has transactions. Deactivate it instead of deleting it.`,
            );
          }
          db.transaction((tx) => {
            tx.delete(financeAccounts).where(eq(financeAccounts.id, account.id)).run();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'account.delete',
              entityType: 'finance_account',
              entityId: account.id,
              summary: `Deleted the account ${account.name}`,
              before: { name: account.name, type: account.type },
            });
          });
          return { ok: true as const };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
        },
      )
      // ---- Categories ----------------------------------------------------------------------
      .post(
        '/categories',
        ({ church, audit, body, set }) => {
          assertUniqueCategory(church.id, body.kind, body.name);
          const now = nowIso();
          const row = db.transaction((tx) => {
            const inserted = tx
              .insert(financeCategories)
              .values({ id: newId(), churchId: church.id, ...body, createdAt: now, updatedAt: now })
              .returning()
              .get();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'category.create',
              entityType: 'finance_category',
              entityId: inserted.id,
              summary: `Created the category ${inserted.name}`,
              after: body,
            });
            return inserted;
          });
          set.status = 201;
          return { category: toCategory(row) };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchParamsSchema,
          body: financeCategoryInputSchema,
        },
      )
      .patch(
        '/categories/:id',
        ({ church, audit, params, body }) => {
          const category = loadCategory(db, church.id, params.id);
          if (body.kind !== category.kind) {
            const used = isUsed([
              { table: financeEntries, where: eq(financeEntries.categoryId, category.id) },
              { table: offeringBatchLines, where: eq(offeringBatchLines.categoryId, category.id) },
              {
                table: financeContributions,
                where: eq(financeContributions.categoryId, category.id),
              },
              { table: expenseRequests, where: eq(expenseRequests.categoryId, category.id) },
              { table: financeBudgets, where: eq(financeBudgets.categoryId, category.id) },
            ]);
            if (used) throw conflict('A category in use cannot change between income and expense');
          }
          assertUniqueCategory(church.id, body.kind, body.name, category.id);
          const row = db.transaction((tx) => {
            const updated = tx
              .update(financeCategories)
              .set({ ...body, updatedAt: nowIso() })
              .where(eq(financeCategories.id, category.id))
              .returning()
              .get();
            if (!updated) throw notFound('Category');
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'category.update',
              entityType: 'finance_category',
              entityId: category.id,
              summary: `Updated the category ${updated.name}`,
              ...changes(category, body),
            });
            return updated;
          });
          return { category: toCategory(row) };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
          body: financeCategoryInputSchema,
        },
      )
      .delete(
        '/categories/:id',
        ({ church, audit, params }) => {
          const category = loadCategory(db, church.id, params.id);
          const used = isUsed([
            { table: financeEntries, where: eq(financeEntries.categoryId, category.id) },
            { table: offeringBatchLines, where: eq(offeringBatchLines.categoryId, category.id) },
            {
              table: financeContributions,
              where: eq(financeContributions.categoryId, category.id),
            },
            { table: expenseRequests, where: eq(expenseRequests.categoryId, category.id) },
            { table: financeBudgets, where: eq(financeBudgets.categoryId, category.id) },
          ]);
          if (used) {
            throw conflict(
              `The category ${category.name} is in use. Deactivate it instead of deleting it.`,
            );
          }
          db.transaction((tx) => {
            tx.delete(financeCategories).where(eq(financeCategories.id, category.id)).run();
            recordAudit(tx, audit, {
              module: 'finance',
              action: 'category.delete',
              entityType: 'finance_category',
              entityId: category.id,
              summary: `Deleted the category ${category.name}`,
              before: { name: category.name, kind: category.kind },
            });
          });
          return { ok: true as const };
        },
        {
          church: { module: 'finance', permission: 'finance.manage' },
          params: churchIdParamsSchema,
        },
      )
      // ---- Pickers -------------------------------------------------------------------------
      .get(
        '/donors',
        ({ church, query }) => {
          const conditions: SQL[] = [eq(people.churchId, church.id)];
          if (query.q) {
            const pattern = likePattern(query.q);
            const match = or(
              like(people.firstName, pattern),
              like(people.lastName, pattern),
              like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
            );
            if (match) conditions.push(match);
          }
          return {
            items: db
              .select()
              .from(people)
              .where(and(...conditions))
              .orderBy(asc(people.firstName), asc(people.lastName))
              .limit(query.limit)
              .all()
              .map(toPersonSummary),
          };
        },
        {
          church: {
            module: 'finance',
            permission: ['finance.record', 'finance.view', 'finance.reports', 'finance.manage'],
          },
          params: churchParamsSchema,
          query: financeDonorQuerySchema,
        },
      )
      .get(
        '/members',
        ({ church, query }) => {
          const conditions: SQL[] = [
            eq(churchMemberships.churchId, church.id),
            eq(churchMemberships.status, 'active'),
          ];
          if (query.q) conditions.push(like(users.name, likePattern(query.q)));
          return {
            items: db
              .select({ userId: users.id, name: users.name })
              .from(churchMemberships)
              .innerJoin(users, eq(users.id, churchMemberships.userId))
              .where(and(...conditions))
              .orderBy(asc(users.name))
              .limit(query.limit)
              .all(),
          };
        },
        {
          church: { module: 'finance', permission: ['finance.record', 'finance.approve'] },
          params: churchParamsSchema,
          query: financeDonorQuerySchema,
        },
      )
  );
};
