import {
  HYMNALS,
  HYMNAL_LABELS,
  SONG_REST_WEEKS,
  canManageServices,
  localize,
  songRecentlyUsed,
  type Hymnal,
  type SongListQuery,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ListMusic, Music, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { songTagsQuery, songsQuery } from './api';
import { WorshipNav } from './worship-ui';
import { WORSHIP_TONE, hymnalLabel } from './worship-lib';

const PAGE_SIZE = 30;
const SORTS = ['title', 'last_used', 'most_used'] as const;

export function SongsPage() {
  const { churchId, base, access } = useChurch();
  const { t, locale, formatRelative } = useI18n();
  const [state, setState, reset] = useUrlState({
    q: '',
    hymnal: '',
    tag: '',
    sort: 'title',
    page: 1,
  });
  const sort = (SORTS as readonly string[]).includes(state.sort)
    ? (state.sort as SongListQuery['sort'])
    : 'title';
  const canManage = canManageServices(access);
  const tags = useQuery(songTagsQuery(churchId));
  const query = useQuery(
    songsQuery(churchId, {
      q: state.q || undefined,
      hymnal: (state.hymnal || undefined) as Hymnal | undefined,
      tag: state.tag || undefined,
      sort,
      page: state.page,
      limit: PAGE_SIZE,
    }),
  );
  const filtered = !!(state.q || state.hymnal || state.tag);

  const filters: FilterDefinition[] = [
    {
      id: 'hymnal',
      label: t('worship.filterHymnal'),
      value: state.hymnal,
      onChange: (hymnal) => setState({ hymnal }),
      options: HYMNALS.map((hymnal) => ({
        value: hymnal,
        label: localize(HYMNAL_LABELS[hymnal], locale),
      })),
    },
    ...((tags.data?.items.length ?? 0) > 0
      ? [
          {
            id: 'tag',
            label: t('worship.filterTag'),
            value: state.tag,
            onChange: (tag: string) => setState({ tag }),
            options: (tags.data?.items ?? []).map((item) => ({
              value: item.tag,
              label: item.tag,
              count: item.count,
            })),
          },
        ]
      : []),
  ];

  return (
    <Page size="wide">
      <PageHeader
        title={t('worship.songsTitle')}
        description={t('worship.songsDescription')}
        breadcrumbs={[
          { label: t('worship.nav'), to: `${base}/worship` },
          { label: t('worship.songsTitle') },
        ]}
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link to={`${base}/worship/songs/new`}>
                <Plus />
                {t('worship.newSong')}
              </Link>
            </Button>
          ) : null
        }
      />
      <WorshipNav />
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('worship.searchSongs'),
        }}
        filters={filters}
        sort={{
          value: sort,
          onChange: (value) => setState({ sort: value }),
          options: [
            { value: 'title', label: t('worship.sortTitle') },
            { value: 'last_used', label: t('worship.sortLastUsed') },
            { value: 'most_used', label: t('worship.sortMostUsed') },
          ],
        }}
        onReset={() => reset(['sort'])}
      />

      {query.isPending ? (
        <SkeletonList rows={8} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          tone={WORSHIP_TONE}
          title={filtered ? t('worship.noSongsFound') : t('worship.noSongs')}
          description={filtered ? t('common.noResultsHint') : t('worship.noSongsBody')}
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset(['sort'])}>
                {t('common.clearAll')}
              </Button>
            ) : canManage ? (
              <Button asChild>
                <Link to={`${base}/worship/songs/new`}>
                  <Plus />
                  {t('worship.newSong')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-3" aria-busy={query.isFetching || undefined}>
          <DataList
            items={query.data.items}
            getKey={(song) => song.id}
            href={(song) => `${base}/worship/songs/${song.id}`}
            leading={(song) => {
              const label = hymnalLabel(song);
              return label ? (
                <span
                  data-tone={WORSHIP_TONE}
                  className="flex h-10 w-16 items-center justify-center rounded-xl bg-tone-soft px-1 text-xs font-bold whitespace-nowrap text-tone-ink tabular"
                >
                  {label}
                </span>
              ) : (
                <span
                  data-tone="sky"
                  className="flex h-10 w-16 items-center justify-center rounded-xl bg-tone-soft text-tone-ink"
                >
                  <Music className="size-5" aria-hidden />
                </span>
              );
            }}
            title={(song) => (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{song.title}</span>
                {!song.isActive ? (
                  <StatusBadge tone="neutral" size="sm">
                    {t('worship.inactive')}
                  </StatusBadge>
                ) : null}
              </span>
            )}
            subtitle={(song) =>
              [
                song.author,
                song.defaultKey ? `${t('worship.key')} ${song.defaultKey}` : null,
                song.tempo ? t('worship.bpm', { tempo: song.tempo }) : null,
                song.tags.length > 0 ? song.tags.map((tag) => `#${tag}`).join(' ') : null,
              ]
                .filter(Boolean)
                .join(' · ') || t('worship.usedTimes', { count: song.useCount })
            }
            trailing={(song) =>
              song.lastUsedAt ? (
                <span className="hidden flex-col items-end gap-0.5 sm:flex">
                  <StatusBadge
                    tone={songRecentlyUsed(song.lastUsedAt) ? 'warning' : 'neutral'}
                    size="sm"
                    title={
                      songRecentlyUsed(song.lastUsedAt)
                        ? t('worship.restWarning', { weeks: SONG_REST_WEEKS })
                        : undefined
                    }
                  >
                    {formatRelative(song.lastUsedAt)}
                  </StatusBadge>
                  <span className="text-xs tabular">
                    {t('worship.usedTimes', { count: song.useCount })}
                  </span>
                </span>
              ) : (
                <span className="hidden text-xs sm:inline">
                  {t('worship.usedTimes', { count: 0 })}
                </span>
              )
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
