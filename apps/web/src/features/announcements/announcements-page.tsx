import { isAdmin } from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Megaphone, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list';
import { EmptyState, ErrorState, SearchInput, Skeleton } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { announcementsQuery } from './api';

export function AnnouncementsPage() {
  const { churchId, base, access } = useChurch();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const page = Number(params.get('page') ?? '1');
  const debounced = useDebounced(search);
  const canPost = isAdmin(access) || access.leaderGroupIds.length > 0;

  const query = useQuery({
    ...announcementsQuery(churchId, {
      q: debounced || undefined,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      limit: 50,
    }),
    placeholderData: keepPreviousData,
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.limit)) : 1;

  return (
    <Page>
      <PageHeader
        backTo={`${base}/more`}
        title="Announcements"
        description="News for the whole church and for your groups."
        actions={
          canPost ? (
            <Button asChild size="sm">
              <Link to={`${base}/announcements/new`}>
                <Plus /> New
              </Link>
            </Button>
          ) : null
        }
      />
      <SearchInput
        value={search}
        onChange={(value) => {
          setSearch(value);
          setParam('q', value);
        }}
        placeholder="Search announcements"
      />

      {query.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={debounced ? 'No matching announcements' : 'No announcements yet'}
          description={
            canPost
              ? 'Share news, schedules or prayer requests with your church.'
              : 'Check back later.'
          }
          action={
            canPost && !debounced ? (
              <Button asChild>
                <Link to={`${base}/announcements/new`}>
                  <Plus /> Write one
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ListGroup>
            {query.data.items.map((announcement) => (
              <ListRow
                key={announcement.id}
                to={`${base}/announcements/${announcement.id}`}
                title={
                  <span className="flex items-center gap-2">
                    {announcement.title}
                    {announcement.status === 'draft' ? (
                      <Badge variant="warning">Draft</Badge>
                    ) : null}
                  </span>
                }
                subtitle={`${announcement.authorName} · ${formatRelative(announcement.publishedAt ?? announcement.createdAt)}`}
                trailing={
                  announcement.groupName ? (
                    <Badge variant="secondary">{announcement.groupName}</Badge>
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
