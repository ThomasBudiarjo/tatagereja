import {
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  canViewAllExpenses,
  has,
  localize,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Receipt, Undo2 } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Segmented } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { ResponsiveTable, formatSort, parseSort } from '@/components/ui/responsive-table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { expensesQuery, type ExpenseListParams } from './api';
import { ExpenseStatusBadge, FinanceNav, Money } from './components';
import { useFinanceSetup } from './helpers';

const PAGE_SIZE = 25;

export function ExpensesPage() {
  const { t, locale, formatDate } = useI18n();
  const { churchId, base, access } = useChurch();
  const setup = useFinanceSetup();
  const seesAll = canViewAllExpenses(access);
  const [state, setState, reset] = useUrlState({
    q: '',
    status: '',
    categoryId: '',
    scope: seesAll ? 'all' : 'mine',
    sort: '-createdAt',
    page: 1,
  });
  const params: ExpenseListParams = {
    q: state.q || undefined,
    status: (state.status || undefined) as ExpenseListParams['status'],
    categoryId: state.categoryId || undefined,
    mine: state.scope === 'mine' ? 'true' : undefined,
    sort: state.sort as ExpenseListParams['sort'],
    page: state.page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({ ...expensesQuery(churchId, params), placeholderData: keepPreviousData });
  const canRecord = has(access, 'finance.record');
  const filtered = !!(state.q || state.status || state.categoryId);

  return (
    <Page size="wide">
      <PageHeader
        icon={Receipt}
        tone="rose"
        title={t('finance.navExpenses')}
        description={t('finance.expensesDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navExpenses') },
        ]}
        actions={
          canRecord ? (
            <Button asChild size="sm">
              <Link to={`${base}/finance/expenses/new`}>
                <Plus />
                <span className="hidden sm:inline">{t('finance.newExpense')}</span>
                <span className="sm:hidden">{t('common.add')}</span>
              </Link>
            </Button>
          ) : null
        }
      />
      <FinanceNav />
      {seesAll && canRecord ? (
        <Segmented
          aria-label={t('finance.scope')}
          className="sm:max-w-xs"
          value={state.scope}
          onChange={(scope) => setState({ scope })}
          options={[
            { value: 'all', label: t('finance.allRequests') },
            { value: 'mine', label: t('finance.myRequests') },
          ]}
        />
      ) : null}
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('finance.searchExpenses'),
        }}
        filters={[
          {
            id: 'status',
            label: t('finance.status'),
            value: state.status,
            onChange: (status) => setState({ status }),
            options: EXPENSE_STATUSES.map((value) => ({
              value,
              label: localize(EXPENSE_STATUS_LABELS[value], locale),
            })),
          },
          {
            id: 'category',
            label: t('finance.category'),
            value: state.categoryId,
            onChange: (categoryId) => setState({ categoryId }),
            options: setup.categories
              .filter((category) => category.kind === 'expense')
              .map((category) => ({ value: category.id, label: category.name })),
          },
        ]}
        sort={{
          value: state.sort,
          onChange: (sort) => setState({ sort }),
          options: [
            { value: '-createdAt', label: t('finance.sortNewest') },
            { value: 'createdAt', label: t('finance.sortOldest') },
            { value: '-amount', label: t('finance.sortLargest') },
          ],
        }}
        onReset={() => reset(['sort', 'scope'])}
      />

      {query.isPending ? (
        <SkeletonTable rows={6} columns={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          tone="rose"
          title={filtered ? t('common.noResults') : t('finance.noExpensesTitle')}
          description={filtered ? t('common.noResultsHint') : t('finance.noExpensesDescription')}
          action={
            canRecord && !filtered ? (
              <Button asChild>
                <Link to={`${base}/finance/expenses/new`}>
                  <Plus />
                  {t('finance.newExpense')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ResponsiveTable
            items={query.data.items}
            getKey={(expense) => expense.id}
            caption={t('finance.navExpenses')}
            href={(expense) => `${base}/finance/expenses/${expense.id}`}
            sort={parseSort(state.sort)}
            onSortChange={(sort) => setState({ sort: formatSort(sort) })}
            columns={[
              {
                id: 'title',
                header: t('finance.expenseTitle'),
                primary: true,
                cell: (expense) => (
                  <span className="inline-flex items-center gap-2">
                    {expense.isReimbursement ? (
                      <Undo2
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-label={t('finance.reimbursement')}
                      />
                    ) : null}
                    <span className="min-w-0 truncate">{expense.title}</span>
                  </span>
                ),
              },
              {
                id: 'meta',
                header: t('finance.requester'),
                secondary: true,
                cell: (expense) =>
                  `${expense.requesterName ?? '—'} · ${formatDate(expense.createdAt, 'dateShort')}`,
              },
              {
                id: 'status',
                header: t('finance.status'),
                cell: (expense) => <ExpenseStatusBadge status={expense.status} />,
              },
              {
                id: 'category',
                header: t('finance.category'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (expense) => expense.categoryName,
              },
              {
                id: 'fund',
                header: t('finance.fund'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (expense) => expense.fundName,
              },
              {
                id: 'amount',
                header: t('finance.amount'),
                align: 'right',
                sortKey: 'amount',
                cell: (expense) => <Money value={expense.amount} />,
              },
            ]}
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => setState({ page })}
          />
        </>
      )}
    </Page>
  );
}
