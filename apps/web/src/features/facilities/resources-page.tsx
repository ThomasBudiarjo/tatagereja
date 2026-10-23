import {
  RESOURCE_KINDS,
  RESOURCE_KIND_LABELS,
  canManageFacilities,
  canRequestBooking,
  localize,
  type FacilityResource,
  type ResourceKind,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, DoorOpen, MapPin, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { resourcesQuery } from './api';
import { FACILITIES_TONE, RESOURCE_KIND_ICONS, resourceTone } from './facilities-lib';
import { AvailabilityBadge, CapacityLabel, FacilitiesNav } from './facilities-ui';

export function ResourcesPage() {
  const { churchId, base, access } = useChurch();
  const { t, locale } = useI18n();
  const manager = canManageFacilities(access);
  const [state, setState, reset] = useUrlState({ q: '', kind: '', show: '' });
  const kind = (RESOURCE_KINDS as readonly string[]).includes(state.kind)
    ? (state.kind as ResourceKind)
    : undefined;
  const query = useQuery(
    resourcesQuery(churchId, {
      q: state.q || undefined,
      kind,
      includeInactive: manager && state.show === 'all',
    }),
  );
  const filtered = !!(state.q || state.kind);

  const filters: FilterDefinition[] = [
    {
      id: 'kind',
      label: t('facilities.filterKind'),
      value: state.kind,
      onChange: (value) => setState({ kind: value }),
      options: RESOURCE_KINDS.map((value) => ({
        value,
        label: localize(RESOURCE_KIND_LABELS[value], locale),
      })),
    },
    ...(manager
      ? [
          {
            id: 'show',
            label: t('facilities.filterShow'),
            value: state.show,
            onChange: (value: string) => setState({ show: value }),
            options: [{ value: 'all', label: t('facilities.showInactive') }],
          },
        ]
      : []),
  ];

  return (
    <Page size="wide">
      <PageHeader
        title={t('facilities.roomsTitle')}
        description={t('facilities.roomsDescription')}
        breadcrumbs={[
          { label: t('facilities.nav'), to: `${base}/facilities` },
          { label: t('facilities.roomsTitle') },
        ]}
        actions={
          manager ? (
            <Button asChild size="sm">
              <Link to={`${base}/facilities/rooms/new`}>
                <Plus />
                {t('facilities.newRoom')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FacilitiesNav />
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('facilities.searchRooms'),
        }}
        filters={filters}
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
        <EmptyState
          icon={DoorOpen}
          tone={FACILITIES_TONE}
          title={filtered ? t('facilities.noRoomsFound') : t('facilities.noRooms')}
          description={
            filtered
              ? t('common.noResultsHint')
              : manager
                ? t('facilities.noRoomsManage')
                : t('facilities.noRoomsView')
          }
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset()}>
                {t('common.clearAll')}
              </Button>
            ) : manager ? (
              <Button asChild>
                <Link to={`${base}/facilities/rooms/new`}>
                  <Plus />
                  {t('facilities.newRoom')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ul
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy={query.isFetching || undefined}
        >
          {query.data.items.map((resource) => (
            <li key={resource.id}>
              <ResourceCard resource={resource} canBook={canRequestBooking(access)} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function ResourceCard({ resource, canBook }: { resource: FacilityResource; canBook: boolean }) {
  const { base } = useChurch();
  const { t, locale, formatDateTime } = useI18n();
  const Icon = RESOURCE_KIND_ICONS[resource.kind];
  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft transition-shadow hover:shadow-raised',
        !resource.isActive && 'opacity-70',
      )}
    >
      <div
        data-tone={resourceTone(resource.kind)}
        className="relative flex aspect-[16/7] items-center justify-center overflow-hidden bg-tone-soft text-tone-ink"
      >
        {resource.photoUrl ? (
          <img
            src={resource.photoUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <Icon className="size-10 opacity-80" aria-hidden />
        )}
        {resource.color ? (
          <span
            className="absolute inset-x-0 bottom-0 h-1"
            style={{ backgroundColor: resource.color }}
            aria-hidden
          />
        ) : null}
        <span className="absolute top-2.5 left-2.5">
          <AvailabilityBadge resource={resource} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h2 className="text-base leading-tight font-semibold tracking-tight">
            <Link
              to={`${base}/facilities/rooms/${resource.id}`}
              className="outline-none after:absolute after:inset-0 focus-visible:underline"
            >
              {resource.name}
            </Link>
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{localize(RESOURCE_KIND_LABELS[resource.kind], locale)}</span>
            <CapacityLabel capacity={resource.capacity} />
            {resource.location ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{resource.location}</span>
              </span>
            ) : null}
          </p>
        </div>
        {resource.features.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {resource.features.slice(0, 4).map((feature) => (
              <li
                key={feature}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {feature}
              </li>
            ))}
            {resource.features.length > 4 ? (
              <li className="px-1 py-0.5 text-[11px] text-muted-foreground">
                +{resource.features.length - 4}
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <p className="min-w-0 text-xs text-muted-foreground">
            {resource.nextBooking ? (
              <>
                <span className="block">{t('facilities.nextBooking')}</span>
                <span className="block truncate font-medium text-foreground">
                  {formatDateTime(resource.nextBooking.startsAt)} · {resource.nextBooking.title}
                </span>
              </>
            ) : (
              t('facilities.noUpcomingBookings')
            )}
          </p>
          {canBook && resource.isActive ? (
            <Button asChild size="sm" variant="outline" className="relative z-10 shrink-0">
              <Link to={`${base}/facilities/bookings/new?resourceId=${resource.id}`}>
                <CalendarPlus />
                {t('facilities.book')}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
