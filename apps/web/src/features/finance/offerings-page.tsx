import {
  OFFERING_BATCH_STATUSES,
  OFFERING_BATCH_STATUS_LABELS,
  has,
  localize,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { HandCoins, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { ResponsiveTable, formatSort, parseSort } from '@/components/ui/responsive-table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { offeringsQuery, type OfferingListParams } from './api';
import { FinanceNav, Money, OfferingStatusBadge } from './components';
import { compactRange } from './helpers';

const PAGE_SIZE = 25;

export function OfferingsPage() {
  const { t, locale, formatDate } = useI18n();
  const { churchId, base, access } = useChurch();
  const [state, setState, reset] = useUrlState({
    q: '',
    status: '',
    from: '',
    to: '',
    sort: '-serviceDate',
    page: 1,
  });
  const params: OfferingListParams = {
    q: state.q || undefined,
    status: (state.status || undefined) as OfferingListParams['status'],
    from: state.from || undefined,
    to: state.to || undefined,
    sort: state.sort as OfferingListParams['sort'],
    page: state.page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({
    ...offeringsQuery(churchId, params),
    placeholderData: keepPreviousData,
  });
  const canRecord = has(access, 'finance.record');
  const filtered = !!(state.q || state.status || state.from);

  return (
    <Page size="wide">
      <PageHeader
        icon={HandCoins}
        tone="emerald"
        title={t('finance.navOfferings')}
        description={t('finance.offeringsDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navOfferings') },
        ]}
        actions={
          canRecord ? (
            <Button asChild className="max-sm:size-11 max-sm:px-0">
              <Link to={`${base}/finance/offerings/new`}>
                <Plus />
                <span className="hidden sm:inline">{t('finance.recordOffering')}</span>
                <span className="sr-only sm:hidden">{t('common.add')}</span>
              </Link>
            </Button>
          ) : null
        }
      />
      <FinanceNav />
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('finance.searchOfferings'),
        }}
        actions={
          <DateRangePicker
            value={{ from: state.from, to: state.to }}
            onChange={(range) => setState({ from: range.from, to: range.to })}
            className={compactRange(!!state.from)}
          />
        }
        filters={[
          {
            id: 'status',
            label: t('finance.status'),
            value: state.status,
            onChange: (status) => setState({ status }),
            options: OFFERING_BATCH_STATUSES.map((value) => ({
              value,
              label: localize(OFFERING_BATCH_STATUS_LABELS[value], locale),
            })),
          },
        ]}
        sort={{
          value: state.sort,
          onChange: (sort) => setState({ sort }),
          options: [
            { value: '-serviceDate', label: t('finance.sortNewest') },
            { value: 'serviceDate', label: t('finance.sortOldest') },
            { value: '-totalAmount', label: t('finance.sortLargest') },
          ],
        }}
        onReset={() => reset(['sort'])}
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
          icon={HandCoins}
          tone="emerald"
          title={filtered ? t('common.noResults') : t('finance.noOfferingsTitle')}
          description={filtered ? t('common.noResultsHint') : t('finance.noOfferingsDescription')}
          action={
            canRecord && !filtered ? (
              <Button asChild>
                <Link to={`${base}/finance/offerings/new`}>
                  <Plus />
                  {t('finance.recordOffering')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ResponsiveTable
            items={query.data.items}
            getKey={(batch) => batch.id}
            caption={t('finance.navOfferings')}
            href={(batch) => `${base}/finance/offerings/${batch.id}`}
            sort={parseSort(state.sort)}
            onSortChange={(sort) => setState({ sort: formatSort(sort) })}
            columns={[
              {
                id: 'service',
                header: t('finance.service'),
                primary: true,
                cell: (batch) => batch.serviceLabel ?? t('finance.serviceFallback'),
              },
              {
                id: 'date',
                header: t('finance.serviceDate'),
                secondary: true,
                sortKey: 'serviceDate',
                cell: (batch) => formatDate(batch.serviceDate, 'dateShort'),
              },
              {
                id: 'status',
                header: t('finance.status'),
                cell: (batch) => <OfferingStatusBadge status={batch.status} />,
              },
              {
                id: 'counters',
                header: t('finance.counters'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (batch) =>
                  [batch.counter1Name, batch.counter2Name].filter(Boolean).join(' & ') || '—',
              },
              {
                id: 'account',
                header: t('finance.account'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (batch) => batch.accountName,
              },
              {
                id: 'total',
                header: t('finance.total'),
                align: 'right',
                sortKey: 'totalAmount',
                cell: (batch) => <Money value={batch.totalAmount} />,
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
