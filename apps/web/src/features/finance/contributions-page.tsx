import {
  CONTRIBUTION_KINDS,
  CONTRIBUTION_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  canViewGivingOf,
  fullName,
  has,
  localize,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText, HeartHandshake, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { FilterBar, PersonFilterNotice } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { ResponsiveTable, formatSort, parseSort } from '@/components/ui/responsive-table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { contributionsQuery, type ContributionListParams } from './api';
import { FinanceNav, MethodLabel, Money } from './components';
import { compactRange, donorName, useFinanceSetup } from './helpers';

const PAGE_SIZE = 25;

export function ContributionsPage() {
  const { t, locale, formatDate } = useI18n();
  const { churchId, base, access } = useChurch();
  const setup = useFinanceSetup();
  const [state, setState, reset] = useUrlState({
    q: '',
    kind: '',
    method: '',
    fundId: '',
    from: '',
    to: '',
    voided: '',
    campaignId: '',
    personId: '',
    sort: '-receivedAt',
    page: 1,
  });
  const params: ContributionListParams = {
    q: state.q || undefined,
    kind: (state.kind || undefined) as ContributionListParams['kind'],
    method: (state.method || undefined) as ContributionListParams['method'],
    fundId: state.fundId || undefined,
    from: state.from || undefined,
    to: state.to || undefined,
    includeVoided: state.voided === 'include' ? 'true' : undefined,
    campaignId: state.campaignId || undefined,
    personId: state.personId || undefined,
    sort: state.sort as ContributionListParams['sort'],
    page: state.page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({
    ...contributionsQuery(churchId, params),
    placeholderData: keepPreviousData,
  });
  const canRecord = has(access, 'finance.record');
  const narrowed = !!(
    state.q ||
    state.kind ||
    state.method ||
    state.fundId ||
    state.from ||
    state.campaignId
  );
  const filtered = narrowed || !!state.personId;
  // A profile links here with `?personId=`; the name comes from their gifts.
  const giver = state.personId
    ? query.data?.items.find((gift) => gift.person?.id === state.personId)?.person
    : undefined;
  const anonymous = t('finance.anonymous');

  return (
    <Page size="wide">
      <PageHeader
        icon={HeartHandshake}
        tone="teal"
        title={t('finance.navGiving')}
        description={t('finance.givingDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navGiving') },
        ]}
        actions={
          canRecord ? (
            <Button asChild size="sm">
              <Link to={`${base}/finance/giving/new`}>
                <Plus />
                <span className="hidden sm:inline">{t('finance.recordGift')}</span>
                <span className="sm:hidden">{t('common.add')}</span>
              </Link>
            </Button>
          ) : null
        }
      />
      <FinanceNav />
      {!has(access, 'finance.view') ? (
        <Alert variant="info">{t('finance.recordedByYouHint')}</Alert>
      ) : null}
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('finance.searchGiving'),
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
            id: 'kind',
            label: t('finance.kind'),
            value: state.kind,
            onChange: (kind) => setState({ kind }),
            options: CONTRIBUTION_KINDS.map((value) => ({
              value,
              label: localize(CONTRIBUTION_KIND_LABELS[value], locale),
            })),
          },
          {
            id: 'method',
            label: t('finance.method'),
            value: state.method,
            onChange: (method) => setState({ method }),
            options: PAYMENT_METHODS.map((value) => ({
              value,
              label: localize(PAYMENT_METHOD_LABELS[value], locale),
            })),
          },
          {
            id: 'fund',
            label: t('finance.fund'),
            value: state.fundId,
            onChange: (fundId) => setState({ fundId }),
            options: setup.funds.map((fund) => ({ value: fund.id, label: fund.name })),
          },
          {
            id: 'voided',
            label: t('finance.voidedFilter'),
            value: state.voided,
            onChange: (voided) => setState({ voided }),
            options: [{ value: 'include', label: t('finance.includeVoided') }],
          },
        ]}
        sort={{
          value: state.sort,
          onChange: (sort) => setState({ sort }),
          options: [
            { value: '-receivedAt', label: t('finance.sortNewest') },
            { value: 'receivedAt', label: t('finance.sortOldest') },
            { value: '-amount', label: t('finance.sortLargest') },
          ],
        }}
        onReset={() => reset(['sort'])}
      />
      {state.personId ? (
        <PersonFilterNotice
          name={giver ? fullName(giver) : null}
          photoUrl={giver?.photoUrl}
          onClear={() => setState({ personId: '' })}
          actions={
            canViewGivingOf(access, state.personId) ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="shrink-0 max-sm:size-10 max-sm:px-0"
              >
                <Link to={`${base}/finance/statements/${state.personId}`}>
                  <FileText />
                  <span className="max-sm:sr-only">{t('finance.statement')}</span>
                </Link>
              </Button>
            ) : null
          }
        />
      ) : null}

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
          icon={HeartHandshake}
          tone="teal"
          title={
            narrowed
              ? t('common.noResults')
              : filtered
                ? t('finance.noPersonGiftsTitle')
                : t('finance.noGiftsTitle')
          }
          description={
            narrowed
              ? t('common.noResultsHint')
              : filtered
                ? t('finance.noPersonGiftsDescription')
                : t('finance.noGiftsDescription')
          }
          action={
            canRecord && !narrowed ? (
              <Button asChild>
                <Link to={`${base}/finance/giving/new`}>
                  <Plus />
                  {t('finance.recordGift')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-muted/50 px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {t('finance.giftsCount', { count: query.data.total })}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-muted-foreground">{t('finance.total')}</span>
              <Money value={query.data.totalAmount} className="text-base" />
            </span>
          </div>
          <ResponsiveTable
            items={query.data.items}
            getKey={(gift) => gift.id}
            caption={t('finance.navGiving')}
            href={(gift) => `${base}/finance/giving/${gift.id}`}
            sort={parseSort(state.sort)}
            onSortChange={(sort) => setState({ sort: formatSort(sort) })}
            columns={[
              {
                id: 'giver',
                header: t('finance.giver'),
                primary: true,
                cell: (gift) => (
                  <span className="flex items-center gap-2.5">
                    <EntityAvatar
                      name={donorName(gift.person, gift.donorName, 'NN')}
                      src={gift.person?.photoUrl}
                      size="sm"
                    />
                    <span className="min-w-0 truncate">
                      {donorName(gift.person, gift.donorName, anonymous)}
                    </span>
                  </span>
                ),
              },
              {
                id: 'receipt',
                header: t('finance.receiptNumber'),
                secondary: true,
                cell: (gift) => (
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono text-xs">{gift.receiptNumber}</span>
                    {gift.voidedAt ? (
                      <StatusBadge tone="danger" size="sm">
                        {t('finance.voided')}
                      </StatusBadge>
                    ) : null}
                  </span>
                ),
              },
              {
                id: 'kind',
                header: t('finance.kind'),
                cell: (gift) => localize(CONTRIBUTION_KIND_LABELS[gift.kind], locale),
              },
              {
                id: 'date',
                header: t('finance.receivedAt'),
                sortKey: 'receivedAt',
                cell: (gift) => formatDate(gift.receivedAt, 'dateShort'),
              },
              {
                id: 'fund',
                header: t('finance.fund'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (gift) => gift.fundName,
              },
              {
                id: 'method',
                header: t('finance.method'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (gift) => <MethodLabel method={gift.method} />,
              },
              {
                id: 'amount',
                header: t('finance.amount'),
                align: 'right',
                sortKey: 'amount',
                cell: (gift) => (
                  <Money
                    value={gift.amount}
                    className={gift.voidedAt ? 'text-muted-foreground line-through' : undefined}
                  />
                ),
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
