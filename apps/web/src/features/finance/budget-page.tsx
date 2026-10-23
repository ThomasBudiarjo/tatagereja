import { budgetUsage, has, type FinanceBudget, type FinanceCategoryKind } from '@tatagereja/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  PiggyBank,
  Save,
  SquarePen,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { SkeletonStats, SkeletonTable } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { budgetQuery, useSaveBudget } from './api';
import { FinanceNav, Meter, Money } from './components';
import { todayIn, yearOptions } from './helpers';

export function BudgetPage() {
  const { t, formatCurrency, formatPercent } = useI18n();
  const { churchId, base, access, church } = useChurch();
  const currentYear = Number(todayIn(church.timezone).slice(0, 4));
  const [state, setState] = useUrlState({ year: currentYear });
  const query = useQuery(budgetQuery(churchId, state.year));
  const client = useQueryClient();
  const canManage = has(access, 'finance.manage');
  const [draft, setDraft] = useState<Record<string, number> | null>(null);
  const save = useMutationToast(useSaveBudget(churchId), { success: t('finance.budgetSaved') });
  const guard = useUnsavedChangesGuard(!!draft && !save.isPending);

  const startEditing = () =>
    setDraft(
      Object.fromEntries((query.data?.items ?? []).map((item) => [item.categoryId, item.amount])),
    );

  const copyPrevious = async () => {
    try {
      const previous = await client.fetchQuery(budgetQuery(churchId, state.year - 1));
      setDraft((current) => ({
        ...current,
        ...Object.fromEntries(
          previous.items
            .filter((item) => item.amount > 0)
            .map((item) => [item.categoryId, item.amount]),
        ),
      }));
      toast.success(t('finance.budgetCopied', { year: state.year - 1 }));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const submit = async () => {
    if (!draft || !query.data) return;
    const result = await save.run({
      year: state.year,
      items: query.data.items.map((item) => ({
        categoryId: item.categoryId,
        amount: draft[item.categoryId] ?? 0,
        notes: item.notes,
      })),
    });
    if (result) setDraft(null);
  };

  const data = query.data;
  const surplus = data ? data.totals.income.actual - data.totals.expense.actual : 0;

  return (
    <Page size="wide">
      <PageHeader
        icon={PiggyBank}
        tone="emerald"
        title={t('finance.budgetTitle', { year: state.year })}
        description={t('finance.budgetDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navBudget') },
        ]}
        actions={
          <Select
            aria-label={t('finance.year')}
            className="h-10 w-28"
            value={state.year}
            disabled={!!draft}
            onChange={(event) => setState({ year: Number(event.target.value) })}
          >
            {yearOptions(currentYear).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        }
      />
      <FinanceNav />

      {query.isPending ? (
        <>
          <SkeletonStats count={3} />
          <SkeletonTable rows={8} columns={4} />
        </>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          tone="emerald"
          title={t('finance.noCategoriesTitle')}
          description={t('finance.noCategoriesDescription')}
        />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              label={t('finance.incomeVsTarget')}
              value={formatCurrency(data.totals.income.actual, { compact: true })}
              hint={t('finance.ofAmount', {
                amount: formatCurrency(data.totals.income.budget, { compact: true }),
              })}
              icon={Target}
              tone="teal"
            />
            <StatCard
              label={t('finance.expenseVsBudget')}
              value={formatCurrency(data.totals.expense.actual, { compact: true })}
              hint={
                data.totals.expense.budget > 0
                  ? t('finance.usedOf', {
                      percent: formatPercent(
                        data.totals.expense.actual / data.totals.expense.budget,
                      ),
                      amount: formatCurrency(data.totals.expense.budget, { compact: true }),
                    })
                  : t('finance.noBudgetYet')
              }
              icon={TrendingDown}
              tone="rose"
            />
            <StatCard
              label={t('finance.surplus')}
              value={formatCurrency(surplus, { compact: true, signDisplay: 'exceptZero' })}
              icon={TrendingUp}
              tone={surplus >= 0 ? 'success' : 'danger'}
              className="col-span-2 sm:col-span-1"
            />
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {draft ? (
                <>
                  <Button variant="ghost" onClick={() => setDraft(null)}>
                    <X />
                    {t('common.cancel')}
                  </Button>
                  <Button variant="outline" onClick={() => void copyPrevious()}>
                    <Copy />
                    {t('finance.copyPreviousYear')}
                  </Button>
                  <Button loading={save.isPending} onClick={() => void submit()}>
                    {!save.isPending ? <Save /> : null}
                    {t('finance.saveBudget')}
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={startEditing}>
                  <SquarePen />
                  {t('finance.editBudget')}
                </Button>
              )}
            </div>
          ) : null}

          {(['expense', 'income'] as FinanceCategoryKind[]).map((kind) => (
            <BudgetSection
              key={kind}
              kind={kind}
              items={data.items.filter((item) => item.kind === kind)}
              draft={draft}
              onChange={(categoryId, amount) =>
                setDraft((current) => ({ ...current, [categoryId]: amount }))
              }
            />
          ))}
        </>
      ) : null}
      {guard}
    </Page>
  );
}

function BudgetSection({
  kind,
  items,
  draft,
  onChange,
}: {
  kind: FinanceCategoryKind;
  items: FinanceBudget[];
  draft: Record<string, number> | null;
  onChange: (categoryId: string, amount: number) => void;
}) {
  const { t, formatPercent } = useI18n();
  if (items.length === 0) return null;
  const budget = items.reduce(
    (sum, item) => sum + (draft ? (draft[item.categoryId] ?? 0) : item.amount),
    0,
  );
  const actual = items.reduce((sum, item) => sum + item.actual, 0);
  return (
    <Section
      title={kind === 'expense' ? t('finance.budgetExpense') : t('finance.budgetIncome')}
      description={
        kind === 'expense' ? t('finance.budgetExpenseHint') : t('finance.budgetIncomeHint')
      }
    >
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
        <div className="hidden grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] gap-4 border-b bg-muted/45 px-4 py-2.5 text-xs font-semibold text-muted-foreground md:grid">
          <span>{t('finance.category')}</span>
          <span className="text-right">
            {kind === 'expense' ? t('finance.budget') : t('finance.target')}
          </span>
          <span className="text-right">{t('finance.actual')}</span>
          <span className="text-right">{t('finance.variance')}</span>
        </div>
        <ul className="divide-y divide-border/60">
          {items.map((item) => {
            const amount = draft ? (draft[item.categoryId] ?? 0) : item.amount;
            const usage = budgetUsage(amount, item.actual);
            const variance = item.actual - amount;
            const bad = kind === 'expense' ? variance > 0 : variance < 0;
            return (
              <li
                key={item.categoryId}
                className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.categoryName}</p>
                  {usage !== null ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Meter
                        value={usage}
                        tone={kind === 'expense' ? 'emerald' : 'teal'}
                        label={t('finance.usageOf', { category: item.categoryName })}
                        className="flex-1"
                      />
                      <span className="w-10 text-right text-xs text-muted-foreground tabular">
                        {formatPercent(usage)}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <span className="text-xs text-muted-foreground md:hidden">
                    {kind === 'expense' ? t('finance.budget') : t('finance.target')}
                  </span>
                  {draft ? (
                    <CurrencyInput
                      aria-label={t('finance.budgetFor', { category: item.categoryName })}
                      value={amount || null}
                      onChange={(value) => onChange(item.categoryId, value ?? 0)}
                      className="h-10 max-w-44"
                    />
                  ) : (
                    <Money value={item.amount} />
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <span className="text-xs text-muted-foreground md:hidden">
                    {t('finance.actual')}
                  </span>
                  <Money value={item.actual} />
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <span className="text-xs text-muted-foreground md:hidden">
                    {t('finance.variance')}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular',
                      amount > 0 && bad && 'text-destructive',
                      amount > 0 && !bad && 'text-success',
                    )}
                  >
                    {amount > 0 ? <Money value={variance} signed className="text-inherit" /> : '—'}
                  </span>
                </div>
              </li>
            );
          })}
          <li className="grid gap-2 bg-muted/40 px-4 py-3 font-semibold md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] md:gap-4">
            <span>{t('finance.total')}</span>
            <span className="flex justify-between md:justify-end">
              <span className="text-xs font-normal text-muted-foreground md:hidden">
                {kind === 'expense' ? t('finance.budget') : t('finance.target')}
              </span>
              <Money value={budget} />
            </span>
            <span className="flex justify-between md:justify-end">
              <span className="text-xs font-normal text-muted-foreground md:hidden">
                {t('finance.actual')}
              </span>
              <Money value={actual} />
            </span>
            <span className="flex justify-between md:justify-end">
              <span className="text-xs font-normal text-muted-foreground md:hidden">
                {t('finance.variance')}
              </span>
              <Money
                value={actual - budget}
                signed
                className={cn(
                  'text-inherit',
                  budget > 0 &&
                    ((kind === 'expense' ? actual > budget : actual < budget)
                      ? 'text-destructive'
                      : 'text-success'),
                )}
              />
            </span>
          </li>
        </ul>
      </div>
    </Section>
  );
}
