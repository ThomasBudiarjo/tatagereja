import {
  fullName,
  type ExpenseStatus,
  type FinanceEntrySource,
  type FinancePeriodStatus,
  type OfferingBatchStatus,
  type PaymentMethod,
  type PersonSummary,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Banknote,
  CreditCard,
  HandCoins,
  HeartHandshake,
  QrCode,
  Receipt,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { FieldValues, Resolver } from 'react-hook-form';
import { useChurch } from '@/components/layout/church-provider';
import type { Tone } from '@/components/ui/tone';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { financeSetupQuery } from './api';

export const OFFERING_STATUS_TONE: Record<OfferingBatchStatus, Tone> = {
  draft: 'neutral',
  submitted: 'warning',
  verified: 'success',
  voided: 'danger',
};

export const EXPENSE_STATUS_TONE: Record<ExpenseStatus, Tone> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'info',
  rejected: 'danger',
  paid: 'success',
  cancelled: 'slate',
};

export const PERIOD_STATUS_TONE: Record<FinancePeriodStatus, Tone> = {
  open: 'neutral',
  closed: 'success',
  reopened: 'warning',
};

export const SOURCE_ICON: Record<FinanceEntrySource, ComponentType<{ className?: string }>> = {
  offering: HandCoins,
  contribution: HeartHandshake,
  expense: Receipt,
  transfer: ArrowLeftRight,
  adjustment: SlidersHorizontal,
};

export const SOURCE_TONE: Record<FinanceEntrySource, Tone> = {
  offering: 'emerald',
  contribution: 'teal',
  expense: 'rose',
  transfer: 'sky',
  adjustment: 'slate',
};

export const METHOD_ICON: Record<PaymentMethod, ComponentType<{ className?: string }>> = {
  cash: Banknote,
  transfer: CreditCard,
  qris: QrCode,
  other: Wallet,
};

/** Where a ledger entry came from, as an in-app path below the church. */
export const sourcePath = (sourceType: FinanceEntrySource, sourceId: string | null) => {
  if (!sourceId) return null;
  switch (sourceType) {
    case 'offering':
      return `finance/offerings/${sourceId}`;
    case 'contribution':
      return `finance/giving/${sourceId}`;
    case 'expense':
      return `finance/expenses/${sourceId}`;
    default:
      return null;
  }
};

/** Today in the church time zone, as `YYYY-MM-DD`. */
export const todayIn = (timeZone?: string): string => {
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
};

/** The most recent Sunday (today on a Sunday), for the offering form. */
export const lastSunday = (today: string): string => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
};

export const donorName = (
  person: PersonSummary | null,
  donorName: string | null,
  anonymous: string,
) => (person ? fullName(person) : (donorName ?? anonymous));

/** The church's funds, accounts and categories, with active ones first-class. */
export function useFinanceSetup() {
  const { churchId } = useChurch();
  const query = useQuery(financeSetupQuery(churchId));
  const data = query.data;
  return {
    query,
    funds: data?.funds ?? [],
    accounts: data?.accounts ?? [],
    categories: data?.categories ?? [],
    activeFunds: (data?.funds ?? []).filter((fund) => fund.isActive),
    activeAccounts: (data?.accounts ?? []).filter((account) => account.isActive),
    incomeCategories: (data?.categories ?? []).filter((c) => c.kind === 'income' && c.isActive),
    expenseCategories: (data?.categories ?? []).filter((c) => c.kind === 'expense' && c.isActive),
    isEmpty: !!data && (data.funds.length === 0 || data.accounts.length === 0),
  };
}

/**
 * Active choices plus the one a record already uses, so correcting it never silently swaps an
 * inactive fund, account, category or closed campaign for the first option.
 */
export function withCurrent<T extends { id: string }>(
  active: readonly T[],
  all: readonly T[],
  currentId: string | null | undefined,
): T[] {
  if (!currentId || active.some((item) => item.id === currentId)) return [...active];
  const current = all.find((item) => item.id === currentId);
  return current ? [current, ...active] : [...active];
}

/** The four years around now, for year pickers. */
export const yearOptions = (current: number) => [
  current + 1,
  current,
  current - 1,
  current - 2,
  current - 3,
];

const ONES = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
];

/** Indonesian amount in words for receipts ("terbilang"): 1.250.000 → "satu juta dua ratus lima puluh ribu". */
export function terbilang(value: number): string {
  const words = (n: number): string => {
    if (n < 12) return ONES[n] ?? '';
    if (n < 20) return `${words(n - 10)} belas`;
    if (n < 100) return `${words(Math.floor(n / 10))} puluh ${words(n % 10)}`;
    if (n < 200) return `seratus ${words(n - 100)}`;
    if (n < 1000) return `${words(Math.floor(n / 100))} ratus ${words(n % 100)}`;
    if (n < 2000) return `seribu ${words(n - 1000)}`;
    if (n < 1e6) return `${words(Math.floor(n / 1000))} ribu ${words(n % 1000)}`;
    if (n < 1e9) return `${words(Math.floor(n / 1e6))} juta ${words(n % 1e6)}`;
    if (n < 1e12) return `${words(Math.floor(n / 1e9))} miliar ${words(n % 1e9)}`;
    return `${words(Math.floor(n / 1e12))} triliun ${words(n % 1e12)}`;
  };
  const result = words(Math.floor(Math.abs(value)))
    .replace(/\s+/g, ' ')
    .trim();
  return result || 'nol';
}

/** A date-range trigger that shrinks to its icon on phones (tinted when a range is chosen). */
export const compactRange = (active: boolean) =>
  [
    'max-sm:w-11 max-sm:justify-center max-sm:px-0 max-sm:[&>span]:sr-only max-sm:[&>svg:last-child]:hidden',
    active ? 'max-sm:border-primary/30 max-sm:bg-accent max-sm:text-accent-foreground' : '',
  ].join(' ');

/** The shared finance schemas' own rule messages (English), by their dictionary key. */
const RULE_MESSAGES: Record<string, MessageKey> = {
  'Choose a person or enter a name': 'finance.ruleChoosePersonOrName',
  'Choose a shorter range': 'finance.ruleShorterRange',
  'Choose two different accounts': 'finance.ruleTwoAccounts',
  'Choose who is reimbursed': 'finance.ruleReimbursePerson',
  'Each category appears once': 'finance.ruleCategoryOnce',
  'Enter a target': 'finance.ruleEnterTarget',
  'Enter an amount': 'finance.ruleEnterAmount',
  'Enter at least one amount': 'finance.enterAnAmount',
  'Explain why the request is rejected': 'finance.ruleRejectReason',
  'Name the first counter': 'finance.ruleFirstCounter',
  'Offerings are counted by two people': 'finance.ruleTwoCounters',
  'The amount cannot be zero': 'finance.ruleNonZero',
  'The amount must equal the counted notes and coins': 'finance.ruleDenominations',
  'The end date must be on or after the start date': 'finance.ruleEndAfterStart',
  'The two counters must be different people': 'finance.ruleDifferentCounters',
  'Too many denominations': 'finance.ruleTooManyDenominations',
};

/**
 * Wraps a form resolver so the finance rules (written in English in the shared schemas) show in
 * the interface language; zod's own messages already follow it.
 */
export function useFinanceResolver<TInput extends FieldValues, TContext, TOutput>(
  resolver: Resolver<TInput, TContext, TOutput>,
): Resolver<TInput, TContext, TOutput> {
  const { t } = useI18n();
  const translate = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'ref') continue;
      if (key === 'message' && typeof value === 'string' && RULE_MESSAGES[value]) {
        (node as { message: string }).message = t(RULE_MESSAGES[value]);
      } else translate(value);
    }
  };
  return async (values, context, options) => {
    const result = await resolver(values, context, options);
    translate(result.errors);
    return result;
  };
}
