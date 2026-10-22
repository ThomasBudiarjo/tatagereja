// Zod schemas, enums and labels owned by the finance module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
//
// Every amount is an integer of minor units in the church currency (`moneySchema`); display it
// with `formatMoney(minor, church.currency)`.
import { z } from 'zod';
import { LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import { has, type AccessLike } from '../permissions';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  optionalDate,
  optionalText,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
  signedMoneySchema,
} from './common';
import { personSummarySchema } from './person';

export const FINANCE_LIMITS = {
  batchLinesMax: 50,
  attachmentsMax: 10,
  denominationsMax: 30,
  denominationCountMax: 1_000_000,
  accountNumberMax: 40,
  reportRangeDaysMax: 1100,
} as const;

// ---------------------------------------------------------------------------------------------
// Enumerations and labels
// ---------------------------------------------------------------------------------------------

export const FINANCE_ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'other'] as const;
export type FinanceAccountType = (typeof FINANCE_ACCOUNT_TYPES)[number];

export const FINANCE_ACCOUNT_TYPE_LABELS: Record<FinanceAccountType, LocalizedText> = {
  cash: { en: 'Cash box', id: 'Kas tunai' },
  bank: { en: 'Bank account', id: 'Rekening bank' },
  ewallet: { en: 'E-wallet', id: 'Dompet digital' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const FINANCE_CATEGORY_KINDS = ['income', 'expense'] as const;
export type FinanceCategoryKind = (typeof FINANCE_CATEGORY_KINDS)[number];

export const FINANCE_CATEGORY_KIND_LABELS: Record<FinanceCategoryKind, LocalizedText> = {
  income: { en: 'Income', id: 'Penerimaan' },
  expense: { en: 'Expense', id: 'Pengeluaran' },
};

export const PAYMENT_METHODS = ['cash', 'transfer', 'qris', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, LocalizedText> = {
  cash: { en: 'Cash', id: 'Tunai' },
  transfer: { en: 'Bank transfer', id: 'Transfer bank' },
  qris: { en: 'QRIS', id: 'QRIS' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const CONTRIBUTION_KINDS = [
  'tithe',
  'thanksgiving',
  'special',
  'donation',
  'pledge_payment',
  'other',
] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export const CONTRIBUTION_KIND_LABELS: Record<ContributionKind, LocalizedText> = {
  tithe: { en: 'Tithe', id: 'Perpuluhan' },
  thanksgiving: { en: 'Thanksgiving offering', id: 'Persembahan syukur' },
  special: { en: 'Special offering', id: 'Persembahan khusus' },
  donation: { en: 'Donation', id: 'Donasi' },
  pledge_payment: { en: 'Pledge payment', id: 'Pelunasan janji iman' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const OFFERING_BATCH_STATUSES = ['draft', 'submitted', 'verified', 'voided'] as const;
export type OfferingBatchStatus = (typeof OFFERING_BATCH_STATUSES)[number];

export const OFFERING_BATCH_STATUS_LABELS: Record<OfferingBatchStatus, LocalizedText> = {
  draft: { en: 'Counting', id: 'Sedang dihitung' },
  submitted: { en: 'Waiting for verification', id: 'Menunggu verifikasi' },
  verified: { en: 'Verified', id: 'Terverifikasi' },
  voided: { en: 'Voided', id: 'Dibatalkan' },
};

export const EXPENSE_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'paid',
  'cancelled',
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, LocalizedText> = {
  draft: { en: 'Draft', id: 'Draf' },
  submitted: { en: 'Waiting for approval', id: 'Menunggu persetujuan' },
  approved: { en: 'Approved', id: 'Disetujui' },
  rejected: { en: 'Rejected', id: 'Ditolak' },
  paid: { en: 'Paid', id: 'Dibayar' },
  cancelled: { en: 'Cancelled', id: 'Dibatalkan' },
};

/** Allowed moves of the expense workflow. */
export const EXPENSE_TRANSITIONS: Record<ExpenseStatus, readonly ExpenseStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'cancelled'],
  approved: ['paid', 'cancelled'],
  rejected: [],
  paid: [],
  cancelled: [],
};

export const FINANCE_ENTRY_SOURCES = [
  'offering',
  'contribution',
  'expense',
  'transfer',
  'adjustment',
] as const;
export type FinanceEntrySource = (typeof FINANCE_ENTRY_SOURCES)[number];

export const FINANCE_ENTRY_SOURCE_LABELS: Record<FinanceEntrySource, LocalizedText> = {
  offering: { en: 'Service offering', id: 'Persembahan ibadah' },
  contribution: { en: 'Contribution', id: 'Persembahan perorangan' },
  expense: { en: 'Expense', id: 'Pengeluaran' },
  transfer: { en: 'Transfer', id: 'Pemindahan dana' },
  adjustment: { en: 'Adjustment', id: 'Penyesuaian' },
};

export const CAMPAIGN_STATUSES = ['active', 'closed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Rupiah banknotes and coins for the denomination counter (IDR minor unit = 1 rupiah). */
export const IDR_DENOMINATIONS = [
  100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100,
] as const;

/** Suggested setup for a new church. */
export const DEFAULT_FUNDS = ['Kas Umum', 'Pembangunan', 'Misi', 'Diakonia'] as const;
export const DEFAULT_INCOME_CATEGORIES = [
  'Persembahan Ibadah',
  'Perpuluhan',
  'Persembahan Syukur',
  'Persembahan Khusus',
  'Donasi',
] as const;
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Pelayanan & Ibadah',
  'Honorarium',
  'Operasional Gedung',
  'Listrik, Air & Internet',
  'Diakonia',
  'Misi & Pekabaran Injil',
  'Pembangunan',
  'Administrasi',
] as const;

// ---------------------------------------------------------------------------------------------
// Helpers and access rules
// ---------------------------------------------------------------------------------------------

/** Sum of a denomination count, e.g. `{ "100000": 3, "5000": 2 }` → 310000. */
export const denominationTotal = (denominations: Record<string, number>): number =>
  Object.entries(denominations).reduce((sum, [value, count]) => sum + Number(value) * count, 0);

/** The finance period of a YYYY-MM-DD date. */
export const financePeriodOf = (date: string): { year: number; month: number } => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
});

/** Whether a date falls in one of the closed periods. */
export const isInClosedPeriod = (
  date: string,
  closedPeriods: readonly { year: number; month: number }[],
): boolean => {
  const { year, month } = financePeriodOf(date);
  return closedPeriods.some((period) => period.year === year && period.month === month);
};

/** Segregation of duties: nobody approves an expense they requested. */
export const canApproveExpense = (access: AccessLike, expense: { requestedBy: string | null }) =>
  has(access, 'finance.approve') && expense.requestedBy !== access.userId;

/** The verifier of an offering count must not be one of its counters or its creator. */
export const canVerifyOfferingBatch = (
  access: AccessLike,
  batch: { counter1UserId: string | null; counter2UserId: string | null; createdBy: string | null },
) =>
  has(access, 'finance.approve') &&
  access.userId !== batch.counter1UserId &&
  access.userId !== batch.counter2UserId &&
  access.userId !== batch.createdBy;

// ---------------------------------------------------------------------------------------------
// Funds, accounts, categories and periods
// ---------------------------------------------------------------------------------------------

export const financeFundSchema = z.object({
  id: idSchema,
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  isRestricted: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  balance: signedMoneySchema,
});
export type FinanceFund = z.infer<typeof financeFundSchema>;

export const financeFundInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  code: optionalText(20),
  description: optionalText(LIMITS.shortTextMax),
  isRestricted: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
export type FinanceFundInput = z.infer<typeof financeFundInputSchema>;

export const financeAccountSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: z.enum(FINANCE_ACCOUNT_TYPES),
  bankName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  openingBalance: signedMoneySchema,
  openingDate: isoDateSchema,
  isActive: z.boolean(),
  balance: signedMoneySchema,
});
export type FinanceAccount = z.infer<typeof financeAccountSchema>;

export const financeAccountInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  type: z.enum(FINANCE_ACCOUNT_TYPES),
  bankName: optionalText(LIMITS.nameMax),
  accountNumber: optionalText(FINANCE_LIMITS.accountNumberMax),
  openingBalance: signedMoneySchema.default(0),
  openingDate: isoDateSchema,
  isActive: z.boolean().default(true),
});
export type FinanceAccountInput = z.infer<typeof financeAccountInputSchema>;

export const financeCategorySchema = z.object({
  id: idSchema,
  kind: z.enum(FINANCE_CATEGORY_KINDS),
  name: z.string(),
  code: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type FinanceCategory = z.infer<typeof financeCategorySchema>;

export const financeCategoryInputSchema = z.object({
  kind: z.enum(FINANCE_CATEGORY_KINDS),
  name: requiredText(2, LIMITS.nameMax),
  code: optionalText(20),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
export type FinanceCategoryInput = z.infer<typeof financeCategoryInputSchema>;

export const financeSetupSchema = z.object({
  funds: z.array(financeFundSchema),
  accounts: z.array(financeAccountSchema),
  categories: z.array(financeCategorySchema),
});
export type FinanceSetup = z.infer<typeof financeSetupSchema>;

export const financePeriodSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  status: z.enum(['open', 'closed', 'reopened']),
  closedAt: isoDateTimeSchema.nullable(),
  reopenedAt: isoDateTimeSchema.nullable(),
  reopenReason: z.string().nullable(),
});
export type FinancePeriod = z.infer<typeof financePeriodSchema>;

export const financePeriodParamsSchema = z.object({
  churchId: idSchema,
  year: z.coerce.number().int().min(2000).max(3000),
  month: z.coerce.number().int().min(1).max(12),
});

export const reopenPeriodBodySchema = z.object({ reason: requiredText(3, LIMITS.shortTextMax) });
export type ReopenPeriodBody = z.infer<typeof reopenPeriodBodySchema>;

// ---------------------------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------------------------

export const financeEntrySchema = z.object({
  id: idSchema,
  entryDate: isoDateSchema,
  accountId: idSchema,
  accountName: z.string(),
  fundId: idSchema,
  fundName: z.string(),
  categoryId: idSchema.nullable(),
  categoryName: z.string().nullable(),
  amount: signedMoneySchema,
  description: z.string(),
  sourceType: z.enum(FINANCE_ENTRY_SOURCES),
  sourceId: z.string().nullable(),
  /** Account balance after this entry, when listed per account. */
  runningBalance: signedMoneySchema.nullable(),
  voidedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type FinanceEntry = z.infer<typeof financeEntrySchema>;

export const financeEntryListQuerySchema = paginationQuerySchema.extend({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  accountId: idSchema.optional(),
  fundId: idSchema.optional(),
  categoryId: idSchema.optional(),
  sourceType: z.enum(FINANCE_ENTRY_SOURCES).optional(),
  includeVoided: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type FinanceEntryListQuery = z.infer<typeof financeEntryListQuerySchema>;

export const financeEntryListSchema = paginatedSchema(financeEntrySchema);
export type FinanceEntryList = z.infer<typeof financeEntryListSchema>;

/** A manual correction posted by `finance.manage`. */
export const financeAdjustmentInputSchema = z.object({
  entryDate: isoDateSchema,
  accountId: idSchema,
  fundId: idSchema,
  categoryId: idSchema.nullable().default(null),
  amount: signedMoneySchema.refine((value) => value !== 0, 'The amount cannot be zero'),
  description: requiredText(3, LIMITS.shortTextMax),
});
export type FinanceAdjustmentInput = z.infer<typeof financeAdjustmentInputSchema>;

export const voidFinanceBodySchema = z.object({ reason: requiredText(3, LIMITS.shortTextMax) });
export type VoidFinanceBody = z.infer<typeof voidFinanceBodySchema>;

// ---------------------------------------------------------------------------------------------
// Offerings (persembahan ibadah)
// ---------------------------------------------------------------------------------------------

const denominationsSchema = z
  .record(
    z.string().regex(/^\d+$/),
    z.number().int().min(0).max(FINANCE_LIMITS.denominationCountMax),
  )
  .refine((value) => Object.keys(value).length <= FINANCE_LIMITS.denominationsMax, {
    message: 'Too many denominations',
  });

export const offeringBatchLineSchema = z.object({
  id: idSchema,
  fundId: idSchema,
  fundName: z.string(),
  categoryId: idSchema.nullable(),
  method: z.enum(PAYMENT_METHODS),
  amount: moneySchema,
  denominations: z.record(z.string(), z.number()),
  note: z.string().nullable(),
});
export type OfferingBatchLine = z.infer<typeof offeringBatchLineSchema>;

export const offeringBatchLineInputSchema = z
  .object({
    fundId: idSchema,
    categoryId: idSchema.nullable().default(null),
    method: z.enum(PAYMENT_METHODS).default('cash'),
    amount: moneySchema,
    denominations: denominationsSchema.default({}),
    note: optionalText(LIMITS.shortTextMax),
  })
  .refine(
    (value) =>
      Object.keys(value.denominations).length === 0 ||
      denominationTotal(value.denominations) === value.amount,
    { message: 'The amount must equal the counted notes and coins', path: ['amount'] },
  );
export type OfferingBatchLineInput = z.infer<typeof offeringBatchLineInputSchema>;

export const offeringBatchSchema = z.object({
  id: idSchema,
  serviceDate: isoDateSchema,
  worshipServiceId: idSchema.nullable(),
  serviceLabel: z.string().nullable(),
  accountId: idSchema,
  status: z.enum(OFFERING_BATCH_STATUSES),
  totalAmount: moneySchema,
  lines: z.array(offeringBatchLineSchema),
  counter1UserId: idSchema.nullable(),
  counter1Name: z.string().nullable(),
  counter2UserId: idSchema.nullable(),
  counter2Name: z.string().nullable(),
  notes: z.string().nullable(),
  submittedAt: isoDateTimeSchema.nullable(),
  verifiedBy: idSchema.nullable(),
  verifiedByName: z.string().nullable(),
  verifiedAt: isoDateTimeSchema.nullable(),
  voidedAt: isoDateTimeSchema.nullable(),
  voidReason: z.string().nullable(),
  createdBy: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  canVerify: z.boolean(),
});
export type OfferingBatch = z.infer<typeof offeringBatchSchema>;

export const offeringBatchInputSchema = z
  .object({
    serviceDate: isoDateSchema,
    worshipServiceId: idSchema.nullable().default(null),
    serviceLabel: optionalText(LIMITS.nameMax),
    accountId: idSchema,
    lines: z.array(offeringBatchLineInputSchema).min(1).max(FINANCE_LIMITS.batchLinesMax),
    counter1UserId: idSchema.nullable().default(null),
    counter1Name: optionalText(LIMITS.nameMax),
    counter2UserId: idSchema.nullable().default(null),
    counter2Name: optionalText(LIMITS.nameMax),
    notes: optionalText(LIMITS.longTextMax),
    /** Submit for verification right away. */
    submit: z.boolean().default(false),
  })
  .refine((value) => value.counter1UserId || value.counter1Name, {
    message: 'Name the first counter',
    path: ['counter1Name'],
  })
  .refine((value) => value.counter2UserId || value.counter2Name, {
    message: 'Offerings are counted by two people',
    path: ['counter2Name'],
  })
  .refine((value) => !value.counter1UserId || value.counter1UserId !== value.counter2UserId, {
    message: 'The two counters must be different people',
    path: ['counter2UserId'],
  });
export type OfferingBatchInput = z.infer<typeof offeringBatchInputSchema>;

export const offeringBatchListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(OFFERING_BATCH_STATUSES).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type OfferingBatchListQuery = z.infer<typeof offeringBatchListQuerySchema>;

export const offeringBatchListSchema = paginatedSchema(offeringBatchSchema);

// ---------------------------------------------------------------------------------------------
// Contributions, campaigns and pledges
// ---------------------------------------------------------------------------------------------

export const financeContributionSchema = z.object({
  id: idSchema,
  person: personSummarySchema.nullable(),
  donorName: z.string().nullable(),
  kind: z.enum(CONTRIBUTION_KINDS),
  fundId: idSchema,
  fundName: z.string(),
  accountId: idSchema,
  categoryId: idSchema.nullable(),
  campaignId: idSchema.nullable(),
  method: z.enum(PAYMENT_METHODS),
  amount: moneySchema,
  receivedAt: isoDateSchema,
  reference: z.string().nullable(),
  receiptNumber: z.string().nullable(),
  note: z.string().nullable(),
  voidedAt: isoDateTimeSchema.nullable(),
  voidReason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type FinanceContribution = z.infer<typeof financeContributionSchema>;

export const financeContributionInputSchema = z.object({
  /** Null records an anonymous gift (NN). */
  personId: idSchema.nullable().default(null),
  donorName: optionalText(LIMITS.nameMax),
  kind: z.enum(CONTRIBUTION_KINDS),
  fundId: idSchema,
  accountId: idSchema,
  categoryId: idSchema.nullable().default(null),
  campaignId: idSchema.nullable().default(null),
  method: z.enum(PAYMENT_METHODS),
  amount: moneySchema.refine((value) => value > 0, 'Enter an amount'),
  receivedAt: isoDateSchema,
  reference: optionalText(LIMITS.shortTextMax),
  note: optionalText(LIMITS.shortTextMax),
});
export type FinanceContributionInput = z.infer<typeof financeContributionInputSchema>;

export const financeContributionListQuerySchema = paginationQuerySchema.extend({
  personId: idSchema.optional(),
  kind: z.enum(CONTRIBUTION_KINDS).optional(),
  fundId: idSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type FinanceContributionListQuery = z.infer<typeof financeContributionListQuerySchema>;

export const financeContributionListSchema = paginatedSchema(financeContributionSchema);

export const financeCampaignSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  fundId: idSchema,
  targetAmount: moneySchema,
  pledgedAmount: moneySchema,
  receivedAmount: moneySchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
  status: z.enum(CAMPAIGN_STATUSES),
});
export type FinanceCampaign = z.infer<typeof financeCampaignSchema>;

export const financeCampaignInputSchema = z
  .object({
    name: requiredText(2, LIMITS.nameMax),
    description: optionalText(LIMITS.longTextMax),
    fundId: idSchema,
    targetAmount: moneySchema.refine((value) => value > 0, 'Enter a target'),
    startDate: isoDateSchema,
    endDate: optionalDate,
    status: z.enum(CAMPAIGN_STATUSES).default('active'),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  });
export type FinanceCampaignInput = z.infer<typeof financeCampaignInputSchema>;

export const financePledgeSchema = z.object({
  id: idSchema,
  campaignId: idSchema,
  person: personSummarySchema.nullable(),
  donorName: z.string().nullable(),
  amount: moneySchema,
  paidAmount: moneySchema,
  note: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type FinancePledge = z.infer<typeof financePledgeSchema>;

export const financePledgeInputSchema = z.object({
  personId: idSchema.nullable().default(null),
  donorName: optionalText(LIMITS.nameMax),
  amount: moneySchema.refine((value) => value > 0, 'Enter an amount'),
  note: optionalText(LIMITS.shortTextMax),
});
export type FinancePledgeInput = z.infer<typeof financePledgeInputSchema>;

// ---------------------------------------------------------------------------------------------
// Expenses, budgets and transfers
// ---------------------------------------------------------------------------------------------

export const expenseRequestSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  categoryId: idSchema,
  categoryName: z.string(),
  fundId: idSchema,
  fundName: z.string(),
  amount: moneySchema,
  payeeName: z.string().nullable(),
  neededBy: isoDateSchema.nullable(),
  attachmentUrls: z.array(z.string()),
  isReimbursement: z.boolean(),
  reimbursePerson: personSummarySchema.nullable(),
  status: z.enum(EXPENSE_STATUSES),
  requestedBy: idSchema.nullable(),
  requesterName: z.string().nullable(),
  submittedAt: isoDateTimeSchema.nullable(),
  decidedBy: idSchema.nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  decisionNote: z.string().nullable(),
  paidAt: isoDateTimeSchema.nullable(),
  paidFromAccountId: idSchema.nullable(),
  paymentReference: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  canApprove: z.boolean(),
});
export type ExpenseRequest = z.infer<typeof expenseRequestSchema>;

export const expenseRequestInputSchema = z.object({
  title: requiredText(2, LIMITS.nameMax),
  description: optionalText(LIMITS.longTextMax),
  categoryId: idSchema,
  fundId: idSchema,
  amount: moneySchema.refine((value) => value > 0, 'Enter an amount'),
  payeeName: optionalText(LIMITS.nameMax),
  neededBy: optionalDate,
  attachmentUrls: z
    .array(
      z
        .string()
        .trim()
        .max(LIMITS.urlMax)
        .pipe(z.url({ protocol: /^https?$/ })),
    )
    .max(FINANCE_LIMITS.attachmentsMax)
    .default([]),
  isReimbursement: z.boolean().default(false),
  reimbursePersonId: idSchema.nullable().default(null),
  submit: z.boolean().default(false),
});
export type ExpenseRequestInput = z.infer<typeof expenseRequestInputSchema>;

export const decideExpenseBodySchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    note: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.decision === 'approved' || !!value.note, {
    message: 'Explain why the request is rejected',
    path: ['note'],
  });
export type DecideExpenseBody = z.infer<typeof decideExpenseBodySchema>;

export const payExpenseBodySchema = z.object({
  accountId: idSchema,
  paidAt: isoDateSchema,
  paymentReference: optionalText(LIMITS.shortTextMax),
});
export type PayExpenseBody = z.infer<typeof payExpenseBodySchema>;

export const expenseRequestListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(EXPENSE_STATUSES).optional(),
  mine: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type ExpenseRequestListQuery = z.infer<typeof expenseRequestListQuerySchema>;

export const expenseRequestListSchema = paginatedSchema(expenseRequestSchema);

export const financeBudgetSchema = z.object({
  id: idSchema,
  year: z.number().int(),
  categoryId: idSchema,
  categoryName: z.string(),
  kind: z.enum(FINANCE_CATEGORY_KINDS),
  amount: moneySchema,
  actual: moneySchema,
  /** actual − budget (positive = over budget for expenses, above target for income). */
  variance: signedMoneySchema,
  notes: z.string().nullable(),
});
export type FinanceBudget = z.infer<typeof financeBudgetSchema>;

export const saveBudgetBodySchema = z.object({
  year: z.number().int().min(2000).max(3000),
  items: z
    .array(
      z.object({
        categoryId: idSchema,
        amount: moneySchema,
        notes: optionalText(LIMITS.shortTextMax),
      }),
    )
    .max(500),
});
export type SaveBudgetBody = z.infer<typeof saveBudgetBodySchema>;

export const financeTransferInputSchema = z
  .object({
    fromAccountId: idSchema,
    toAccountId: idSchema,
    fundId: idSchema,
    amount: moneySchema.refine((value) => value > 0, 'Enter an amount'),
    transferDate: isoDateSchema,
    note: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: 'Choose two different accounts',
    path: ['toAccountId'],
  });
export type FinanceTransferInput = z.infer<typeof financeTransferInputSchema>;

// ---------------------------------------------------------------------------------------------
// Reports and giving statements
// ---------------------------------------------------------------------------------------------

export const FINANCE_REPORT_KINDS = [
  'income_expense',
  'by_fund',
  'by_category',
  'cash_flow',
  'trend',
] as const;
export type FinanceReportKind = (typeof FINANCE_REPORT_KINDS)[number];

export const FINANCE_REPORT_LABELS: Record<FinanceReportKind, LocalizedText> = {
  income_expense: { en: 'Income vs expense', id: 'Penerimaan vs pengeluaran' },
  by_fund: { en: 'By fund', id: 'Per kas' },
  by_category: { en: 'By category', id: 'Per mata anggaran' },
  cash_flow: { en: 'Cash flow per account', id: 'Arus kas per rekening' },
  trend: { en: 'Trend', id: 'Tren' },
};

export const financeReportQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    fundId: idSchema.optional(),
    accountId: idSchema.optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .refine((value) => value.to >= value.from, {
    message: 'The end date must be on or after the start date',
    path: ['to'],
  })
  .refine(
    (value) =>
      (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <=
      FINANCE_LIMITS.reportRangeDaysMax,
    { message: 'Choose a shorter range', path: ['to'] },
  );
export type FinanceReportQuery = z.infer<typeof financeReportQuerySchema>;

export const financeReportRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  income: moneySchema,
  expense: moneySchema,
  net: signedMoneySchema,
});
export type FinanceReportRow = z.infer<typeof financeReportRowSchema>;

export const financeReportSchema = z.object({
  kind: z.enum(FINANCE_REPORT_KINDS),
  from: isoDateSchema,
  to: isoDateSchema,
  currency: z.string(),
  rows: z.array(financeReportRowSchema),
  totals: financeReportRowSchema.omit({ key: true, label: true }),
});
export type FinanceReport = z.infer<typeof financeReportSchema>;

export const givingStatementQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(3000),
  /** Omitted for "my giving"; another person needs `finance.reports`. */
  personId: idSchema.optional(),
});
export type GivingStatementQuery = z.infer<typeof givingStatementQuerySchema>;

export const givingStatementSchema = z.object({
  year: z.number().int(),
  person: personSummarySchema,
  currency: z.string(),
  total: moneySchema,
  byKind: z.array(z.object({ kind: z.enum(CONTRIBUTION_KINDS), amount: moneySchema })),
  items: z.array(
    financeContributionSchema.pick({
      id: true,
      kind: true,
      fundName: true,
      method: true,
      amount: true,
      receivedAt: true,
      receiptNumber: true,
    }),
  ),
});
export type GivingStatement = z.infer<typeof givingStatementSchema>;

export const financeSummarySchema = z.object({
  currency: z.string(),
  totalBalance: signedMoneySchema,
  accounts: z.array(financeAccountSchema),
  monthIncome: moneySchema,
  monthExpense: moneySchema,
  pendingBatches: z.number().int().nonnegative(),
  pendingExpenses: z.number().int().nonnegative(),
  recentEntries: z.array(financeEntrySchema),
});
export type FinanceSummary = z.infer<typeof financeSummarySchema>;
