import { isAdmin } from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, MapPin, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list';
import { EmptyState, ErrorState, SearchInput, Segmented, Skeleton } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { formatEventRange } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { eventsQuery } from './api';

type Scope = 'upcoming' | 'past' | 'all';

export function EventsPage() {
  const { churchId, base, access } = useChurch();
  const [params, setParams] = useSearchParams();
  const scope = (params.get('scope') ?? 'upcoming') as Scope;
  const page = Number(params.get('page') ?? '1');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search);

  const query = useQuery({
    ...eventsQuery(churchId, {
      scope,
      q: debounced || undefined,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      limit: 50,
    }),
    placeholderData: keepPreviousData,
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && !(key === 'scope' && value === 'upcoming')) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const canCreate = isAdmin(access) || access.leaderGroupIds.length > 0;
  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.limit)) : 1;

  return (
    <Page>
      <PageHeader
        title="Events"
        description="Church-wide and group events."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link to={`${base}/events/new`}>
                <Plus /> New
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-3">
        <Segmented<Scope>
          value={scope}
          onChange={(value) => setParam('scope', value)}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
            { value: 'all', label: 'All' },
          ]}
        />
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setParam('q', value);
          }}
          placeholder="Search events"
        />
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={scope === 'upcoming' ? 'No upcoming events' : 'No events found'}
          description={
            canCreate ? 'Create an event so people know when to gather.' : 'Check back later.'
          }
          action={
            canCreate && !debounced ? (
              <Button asChild>
                <Link to={`${base}/events/new`}>
                  <Plus /> New event
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ListGroup>
            {query.data.items.map((event) => (
              <ListRow
                key={event.id}
                to={`${base}/events/${event.id}`}
                title={event.title}
                subtitle={
                  <span className="flex flex-wrap items-center gap-x-2">
                    {formatEventRange(event.startsAt, event.endsAt, event.isAllDay)}
                    {event.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" /> {event.location}
                      </span>
                    ) : null}
                    {event.participantCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3" /> {event.participantCount}
                      </span>
                    ) : null}
                  </span>
                }
                trailing={
                  event.groupName ? (
                    <Badge variant="secondary">{event.groupName}</Badge>
                  ) : (
                    <Badge variant="muted">Church</Badge>
                  )
                }
              />
            ))}
          </ListGroup>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={query.data.page <= 1}
                onClick={() => setParam('page', String(query.data.page - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground tabular">
                Page {query.data.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={query.data.page >= totalPages}
                onClick={() => setParam('page', String(query.data.page + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}
