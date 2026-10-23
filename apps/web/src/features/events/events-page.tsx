import { can, has, type EventDetails } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, CalendarRange } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { eventsQuery, type EventListParams } from './api';
import { EVENT_TONE } from './event-lib';
import { EventCard } from './event-ui';

const PAGE_SIZE = 25;
const TABS = ['upcoming', 'mine', 'past', 'all'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, MessageKey> = {
  upcoming: 'events.tabUpcoming',
  mine: 'events.tabMine',
  past: 'events.tabPast',
  all: 'events.tabAll',
};

export function EventsPage() {
  const { churchId, base, access } = useChurch();
  const { t, formatDate } = useI18n();
  const [state, setState, reset] = useUrlState({ tab: 'upcoming', q: '', groupId: '', page: 1 });
  const tab: Tab = (TABS as readonly string[]).includes(state.tab)
    ? (state.tab as Tab)
    : 'upcoming';
  const params: EventListParams = {
    q: state.q || undefined,
    groupId: state.groupId || undefined,
    page: state.page,
    limit: PAGE_SIZE,
    scope: tab === 'mine' ? 'upcoming' : tab,
    mine: tab === 'mine',
  };
  const query = useQuery(eventsQuery(churchId, params));
  const groups = useQuery({ ...groupsQuery(churchId), enabled: has(access, 'groups.view') });
  const canCreate = can.createAnyEvent(access);
  const filtered = !!(state.q || state.groupId);

  const filters: FilterDefinition[] =
    (groups.data?.items.length ?? 0) > 0
      ? [
          {
            id: 'groupId',
            label: t('events.filterGroup'),
            value: state.groupId,
            onChange: (groupId) => setState({ groupId }),
            options: (groups.data?.items ?? []).map((group) => ({
              value: group.id,
              label: group.name,
            })),
          },
        ]
      : [];

  // Month headings keep a long agenda easy to scan.
  const months: { key: string; items: EventDetails[] }[] = [];
  for (const event of query.data?.items ?? []) {
    const key = formatDate(event.startsAt, 'monthYear');
    const last = months[months.length - 1];
    if (last && last.key === key) last.items.push(event);
    else months.push({ key, items: [event] });
  }

  const emptyTitle: Record<Tab, MessageKey> = {
    upcoming: 'events.noUpcoming',
    mine: 'events.noMine',
    past: 'events.noPast',
    all: 'events.noEvents',
  };

  return (
    <Page>
      <PageHeader
        title={t('events.title')}
        description={t('events.description')}
        icon={CalendarDays}
        tone={EVENT_TONE}
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link to={`${base}/calendar`}>
                <CalendarRange />
                <span className="hidden sm:inline">{t('events.openCalendar')}</span>
              </Link>
            </Button>
            {canCreate ? (
              <Button asChild size="sm">
                <Link to={`${base}/events/new`}>
                  <CalendarPlus />
                  {t('events.new')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(value) => setState({ tab: value }, { push: true })}>
        <TabsList variant="underline">
          {TABS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(TAB_LABELS[value])}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('events.search'),
        }}
        filters={filters}
        onReset={() => reset(['tab'])}
      />

      {query.isPending ? (
        <SkeletonList rows={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          tone={EVENT_TONE}
          title={filtered ? t('events.noneFound') : t(emptyTitle[tab])}
          description={
            filtered
              ? t('common.noResultsHint')
              : tab === 'mine'
                ? t('events.noMineHint')
                : canCreate
                  ? t('events.emptyCreator')
                  : t('events.emptyMember')
          }
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset(['tab'])}>
                {t('common.clearAll')}
              </Button>
            ) : canCreate && tab !== 'mine' ? (
              <Button asChild>
                <Link to={`${base}/events/new`}>
                  <CalendarPlus />
                  {t('events.new')}
                </Link>
              </Button>
            ) : tab === 'mine' ? (
              <Button variant="outline" onClick={() => setState({ tab: 'upcoming' })}>
                {t('events.browseUpcoming')}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-5" aria-busy={query.isFetching || undefined}>
          {months.map((month) => (
            <section key={month.key} aria-label={month.key} className="flex flex-col gap-2">
              <h2 className="text-overline px-1 text-muted-foreground capitalize">{month.key}</h2>
              <div className="flex flex-col gap-2">
                {month.items.map((event) => (
                  <EventCard key={event.id} event={event} to={`${base}/events/${event.id}`} />
                ))}
              </div>
            </section>
          ))}
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => {
              setState({ page });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      )}
    </Page>
  );
}
