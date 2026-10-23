import {
  canApproveExpense,
  canCancelExpense,
  canEditExpense,
  canPayExpense,
  canReversePayment,
  canViewAllExpenses,
  cancelExpenseBodySchema,
  churchIdParamsSchema,
  churchParamsSchema,
  decideExpenseBodySchema,
  expenseRequestInputSchema,
  expenseRequestListQuerySchema,
  fullName,
  payExpenseBodySchema,
  voidFinanceBodySchema,
  type AccessLike,
  type ExpenseRequestInput,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, gte, like, lte, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, ExpenseRequestRow } from '../../db/schema';
import { expenseRequests } from '../../db/schema';
import type { Deps } from '../../deps';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import {
  assertPeriodOpen,
  loadCategory,
  loadFund,
  loadPersonInChurch,
  loadPostingTargets,
  postEntry,
  voidEntriesOf,
} from '../../services/finance';
import { notify } from '../../services/notifications';
import { hydrateExpenses } from './serializers';

const VIEWERS = ['finance.view', 'finance.record', 'finance.approve', 'finance.manage'] as const;

const auditable = (row: ExpenseRequestRow) => ({
  title: row.title,
  categoryId: row.categoryId,
  fundId: row.fundId,
  amount: row.amount,
  payeeName: row.payeeName,
  neededBy: row.neededBy,
  attachmentUrls: row.attachmentUrls,
  isReimbursement: row.isReimbursement,
  reimbursePersonId: row.reimbursePersonId,
  status: row.status,
});

export const expensesRouter = (deps: Deps) => {
  const { db } = deps;

  const loadExpense = (churchId: string, access: AccessLike, id: string): ExpenseRequestRow => {
    const row = db
      .select()
      .from(expenseRequests)
      .where(and(eq(expenseRequests.id, id), eq(expenseRequests.churchId, churchId)))
      .get();
    // Without the finance viewing permissions people only see their own requests.
    if (!row || (!canViewAllExpenses(access) && row.requestedBy !== access.userId)) {
      throw notFound('Expense request');
    }
    return row;
  };

  const hydrateOne = (churchId: string, access: AccessLike, row: ExpenseRequestRow) => {
    const [expense] = hydrateExpenses(db, churchId, access, [row]);
    if (!expense) throw notFound('Expense request');
    return expense;
  };

  const resolve = (churchId: string, body: ExpenseRequestInput) => {
    // The paying account is chosen at payment; only the fund and category matter now.
    const fund = loadFund(db, churchId, body.fundId);
    const category = loadCategory(db, churchId, body.categoryId, 'expense');
    if (!fund.isActive) throw badRequest(`The fund ${fund.name} is no longer active`);
    if (!category.isActive) throw badRequest(`The category ${category.name} is no longer active`);
    const person =
      body.isReimbursement && body.reimbursePersonId
        ? loadPersonInChurch(db, churchId, body.reimbursePersonId)
        : null;
    return {
      fund,
      values: {
        title: body.title,
        description: body.description,
        categoryId: body.categoryId,
        fundId: body.fundId,
        amount: body.amount,
        payeeName: body.payeeName ?? (person ? fullName(person) : null),
        neededBy: body.neededBy,
        attachmentUrls: body.attachmentUrls,
        isReimbursement: body.isReimbursement,
        reimbursePersonId: person?.id ?? null,
      },
    };
  };

  const notifyApprovers = (tx: Queryable, church: ChurchRow, row: ExpenseRequestRow) =>
    notify(tx, {
      churchId: church.id,
      audience: { kind: 'permission', permission: 'finance.approve' },
      excludeUserIds: [row.requestedBy, ...row.editorUserIds].filter((id): id is string => !!id),
      type: 'finance.expense_submitted',
      title: row.isReimbursement
        ? 'Penggantian biaya menunggu persetujuan'
        : 'Pengajuan dana menunggu persetujuan',
      body: row.title,
      link: `/c/${church.id}/finance/expenses/${row.id}`,
      entityType: 'expense_request',
      entityId: row.id,
    });

  const notifyRequester = (
    tx: Queryable,
    church: ChurchRow,
    row: ExpenseRequestRow,
    title: string,
    actorId: string,
  ) => {
    if (!row.requestedBy || row.requestedBy === actorId) return;
    notify(tx, {
      churchId: church.id,
      userIds: [row.requestedBy],
      type: 'finance.expense_decided',
      title,
      body: row.title,
      link: `/c/${church.id}/finance/expenses/${row.id}`,
      entityType: 'expense_request',
      entityId: row.id,
    });
  };

  const submitted = () => ({ status: 'submitted' as const, submittedAt: nowIso() });

  return new Elysia({ prefix: '/churches/:churchId/finance/expenses' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const conditions: SQL[] = [eq(expenseRequests.churchId, church.id)];
        if (query.mine || !canViewAllExpenses(access)) {
          conditions.push(eq(expenseRequests.requestedBy, access.userId));
        }
        if (query.status) conditions.push(eq(expenseRequests.status, query.status));
        if (query.categoryId) conditions.push(eq(expenseRequests.categoryId, query.categoryId));
        if (query.from) conditions.push(gte(expenseRequests.createdAt, query.from));
        if (query.to) conditions.push(lte(expenseRequests.createdAt, `${query.to}T23:59:59.999Z`));
        if (query.q) {
          const match = or(
            like(expenseRequests.title, likePattern(query.q)),
            like(expenseRequests.payeeName, likePattern(query.q)),
          );
          if (match) conditions.push(match);
        }
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(expenseRequests).where(where).get()?.value ?? 0;
        const order = {
          createdAt: [asc(expenseRequests.createdAt)],
          '-createdAt': [desc(expenseRequests.createdAt)],
          amount: [asc(expenseRequests.amount)],
          '-amount': [desc(expenseRequests.amount)],
        }[query.sort];
        const rows = db
          .select()
          .from(expenseRequests)
          .where(where)
          .orderBy(...order)
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateExpenses(db, church.id, access, rows),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { module: 'finance', permission: VIEWERS },
        params: churchParamsSchema,
        query: expenseRequestListQuerySchema,
      },
    )
    .post(
      '/',
      ({ church, access, auth, audit, body, set }) => {
        const { values } = resolve(church.id, body);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const inserted = tx
            .insert(expenseRequests)
            .values({
              id: newId(),
              churchId: church.id,
              ...values,
              status: 'draft',
              ...(body.submit ? submitted() : {}),
              requestedBy: auth.user.id,
              editorUserIds: [auth.user.id],
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'expense.create',
            entityType: 'expense_request',
            entityId: inserted.id,
            summary: `Requested ${inserted.isReimbursement ? 'a reimbursement' : 'an expense'}: ${inserted.title}`,
            after: auditable(inserted),
          });
          if (body.submit) notifyApprovers(tx, church, inserted);
          return inserted;
        });
        set.status = 201;
        return { expense: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: 'finance.record' },
        params: churchParamsSchema,
        body: expenseRequestInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => ({
        expense: hydrateOne(church.id, access, loadExpense(church.id, access, params.id)),
      }),
      { church: { module: 'finance', permission: VIEWERS }, params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, auth, audit, params, body }) => {
        const expense = loadExpense(church.id, access, params.id);
        if (expense.status !== 'draft') throw conflict('Only drafts can be edited');
        if (!canEditExpense(access, expense)) throw forbidden('You cannot edit this request');
        const { values } = resolve(church.id, body);
        const row = db.transaction((tx) => {
          const updated = tx
            .update(expenseRequests)
            .set({
              ...values,
              ...(body.submit ? submitted() : {}),
              // Whoever changes a request can no longer approve it.
              editorUserIds: expense.editorUserIds.includes(auth.user.id)
                ? expense.editorUserIds
                : [...expense.editorUserIds, auth.user.id],
              updatedAt: nowIso(),
            })
            .where(eq(expenseRequests.id, expense.id))
            .returning()
            .get();
          if (!updated) throw notFound('Expense request');
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'expense.update',
            entityType: 'expense_request',
            entityId: expense.id,
            summary: `Updated the request ${updated.title}`,
            ...changes(auditable(expense), auditable(updated)),
          });
          if (body.submit) notifyApprovers(tx, church, updated);
          return updated;
        });
        return { expense: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: ['finance.record', 'finance.manage'] },
        params: churchIdParamsSchema,
        body: expenseRequestInputSchema,
      },
    )
    .post(
      '/:id/submit',
      ({ church, access, audit, params }) => {
        const expense = loadExpense(church.id, access, params.id);
        if (expense.status !== 'draft') throw conflict('This request was already submitted');
        if (!canEditExpense(access, expense)) throw forbidden('You cannot submit this request');
        const row = db.transaction((tx) => {
          const updated = tx
            .update(expenseRequests)
            .set({ ...submitted(), updatedAt: nowIso() })
            .where(eq(expenseRequests.id, expense.id))
            .returning()
            .get();
          if (!updated) throw notFound('Expense request');
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'expense.submit',
            entityType: 'expense_request',
            entityId: expense.id,
            summary: `Submitted the request ${expense.title} for approval`,
            before: { status: expense.status },
            after: { status: updated.status },
          });
          notifyApprovers(tx, church, updated);
          return updated;
        });
        return { expense: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: ['finance.record', 'finance.manage'] },
        params: churchIdParamsSchema,
      },
    )
    .post(
      '/:id/decide',
      ({ church, access, auth, audit, params, body }) => {
        const expense = loadExpense(church.id, access, params.id);
        if (expense.status !== 'submitted') {
          throw conflict('Only requests waiting for approval can be decided');
        }
        if (!canApproveExpense(access, expense)) {
          throw new HttpError(403, 'SELF_APPROVAL', 'Nobody can approve their own request');
        }
        const row = db.transaction((tx) => {
          const now = nowIso();
          const updated = tx
            .update(expenseRequests)
            .set({
              status: body.decision,
              decidedBy: auth.user.id,
              decidedAt: now,
              decisionNote: body.note,
              updatedAt: now,
            })
            .where(and(eq(expenseRequests.id, expense.id), eq(expenseRequests.status, 'submitted')))
            .returning()
            .get();
          if (!updated) throw conflict('This request changed; reload it');
          recordAudit(tx, audit, {
            module: 'finance',
            action: body.decision === 'approved' ? 'expense.approve' : 'expense.reject',
            entityType: 'expense_request',
            entityId: expense.id,
            summary: `${body.decision === 'approved' ? 'Approved' : 'Rejected'} the request ${expense.title}`,
            before: { status: expense.status },
            after: { status: updated.status, note: body.note },
          });
          notifyRequester(
            tx,
            church,
            updated,
            body.decision === 'approved' ? 'Pengajuan dana disetujui' : 'Pengajuan dana ditolak',
            auth.user.id,
          );
          return updated;
        });
        return { expense: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: 'finance.approve' },
        params: churchIdParamsSchema,
        body: decideExpenseBodySchema,
      },
    )
    .post(
      '/:id/pay',
      ({ church, access, auth, audit, params, body }) => {
        const expense = loadExpense(church.id, access, params.id);
        if (expense.status !== 'approved') throw conflict('Only approved requests can be paid');
        if (!canPayExpense(access, expense)) throw forbidden('You cannot pay this request');
        const { account } = loadPostingTargets(db, church.id, {
          fundId: expense.fundId,
          accountId: body.accountId,
          categoryId: expense.categoryId,
        });
        assertPeriodOpen(db, church.id, body.paidAt);
        const row = db.transaction((tx) => {
          const updated = tx
            .update(expenseRequests)
            .set({
              status: 'paid',
              paidAt: body.paidAt,
              paidBy: auth.user.id,
              paidFromAccountId: account.id,
              paymentReference: body.paymentReference,
              updatedAt: nowIso(),
            })
            .where(and(eq(expenseRequests.id, expense.id), eq(expenseRequests.status, 'approved')))
            .returning()
            .get();
          if (!updated) throw conflict('This request changed; reload it');
          postEntry(tx, {
            churchId: church.id,
            entryDate: body.paidAt,
            accountId: account.id,
            fundId: expense.fundId,
            categoryId: expense.categoryId,
            amount: -expense.amount,
            description: `${expense.isReimbursement ? 'Penggantian biaya' : 'Pengeluaran'}: ${expense.title}${expense.payeeName ? ` · ${expense.payeeName}` : ''}`,
            sourceType: 'expense',
            sourceId: expense.id,
            createdBy: auth.user.id,
          });
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'expense.pay',
            entityType: 'expense_request',
            entityId: expense.id,
            summary: `Paid the request ${expense.title} from ${account.name}`,
            before: { status: expense.status },
            after: {
              status: updated.status,
              accountId: account.id,
              paidAt: body.paidAt,
              amount: expense.amount,
            },
          });
          notifyRequester(tx, church, updated, 'Pengajuan dana sudah dibayarkan', auth.user.id);
          return updated;
        });
        return { expense: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: ['finance.record', 'finance.manage'] },
        params: churchIdParamsSchema,
        body: payExpenseBodySchema,
      },
    )
    .post(
      '/:id/reverse-payment',
      ({ church, access, auth, audit, params, body }) => {
        const expense = loadExpense(church.id, access, params.id);
        if (!canReversePayment(access, expense)) {
          throw conflict('Only paid requests can have their payment reversed');
        }
        assertPeriodOpen(db, church.id, expense.paidAt);
        const row = db.transaction((tx) => {
          const updated = tx
            .update(expenseRequests)
            .set({
              status: 'approved',
              paidAt: null,
              paidBy: null,
              paidFromAccountId: null,
              paymentReference: null,
              updatedAt: nowIso(),
            })
            .where(and(eq(expenseRequests.id, expense.id), eq(expenseRequests.status, 'paid')))
            .returning()
            .get();
          if (!updated) throw conflict('This request changed; reload it');
          // The ledger keeps the payment, voided, so the correction stays visible.
          const voided = voidEntriesOf(
            tx,
            church.id,
            { type: 'expense', id: expense.id },
            auth.user.id,
            body.reason,
          );
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'expense.reverse_payment',
            entityType: 'expense_request',
            entityId: expense.id,
            summary: `Reversed the payment of ${expense.title}`,
            before: {
              status: expense.status,
              accountId: expense.paidFromAccountId,
              paidAt: expense.paidAt,
              paymentReference: expense.paymentReference,
              amount: expense.amount,
            },
            after: { status: updated.status, reason: body.reason, voidedEntries: voided },
          });
          return updated;
        });
        return { expense: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: 'finance.manage' },
        params: churchIdParamsSchema,
        body: voidFinanceBodySchema,
      },
    )
    .post(
      '/:id/cancel',
      ({ church, access, auth, audit, params, body }) => {
        const expense = loadExpense(church.id, access, params.id);
        if (!['draft', 'submitted', 'approved'].includes(expense.status)) {
          throw conflict('This request can no longer be cancelled');
        }
        if (!canCancelExpense(access, expense)) throw forbidden('You cannot cancel this request');
        const row = db.transaction((tx) => {
          const updated = tx
            .update(expenseRequests)
            .set({
              status: 'cancelled',
              decisionNote: body.reason ?? expense.decisionNote,
              updatedAt: nowIso(),
            })
            .where(eq(expenseRequests.id, expense.id))
            .returning()
            .get();
          if (!updated) throw notFound('Expense request');
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'expense.cancel',
            entityType: 'expense_request',
            entityId: expense.id,
            summary: `Cancelled the request ${expense.title}`,
            before: { status: expense.status },
            after: { status: updated.status, reason: body.reason },
          });
          notifyRequester(tx, church, updated, 'Pengajuan dana dibatalkan', auth.user.id);
          return updated;
        });
        return { expense: hydrateOne(church.id, access, row) };
      },
      {
        church: { module: 'finance', permission: ['finance.record', 'finance.manage'] },
        params: churchIdParamsSchema,
        body: cancelExpenseBodySchema,
      },
    );
};
