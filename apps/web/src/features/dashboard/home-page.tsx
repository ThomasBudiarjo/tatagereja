import { GROUP_TYPE_LABELS, isAdmin } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Cake,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  Megaphone,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list';
import { EmptyState, ErrorState, Skeleton, Stat } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { formatEventRange, formatRelative } from '@/lib/format';
import { useAuth } from '@/stores/auth';
import { dashboardQuery } from './api';

const monthDay = (birthDate: string) => {
  const [, month, day] = birthDate.split('-');
  if (!month || !day) return '';
  const date = new Date(2000, Number(month) - 1, Number(day));
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export function HomePage() {
  const { church, base, access } = useChurch();
  const { user } = useAuth();
  const query = useQuery(dashboardQuery(church.id));
  const admin = isAdmin(access);
  const canLead = admin || access.leaderGroupIds.length > 0;

  return (
    <Page>
      <PageHeader
        eyebrow={church.name}
        title={`Hello, ${user?.name.split(' ')[0] ?? 'there'}`}
        description={church.description ?? undefined}
      />

      {query.isPending ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="People" value={query.data.stats.people} />
            <Stat label="Groups" value={query.data.stats.activeGroups} />
            <Stat label="Upcoming" value={query.data.stats.upcomingEvents} hint="events" />
            <Stat label="Accounts" value={query.data.stats.members} />
          </div>

          {canLead ? (
            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3 text-xs">
                <Link to={`${base}/events/new`}>
                  <CalendarPlus className="size-5" />
                  Event
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3 text-xs">
                <Link to={`${base}/announcements/new`}>
                  <Megaphone className="size-5" />
                  Announce
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3 text-xs">
                <Link to={admin ? `${base}/people/new` : `${base}/attendance`}>
                  {admin ? <UserPlus className="size-5" /> : <ClipboardCheck className="size-5" />}
                  {admin ? 'Person' : 'Attendance'}
                </Link>
              </Button>
            </div>
          ) : null}

          <Section
            title="Upcoming events"
            action={
              <Button asChild variant="link" size="sm">
                <Link to={`${base}/events`}>See all</Link>
              </Button>
            }
          >
            {query.data.upcomingEvents.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing scheduled"
                description="Upcoming events appear here."
              />
            ) : (
              <ListGroup>
                {query.data.upcomingEvents.map((event) => (
                  <ListRow
                    key={event.id}
                    to={`${base}/events/${event.id}`}
                    title={event.title}
                    subtitle={formatEventRange(event.startsAt, event.endsAt, event.isAllDay)}
                    trailing={
                      event.groupName ? <Badge variant="secondary">{event.groupName}</Badge> : null
                    }
                  />
                ))}
              </ListGroup>
            )}
          </Section>

          <Section
            title="Latest announcements"
            action={
              <Button asChild variant="link" size="sm">
                <Link to={`${base}/announcements`}>See all</Link>
              </Button>
            }
          >
            {query.data.recentAnnouncements.length === 0 ? (
              <EmptyState icon={Megaphone} title="No announcements yet" />
            ) : (
              <ListGroup>
                {query.data.recentAnnouncements.map((announcement) => (
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
                  />
                ))}
              </ListGroup>
            )}
          </Section>

          {query.data.myGroups.length > 0 ? (
            <Section title="My groups">
              <ListGroup>
                {query.data.myGroups.map((group) => (
                  <ListRow
                    key={group.id}
                    to={`${base}/groups/${group.id}`}
                    leading={<UsersRound className="size-5 text-muted-foreground" />}
                    title={group.name}
                    subtitle={GROUP_TYPE_LABELS[group.type]}
                    trailing={group.isLeader ? <Badge variant="secondary">Leader</Badge> : null}
                  />
                ))}
              </ListGroup>
            </Section>
          ) : null}

          {query.data.birthdaysThisMonth.length > 0 ? (
            <Section title="Birthdays this month">
              <ListGroup>
                {query.data.birthdaysThisMonth.map((birthday) => (
                  <ListRow
                    key={birthday.personId}
                    to={`${base}/people/${birthday.personId}`}
                    leading={<Cake className="size-5 text-muted-foreground" />}
                    title={birthday.name}
                    trailing={monthDay(birthday.birthDate)}
                  />
                ))}
              </ListGroup>
            </Section>
          ) : null}
        </>
      )}
    </Page>
  );
}
