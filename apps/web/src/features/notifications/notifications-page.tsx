import { addDaysToDate, churchDateOf } from '@tatagereja/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck, Settings2 } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/misc';
import { InfiniteListFooter } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { myChurchesQuery } from '@/features/churches/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { inboxQuery, useMarkAllRead } from './api';
import { NotificationRow } from './notification-ui';

/** The inbox: everything people were told, newest first, grouped by day. */
export function NotificationsPage() {
  const { t, formatDate, timeZone } = useI18n();
  const { churchId, base } = useChurch();
  const [state, setState] = useUrlState({ show: 'all', scope: 'church' });
  const unread = state.show === 'unread';
  const scopedChurch = state.scope === 'church' ? churchId : undefined;
  const query = useInfiniteQuery(inboxQuery({ unread, churchId: scopedChurch }));
  const churches = useQuery(myChurchesQuery());
  const markAll = useMarkAllRead();
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  const zone = timeZone ?? 'Asia/Jakarta';
  const today = churchDateOf(new Date(), zone);
  const yesterday = addDaysToDate(today, -1);
  const dayLabel = (day: string) =>
    day === today
      ? t('common.today')
      : day === yesterday
        ? t('common.yesterday')
        : formatDate(day, 'dateLong');
  const groups: { day: string; items: typeof items }[] = [];
  for (const item of items) {
    const day = churchDateOf(item.createdAt, zone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  const churchName = (id: string | null) =>
    id && id !== churchId
      ? (churches.data?.items.find((entry) => entry.church.id === id)?.church.name ?? null)
      : null;
  const multipleChurches = (churches.data?.items.length ?? 0) > 1;

  return (
    <Page>
      <PageHeader
        title={t('common.notifications')}
        description={t('comms.inboxDescription')}
        icon={Bell}
        tone="amber"
        actions={
          <>
            {unreadCount > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => markAll.mutate(scopedChurch)}
                disabled={markAll.isPending}
              >
                <CheckCheck />
                <span className="hidden sm:inline">{t('comms.markAllRead')}</span>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="ghost" aria-label={t('comms.notificationSettings')}>
              <Link to={`${base}/notifications/settings`}>
                <Settings2 />
                <span className="hidden sm:inline">{t('comms.notificationSettings')}</span>
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Segmented
          aria-label={t('comms.inboxShow')}
          value={unread ? 'unread' : 'all'}
          onChange={(show) => setState({ show })}
          options={[
            { value: 'all', label: t('comms.inboxAll') },
            {
              value: 'unread',
              label:
                unreadCount > 0
                  ? `${t('comms.inboxUnread')} (${unreadCount})`
                  : t('comms.inboxUnread'),
            },
          ]}
        />
        {multipleChurches ? (
          <Segmented
            aria-label={t('comms.inboxScope')}
            value={state.scope === 'all' ? 'all' : 'church'}
            onChange={(scope) => setState({ scope })}
            options={[
              { value: 'church', label: t('comms.inboxThisChurch') },
              { value: 'all', label: t('comms.inboxAllChurches') },
            ]}
          />
        ) : null}
      </div>

      {query.isPending ? (
        <SkeletonList rows={7} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={unread ? CheckCheck : BellOff}
          tone={unread ? 'success' : 'amber'}
          title={unread ? t('comms.inboxAllCaughtUp') : t('comms.notificationsEmpty')}
          description={unread ? t('comms.inboxAllCaughtUpHint') : t('comms.notificationsEmptyHint')}
          action={
            unread ? (
              <Button variant="outline" onClick={() => setState({ show: 'all' })}>
                {t('comms.inboxShowAll')}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-5" aria-busy={query.isFetching || undefined}>
          {groups.map((group) => (
            <section
              key={group.day}
              aria-label={dayLabel(group.day)}
              className="flex flex-col gap-2"
            >
              <h2 className="text-overline px-1 text-muted-foreground">{dayLabel(group.day)}</h2>
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
                {group.items.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    churchName={churchName(notification.churchId)}
                  />
                ))}
              </ul>
            </section>
          ))}
          <InfiniteListFooter
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={query.fetchNextPage}
          />
        </div>
      )}
    </Page>
  );
}
