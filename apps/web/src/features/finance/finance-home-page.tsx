import {
  FINANCE_ACCOUNT_TYPE_LABELS,
  FINANCE_ENTRY_SOURCE_LABELS,
  has,
  hasAny,
  localize,
  type FinanceAccount,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ClipboardCheck,
  HandCoins,
  HeartHandshake,
  Landmark,
  Receipt,
  Smartphone,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LineChart } from '@/components/ui/charts';
import { DataList } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { Skeleton, SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { ToneIcon } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { financePendingQuery, financeSummaryQuery } from './api';
import { FinanceNav, Money } from './components';
import { SOURCE_ICON, SOURCE_TONE, sourcePath, useFinanceSetup } from './helpers';
import { DefaultsDialog } from './setup-dialogs';

const ACCOUNT_ICON = {
  cash: Banknote,
  bank: Landmark,
  ewallet: Smartphone,
  other: Wallet,
} as const;
const ACCOUNT_TONE = { cash: 'emerald', bank: 'sky', ewallet: 'violet', other: 'slate' } as const;

const change = (current: number, previous: number) =>
  previous > 0 ? (current - previous) / previous : null;

export function FinanceHomePage() {
  const { t, locale, formatDate, formatCurrency } = useI18n();
  const { access, base, churchId } = useChurch();
  const canView = has(access, 'finance.view');
  const canRecord = has(access, 'finance.record');
  const canApprove = has(access, 'finance.approve');
  const canManage = has(access, 'finance.manage');
  const setup = useFinanceSetup();
  const summary = useQuery({ ...financeSummaryQuery(churchId), enabled: canView });
  const pending = useQuery({ ...financePendingQuery(churchId), enabled: canApprove });
  const [defaultsOpen, setDefaultsOpen] = useState(false);

  const actions = canRecord
    ? [
        {
          to: 'finance/offerings/new',
          icon: HandCoins,
          tone: 'emerald' as const,
          label: t('finance.recordOffering'),
          hint: t('finance.recordOfferingHint'),
        },
        {
          to: 'finance/giving/new',
          icon: HeartHandshake,
          tone: 'teal' as const,
          label: t('finance.recordGift'),
          hint: t('finance.recordGiftHint'),
        },
        {
          to: 'finance/expenses/new',
          icon: Receipt,
          tone: 'rose' as const,
          label: t('finance.newExpense'),
          hint: t('finance.newExpenseHint'),
        },
      ]
    : [];

  const incomeChange = summary.data
    ? change(summary.data.monthIncome, summary.data.previousMonthIncome)
    : null;
  const expenseChange = summary.data
    ? change(summary.data.monthExpense, summary.data.previousMonthExpense)
    : null;

  return (
    <Page size="wide">
      <PageHeader
        icon={Wallet}
        tone="emerald"
        title={t('finance.nav')}
        description={t('finance.homeDescription')}
        actions={
          canRecord && !setup.isEmpty ? (
            <Button asChild className="hidden sm:inline-flex">
              <Link to={`${base}/finance/offerings/new`}>
                <HandCoins />
                {t('finance.recordOffering')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FinanceNav />

      {setup.query.isPending ? (
        <SkeletonStats />
      ) : setup.query.isError ? (
        <ErrorState
          error={setup.query.error}
          message={getErrorMessage(setup.query.error)}
          onRetry={() => void setup.query.refetch()}
          retrying={setup.query.isFetching}
        />
      ) : setup.isEmpty ? (
        <EmptyState
          icon={Sparkles}
          tone="emerald"
          title={t('finance.setupTitle')}
          description={canManage ? t('finance.setupDescription') : t('finance.setupAskTreasurer')}
          action={
            canManage ? (
              <Button onClick={() => setDefaultsOpen(true)}>
                <Sparkles />
                {t('finance.setupStart')}
              </Button>
            ) : null
          }
          secondaryAction={
            canManage ? (
              <Button asChild variant="outline">
                <Link to={`${base}/finance/settings`}>{t('finance.setupManual')}</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {pending.data && pending.data.total > 0 ? (
            <Alert
              variant="warning"
              title={t('finance.pendingTitle')}
              action={
                <Button asChild size="sm" variant="outline">
                  <Link
                    to={
                      pending.data.batches > 0
                        ? `${base}/finance/offerings?status=submitted`
                        : `${base}/finance/expenses?status=submitted`
                    }
                  >
                    <ClipboardCheck />
                    {t('finance.pendingReview')}
                  </Link>
                </Button>
              }
            >
              {[
                pending.data.batches > 0
                  ? t('finance.pendingBatches', { count: pending.data.batches })
                  : null,
                pending.data.expenses > 0
                  ? t('finance.pendingExpenses', { count: pending.data.expenses })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Alert>
          ) : null}

          {actions.length > 0 ? (
            <ul className="grid gap-2.5 sm:grid-cols-3">
              {actions.map((action) => (
                <li key={action.to}>
                  <Link
                    to={`${base}/${action.to}`}
                    className="pressable flex h-full min-h-16 items-center gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    <ToneIcon icon={action.icon} tone={action.tone} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{action.label}</span>
                      <span className="block text-xs text-muted-foreground">{action.hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {!canView ? (
            <Card>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">{t('finance.limitedAccess')}</p>
                {hasAny(access, ['finance.record', 'finance.approve']) ? (
                  <Button asChild variant="outline">
                    <Link to={`${base}/finance/expenses`}>{t('finance.navExpenses')}</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : summary.isPending ? (
            <>
              <SkeletonStats />
              <Skeleton className="h-64" />
              <SkeletonList rows={4} />
            </>
          ) : summary.isError ? (
            <ErrorState
              error={summary.error}
              message={getErrorMessage(summary.error)}
              onRetry={() => void summary.refetch()}
              retrying={summary.isFetching}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label={t('finance.totalBalance')}
                  value={formatCurrency(summary.data.totalBalance)}
                  icon={Wallet}
                  tone="emerald"
                  to={`${base}/finance/ledger`}
                  className="col-span-2 lg:col-span-1"
                />
                <StatCard
                  label={t('finance.monthIncome')}
                  value={formatCurrency(summary.data.monthIncome, { compact: true })}
                  icon={ArrowDownLeft}
                  tone="teal"
                  trend={incomeChange === null ? undefined : { value: incomeChange }}
                  hint={t('finance.vsLastMonth')}
                />
                <StatCard
                  label={t('finance.monthExpense')}
                  value={formatCurrency(summary.data.monthExpense, { compact: true })}
                  icon={ArrowUpRight}
                  tone="rose"
                  trend={
                    expenseChange === null ? undefined : { value: expenseChange, upIsGood: false }
                  }
                  hint={t('finance.vsLastMonth')}
                />
                <StatCard
                  label={t('finance.waiting')}
                  value={
                    summary.data.pendingBatches +
                    summary.data.pendingExpenses +
                    summary.data.approvedExpenses
                  }
                  icon={ClipboardCheck}
                  tone="amber"
                  hint={t('finance.waitingHint', {
                    batches: summary.data.pendingBatches,
                    expenses: summary.data.pendingExpenses + summary.data.approvedExpenses,
                  })}
                  to={`${base}/finance/offerings?status=submitted`}
                  className="col-span-2 lg:col-span-1"
                />
              </div>

              <Section title={t('finance.accounts')}>
                <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {summary.data.accounts
                    .filter((account) => account.isActive || (account.balance ?? 0) !== 0)
                    .map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        to={`${base}/finance/ledger?accountId=${account.id}`}
                      />
                    ))}
                </ul>
              </Section>

              <div className="grid gap-6 lg:grid-cols-5">
                <Section title={t('finance.trendTitle')} className="lg:col-span-3">
                  <Card className="relative overflow-hidden">
                    <CardContent>
                      <LineChart
                        title={t('finance.trendTitle')}
                        labels={summary.data.trend.map((point) =>
                          formatDate(`${point.month}-01`, { options: { month: 'short' } }),
                        )}
                        series={[
                          {
                            id: 'income',
                            label: t('finance.income'),
                            values: summary.data.trend.map((point) => point.income),
                          },
                          {
                            id: 'expense',
                            label: t('finance.expense'),
                            values: summary.data.trend.map((point) => point.expense),
                          },
                        ]}
                        format={(value) => formatCurrency(value, { compact: true })}
                      />
                    </CardContent>
                  </Card>
                </Section>
                <Section title={t('finance.funds')} className="lg:col-span-2">
                  <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
                    {summary.data.funds
                      .filter((fund) => fund.isActive || (fund.balance ?? 0) !== 0)
                      .map((fund) => (
                        <Link
                          key={fund.id}
                          to={`${base}/finance/ledger?fundId=${fund.id}`}
                          className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
                        >
                          <span className="min-w-0 truncate font-medium">{fund.name}</span>
                          <Money value={fund.balance} />
                        </Link>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t('finance.fundBalanceHint')}</p>
                </Section>
              </div>

              <Section
                title={t('finance.recentEntries')}
                action={
                  <Button asChild variant="link" size="sm">
                    <Link to={`${base}/finance/ledger`}>{t('common.seeAll')}</Link>
                  </Button>
                }
              >
                {summary.data.recentEntries.length === 0 ? (
                  <EmptyState
                    compact
                    icon={HandCoins}
                    tone="emerald"
                    title={t('finance.noEntriesTitle')}
                    description={t('finance.noEntriesDescription')}
                    action={
                      canRecord ? (
                        <Button asChild>
                          <Link to={`${base}/finance/offerings/new`}>
                            {t('finance.recordOffering')}
                          </Link>
                        </Button>
                      ) : null
                    }
                  />
                ) : (
                  <DataList
                    items={summary.data.recentEntries}
                    getKey={(entry) => entry.id}
                    href={(entry) => {
                      const target = sourcePath(entry.sourceType, entry.sourceId);
                      return target ? `${base}/${target}` : undefined;
                    }}
                    leading={(entry) => (
                      <ToneIcon
                        icon={SOURCE_ICON[entry.sourceType]}
                        tone={SOURCE_TONE[entry.sourceType]}
                        size="sm"
                      />
                    )}
                    title={(entry) => entry.description}
                    subtitle={(entry) =>
                      `${formatDate(entry.entryDate)} · ${entry.accountName} · ${localize(FINANCE_ENTRY_SOURCE_LABELS[entry.sourceType], locale)}`
                    }
                    trailing={(entry) => <Money value={entry.amount} signed />}
                  />
                )}
              </Section>
            </>
          )}
        </>
      )}
      <DefaultsDialog open={defaultsOpen} onOpenChange={setDefaultsOpen} />
    </Page>
  );
}

function AccountCard({ account, to }: { account: FinanceAccount; to: string }) {
  const { t, locale } = useI18n();
  const Icon = ACCOUNT_ICON[account.type];
  const detail = account.bankName
    ? [account.bankName, account.accountNumber].filter(Boolean).join(' · ')
    : localize(FINANCE_ACCOUNT_TYPE_LABELS[account.type], locale);
  return (
    <li>
      <Link
        to={to}
        className={cn(
          'pressable flex items-center gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
          !account.isActive && 'opacity-70',
        )}
      >
        <ToneIcon icon={Icon} tone={ACCOUNT_TONE[account.type]} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{account.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {detail}
            {!account.isActive ? ` · ${t('finance.inactive')}` : ''}
          </span>
        </span>
        <Money value={account.balance} className="text-base" />
      </Link>
    </li>
  );
}
