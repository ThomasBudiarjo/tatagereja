import { can, fullName, type Household } from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Home, MapPin, Phone, Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { AvatarGroup } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { areasQuery, householdsQuery } from '@/features/people/api';
import { AreaChip } from '@/features/people/people-ui';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { HouseholdFormDialog } from './household-form';

const PAGE_SIZE = 24;

export function HouseholdsPage() {
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [state, setState, reset] = useUrlState({ q: '', area: '', page: 1 });
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    ...householdsQuery(churchId, {
      q: state.q || undefined,
      areaId: state.area || undefined,
      page: state.page,
      limit: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });
  const areas = useQuery(areasQuery(churchId));
  const canManage = can.manageHouseholds(access);
  const filtered = !!state.q || !!state.area;

  return (
    <Page size="wide">
      <PageHeader
        icon={Home}
        tone="amber"
        breadcrumbs={[
          { label: t('people.title'), to: `${base}/people` },
          { label: t('people.householdsTitle') },
        ]}
        title={t('people.householdsTitle')}
        description={
          query.data
            ? t('people.householdCount', { count: query.data.total })
            : t('people.householdsDescription')
        }
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> {t('people.newHousehold')}
            </Button>
          ) : null
        }
      />
      <FilterBar
        search={{
          value: state.q,
          onChange: (value) => setState({ q: value }),
          placeholder: t('people.searchHouseholds'),
        }}
        filters={
          areas.data && areas.data.items.length > 0
            ? [
                {
                  id: 'area',
                  label: t('people.filterArea'),
                  value: state.area,
                  onChange: (value) => setState({ area: value }),
                  options: areas.data.items.map((area) => ({
                    value: area.id,
                    label: area.name,
                    count: area.householdCount,
                  })),
                },
              ]
            : []
        }
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
      ) : query.data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SlidersHorizontal}
            tone="amber"
            title={t('people.noMatches')}
            description={t('common.noResultsHint')}
            action={
              <Button variant="outline" onClick={() => reset()}>
                {t('common.clearAll')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Home}
            tone="amber"
            title={t('people.householdsEmpty')}
            description={t('people.householdsEmptyHint')}
            action={
              canManage ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> {t('people.newHousehold')}
                </Button>
              ) : null
            }
          />
        )
      ) : (
        <>
          <ul
            className={cn(
              'grid grid-cols-1 gap-3 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3',
              query.isPlaceholderData && 'opacity-60',
            )}
          >
            {query.data.items.map((household) => (
              <li key={household.id}>
                <HouseholdCard household={household} />
              </li>
            ))}
          </ul>
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => {
              setState({ page }, { push: true });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      {canManage ? (
        <HouseholdFormDialog
          open={creating}
          onOpenChange={setCreating}
          onSaved={(household) => navigate(`${base}/households/${household.id}`)}
        />
      ) : null}
    </Page>
  );
}

function HouseholdCard({ household }: { household: Household }) {
  const { base } = useChurch();
  const { t } = useI18n();
  const head =
    household.members.find((member) => member.relationship === 'head') ?? household.members[0];
  return (
    <Link
      to={`${base}/households/${household.id}`}
      className="pressable group flex h-full flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft outline-none hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <div className="flex items-start gap-3">
        <span
          data-tone="amber"
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-tone-soft text-tone-ink"
        >
          <Home className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{household.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {head ? t('people.headName', { name: fullName(head) }) : t('people.noMembersYet')}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        {household.members.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2">
            <AvatarGroup
              people={household.members.map((member) => ({
                id: member.id,
                name: fullName(member),
                src: member.photoUrl,
              }))}
              max={4}
            />
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {t('people.memberCount', { count: household.members.length })}
            </span>
          </div>
        ) : (
          <span />
        )}
        {household.area ? <AreaChip area={household.area} className="min-w-0" /> : null}
      </div>
      {household.phone || household.address ? (
        <div className="flex flex-col gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          {household.address ? (
            <span className="flex items-center gap-1.5 truncate">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{household.address}</span>
            </span>
          ) : null}
          {household.phone ? (
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5 shrink-0" aria-hidden /> {household.phone}
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}
