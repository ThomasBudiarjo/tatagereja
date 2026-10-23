import {
  ASSET_CONDITIONS,
  ASSET_CONDITION_LABELS,
  ASSET_SORTS,
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  canManageInventory,
  fullName,
  localize,
  type AssetCondition,
  type AssetSort,
  type AssetStatus,
  type InventoryAsset,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Package, PackagePlus, QrCode } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { assetsQuery, categoriesQuery } from './api';
import { INVENTORY_TONE, todayIn } from './facilities-lib';
import { AssetStatusBadge, ConditionBadge, FacilitiesNav } from './facilities-ui';

const PAGE_SIZE = 30;

export function InventoryPage() {
  const { churchId, base, access, church } = useChurch();
  const { t, locale, formatCurrency, formatNumber, formatDate } = useI18n();
  const canManage = canManageInventory(access);
  const [state, setState, reset] = useUrlState({
    q: '',
    category: '',
    status: '',
    condition: '',
    sort: 'code',
    page: 1,
  });
  const sort = (ASSET_SORTS as readonly string[]).includes(state.sort)
    ? (state.sort as AssetSort)
    : 'code';
  const status = (ASSET_STATUSES as readonly string[]).includes(state.status)
    ? (state.status as AssetStatus)
    : undefined;
  const condition = (ASSET_CONDITIONS as readonly string[]).includes(state.condition)
    ? (state.condition as AssetCondition)
    : undefined;
  const categories = useQuery(categoriesQuery(churchId));
  const query = useQuery(
    assetsQuery(churchId, {
      q: state.q || undefined,
      category: state.category || undefined,
      status,
      condition,
      sort,
      page: state.page,
      limit: PAGE_SIZE,
    }),
  );
  const today = todayIn(church.timezone);
  const filtered = !!(state.q || state.category || state.status || state.condition);

  const filters: FilterDefinition[] = [
    ...((categories.data?.items.length ?? 0) > 0
      ? [
          {
            id: 'category',
            label: t('facilities.filterCategory'),
            value: state.category,
            onChange: (category: string) => setState({ category }),
            options: (categories.data?.items ?? []).map((item) => ({
              value: item.category,
              label: item.category,
              count: item.count,
            })),
          },
        ]
      : []),
    {
      id: 'status',
      label: t('facilities.filterStatus'),
      value: state.status,
      onChange: (value) => setState({ status: value }),
      options: ASSET_STATUSES.map((value) => ({
        value,
        label: localize(ASSET_STATUS_LABELS[value], locale),
      })),
    },
    {
      id: 'condition',
      label: t('facilities.filterCondition'),
      value: state.condition,
      onChange: (value) => setState({ condition: value }),
      options: ASSET_CONDITIONS.map((value) => ({
        value,
        label: localize(ASSET_CONDITION_LABELS[value], locale),
      })),
    },
  ];

  const columns: Column<InventoryAsset>[] = [
    {
      id: 'name',
      header: t('facilities.colAsset'),
      primary: true,
      sortKey: 'name',
      cell: (asset) => (
        <span className="flex min-w-0 items-center gap-3">
          {asset.photoUrl ? (
            <img
              src={asset.photoUrl}
              alt=""
              loading="lazy"
              className="size-10 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span
              data-tone={INVENTORY_TONE}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tone-soft text-tone-ink"
              aria-hidden
            >
              <Package className="size-5" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-semibold">{asset.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              <span className="font-mono">{asset.code}</span>
              {asset.category ? ` · ${asset.category}` : ''}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'location',
      header: t('facilities.colLocation'),
      cell: (asset) => (
        // Wraps inside the truncating cells of the phone cards too.
        <span className="line-clamp-2 max-w-48 whitespace-normal">
          {asset.resourceName ?? asset.location ?? '—'}
        </span>
      ),
    },
    {
      id: 'condition',
      header: t('facilities.colCondition'),
      cell: (asset) => <ConditionBadge condition={asset.condition} />,
    },
    {
      id: 'status',
      header: t('facilities.colStatus'),
      cell: (asset) =>
        asset.currentLoan ? (
          <span className="flex flex-col gap-0.5">
            <StatusBadge tone={asset.currentLoan.isOverdue ? 'danger' : 'info'} dot size="sm">
              {asset.currentLoan.isOverdue
                ? t('facilities.overdue')
                : localize(ASSET_STATUS_LABELS.on_loan, locale)}
            </StatusBadge>
            <span className="truncate text-xs text-muted-foreground">
              {asset.currentLoan.borrowerName}
              {asset.currentLoan.dueDate
                ? ` · ${formatDate(asset.currentLoan.dueDate, 'dayMonth')}`
                : ''}
            </span>
          </span>
        ) : (
          <span className="flex flex-col gap-0.5">
            <AssetStatusBadge status={asset.status} />
            {asset.nextMaintenanceDate && asset.nextMaintenanceDate <= today ? (
              <span className="text-xs text-tone-ink" data-tone="warning">
                {t('facilities.serviceDue')}
              </span>
            ) : null}
          </span>
        ),
    },
    {
      id: 'custodian',
      header: t('facilities.colCustodian'),
      hideBelowLg: true,
      hideOnMobile: true,
      cell: (asset) =>
        asset.custodian ? (
          <span className="flex min-w-0 items-center gap-2">
            <EntityAvatar
              name={fullName(asset.custodian)}
              src={asset.custodian.photoUrl}
              size="xs"
            />
            <span className="max-w-40 truncate">{fullName(asset.custodian)}</span>
          </span>
        ) : (
          '—'
        ),
    },
    {
      id: 'value',
      header: t('facilities.colValue'),
      align: 'right',
      sortKey: 'value',
      hideOnMobile: true,
      cell: (asset) => (
        <span className="tabular">
          {asset.acquisitionValue !== null ? formatCurrency(asset.acquisitionValue) : '—'}
        </span>
      ),
    },
  ];

  const labelIds = query.data?.items.map((asset) => asset.id).join(',') ?? '';

  return (
    <Page size="wide">
      <PageHeader
        title={t('facilities.inventoryTitle')}
        description={t('facilities.inventoryDescription')}
        breadcrumbs={[
          { label: t('facilities.nav'), to: `${base}/facilities` },
          { label: t('facilities.inventoryTitle') },
        ]}
        actions={
          <>
            {query.data && query.data.items.length > 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`${base}/facilities/inventory/labels?ids=${labelIds}`}>
                  <QrCode />
                  <span className="hidden sm:inline">{t('facilities.printLabels')}</span>
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <Button asChild size="sm">
                <Link to={`${base}/facilities/inventory/new`}>
                  <PackagePlus />
                  {t('facilities.newAsset')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <FacilitiesNav />
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('facilities.searchAssets'),
        }}
        filters={filters}
        sort={{
          value: sort,
          onChange: (value) => setState({ sort: value }),
          options: [
            { value: 'code', label: t('facilities.sortCode') },
            { value: 'name', label: t('facilities.sortName') },
            { value: '-value', label: t('facilities.sortValue') },
            { value: '-acquired', label: t('facilities.sortAcquired') },
            { value: '-updated', label: t('facilities.sortUpdated') },
          ],
        }}
        onReset={() => reset(['sort'])}
      />

      {query.data && query.data.total > 0 ? (
        <p className="-mt-2 text-sm text-muted-foreground" aria-live="polite">
          {t('facilities.assetsSummary', {
            count: query.data.total,
            countLabel: formatNumber(query.data.total),
            value: formatCurrency(query.data.totalValue),
          })}
        </p>
      ) : null}

      {query.isPending ? (
        <SkeletonTable rows={8} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Package}
          tone={INVENTORY_TONE}
          title={filtered ? t('facilities.noAssetsFound') : t('facilities.noAssets')}
          description={
            filtered
              ? t('common.noResultsHint')
              : canManage
                ? t('facilities.noAssetsManage')
                : t('facilities.noAssetsView')
          }
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset(['sort'])}>
                {t('common.clearAll')}
              </Button>
            ) : canManage ? (
              <Button asChild>
                <Link to={`${base}/facilities/inventory/new`}>
                  <PackagePlus />
                  {t('facilities.newAsset')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-3" aria-busy={query.isFetching || undefined}>
          <ResponsiveTable
            items={query.data.items}
            columns={columns}
            getKey={(asset) => asset.id}
            href={(asset) => `${base}/facilities/inventory/${asset.id}`}
            caption={t('facilities.inventoryTitle')}
            sort={
              sort === 'name'
                ? { key: 'name', direction: 'asc' }
                : sort === '-value'
                  ? { key: 'value', direction: 'desc' }
                  : undefined
            }
            onSortChange={(next) =>
              setState({
                sort: next.key === 'name' ? 'name' : next.key === 'value' ? '-value' : 'code',
              })
            }
          />
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
      )}
    </Page>
  );
}
