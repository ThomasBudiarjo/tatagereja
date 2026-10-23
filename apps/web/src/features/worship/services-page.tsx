import {
  SERVICE_STATUSES,
  SERVICE_STATUS_LABELS,
  canManageServices,
  localize,
  type ServiceStatus,
  type WorshipService,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, CalendarPlus, Settings2 } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Segmented } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { serviceTypesQuery, servicesQuery } from './api';
import { ServiceRow, WorshipNav } from './worship-ui';
import { WORSHIP_TONE } from './worship-lib';

const PAGE_SIZE = 20;
type Scope = 'upcoming' | 'past' | 'all';

/** Services grouped under month headings, in the order the API returned them. */
function groupByMonth(items: WorshipService[], label: (iso: string) => string) {
  const groups: { month: string; items: WorshipService[] }[] = [];
  for (const item of items) {
    const month = label(item.startsAt);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }
  return groups;
}

export function ServicesPage() {
  const { churchId, base, access } = useChurch();
  const { t, locale, formatDate } = useI18n();
  const [state, setState, reset] = useUrlState({
    q: '',
    scope: 'upcoming',
    type: '',
    status: '',
    page: 1,
  });
  const scope = (
    ['upcoming', 'past', 'all'].includes(state.scope) ? state.scope : 'upcoming'
  ) as Scope;
  const canManage = canManageServices(access);
  const types = useQuery(serviceTypesQuery(churchId));
  const query = useQuery(
    servicesQuery(churchId, {
      q: state.q || undefined,
      scope,
      serviceTypeId: state.type || undefined,
      status: (state.status || undefined) as ServiceStatus | undefined,
      page: state.page,
      limit: PAGE_SIZE,
    }),
  );

  const filters: FilterDefinition[] = [
    {
      id: 'type',
      label: t('worship.filterType'),
      value: state.type,
      onChange: (type) => setState({ type }),
      options: (types.data?.items ?? []).map((type) => ({ value: type.id, label: type.name })),
    },
    {
      id: 'status',
      label: t('worship.filterStatus'),
      value: state.status,
      onChange: (status) => setState({ status }),
      options: SERVICE_STATUSES.map((status) => ({
        value: status,
        label: localize(SERVICE_STATUS_LABELS[status], locale),
      })),
    },
  ];
  const filtered = !!(state.q || state.type || state.status);

  return (
    <Page size="wide">
      <PageHeader
        title={t('worship.servicesTitle')}
        description={t('worship.servicesDescription')}
        breadcrumbs={[
          { label: t('worship.nav'), to: `${base}/worship` },
          { label: t('worship.servicesTitle') },
        ]}
        actions={
          canManage ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link to={`${base}/worship/types`}>
                  <Settings2 />
                  <span className="hidden sm:inline">{t('worship.serviceTypes')}</span>
                  <span className="sr-only sm:hidden">{t('worship.serviceTypes')}</span>
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to={`${base}/worship/services/new`}>
                  <CalendarPlus />
                  {t('worship.newService')}
                </Link>
              </Button>
            </>
          ) : null
        }
      />
      <WorshipNav />
      <div className="flex flex-col gap-3">
        <Segmented<Scope>
          aria-label={t('worship.servicesTitle')}
          value={scope}
          onChange={(value) => setState({ scope: value })}
          className="sm:max-w-sm"
          options={[
            { value: 'upcoming', label: t('worship.scopeUpcoming') },
            { value: 'past', label: t('worship.scopePast') },
            { value: 'all', label: t('worship.scopeAll') },
          ]}
        />
        <FilterBar
          search={{
            value: state.q,
            onChange: (q) => setState({ q }),
            placeholder: t('worship.searchServices'),
          }}
          filters={filters}
          onReset={() => reset(['scope'])}
        />
      </div>

      {query.isPending ? (
        <SkeletonList rows={5} avatar={false} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          tone={WORSHIP_TONE}
          title={filtered ? t('worship.noServicesFound') : t('worship.noUpcoming')}
          description={
            filtered
              ? t('common.noResultsHint')
              : canManage
                ? t('worship.noUpcomingManage')
                : t('worship.noUpcomingView')
          }
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset(['scope'])}>
                {t('common.clearAll')}
              </Button>
            ) : canManage ? (
              <Button asChild>
                <Link to={`${base}/worship/services/new`}>
                  <CalendarPlus />
                  {t('worship.planService')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-5" aria-busy={query.isFetching || undefined}>
          {groupByMonth(query.data.items, (iso) => formatDate(iso, 'monthYear')).map((group) => (
            <section key={group.month} className="flex flex-col gap-2.5">
              <h2 className="text-overline text-muted-foreground">{group.month}</h2>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {group.items.map((service) => (
                  <ServiceRow key={service.id} service={service} />
                ))}
              </div>
            </section>
          ))}
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
