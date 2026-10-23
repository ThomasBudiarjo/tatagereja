import { financePendingSchema, has, type Permission } from '@tatagereja/shared';
import {
  BookOpen,
  ChartColumnIncreasing,
  HandCoins,
  HeartHandshake,
  PiggyBank,
  Receipt,
  Wallet,
} from 'lucide-react';
import { request } from '@/lib/api';
import { churchScope } from '@/lib/keys';
import { defineModule, lazyPage, type AccessRule, type RoutePrefetch } from '@/lib/modules';

const anyOf = (...permissions: Permission[]): AccessRule => ({ anyOf: permissions });

/** Anyone holding one of the module's permissions sees it. */
const access = anyOf(
  'finance.view',
  'finance.record',
  'finance.approve',
  'finance.manage',
  'finance.reports',
);
const viewers = anyOf('finance.view', 'finance.record', 'finance.approve');
const expenses = anyOf('finance.view', 'finance.record', 'finance.approve', 'finance.manage');
const record = anyOf('finance.record');

/** The finance home as it opens: setup, and the summary and approvals the caller may see. */
const prefetchFinanceHome: RoutePrefetch = async ({ churchId, access: caller, client }) => {
  const api = await import('./api');
  void client.prefetchQuery(api.financeSetupQuery(churchId));
  if (has(caller, 'finance.view')) void client.prefetchQuery(api.financeSummaryQuery(churchId));
  if (has(caller, 'finance.approve')) void client.prefetchQuery(api.financePendingQuery(churchId));
};

export const financeModule = defineModule({
  id: 'finance',
  icon: Wallet,
  accent: 'emerald',
  labelKey: 'finance.nav',
  descriptionKey: 'finance.description',
  section: 'admin',
  routes: [
    {
      path: 'finance',
      lazy: lazyPage(() => import('./finance-home-page'), 'FinanceHomePage'),
      handle: { access, prefetch: prefetchFinanceHome },
    },
    {
      path: 'finance/offerings',
      lazy: lazyPage(() => import('./offerings-page'), 'OfferingsPage'),
      handle: { access: viewers },
    },
    {
      path: 'finance/offerings/new',
      lazy: lazyPage(() => import('./offering-form-page'), 'NewOfferingPage'),
      handle: { access: record },
    },
    {
      path: 'finance/offerings/:offeringId',
      lazy: lazyPage(() => import('./offering-page'), 'OfferingPage'),
      handle: { access: viewers },
    },
    {
      path: 'finance/offerings/:offeringId/edit',
      lazy: lazyPage(() => import('./offering-form-page'), 'EditOfferingPage'),
      handle: { access: record },
    },
    {
      path: 'finance/giving',
      lazy: lazyPage(() => import('./contributions-page'), 'ContributionsPage'),
      // Recorders see the gifts they recorded (the API narrows the list).
      handle: { access: anyOf('finance.view', 'finance.record') },
    },
    {
      path: 'finance/giving/new',
      lazy: lazyPage(() => import('./contribution-form'), 'NewContributionPage'),
      handle: { access: record },
    },
    {
      // A receipt: finance viewers, or the giver themselves (the API decides).
      path: 'finance/giving/:contributionId',
      lazy: lazyPage(() => import('./contribution-page'), 'ContributionPage'),
    },
    {
      path: 'finance/giving/:contributionId/edit',
      lazy: lazyPage(() => import('./contribution-form'), 'EditContributionPage'),
      handle: { access: anyOf('finance.record', 'finance.manage') },
    },
    {
      path: 'finance/expenses',
      lazy: lazyPage(() => import('./expenses-page'), 'ExpensesPage'),
      handle: { access: expenses },
    },
    {
      path: 'finance/expenses/new',
      lazy: lazyPage(() => import('./expense-form'), 'NewExpensePage'),
      handle: { access: record },
    },
    {
      path: 'finance/expenses/:expenseId',
      lazy: lazyPage(() => import('./expense-page'), 'ExpensePage'),
      handle: { access: expenses },
    },
    {
      path: 'finance/expenses/:expenseId/edit',
      lazy: lazyPage(() => import('./expense-form'), 'EditExpensePage'),
      handle: { access: anyOf('finance.record', 'finance.manage') },
    },
    {
      path: 'finance/ledger',
      lazy: lazyPage(() => import('./ledger-page'), 'LedgerPage'),
      handle: { access: anyOf('finance.view') },
    },
    {
      path: 'finance/budget',
      lazy: lazyPage(() => import('./budget-page'), 'BudgetPage'),
      handle: { access: anyOf('finance.view', 'finance.reports') },
    },
    {
      path: 'finance/campaigns',
      lazy: lazyPage(() => import('./campaigns-page'), 'CampaignsPage'),
      handle: { access: anyOf('finance.view', 'finance.record', 'finance.reports') },
    },
    {
      path: 'finance/campaigns/:campaignId',
      lazy: lazyPage(() => import('./campaigns-page'), 'CampaignPage'),
      handle: { access: anyOf('finance.view', 'finance.record', 'finance.reports') },
    },
    {
      path: 'finance/reports',
      lazy: lazyPage(() => import('./reports-page'), 'ReportsPage'),
      handle: { access: anyOf('finance.reports') },
    },
    {
      // Finance reports, or the person's own statement (the API decides).
      path: 'finance/statements/:personId',
      lazy: lazyPage(() => import('./statement-page'), 'GivingStatementPage'),
    },
    {
      // Every member: their own giving.
      path: 'finance/my-giving',
      lazy: lazyPage(() => import('./statement-page'), 'MyGivingPage'),
    },
    {
      path: 'finance/periods',
      lazy: lazyPage(() => import('./periods-page'), 'PeriodsPage'),
      handle: { access: anyOf('finance.view', 'finance.manage') },
    },
    {
      path: 'finance/settings',
      lazy: lazyPage(() => import('./settings-page'), 'FinanceSettingsPage'),
      handle: { access: anyOf('finance.manage') },
    },
  ],
  nav: [
    {
      id: 'finance',
      to: 'finance',
      labelKey: 'finance.nav',
      descriptionKey: 'finance.description',
      icon: Wallet,
      order: 10,
      access,
      keywords: ['keuangan', 'persembahan', 'perpuluhan', 'kolekte', 'kas', 'offering', 'tithe'],
      // Offering counts to verify and requests to decide (same key as `financeKeys.pending`).
      badge: ({ churchId, access: caller }) => ({
        queryKey: [...churchScope(churchId), 'finance', 'pending', 'badge'],
        queryFn: async () =>
          has(caller, 'finance.approve')
            ? (
                await request(financePendingSchema, {
                  url: `/churches/${churchId}/finance/pending`,
                })
              ).total
            : 0,
        staleTime: 60_000,
      }),
    },
    {
      id: 'my-giving',
      to: 'finance/my-giving',
      labelKey: 'finance.myGiving',
      descriptionKey: 'finance.myGivingDescription',
      icon: HeartHandshake,
      section: 'main',
      order: 60,
      keywords: ['persembahan saya', 'perpuluhan saya', 'my giving', 'statement', 'rekap'],
    },
  ],
  quickActions: [
    {
      id: 'record-offering',
      to: 'finance/offerings/new',
      labelKey: 'finance.recordOffering',
      icon: HandCoins,
      order: 50,
      access: record,
    },
  ],
  commands: [
    {
      id: 'record-gift',
      to: 'finance/giving/new',
      labelKey: 'finance.recordGift',
      icon: HeartHandshake,
      keywords: ['perpuluhan', 'persembahan syukur', 'donasi', 'tithe', 'donation'],
      access: record,
    },
    {
      id: 'new-expense',
      to: 'finance/expenses/new',
      labelKey: 'finance.newExpense',
      icon: Receipt,
      keywords: ['pengajuan dana', 'reimburse', 'penggantian', 'expense'],
      access: record,
    },
    {
      id: 'ledger',
      to: 'finance/ledger',
      labelKey: 'finance.navLedger',
      icon: BookOpen,
      keywords: ['jurnal', 'buku kas', 'saldo', 'ledger'],
      access: anyOf('finance.view'),
    },
    {
      id: 'budget',
      to: 'finance/budget',
      labelKey: 'finance.navBudget',
      icon: PiggyBank,
      keywords: ['rapb', 'anggaran', 'budget'],
      access: anyOf('finance.view', 'finance.reports'),
    },
    {
      id: 'finance-reports',
      to: 'finance/reports',
      labelKey: 'finance.navReports',
      icon: ChartColumnIncreasing,
      keywords: ['laporan keuangan', 'arus kas', 'csv', 'report'],
      access: anyOf('finance.reports'),
    },
  ],
});
