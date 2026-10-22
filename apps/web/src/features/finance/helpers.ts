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
import { useChurch } from '@/components/layout/church-provider';
import type { Tone } from '@/components/ui/tone';
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
