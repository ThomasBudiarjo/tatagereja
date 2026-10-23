import {
  ANNOUNCEMENT_STATE_LABELS,
  localize,
  markdownExcerpt,
  type AnnouncementDetails,
  type AnnouncementState,
} from '@tatagereja/shared';
import { CalendarClock, Eye, Pin } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ANNOUNCEMENT_TONE, AUDIENCE_ICONS, STATE_TONES, audienceText } from './announcement-lib';

export function AnnouncementStateBadge({ state }: { state: AnnouncementState }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={STATE_TONES[state]} dot size="sm">
      {localize(ANNOUNCEMENT_STATE_LABELS[state], locale)}
    </StatusBadge>
  );
}

/** A card in the list: cover, title, excerpt, audience and, for managers, state and reads. */
export function AnnouncementCard({
  announcement,
  to,
  showState,
}: {
  announcement: AnnouncementDetails;
  to: string;
  showState: boolean;
}) {
  const { t, formatRelative, formatDateTime, formatList, formatNumber } = useI18n();
  const AudienceIcon = AUDIENCE_ICONS[announcement.audience];
  const when = announcement.visibleFrom ?? announcement.createdAt;
  const { access } = useChurch();
  const unread =
    !announcement.readByMe &&
    announcement.state === 'published' &&
    announcement.createdBy !== access.userId;
  return (
    <Link
      to={to}
      className={cn(
        'group pressable flex overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft outline-none transition-colors hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40',
        announcement.pinned && 'border-primary/30 ring-1 ring-primary/10',
      )}
    >
      {announcement.coverImageUrl ? (
        <img
          src={announcement.coverImageUrl}
          alt=""
          loading="lazy"
          className="hidden w-36 shrink-0 object-cover sm:block"
        />
      ) : (
        <span
          data-tone={ANNOUNCEMENT_TONE}
          className="hidden w-1.5 shrink-0 bg-tone/70 sm:block"
          aria-hidden
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {announcement.pinned ? (
            <StatusBadge tone="brand" icon={Pin} size="sm">
              {t('announcements.pinned')}
            </StatusBadge>
          ) : null}
          {showState && announcement.state !== 'published' ? (
            <AnnouncementStateBadge state={announcement.state} />
          ) : null}
          <span className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">
            <AudienceIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{audienceText(announcement, t, formatList)}</span>
          </span>
        </div>
        <h3 className="flex items-start gap-2 text-base leading-snug font-semibold tracking-tight text-balance">
          {unread ? (
            <span
              className="mt-2 size-2 shrink-0 rounded-full bg-primary"
              aria-label={t('announcements.unreadDot')}
            />
          ) : null}
          <span className="min-w-0">{announcement.title}</span>
        </h3>
        <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">
          {markdownExcerpt(announcement.body, 220)}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{announcement.authorName}</span>
          {announcement.state === 'scheduled' && announcement.publishAt ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {t('announcements.scheduledFor', { when: formatDateTime(announcement.publishAt) })}
            </span>
          ) : (
            <time dateTime={when} title={formatDateTime(when)}>
              {formatRelative(when)}
            </time>
          )}
          {announcement.seenCount !== null &&
          (announcement.state === 'published' || announcement.state === 'expired') ? (
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden />
              {t('announcements.seenBy', {
                count: announcement.seenCount,
                value: formatNumber(announcement.seenCount),
              })}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
