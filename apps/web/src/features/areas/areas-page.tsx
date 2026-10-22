import { can, type Area } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Home, Map as MapIcon, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { AvatarGroup } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { areasQuery } from '@/features/people/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { AreaFormDialog } from './area-form';

export function AreasPage() {
  const { churchId, base, access } = useChurch();
  const { t, formatNumber } = useI18n();
  const navigate = useNavigate();
  const [state, setState, reset] = useUrlState({ q: '', inactive: false as boolean });
  const [creating, setCreating] = useState(false);
  const query = useQuery(areasQuery(churchId, { includeInactive: state.inactive }));
  const canManage = can.manageAreas(access);
  const needle = state.q.trim().toLowerCase();
  const items = (query.data?.items ?? []).filter(
    (area) => !needle || `${area.name} ${area.code ?? ''}`.toLowerCase().includes(needle),
  );
  const totals = (query.data?.items ?? []).reduce(
    (sum, area) => ({
      people: sum.people + area.personCount,
      households: sum.households + area.householdCount,
    }),
    { people: 0, households: 0 },
  );

  return (
    <Page size="wide">
      <PageHeader
        icon={MapIcon}
        tone="emerald"
        breadcrumbs={[
          { label: t('people.title'), to: `${base}/people` },
          { label: t('people.areasTitle') },
        ]}
        title={t('people.areasTitle')}
        description={
          query.data && query.data.items.length > 0
            ? t('people.areasSummary', {
                areas: formatNumber(query.data.items.length),
                people: formatNumber(totals.people),
                households: formatNumber(totals.households),
              })
            : t('people.areasDescription')
        }
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> {t('people.newArea')}
            </Button>
          ) : null
        }
      />
      <FilterBar
        search={{
          value: state.q,
          onChange: (value) => setState({ q: value }),
          placeholder: t('people.searchAreas'),
        }}
        filters={[
          {
            id: 'inactive',
            label: t('people.showInactive'),
            value: state.inactive ? 'yes' : '',
            onChange: (value) => setState({ inactive: value === 'yes' }),
            options: [{ value: 'yes', label: t('people.includeInactive') }],
          },
        ]}
        onReset={() => reset()}
      />

      {query.isPending ? (
        <SkeletonCards count={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          tone="emerald"
          title={needle ? t('people.noMatches') : t('people.areasEmpty')}
          description={needle ? t('common.noResultsHint') : t('people.areasEmptyHint')}
          action={
            canManage && !needle ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> {t('people.newArea')}
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((area) => (
            <li key={area.id}>
              <AreaCard area={area} />
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <AreaFormDialog
          open={creating}
          onOpenChange={setCreating}
          onSaved={(area) => navigate(`${base}/areas/${area.id}`)}
        />
      ) : null}
    </Page>
  );
}

function AreaCard({ area }: { area: Area }) {
  const { base } = useChurch();
  const { t, formatNumber } = useI18n();
  return (
    <Link
      to={`${base}/areas/${area.id}`}
      className="pressable group relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-soft outline-none hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: area.color ?? 'var(--chart-3)' }}
      />
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: area.color ?? 'var(--chart-3)' }}
        >
          {(area.code ?? area.name).slice(0, 3).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{area.name}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {area.description ?? t('people.noDescription')}
          </p>
        </div>
        {!area.isActive ? <StatusBadge size="sm">{t('people.inactiveArea')}</StatusBadge> : null}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="size-4" aria-hidden />
            <span className="font-semibold text-foreground tabular">
              {formatNumber(area.personCount)}
            </span>
            <span className="sr-only">{t('people.statPeople')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Home className="size-4" aria-hidden />
            <span className="font-semibold text-foreground tabular">
              {formatNumber(area.householdCount)}
            </span>
            <span className="sr-only">{t('people.statHouseholds')}</span>
          </span>
        </div>
        {area.coordinators.length > 0 ? (
          <AvatarGroup
            people={area.coordinators.map((coordinator) => ({
              id: coordinator.userId,
              name: coordinator.name,
              src: coordinator.avatarUrl,
            }))}
            size="xs"
            max={3}
          />
        ) : (
          <span className="text-xs text-muted-foreground">{t('people.noCoordinator')}</span>
        )}
      </div>
    </Link>
  );
}
