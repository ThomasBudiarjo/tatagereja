import {
  HYMNAL_LABELS,
  SONG_REST_WEEKS,
  canManageServices,
  localize,
  songRecentlyUsed,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  Gauge,
  Hash,
  KeyRound,
  ListMusic,
  Pencil,
  Repeat,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { SkeletonText } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { songQuery, useDeleteSong } from './api';
import { DateTile } from './worship-ui';
import { WORSHIP_TONE, hymnalLabel } from './worship-lib';

export function SongPage() {
  const { songId = '' } = useParams();
  const { churchId, base, access } = useChurch();
  const { t, locale, formatRelative, formatTime, formatNumber } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(songQuery(churchId, songId));
  const [deleting, setDeleting] = useState(false);
  const [now] = useState(() => Date.now());
  const remove = useMutationToast(useDeleteSong(churchId), { success: t('worship.songDeleted') });
  const canManage = canManageServices(access);
  const crumbs = [
    { label: t('worship.nav'), to: `${base}/worship` },
    { label: t('worship.songsTitle'), to: `${base}/worship/songs` },
  ];

  if (query.isPending) {
    return (
      <Page>
        <SkeletonText lines={12} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('worship.songsTitle')} breadcrumbs={crumbs} />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={
            isApiClientError(query.error) && query.error.status === 404
              ? undefined
              : () => void query.refetch()
          }
        />
      </Page>
    );
  }

  const { song, usage } = query.data;
  const label = hymnalLabel(song);
  const recent = songRecentlyUsed(song.lastUsedAt);

  return (
    <Page>
      <PageHeader
        title={song.title}
        eyebrow={
          song.hymnal
            ? `${localize(HYMNAL_LABELS[song.hymnal], locale)}${song.hymnalNumber ? ` · ${song.hymnalNumber}` : ''}`
            : (label ?? undefined)
        }
        description={song.author ?? undefined}
        icon={ListMusic}
        tone={WORSHIP_TONE}
        breadcrumbs={[...crumbs, { label: song.title }]}
        actions={
          canManage ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link to={`${base}/worship/songs/${song.id}/edit`}>
                  <Pencil />
                  {t('common.edit')}
                </Link>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-9 text-muted-foreground hover:text-destructive"
                aria-label={t('worship.deleteSong')}
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
              </Button>
            </>
          ) : null
        }
      />

      {recent ? (
        <Alert variant="warning" title={t('worship.restWarning', { weeks: SONG_REST_WEEKS })}>
          {t('worship.lastUsed', { when: formatRelative(song.lastUsedAt) })}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t('worship.key')}
          value={song.defaultKey ?? '—'}
          icon={KeyRound}
          tone={WORSHIP_TONE}
        />
        <StatCard
          label={t('worship.tempo')}
          value={song.tempo ? t('worship.bpm', { tempo: song.tempo }) : '—'}
          icon={Gauge}
          tone="sky"
        />
        <StatCard
          label={t('worship.usageHistory')}
          value={`${formatNumber(song.useCount)}×`}
          hint={
            song.lastUsedAt
              ? t('worship.lastUsed', { when: formatRelative(song.lastUsedAt) })
              : undefined
          }
          icon={Repeat}
          tone="amber"
        />
        <StatCard
          label={t('worship.ccli')}
          value={song.ccliNumber ?? '—'}
          icon={Hash}
          tone="slate"
        />
      </div>

      {song.tags.length > 0 || !song.isActive ? (
        <div className="flex flex-wrap gap-1.5">
          {!song.isActive ? (
            <StatusBadge tone="neutral">{t('worship.inactive')}</StatusBadge>
          ) : null}
          {song.tags.map((tag) => (
            <Link key={tag} to={`${base}/worship/songs?tag=${encodeURIComponent(tag)}`}>
              <StatusBadge tone={WORSHIP_TONE} className="hover:opacity-80">
                #{tag}
              </StatusBadge>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section title={t('worship.lyrics')}>
          <Card>
            <CardContent>
              {song.lyrics ? (
                <p className="font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line">
                  {song.lyrics}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('worship.noLyrics')}</p>
              )}
              {song.notes ? (
                <p className="mt-4 border-t pt-3 text-sm whitespace-pre-line text-muted-foreground">
                  {song.notes}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </Section>
        <Section title={t('worship.usageHistory')} icon={CalendarCheck}>
          {usage.length === 0 ? (
            <EmptyState
              compact
              icon={CalendarCheck}
              tone={WORSHIP_TONE}
              title={t('worship.usageEmpty')}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {usage.map((item) => {
                const upcoming = new Date(item.startsAt).getTime() > now;
                return (
                  <li key={item.serviceId}>
                    <Link
                      to={`${base}/worship/services/${item.serviceId}`}
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-2.5 shadow-soft pressable hover:border-border"
                    >
                      <DateTile iso={item.startsAt} muted={!upcoming} className="w-12" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block text-xs text-muted-foreground tabular">
                          {formatTime(item.startsAt)} · {formatRelative(item.startsAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('worship.deleteSongTitle', { title: song.title })}
        description={t('worship.deleteSongBody')}
        confirmLabel={t('worship.deleteSong')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(song.id)) {
            setDeleting(false);
            void navigate(`${base}/worship/songs`, { replace: true });
          }
        }}
      />
    </Page>
  );
}
