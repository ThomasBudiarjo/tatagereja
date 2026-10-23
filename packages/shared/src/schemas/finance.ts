// Zod schemas, enums and labels owned by the finance module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
//
// Every amount is an integer of minor units in the church currency (`moneySchema`); display it
// with `formatMoney(minor, church.currency)`.
import { z } from 'zod';
import { LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import { has, hasAny, type AccessLike } from '../permissions';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  optionalDate,
  optionalText,
  cursorQuerySchema,
  keysetPageSchema,
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

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, LocalizedText> = {
  active: { en: 'Active', id: 'Berjalan' },
  closed: { en: 'Closed', id: 'Selesai' },
};

export const FINANCE_PERIOD_STATUSES = ['open', 'closed', 'reopened'] as const;
export type FinancePeriodStatus = (typeof FINANCE_PERIOD_STATUSES)[number];

export const FINANCE_PERIOD_STATUS_LABELS: Record<FinancePeriodStatus, LocalizedText> = {
  open: { en: 'Open', id: 'Terbuka' },
  closed: { en: 'Closed', id: 'Ditutup' },
  reopened: { en: 'Reopened', id: 'Dibuka kembali' },
};

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
export const DEFAULT_CASH_ACCOUNT = 'Kas Tunai' as const;

/** The suggested income category of each kind of individual giving. */
export const CONTRIBUTION_KIND_CATEGORY: Record<ContributionKind, string | null> = {
  tithe: 'Perpuluhan',
  thanksgiving: 'Persembahan Syukur',
  special: 'Persembahan Khusus',
  donation: 'Donasi',
  pledge_payment: 'Persembahan Khusus',
  other: null,
};

/** The category suggested for counted service offerings. */
export const OFFERING_DEFAULT_CATEGORY = 'Persembahan Ibadah' as const;

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

/** `YYYY-MM` of a period, used as report keys. */
export const periodKey = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

/** First and last day (YYYY-MM-DD) of a month. */
export const monthRange = (year: number, month: number): { from: string; to: string } => {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${periodKey(year, month)}-01`,
    to: `${periodKey(year, month)}-${String(last).padStart(2, '0')}`,
  };
};

/** A `YYYY-MM-DD` day moved by whole days. */
export const shiftDate = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/** Whether a date falls in one of the closed periods. */
export const isInClosedPeriod = (
  date: string,
  closedPeriods: readonly { year: number; month: number }[],
): boolean => {
  const { year, month } = financePeriodOf(date);
  return closedPeriods.some((period) => period.year === year && period.month === month);
};

/** Budget usage as a ratio (0.5 = half spent); null without a budget. */
export const budgetUsage = (budget: number, actual: number): number | null =>
  budget > 0 ? actual / budget : null;

/** Campaign or pledge progress as a ratio capped at 1. */
export const progressRatio = (target: number, received: number): number =>
  target > 0 ? Math.min(1, Math.max(0, received / target)) : 0;

/** Lists of funds, accounts and categories: everyone who works with finance needs them. */
export const canUseFinance = (access: Pick<AccessLike, 'permissions'>) =>
  hasAny(access, [
    'finance.view',
    'finance.record',
    'finance.approve',
    'finance.manage',
    'finance.reports',
  ]);

/** Every expense request, not only the caller's own. */
export const canViewAllExpenses = (access: Pick<AccessLike, 'permissions'>) =>
  hasAny(access, ['finance.view', 'finance.approve', 'finance.manage']);

/** Segregation of duties: nobody approves an expense they requested or changed. */
export const canApproveExpense = (
  access: AccessLike,
  expense: { requestedBy: string | null; editorUserIds?: readonly string[] },
) =>
  has(access, 'finance.approve') &&
  expense.requestedBy !== access.userId &&
  !(expense.editorUserIds ?? []).includes(access.userId);

type ExpenseLike = { status: ExpenseStatus; requestedBy: string | null };

const isRequester = (access: AccessLike, expense: ExpenseLike) =>
  expense.requestedBy === access.userId && has(access, 'finance.record');

/** Drafts are edited and submitted by their requester, or by the finance managers. */
export const canEditExpense = (access: AccessLike, expense: ExpenseLike) =>
  expense.status === 'draft' && (isRequester(access, expense) || has(access, 'finance.manage'));

export const canDecideExpense = (access: AccessLike, expense: ExpenseLike) =>
  expense.status === 'submitted' && canApproveExpense(access, expense);

export const canPayExpense = (access: AccessLike, expense: ExpenseLike) =>
  expense.status === 'approved' && hasAny(access, ['finance.record', 'finance.manage']);

export const canCancelExpense = (access: AccessLike, expense: ExpenseLike) =>
  EXPENSE_TRANSITIONS[expense.status].includes('cancelled') &&
  (isRequester(access, expense) || has(access, 'finance.manage'));

/** A payment recorded by mistake is reversed by the finance managers (the request is approved again). */
export const canReversePayment = (access: AccessLike, expense: ExpenseLike) =>
  expense.status === 'paid' && has(access, 'finance.manage');

type BatchLike = {
  status: OfferingBatchStatus;
  counter1UserId: string | null;
  counter2UserId: string | null;
  createdBy: string | null;
  submittedBy?: string | null;
  updatedBy?: string | null;
  editorUserIds?: readonly string[];
};

/**
 * The verifier of an offering count must not be one of its counters, its creator, the person
 * who submitted it or anyone who edited it.
 */
export const canVerifyOfferingBatch = (access: AccessLike, batch: Omit<BatchLike, 'status'>) =>
  has(access, 'finance.approve') &&
  ![
    batch.counter1UserId,
    batch.counter2UserId,
    batch.createdBy,
    batch.submittedBy ?? null,
    batch.updatedBy ?? null,
    ...(batch.editorUserIds ?? []),
  ].includes(access.userId);

export const canEditOfferingBatch = (access: AccessLike, batch: BatchLike) =>
  batch.status === 'draft' && has(access, 'finance.record');

/** A submitted count goes back to counting for corrections. */
export const canReturnOfferingBatch = (access: AccessLike, batch: BatchLike) =>
  batch.status === 'submitted' && hasAny(access, ['finance.record', 'finance.approve']);

/** Managers void any batch; a counter may discard their own unverified count. */
export const canVoidOfferingBatch = (access: AccessLike, batch: BatchLike) =>
  batch.status !== 'voided' &&
  (has(access, 'finance.manage') ||
    (batch.status !== 'verified' &&
      batch.createdBy === access.userId &&
      has(access, 'finance.record')));

/**
 * Corrections re-post a gift, so they belong to whoever recorded it or to the finance managers
 * (who can also void it).
 */
export const canCorrectContribution = (
  access: AccessLike,
  contribution: { recordedBy: string | null; voidedAt: string | null },
) =>
  !contribution.voidedAt &&
  ((has(access, 'finance.record') && contribution.recordedBy === access.userId) ||
    has(access, 'finance.manage'));

/** Giving of a person: finance reports, or the person themselves ("my giving"). */
export const canViewGivingOf = (access: AccessLike, personId: string) =>
  has(access, 'finance.reports') || access.personId === personId;

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
  /** Null for callers without `finance.view`. */
  balance: signedMoneySchema.nullable(),
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
  /** Null for callers without `finance.view` or `finance.manage`. */
  openingBalance: signedMoneySchema.nullable(),
  openingDate: isoDateSchema,
  isActive: z.boolean(),
  /** Null for callers without `finance.view`. */
  balance: signedMoneySchema.nullable(),
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

export const financeFundResponseSchema = z.object({ fund: financeFundSchema });
export const financeAccountResponseSchema = z.object({ account: financeAccountSchema });
export const financeCategoryResponseSchema = z.object({ category: financeCategorySchema });

/** The suggested funds, categories and a cash box; existing names are kept. */
export const financeDefaultsBodySchema = z.object({
  openingDate: isoDateSchema,
  cashOpeningBalance: signedMoneySchema.default(0),
});
export type FinanceDefaultsBody = z.infer<typeof financeDefaultsBodySchema>;

export const financePeriodSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  status: z.enum(FINANCE_PERIOD_STATUSES),
  closedAt: isoDateTimeSchema.nullable(),
  closedByName: z.string().nullable(),
  reopenedAt: isoDateTimeSchema.nullable(),
  reopenedByName: z.string().nullable(),
  reopenReason: z.string().nullable(),
  income: moneySchema,
  expense: moneySchema,
  entryCount: z.number().int().nonnegative(),
  /** Offering counts still in draft or waiting for verification. */
  pendingBatches: z.number().int().nonnegative(),
});
export type FinancePeriod = z.infer<typeof financePeriodSchema>;

export const financePeriodListQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(3000),
});

export const financePeriodListSchema = z.object({
  year: z.number().int(),
  items: z.array(financePeriodSchema),
});
export type FinancePeriodList = z.infer<typeof financePeriodListSchema>;

export const financePeriodResponseSchema = z.object({ period: financePeriodSchema });

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
  voidReason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type FinanceEntry = z.infer<typeof financeEntrySchema>;

const booleanQuery = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const financeEntryListQuerySchema = paginationQuerySchema.extend({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  accountId: idSchema.optional(),
  fundId: idSchema.optional(),
  categoryId: idSchema.optional(),
  sourceType: z.enum(FINANCE_ENTRY_SOURCES).optional(),
  direction: z.enum(['in', 'out']).optional(),
  includeVoided: booleanQuery,
  format: z.enum(['json', 'csv']).default('json'),
  ...cursorQuerySchema.shape,
});
export type FinanceEntryListQuery = z.infer<typeof financeEntryListQuerySchema>;

export const financeEntryListSchema = paginatedSchema(financeEntrySchema).extend(
  keysetPageSchema.shape,
);
export type FinanceEntryList = z.infer<typeof financeEntryListSchema>;

export const financeEntryResponseSchema = z.object({ entry: financeEntrySchema });

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
  categoryName: z.string().nullable(),
  method: z.enum(PAYMENT_METHODS),
  /** The account a non-cash line was posted to; null means the batch account. */
  accountId: idSchema.nullable(),
  accountName: z.string().nullable(),
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
    /** Transfers and QRIS land in a bank or e-wallet; null uses the batch account. */
    accountId: idSchema.nullable().default(null),
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
  accountName: z.string(),
  status: z.enum(OFFERING_BATCH_STATUSES),
  totalAmount: moneySchema,
  lines: z.array(offeringBatchLineSchema),
  counter1UserId: idSchema.nullable(),
  counter1Name: z.string().nullable(),
  counter2UserId: idSchema.nullable(),
  counter2Name: z.string().nullable(),
  notes: z.string().nullable(),
  submittedAt: isoDateTimeSchema.nullable(),
  submittedBy: idSchema.nullable(),
  updatedBy: idSchema.nullable(),
  verifiedBy: idSchema.nullable(),
  verifiedByName: z.string().nullable(),
  verifiedAt: isoDateTimeSchema.nullable(),
  voidedAt: isoDateTimeSchema.nullable(),
  voidReason: z.string().nullable(),
  createdBy: idSchema.nullable(),
  createdByName: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
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
  })
  .refine(
    (value) =>
      !value.counter1Name ||
      !value.counter2Name ||
      value.counter1Name.toLocaleLowerCase() !== value.counter2Name.toLocaleLowerCase(),
    { message: 'The two counters must be different people', path: ['counter2Name'] },
  )
  .refine((value) => value.lines.some((line) => line.amount > 0), {
    message: 'Enter at least one amount',
    path: ['lines'],
  });
export type OfferingBatchInput = z.infer<typeof offeringBatchInputSchema>;

export const offeringBatchListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(OFFERING_BATCH_STATUSES).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  sort: z
    .enum(['serviceDate', '-serviceDate', 'totalAmount', '-totalAmount'])
    .default('-serviceDate'),
});
export type OfferingBatchListQuery = z.infer<typeof offeringBatchListQuerySchema>;

export const offeringBatchListSchema = paginatedSchema(offeringBatchSchema);
export type OfferingBatchList = z.infer<typeof offeringBatchListSchema>;

export const offeringBatchResponseSchema = z.object({ batch: offeringBatchSchema });

export const returnOfferingBatchBodySchema = z.object({
  reason: optionalText(LIMITS.shortTextMax),
});

/** Worship services on a day, to link an offering count to the service it was collected in. */
export const offeringServiceQuerySchema = z.object({ date: isoDateSchema });

export const offeringServiceOptionSchema = z.object({
  id: idSchema,
  title: z.string(),
  startsAt: z.string(),
  location: z.string().nullable(),
});
export type OfferingServiceOption = z.infer<typeof offeringServiceOptionSchema>;

export const offeringServiceListSchema = z.object({ items: z.array(offeringServiceOptionSchema) });

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
  accountName: z.string(),
  categoryId: idSchema.nullable(),
  categoryName: z.string().nullable(),
  campaignId: idSchema.nullable(),
  campaignName: z.string().nullable(),
  method: z.enum(PAYMENT_METHODS),
  amount: moneySchema,
  receivedAt: isoDateSchema,
  reference: z.string().nullable(),
  receiptNumber: z.string().nullable(),
  note: z.string().nullable(),
  recordedBy: idSchema.nullable(),
  recordedByName: z.string().nullable(),
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
  campaignId: idSchema.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  includeVoided: booleanQuery,
  sort: z.enum(['receivedAt', '-receivedAt', 'amount', '-amount']).default('-receivedAt'),
});
export type FinanceContributionListQuery = z.infer<typeof financeContributionListQuerySchema>;

export const financeContributionListSchema = paginatedSchema(financeContributionSchema).extend({
  /** Sum of the matching, non-voided contributions. */
  totalAmount: moneySchema,
});
export type FinanceContributionList = z.infer<typeof financeContributionListSchema>;

export const financeContributionResponseSchema = z.object({
  contribution: financeContributionSchema,
});

export const financeDonorQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const financeDonorListSchema = z.object({ items: z.array(personSummarySchema) });

export const financeMemberOptionSchema = z.object({ userId: idSchema, name: z.string() });
export type FinanceMemberOption = z.infer<typeof financeMemberOptionSchema>;
export const financeMemberListSchema = z.object({ items: z.array(financeMemberOptionSchema) });

export const financeCampaignSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  fundId: idSchema,
  fundName: z.string(),
  targetAmount: moneySchema,
  pledgedAmount: moneySchema,
  receivedAmount: moneySchema,
  pledgeCount: z.number().int().nonnegative(),
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

export const financeCampaignListQuerySchema = z.object({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

export const financeCampaignListSchema = z.object({ items: z.array(financeCampaignSchema) });

export const financePledgeSchema = z.object({
  id: idSchema,
  campaignId: idSchema,
  campaignName: z.string(),
  person: personSummarySchema.nullable(),
  donorName: z.string().nullable(),
  amount: moneySchema,
  paidAmount: moneySchema,
  note: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type FinancePledge = z.infer<typeof financePledgeSchema>;

export const financePledgeInputSchema = z
  .object({
    personId: idSchema.nullable().default(null),
    donorName: optionalText(LIMITS.nameMax),
    amount: moneySchema.refine((value) => value > 0, 'Enter an amount'),
    note: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.personId || value.donorName, {
    message: 'Choose a person or enter a name',
    path: ['donorName'],
  });
export type FinancePledgeInput = z.infer<typeof financePledgeInputSchema>;

export const financeCampaignDetailSchema = z.object({
  campaign: financeCampaignSchema,
  pledges: z.array(financePledgeSchema),
});
export type FinanceCampaignDetail = z.infer<typeof financeCampaignDetailSchema>;

export const financeCampaignResponseSchema = z.object({ campaign: financeCampaignSchema });
export const financePledgeResponseSchema = z.object({ pledge: financePledgeSchema });

export const financePledgeParamsSchema = z.object({
  churchId: idSchema,
  id: idSchema,
  pledgeId: idSchema,
});

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
  paidAt: isoDateSchema.nullable(),
  paidByName: z.string().nullable(),
  paidFromAccountId: idSchema.nullable(),
  paidFromAccountName: z.string().nullable(),
  paymentReference: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  canApprove: z.boolean(),
});
export type ExpenseRequest = z.infer<typeof expenseRequestSchema>;

export const expenseRequestInputSchema = z
  .object({
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
  })
  .refine((value) => !value.isReimbursement || !!value.reimbursePersonId, {
    message: 'Choose who is reimbursed',
    path: ['reimbursePersonId'],
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

export const cancelExpenseBodySchema = z.object({ reason: optionalText(LIMITS.shortTextMax) });

export const expenseRequestListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(EXPENSE_STATUSES).optional(),
  categoryId: idSchema.optional(),
  mine: booleanQuery,
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  sort: z.enum(['createdAt', '-createdAt', 'amount', '-amount']).default('-createdAt'),
});
export type ExpenseRequestListQuery = z.infer<typeof expenseRequestListQuerySchema>;

export const expenseRequestListSchema = paginatedSchema(expenseRequestSchema);
export type ExpenseRequestList = z.infer<typeof expenseRequestListSchema>;

export const expenseRequestResponseSchema = z.object({ expense: expenseRequestSchema });

export const financeBudgetSchema = z.object({
  /** Null for a category without a budget line yet. */
  id: idSchema.nullable(),
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

export const financeBudgetQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(3000),
});

const budgetTotalsSchema = z.object({ budget: moneySchema, actual: moneySchema });

export const financeBudgetListSchema = z.object({
  year: z.number().int(),
  items: z.array(financeBudgetSchema),
  totals: z.object({ income: budgetTotalsSchema, expense: budgetTotalsSchema }),
});
export type FinanceBudgetList = z.infer<typeof financeBudgetListSchema>;

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
    .max(500)
    .refine(
      (items) => new Set(items.map((item) => item.categoryId)).size === items.length,
      'Each category appears once',
    ),
});
export type SaveBudgetBody = z.infer<typeof saveBudgetBodySchema>;

export const financeTransferSchema = z.object({
  id: idSchema,
  fromAccountId: idSchema,
  fromAccountName: z.string(),
  toAccountId: idSchema,
  toAccountName: z.string(),
  fundId: idSchema,
  fundName: z.string(),
  amount: moneySchema,
  transferDate: isoDateSchema,
  note: z.string().nullable(),
  voidedAt: isoDateTimeSchema.nullable(),
  voidReason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type FinanceTransfer = z.infer<typeof financeTransferSchema>;

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

export const financeTransferListQuerySchema = paginationQuerySchema.extend({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  accountId: idSchema.optional(),
});
export const financeTransferListSchema = paginatedSchema(financeTransferSchema);
export const financeTransferResponseSchema = z.object({ transfer: financeTransferSchema });

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
  trend: { en: 'Weekly trend', id: 'Tren mingguan' },
};

export const financeReportParamsSchema = z.object({
  churchId: idSchema,
  kind: z.enum(FINANCE_REPORT_KINDS),
});

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
  /** Cash flow only: the account balance before and after the range. */
  opening: signedMoneySchema.nullable(),
  closing: signedMoneySchema.nullable(),
});
export type FinanceReportRow = z.infer<typeof financeReportRowSchema>;

export const financeReportSchema = z.object({
  kind: z.enum(FINANCE_REPORT_KINDS),
  from: isoDateSchema,
  to: isoDateSchema,
  currency: z.string(),
  rows: z.array(financeReportRowSchema),
  totals: financeReportRowSchema.pick({ income: true, expense: true, net: true }),
});
export type FinanceReport = z.infer<typeof financeReportSchema>;

export const givingStatementQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(3000),
});
export type GivingStatementQuery = z.infer<typeof givingStatementQuerySchema>;

export const givingStatementParamsSchema = z.object({ churchId: idSchema, personId: idSchema });

export const givingStatementSchema = z.object({
  year: z.number().int(),
  person: personSummarySchema,
  currency: z.string(),
  total: moneySchema,
  byKind: z.array(z.object({ kind: z.enum(CONTRIBUTION_KINDS), amount: moneySchema })),
  byFund: z.array(z.object({ fundName: z.string(), amount: moneySchema })),
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
  pledges: z.array(
    financePledgeSchema.pick({
      id: true,
      campaignId: true,
      campaignName: true,
      amount: true,
      paidAmount: true,
    }),
  ),
});
export type GivingStatement = z.infer<typeof givingStatementSchema>;

export const givingStatementResponseSchema = z.object({ statement: givingStatementSchema });

/** "My giving": null when the caller has no person record in the church. */
export const myGivingSchema = z.object({ statement: givingStatementSchema.nullable() });
export type MyGiving = z.infer<typeof myGivingSchema>;

export const givingStatementListQuerySchema = paginationQuerySchema.extend({
  year: z.coerce.number().int().min(2000).max(3000),
  format: z.enum(['json', 'csv']).default('json'),
});
export type GivingStatementListQuery = z.infer<typeof givingStatementListQuerySchema>;

export const givingSummarySchema = z.object({
  person: personSummarySchema,
  total: moneySchema,
  count: z.number().int().nonnegative(),
  lastGiftAt: isoDateSchema.nullable(),
});
export type GivingSummary = z.infer<typeof givingSummarySchema>;

export const givingStatementListSchema = paginatedSchema(givingSummarySchema).extend({
  year: z.number().int(),
  /** Gifts without a person (NN) in the year. */
  anonymousTotal: moneySchema,
});
export type GivingStatementList = z.infer<typeof givingStatementListSchema>;

export const financeSummarySchema = z.object({
  currency: z.string(),
  totalBalance: signedMoneySchema,
  accounts: z.array(financeAccountSchema),
  funds: z.array(financeFundSchema),
  monthIncome: moneySchema,
  monthExpense: moneySchema,
  previousMonthIncome: moneySchema,
  previousMonthExpense: moneySchema,
  /** The last six months, oldest first. */
  trend: z.array(z.object({ month: z.string(), income: moneySchema, expense: moneySchema })),
  pendingBatches: z.number().int().nonnegative(),
  pendingExpenses: z.number().int().nonnegative(),
  approvedExpenses: z.number().int().nonnegative(),
  recentEntries: z.array(financeEntrySchema),
});
export type FinanceSummary = z.infer<typeof financeSummarySchema>;

/** Items waiting for the caller: counts to verify and requests to decide. */
export const financePendingSchema = z.object({
  batches: z.number().int().nonnegative(),
  expenses: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type FinancePending = z.infer<typeof financePendingSchema>;
