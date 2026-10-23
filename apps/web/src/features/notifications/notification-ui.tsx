import type { Notification } from '@tatagereja/shared';
import { Circle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ToneIcon } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useMarkNotification } from './api';
import { notificationVisual } from './notification-visuals';

/**
 * One notification: opening it marks it read and follows its in-app link. The trailing
 * button toggles read without opening.
 */
export function NotificationRow({
  notification,
  churchName,
  onOpen,
  dense = false,
}: {
  notification: Notification;
  /** Shown when the notification belongs to another church than the current one. */
  churchName?: string | null;
  onOpen?: () => void;
  dense?: boolean;
}) {
  const { t, formatRelative, formatDateTime } = useI18n();
  const navigate = useNavigate();
  const mark = useMarkNotification();
  const unread = !notification.readAt;
  const { icon, tone } = notificationVisual(notification.type);

  const open = () => {
    if (unread) mark.mutate({ id: notification.id, read: true });
    onOpen?.();
    if (notification.link) void navigate(notification.link);
  };

  return (
    <li className={cn('group relative flex items-stretch', unread && 'bg-accent/35')}>
      <button
        type="button"
        onClick={open}
        className={cn(
          'flex min-w-0 flex-1 items-start gap-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset',
          dense ? 'px-3.5 py-3' : 'px-4 py-3.5',
        )}
      >
        <ToneIcon icon={icon} tone={tone} size={dense ? 'sm' : 'md'} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'line-clamp-2 text-sm leading-snug text-pretty',
              unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85',
            )}
          >
            {notification.title}
          </span>
          {notification.body ? (
            <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
              {notification.body}
            </span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <time dateTime={notification.createdAt} title={formatDateTime(notification.createdAt)}>
              {formatRelative(notification.createdAt)}
            </time>
            {churchName ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{churchName}</span>
              </>
            ) : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => mark.mutate({ id: notification.id, read: unread })}
        className="flex w-11 shrink-0 items-start justify-center pt-4 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset"
        aria-label={unread ? t('comms.markRead') : t('comms.markUnread')}
        title={unread ? t('comms.markRead') : t('comms.markUnread')}
      >
        {unread ? (
          <span className="mt-1 size-2.5 rounded-full bg-primary" aria-hidden />
        ) : (
          <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Circle className="size-4" aria-hidden />
          </span>
        )}
      </button>
    </li>
  );
}
