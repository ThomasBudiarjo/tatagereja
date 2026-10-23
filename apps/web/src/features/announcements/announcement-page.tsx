import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Eye, Pencil, Pin, PinOff, Share2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { copyText } from '@/components/ui/copy-button';
import { Alert } from '@/components/ui/misc';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SkeletonList, SkeletonPage } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { DetailLoadError } from '@/features/comms/load-error';
import { Markdown } from '@/features/comms/markdown';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  announcementQuery,
  readersQuery,
  useDeleteAnnouncement,
  useMarkAnnouncementRead,
  usePinAnnouncement,
} from './api';
import { ANNOUNCEMENT_TONE, AUDIENCE_ICONS, audienceText } from './announcement-lib';
import { AnnouncementStateBadge } from './announcement-ui';

export function AnnouncementPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const { t, formatDateTime, formatList, formatNumber, formatRelative } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(announcementQuery(churchId, id));
  const markRead = useMarkAnnouncementRead(churchId);
  const pin = usePinAnnouncement(churchId);
  const remove = useMutationToast(useDeleteAnnouncement(churchId), {
    success: t('announcements.deleted'),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [readersOpen, setReadersOpen] = useState(false);
  const readers = useQuery({ ...readersQuery(churchId, id), enabled: readersOpen });
  const marked = useRef<string | null>(null);

  const announcement = query.data?.announcement;
  const { mutate: markAsRead } = markRead;
  useEffect(() => {
    // Opening a published post counts as reading it, once per visit.
    if (!announcement || announcement.readByMe || announcement.state !== 'published') return;
    if (marked.current === announcement.id) return;
    marked.current = announcement.id;
    markAsRead(announcement.id);
  }, [announcement, markAsRead]);

  if (query.isPending) return <SkeletonPage />;
  if (query.isError || !announcement) {
    return (
      <Page>
        <PageHeader title={t('announcements.title')} backTo={`${base}/announcements`} />
        <DetailLoadError
          error={query.error}
          goneTitle={t('announcements.goneTitle')}
          goneBody={t('announcements.goneBody')}
          backTo={`${base}/announcements`}
          backLabel={t('announcements.backToList')}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </Page>
    );
  }

  const { canManage } = query.data;
  const AudienceIcon = AUDIENCE_ICONS[announcement.audience];
  const when = announcement.visibleFrom ?? announcement.createdAt;

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: announcement.title, url });
        return;
      } catch {
        // Cancelled: fall through to copying.
      }
    }
    if (await copyText(url)) toast.success(t('common.copied'));
    else toast.error(t('common.copyFailed'));
  };

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: t('announcements.title'), to: `${base}/announcements` },
          { label: announcement.title },
        ]}
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <AudienceIcon className="size-3.5" aria-hidden />
            {audienceText(announcement, t, formatList)}
          </span>
        }
        tone={ANNOUNCEMENT_TONE}
        title={announcement.title}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void share()}
              aria-label={t('common.share')}
            >
              <Share2 />
              <span className="hidden sm:inline">{t('common.share')}</span>
            </Button>
            {canManage ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`${base}/announcements/${announcement.id}/edit`}>
                  <Pencil />
                  {t('common.edit')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {announcement.state === 'draft' ? (
        <Alert variant="warning" title={t('announcements.draftTitle')}>
          {t('announcements.draftBody')}
        </Alert>
      ) : announcement.state === 'scheduled' && announcement.publishAt ? (
        <Alert variant="info" title={t('announcements.scheduledTitle')}>
          {t('announcements.scheduledBody', { when: formatDateTime(announcement.publishAt) })}
        </Alert>
      ) : announcement.state === 'expired' ? (
        <Alert variant="info" title={t('announcements.expiredTitle')}>
          {t('announcements.expiredBody')}
        </Alert>
      ) : null}

      <article className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft">
        {announcement.coverImageUrl ? (
          <img
            src={announcement.coverImageUrl}
            alt=""
            className="aspect-[16/7] w-full object-cover"
          />
        ) : null}
        <div className="flex flex-col gap-5 p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <EntityAvatar name={announcement.authorName} size="sm" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium">{announcement.authorName}</p>
              <p className="text-muted-foreground">
                <time dateTime={when} title={formatDateTime(when)}>
                  {formatDateTime(when)}
                </time>
                {announcement.expiresAt && announcement.state === 'published' ? (
                  <>
                    {' '}
                    · {t('announcements.until', { when: formatDateTime(announcement.expiresAt) })}
                  </>
                ) : null}
              </p>
            </div>
            {announcement.pinned ? (
              <span
                data-tone="brand"
                className="flex size-9 items-center justify-center rounded-full bg-tone-soft text-tone-ink"
                title={t('announcements.pinned')}
              >
                <Pin className="size-4" aria-label={t('announcements.pinned')} />
              </span>
            ) : null}
          </div>
          <Markdown source={announcement.body} className="text-base" />
        </div>
      </article>

      {canManage ? (
        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setReadersOpen(true)}
              className="pressable flex min-h-12 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
              disabled={announcement.state === 'draft'}
            >
              <span
                data-tone="sky"
                className="flex size-10 items-center justify-center rounded-xl bg-tone-soft text-tone-ink"
              >
                <Eye className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold">
                  {t('announcements.seenBy', {
                    count: announcement.seenCount ?? 0,
                    value: formatNumber(announcement.seenCount ?? 0),
                  })}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {announcement.state === 'draft'
                    ? t('announcements.seenDraft')
                    : t('announcements.seenHint')}
                </span>
              </span>
            </button>
            <div className="flex flex-wrap gap-2">
              <AnnouncementStateBadge state={announcement.state} />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  pin.mutate(
                    { id: announcement.id, pinned: !announcement.pinned },
                    {
                      onSuccess: (result) =>
                        toast.success(
                          result.announcement.pinned
                            ? t('announcements.pinnedToast')
                            : t('announcements.unpinnedToast'),
                        ),
                      onError: (error) => toast.error(getErrorMessage(error)),
                    },
                  )
                }
                disabled={pin.isPending}
              >
                {announcement.pinned ? <PinOff /> : <Pin />}
                {announcement.pinned ? t('announcements.unpin') : t('announcements.pin')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 />
                {t('common.delete')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Sheet open={readersOpen} onOpenChange={setReadersOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('announcements.readersTitle')}</SheetTitle>
            <SheetDescription>
              {readers.data
                ? t('announcements.readersOf', {
                    seen: formatNumber(readers.data.seenCount),
                    total: formatNumber(readers.data.audienceCount),
                  })
                : t('announcements.seenHint')}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            {readers.isPending ? (
              <SkeletonList rows={5} />
            ) : readers.isError ? (
              <ErrorState
                compact
                error={readers.error}
                message={getErrorMessage(readers.error)}
                onRetry={() => void readers.refetch()}
              />
            ) : readers.data.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('announcements.noReaders')}
              </p>
            ) : (
              <>
                {readers.data.audienceCount > 0 ? (
                  <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{
                        width: `${Math.min(100, (readers.data.seenCount / readers.data.audienceCount) * 100)}%`,
                      }}
                    />
                  </div>
                ) : null}
                <ul className="flex flex-col divide-y divide-border/70">
                  {readers.data.items.map((reader) => (
                    <li key={reader.userId} className="flex min-h-14 items-center gap-3 py-2">
                      <EntityAvatar name={reader.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {reader.name}
                      </span>
                      <time className="text-xs text-muted-foreground" dateTime={reader.readAt}>
                        {formatRelative(reader.readAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('announcements.deleteTitle', { title: announcement.title })}
        description={t('announcements.deleteBody')}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={remove.isPending}
        onConfirm={async () => {
          const done = await remove.run(announcement.id);
          if (done) {
            setDeleteOpen(false);
            void navigate(`${base}/announcements`, { replace: true });
          }
        }}
      />
      {announcement.state === 'scheduled' ? (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden />
          {t('announcements.notifyOnPublish')}
        </p>
      ) : null}
    </Page>
  );
}
