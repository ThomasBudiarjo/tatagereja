import {
  REGISTRY_RECORD_SORTS,
  REGISTRY_RECORD_STATUSES,
  REGISTRY_RECORD_STATUS_LABELS,
  REGISTRY_RECORD_TYPES,
  REGISTRY_RECORD_TYPE_LABELS,
  canManageRecords,
  localize,
  type RegistryRecord,
  type RegistryRecordSort,
  type RegistryRecordStatus,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpenText, SearchX } from 'lucide-react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { PrintButton, PrintHeader } from '@/components/ui/print';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { overviewQuery, recordsQuery } from './api';
import { RECORDS_TONE, RECORD_TYPE_META, isRecordType, recordTitle } from './records-lib';
import {
  NewRecordMenu,
  RecordNumber,
  RecordStatusBadge,
  RecordTypeBadge,
  RecordsNav,
} from './records-ui';

const PAGE_SIZE = 50;

/** The register book (buku induk): every record of a type, by year, printable. */
export function RegisterPage() {
  const { churchId, base, access, church } = useChurch();
  const { t, locale, formatDate, formatNumber } = useI18n();
  const [state, setState, reset] = useUrlState({
    type: '',
    year: '',
    status: '',
    personId: '',
    q: '',
    sort: 'date_desc',
    page: 1,
  });
  const type = isRecordType(state.type) ? state.type : undefined;
  const status = (REGISTRY_RECORD_STATUSES as readonly string[]).includes(state.status)
    ? (state.status as RegistryRecordStatus)
    : undefined;
  const sort = (REGISTRY_RECORD_SORTS as readonly string[]).includes(state.sort)
    ? (state.sort as RegistryRecordSort)
    : 'date_desc';
  const year = /^\d{4}$/.test(state.year) ? Number(state.year) : undefined;
  const overview = useQuery(overviewQuery(churchId));
  const query = useQuery(
    recordsQuery(churchId, {
      type,
      year,
      status,
      personId: state.personId || undefined,
      q: state.q || undefined,
      sort,
      page: state.page,
      limit: PAGE_SIZE,
    }),
  );
  const filtered = !!(state.q || state.year || state.status || state.personId);
  const typeLabel = type ? localize(REGISTRY_RECORD_TYPE_LABELS[type], locale) : null;
  const title = typeLabel
    ? t('records.registerOf', { type: typeLabel })
    : t('records.registerTitle');

  const filters: FilterDefinition[] = [
    {
      id: 'year',
      label: t('records.filterYear'),
      value: state.year,
      onChange: (value) => setState({ year: value }),
      options: (overview.data?.years ?? []).map((value) => ({
        value: String(value),
        label: String(value),
      })),
    },
    {
      id: 'status',
      label: t('records.filterStatus'),
      value: state.status,
      onChange: (value) => setState({ status: value }),
      options: REGISTRY_RECORD_STATUSES.map((value) => ({
        value,
        label: localize(REGISTRY_RECORD_STATUS_LABELS[value], locale),
      })),
    },
  ];

  const columns: Column<RegistryRecord>[] = [
    {
      id: 'number',
      header: t('records.colNumber'),
      cell: (record) => <RecordNumber number={record.number} />,
      sortKey: 'number',
      className: 'w-36',
    },
    {
      id: 'name',
      header: t('records.colName'),
      primary: true,
      cell: (record) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-pretty break-words">{recordTitle(record)}</span>
          {!type ? (
            <span className="mt-1 md:hidden">
              <RecordTypeBadge record={record} />
            </span>
          ) : null}
        </span>
      ),
    },
    ...(!type
      ? [
          {
            id: 'type',
            header: t('records.colType'),
            hideOnMobile: true,
            cell: (record: RegistryRecord) => <RecordTypeBadge record={record} />,
          },
        ]
      : []),
    {
      id: 'date',
      header: t('records.colDate'),
      secondary: true,
      sortKey: 'date',
      cell: (record) => (
        <span className="whitespace-nowrap tabular">{formatDate(record.date, 'dateShort')}</span>
      ),
    },
    {
      id: 'place',
      header: t('records.colPlace'),
      hideBelowLg: true,
      hideOnMobile: true,
      // The printed register always shows where and by whom.
      className: 'print:table-cell',
      cell: (record) => record.place ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'officiant',
      header: t('records.colOfficiant'),
      hideBelowLg: true,
      className: 'print:table-cell',
      cell: (record) => record.officiantName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'status',
      header: t('records.colStatus'),
      align: 'right',
      cell: (record) => <RecordStatusBadge status={record.status} />,
    },
  ];

  return (
    <Page size="wide">
      <PrintHeader
        churchName={church.name}
        logoUrl={church.logoUrl}
        title={title}
        subtitle={year ? String(year) : undefined}
      />
      <PageHeader
        title={title}
        description={t('records.registerDescription')}
        icon={type ? RECORD_TYPE_META[type].icon : BookOpenText}
        tone={type ? RECORD_TYPE_META[type].tone : RECORDS_TONE}
        breadcrumbs={[
          { label: t('records.nav'), to: `${base}/records` },
          { label: t('records.registerTitle') },
        ]}
        className="print:hidden"
        actions={
          <>
            <PrintButton size="sm" className="hidden sm:inline-flex" />
            <NewRecordMenu />
          </>
        }
      />
      <RecordsNav />

      <div
        role="tablist"
        aria-label={t('records.filterType')}
        data-print="hide"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {[undefined, ...REGISTRY_RECORD_TYPES].map((value) => {
          const selected = value === type;
          const meta = value ? RECORD_TYPE_META[value] : null;
          return (
            <button
              key={value ?? 'all'}
              type="button"
              role="tab"
              aria-selected={selected}
              data-tone={meta?.tone ?? RECORDS_TONE}
              onClick={() => setState({ type: value ?? '' }, { push: true })}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                selected
                  ? 'border-tone bg-tone-soft text-tone-ink'
                  : 'border-border/80 bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {meta ? <meta.icon className="size-4" aria-hidden /> : null}
              {value ? localize(REGISTRY_RECORD_TYPE_LABELS[value], locale) : t('records.allTypes')}
            </button>
          );
        })}
      </div>

      <div data-print="hide">
        <FilterBar
          search={{
            value: state.q,
            onChange: (q) => setState({ q }),
            placeholder: t('records.searchPlaceholder'),
          }}
          filters={filters}
          sort={{
            value: sort,
            onChange: (value) => setState({ sort: value }),
            options: [
              { value: 'date_desc', label: t('records.sortNewest') },
              { value: 'date_asc', label: t('records.sortOldest') },
              { value: 'number', label: t('records.sortNumber') },
            ],
          }}
          onReset={() => reset(['type', 'sort'])}
        />
        {state.personId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {t('records.filteredByPerson')}
            <Button variant="outline" size="sm" onClick={() => setState({ personId: '' })}>
              {t('records.clearPerson')}
            </Button>
          </div>
        ) : null}
      </div>

      {query.isPending ? (
        <SkeletonTable rows={8} columns={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={filtered ? SearchX : type ? RECORD_TYPE_META[type].icon : BookOpenText}
          tone={type ? RECORD_TYPE_META[type].tone : RECORDS_TONE}
          title={filtered ? t('records.noResults') : t('records.registerEmpty')}
          description={
            filtered
              ? t('common.noResultsHint')
              : canManageRecords(access)
                ? t('records.registerEmptyManage')
                : t('records.registerEmptyBody')
          }
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset(['type', 'sort'])}>
                {t('common.clearAll')}
              </Button>
            ) : (
              <NewRecordMenu size="default" />
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3" aria-busy={query.isFetching || undefined}>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t('records.recordCount', {
              count: query.data.total,
              formatted: formatNumber(query.data.total),
            })}
          </p>
          <ResponsiveTable
            items={query.data.items}
            columns={columns}
            getKey={(record) => record.id}
            href={(record) => `${base}/records/${record.id}`}
            caption={title}
            sort={
              sort === 'number'
                ? { key: 'number', direction: 'desc' }
                : { key: 'date', direction: sort === 'date_asc' ? 'asc' : 'desc' }
            }
            onSortChange={(next) =>
              setState({
                sort:
                  next.key === 'number'
                    ? 'number'
                    : next.direction === 'asc'
                      ? 'date_asc'
                      : 'date_desc',
              })
            }
          />
          <div data-print="hide">
            <Pagination
              page={query.data.page}
              pageSize={query.data.limit}
              total={query.data.total}
              onPageChange={(page) => {
                setState({ page }, { push: true });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        </div>
      )}
    </Page>
  );
}
