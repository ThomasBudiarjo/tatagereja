import { useQuery } from '@tanstack/react-query';
import { Bell, CheckCheck, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { EmptyIllustration } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { myChurchesQuery } from '@/features/churches/api';
import { latestQuery, unreadCountQuery, useMarkAllRead } from '@/features/notifications/api';
import { NotificationRow } from '@/features/notifications/notification-ui';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * The top-bar bell: the unread count across every church (polled each minute and on focus),
 * the newest notifications, "mark all read" and links to the inbox and its settings.
 */
export function NotificationsBell() {
  const { t, formatNumber } = useI18n();
  const { churchId, base } = useChurch();
  const [open, setOpen] = useState(false);
  const count = useQuery(unreadCountQuery()).data?.count ?? 0;
  const latest = useQuery({ ...latestQuery(), enabled: open });
  const churches = useQuery({ ...myChurchesQuery(), enabled: open });
  const markAll = useMarkAllRead();
  const churchName = (id: string | null) =>
    id && id !== churchId
      ? (churches.data?.items.find((item) => item.church.id === id)?.church.name ?? null)
      : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full text-muted-foreground hover:text-foreground"
          aria-label={count > 0 ? t('comms.bellUnread', { count }) : t('common.notifications')}
        >
          <Bell className="size-5" />
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute top-1 right-1 flex h-[18px] min-w-[18px] animate-in items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground ring-2 ring-background zoom-in-50"
            >
              {count > 99 ? '99+' : formatNumber(count)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex min-h-12 items-center gap-2 border-b px-4 py-1.5">
          <p className="flex-1 font-semibold">{t('common.notifications')}</p>
          {count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2 text-muted-foreground"
              onClick={() => markAll.mutate(undefined)}
              disabled={markAll.isPending}
            >
              <CheckCheck />
              {t('comms.markAllRead')}
            </Button>
          ) : null}
        </div>
        <div className="max-h-[min(26rem,65dvh)] overflow-y-auto overscroll-contain">
          {latest.isPending ? (
            <div className="flex flex-col gap-3 p-4" aria-busy>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex gap-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-4/5" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : latest.isError ? (
            <ErrorState
              compact
              className="m-3"
              error={latest.error}
              message={getErrorMessage(latest.error)}
              onRetry={() => void latest.refetch()}
              retrying={latest.isFetching}
            />
          ) : latest.data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
              <EmptyIllustration icon={Bell} tone="amber" size="sm" />
              <div>
                <p className="text-sm font-semibold">{t('comms.notificationsEmpty')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('comms.notificationsEmptyHint')}
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {latest.data.items.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  churchName={churchName(notification.churchId)}
                  onOpen={() => setOpen(false)}
                  dense
                />
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-1 border-t p-1.5">
          <Button asChild variant="ghost" size="sm" className="h-10 flex-1">
            <Link to={`${base}/notifications`} onClick={() => setOpen(false)}>
              {t('comms.openInbox')}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
            <Link
              to={`${base}/notifications/settings`}
              onClick={() => setOpen(false)}
              aria-label={t('comms.notificationSettings')}
              title={t('comms.notificationSettings')}
            >
              <Settings2 />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
