// Tables owned by the finance module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
//
// Money columns are integers of minor units in `churches.currency`. Entries are voided, never
// deleted, and entries dated in a closed period (`finance_periods`) are immutable. References to
// funds, accounts and categories use the default NO ACTION, so a fund that has entries cannot be
// deleted (deactivate it instead) while deleting the church still cascades everything.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { churches, people, users } from './core';
import { worshipServices } from './worship';

/** Kas Umum, Pembangunan, Misi, Diakonia, ... */
export const financeFunds = sqliteTable(
  'finance_funds',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    description: text('description'),
    /** Restricted funds may only be spent on their purpose (shown as a warning). */
    isRestricted: integer('is_restricted', { mode: 'boolean' }).notNull().default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('finance_funds_church_name_unique').on(table.churchId, table.name)],
);

/** Cash boxes and bank or e-wallet accounts. Balance = opening balance + ledger entries. */
export const financeAccounts = sqliteTable(
  'finance_accounts',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: ['cash', 'bank', 'ewallet', 'other'] }).notNull(),
    bankName: text('bank_name'),
    accountNumber: text('account_number'),
    openingBalance: integer('opening_balance').notNull().default(0),
    openingDate: text('opening_date').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('finance_accounts_church_name_unique').on(table.churchId, table.name)],
);

/** Income and expense categories (mata anggaran). */
export const financeCategories = sqliteTable(
  'finance_categories',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
    name: text('name').notNull(),
    code: text('code'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('finance_categories_church_kind_name_unique').on(
      table.churchId,
      table.kind,
      table.name,
    ),
  ],
);

/** A month closed by `finance.manage`. A missing row means the month is open. */
export const financePeriods = sqliteTable(
  'finance_periods',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    status: text('status', { enum: ['closed', 'reopened'] }).notNull(),
    closedBy: text('closed_by').references(() => users.id, { onDelete: 'set null' }),
    closedAt: text('closed_at').notNull(),
    reopenedBy: text('reopened_by').references(() => users.id, { onDelete: 'set null' }),
    reopenedAt: text('reopened_at'),
    reopenReason: text('reopen_reason'),
  },
  (table) => [
    uniqueIndex('finance_periods_church_year_month_unique').on(
      table.churchId,
      table.year,
      table.month,
    ),
  ],
);

/**
 * The ledger. Every movement of money is one row with a signed `amount` (positive into the
 * account, negative out of it). Offerings, contributions, paid expenses and transfers post
 * entries here; reports and running balances read only this table.
 */
export const financeEntries = sqliteTable(
  'finance_entries',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    entryDate: text('entry_date').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => financeAccounts.id),
    fundId: text('fund_id')
      .notNull()
      .references(() => financeFunds.id),
    categoryId: text('category_id').references(() => financeCategories.id),
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    sourceType: text('source_type', {
      enum: ['offering', 'contribution', 'expense', 'transfer', 'adjustment'],
    }).notNull(),
    sourceId: text('source_id'),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('finance_entries_church_date_idx').on(table.churchId, table.entryDate),
    index('finance_entries_account_date_idx').on(table.accountId, table.entryDate),
    index('finance_entries_fund_idx').on(table.fundId),
    index('finance_entries_category_idx').on(table.categoryId),
    index('finance_entries_source_idx').on(table.sourceType, table.sourceId),
  ],
);

/**
 * Persembahan ibadah counted after a service by two counters and verified by a third person
 * (segregation of duties). Posting to the ledger happens on verification.
 */
export const offeringBatches = sqliteTable(
  'offering_batches',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    serviceDate: text('service_date').notNull(),
    worshipServiceId: text('worship_service_id').references(() => worshipServices.id, {
      onDelete: 'set null',
    }),
    /** Service label when not linked, e.g. "Ibadah Umum 2". */
    serviceLabel: text('service_label'),
    accountId: text('account_id')
      .notNull()
      .references(() => financeAccounts.id),
    status: text('status', { enum: ['draft', 'submitted', 'verified', 'voided'] })
      .notNull()
      .default('draft'),
    totalAmount: integer('total_amount').notNull().default(0),
    counter1UserId: text('counter1_user_id').references(() => users.id, { onDelete: 'set null' }),
    counter1Name: text('counter1_name'),
    counter2UserId: text('counter2_user_id').references(() => users.id, { onDelete: 'set null' }),
    counter2Name: text('counter2_name'),
    notes: text('notes'),
    submittedAt: text('submitted_at'),
    verifiedBy: text('verified_by').references(() => users.id, { onDelete: 'set null' }),
    verifiedAt: text('verified_at'),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('offering_batches_church_date_idx').on(table.churchId, table.serviceDate),
    index('offering_batches_church_status_idx').on(table.churchId, table.status),
  ],
);

/** One counted bag or envelope type within a batch, per fund and method. */
export const offeringBatchLines = sqliteTable(
  'offering_batch_lines',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    batchId: text('batch_id')
      .notNull()
      .references(() => offeringBatches.id, { onDelete: 'cascade' }),
    fundId: text('fund_id')
      .notNull()
      .references(() => financeFunds.id),
    categoryId: text('category_id').references(() => financeCategories.id),
    method: text('method', { enum: ['cash', 'transfer', 'qris', 'other'] }).notNull(),
    amount: integer('amount').notNull(),
    /** Banknote/coin counts for cash, keyed by face value in minor units: {"100000": 3}. */
    denominations: text('denominations', { mode: 'json' })
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    note: text('note'),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('offering_batch_lines_batch_idx').on(table.batchId, table.position)],
);

/** Fundraising campaigns with a target (e.g. pembangunan gedung). */
export const financeCampaigns = sqliteTable(
  'finance_campaigns',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    fundId: text('fund_id')
      .notNull()
      .references(() => financeFunds.id),
    targetAmount: integer('target_amount').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    status: text('status', { enum: ['active', 'closed'] })
      .notNull()
      .default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('finance_campaigns_church_idx').on(table.churchId, table.status)],
);

/** A person's pledge (janji iman) towards a campaign. */
export const financePledges = sqliteTable(
  'finance_pledges',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => financeCampaigns.id, { onDelete: 'cascade' }),
    personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
    donorName: text('donor_name'),
    amount: integer('amount').notNull(),
    note: text('note'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('finance_pledges_campaign_idx').on(table.campaignId),
    index('finance_pledges_person_idx').on(table.personId),
  ],
);

/** Individual giving: perpuluhan, persembahan syukur, donations. `person_id` null = anonymous. */
export const financeContributions = sqliteTable(
  'finance_contributions',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
    /** Shown on the receipt when there is no person record ("NN" for anonymous). */
    donorName: text('donor_name'),
    kind: text('kind', {
      enum: ['tithe', 'thanksgiving', 'special', 'donation', 'pledge_payment', 'other'],
    }).notNull(),
    fundId: text('fund_id')
      .notNull()
      .references(() => financeFunds.id),
    accountId: text('account_id')
      .notNull()
      .references(() => financeAccounts.id),
    categoryId: text('category_id').references(() => financeCategories.id),
    campaignId: text('campaign_id').references(() => financeCampaigns.id, {
      onDelete: 'set null',
    }),
    method: text('method', { enum: ['cash', 'transfer', 'qris', 'other'] }).notNull(),
    amount: integer('amount').notNull(),
    receivedAt: text('received_at').notNull(),
    /** Bank transfer reference or QRIS transaction id. */
    reference: text('reference'),
    receiptNumber: text('receipt_number'),
    note: text('note'),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
    recordedBy: text('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('finance_contributions_church_received_idx').on(table.churchId, table.receivedAt),
    index('finance_contributions_person_idx').on(table.personId, table.receivedAt),
    uniqueIndex('finance_contributions_church_receipt_unique').on(
      table.churchId,
      table.receiptNumber,
    ),
  ],
);

/**
 * Expense requests and reimbursements: draft → submitted → approved/rejected → paid. The approver
 * can never be the requester (`SELF_APPROVAL`).
 */
export const expenseRequests = sqliteTable(
  'expense_requests',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    categoryId: text('category_id')
      .notNull()
      .references(() => financeCategories.id),
    fundId: text('fund_id')
      .notNull()
      .references(() => financeFunds.id),
    amount: integer('amount').notNull(),
    payeeName: text('payee_name'),
    neededBy: text('needed_by'),
    attachmentUrls: text('attachment_urls', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    isReimbursement: integer('is_reimbursement', { mode: 'boolean' }).notNull().default(false),
    reimbursePersonId: text('reimburse_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    status: text('status', {
      enum: ['draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled'],
    })
      .notNull()
      .default('draft'),
    requestedBy: text('requested_by').references(() => users.id, { onDelete: 'set null' }),
    submittedAt: text('submitted_at'),
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: text('decided_at'),
    decisionNote: text('decision_note'),
    paidAt: text('paid_at'),
    paidBy: text('paid_by').references(() => users.id, { onDelete: 'set null' }),
    paidFromAccountId: text('paid_from_account_id').references(() => financeAccounts.id),
    paymentReference: text('payment_reference'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('expense_requests_church_status_idx').on(table.churchId, table.status, table.createdAt),
    index('expense_requests_requester_idx').on(table.requestedBy),
  ],
);

/** RAPB: the yearly budget per category. */
export const financeBudgets = sqliteTable(
  'finance_budgets',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => financeCategories.id),
    amount: integer('amount').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('finance_budgets_church_year_category_unique').on(
      table.churchId,
      table.year,
      table.categoryId,
    ),
  ],
);

/** A move of money between two accounts; posts one negative and one positive entry. */
export const financeTransfers = sqliteTable(
  'finance_transfers',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    fromAccountId: text('from_account_id')
      .notNull()
      .references(() => financeAccounts.id),
    toAccountId: text('to_account_id')
      .notNull()
      .references(() => financeAccounts.id),
    fundId: text('fund_id')
      .notNull()
      .references(() => financeFunds.id),
    amount: integer('amount').notNull(),
    transferDate: text('transfer_date').notNull(),
    note: text('note'),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('finance_transfers_church_date_idx').on(table.churchId, table.transferDate)],
);

export type FinanceFundRow = typeof financeFunds.$inferSelect;
export type FinanceAccountRow = typeof financeAccounts.$inferSelect;
export type FinanceCategoryRow = typeof financeCategories.$inferSelect;
export type FinancePeriodRow = typeof financePeriods.$inferSelect;
export type FinanceEntryRow = typeof financeEntries.$inferSelect;
export type OfferingBatchRow = typeof offeringBatches.$inferSelect;
export type OfferingBatchLineRow = typeof offeringBatchLines.$inferSelect;
export type FinanceCampaignRow = typeof financeCampaigns.$inferSelect;
export type FinancePledgeRow = typeof financePledges.$inferSelect;
export type FinanceContributionRow = typeof financeContributions.$inferSelect;
export type ExpenseRequestRow = typeof expenseRequests.$inferSelect;
export type FinanceBudgetRow = typeof financeBudgets.$inferSelect;
export type FinanceTransferRow = typeof financeTransfers.$inferSelect;
