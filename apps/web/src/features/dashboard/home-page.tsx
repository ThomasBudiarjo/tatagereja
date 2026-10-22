import { GROUP_TYPE_TEXT, localize } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Cake, CalendarDays, Megaphone, UserCheck, Users, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { QuickActions } from '@/components/layout/quick-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { dashboardQuery } from './api';

const greetingKey = (hour: number): MessageKey =>
  hour < 11
    ? 'dashboard.greetingMorning'
    : hour < 15
      ? 'dashboard.greetingMidday'
      : hour < 18
        ? 'dashboard.greetingAfternoon'
        : 'dashboard.greetingEvening';

/** The day of an event as a small calendar chip. */
function DateChip({ value }: { value: string }) {
  const { formatDate } = useI18n();
  return (
    <span
      data-tone="amber"
      className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-tone-soft text-tone-ink"
      aria-hidden
    >
      <span className="text-[10px] leading-none font-semibold uppercase">
        {formatDate(value, { options: { month: 'short' } })}
      </span>
      <span className="text-base leading-tight font-bold tabular">
        {formatDate(value, { options: { day: 'numeric' } })}
      </span>
    </span>
  );
}

export function HomePage() {
  const { church, base } = useChurch();
  const { user } = useAuth();
  const { t, locale, formatDate, formatDateRange, formatRelative } = useI18n();
  const query = useQuery(dashboardQuery(church.id));
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <Page size="wide">
      <PageHeader
        eyebrow={church.name}
        title={t(greetingKey(new Date().getHours()), { name: firstName })}
        description={church.description ?? undefined}
        documentTitle={t('dashboard.title')}
      />

      {query.isPending ? (
        <>
          <SkeletonStats />
          <SkeletonList rows={3} />
        </>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t('dashboard.statPeople')}
              value={query.data.stats.people}
              icon={Users}
              tone="sky"
              to={`${base}/people`}
            />
            <StatCard
              label={t('dashboard.statGroups')}
              value={query.data.stats.activeGroups}
              icon={UsersRound}
              tone="violet"
              to={`${base}/groups`}
            />
            <StatCard
              label={t('dashboard.statUpcoming')}
              value={query.data.stats.upcomingEvents}
              hint={t('dashboard.statUpcomingHint')}
              icon={CalendarDays}
              tone="amber"
              to={`${base}/events`}
            />
            <StatCard
              label={t('dashboard.statAccounts')}
              value={query.data.stats.members}
              hint={t('dashboard.statAccountsHint')}
              icon={UserCheck}
              tone="teal"
            />
          </div>

          <QuickActions />

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              title={t('dashboard.upcomingEvents')}
              action={
                <Button asChild variant="link" size="sm">
                  <Link to={`${base}/events`}>{t('common.seeAll')}</Link>
                </Button>
              }
            >
              {query.data.upcomingEvents.length === 0 ? (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  tone="amber"
                  title={t('dashboard.nothingScheduled')}
                  description={t('dashboard.nothingScheduledHint')}
                />
              ) : (
                <ListGroup>
                  {query.data.upcomingEvents.map((event) => (
                    <ListRow
                      key={event.id}
                      to={`${base}/events/${event.id}`}
                      leading={<DateChip value={event.startsAt} />}
                      title={event.title}
                      subtitle={formatDateRange(event.startsAt, event.endsAt, event.isAllDay)}
                      trailing={
                        event.groupName ? (
                          <Badge variant="secondary">{event.groupName}</Badge>
                        ) : null
                      }
                    />
                  ))}
                </ListGroup>
              )}
            </Section>

            <Section
              title={t('dashboard.latestAnnouncements')}
              action={
                <Button asChild variant="link" size="sm">
                  <Link to={`${base}/announcements`}>{t('common.seeAll')}</Link>
                </Button>
              }
            >
              {query.data.recentAnnouncements.length === 0 ? (
                <EmptyState
                  compact
                  icon={Megaphone}
                  tone="amber"
                  title={t('dashboard.noAnnouncements')}
                  description={t('dashboard.noAnnouncementsHint')}
                />
              ) : (
                <ListGroup>
                  {query.data.recentAnnouncements.map((announcement) => (
                    <ListRow
                      key={announcement.id}
                      to={`${base}/announcements/${announcement.id}`}
                      leading={<ToneIcon icon={Megaphone} tone="amber" size="sm" />}
                      title={
                        <span className="flex items-center gap-2">
                          <span className="truncate">{announcement.title}</span>
                          {announcement.status === 'draft' ? (
                            <StatusBadge tone="warning" size="sm">
                              {t('dashboard.draft')}
                            </StatusBadge>
                          ) : null}
                        </span>
                      }
                      subtitle={`${announcement.authorName} · ${formatRelative(announcement.publishedAt ?? announcement.createdAt)}`}
                    />
                  ))}
                </ListGroup>
              )}
            </Section>

            {query.data.myGroups.length > 0 ? (
              <Section title={t('dashboard.myGroups')}>
                <ListGroup>
                  {query.data.myGroups.map((group) => (
                    <ListRow
                      key={group.id}
                      to={`${base}/groups/${group.id}`}
                      leading={<ToneIcon icon={UsersRound} tone="violet" size="sm" />}
                      title={group.name}
                      subtitle={localize(GROUP_TYPE_TEXT[group.type], locale)}
                      trailing={
                        group.isLeader ? (
                          <StatusBadge tone="violet">{t('dashboard.leader')}</StatusBadge>
                        ) : null
                      }
                    />
                  ))}
                </ListGroup>
              </Section>
            ) : null}

            {query.data.birthdaysThisMonth.length > 0 ? (
              <Section title={t('dashboard.birthdays')}>
                <ListGroup>
                  {query.data.birthdaysThisMonth.map((birthday) => (
                    <ListRow
                      key={birthday.personId}
                      to={`${base}/people/${birthday.personId}`}
                      leading={<ToneIcon icon={Cake} tone="rose" size="sm" />}
                      title={birthday.name}
                      trailing={formatDate(birthday.birthDate, {
                        preset: 'dayMonth',
                        smartYear: false,
                      })}
                    />
                  ))}
                </ListGroup>
              </Section>
            ) : null}
          </div>
        </>
      )}
    </Page>
  );
}
