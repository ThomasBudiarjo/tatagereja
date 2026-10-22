import {
  GROUP_TYPE_TEXT,
  HOUSEHOLD_RELATIONSHIP_LABELS,
  ageOn,
  fullName,
  localize,
  type PersonProfile,
  type PersonTimelineKind,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  Clock3,
  Crown,
  Home,
  IdCard,
  Milestone,
  Sparkles,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListGroup, ListRow } from '@/components/ui/list';
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import type { Tone } from '@/components/ui/tone';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { personAttendanceQuery, personTimelineQuery } from './api';
import { todayInZone } from './labels';
import { GroupCover, PersonStatusBadge } from './people-ui';

export function FamilyTab({
  profile,
  onAddFamily,
  onJoinHousehold,
}: {
  profile: PersonProfile;
  onAddFamily?: () => void;
  onJoinHousehold?: () => void;
}) {
  const { base, church } = useChurch();
  const { t, locale } = useI18n();
  const today = todayInZone(church.timezone);
  const household = profile.household;
  if (!household) {
    return (
      <EmptyState
        icon={Home}
        tone="amber"
        title={t('people.noHousehold')}
        description={t('people.noHouseholdHint')}
        action={
          onAddFamily ? (
            <Button onClick={onAddFamily}>
              <UserPlus /> {t('people.addFamily')}
            </Button>
          ) : null
        }
        secondaryAction={
          onJoinHousehold ? (
            <Button variant="outline" onClick={onJoinHousehold}>
              <Home /> {t('people.joinHousehold')}
            </Button>
          ) : null
        }
      />
    );
  }
  return (
    <Section
      title={household.name}
      description={
        [household.area?.name, household.address, household.phone].filter(Boolean).join(' · ') ||
        undefined
      }
      action={
        <div className="flex items-center gap-1">
          {onAddFamily ? (
            <Button size="sm" variant="ghost" onClick={onAddFamily}>
              <UserPlus /> <span className="sr-only sm:not-sr-only">{t('people.addFamily')}</span>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link to={`${base}/households/${household.id}`}>{t('common.open')}</Link>
          </Button>
        </div>
      }
    >
      <ListGroup>
        {household.members.map((member) => {
          const name = fullName(member);
          const years = member.birthDate ? ageOn(member.birthDate, today) : null;
          const isSelf = member.id === profile.person.id;
          return (
            <ListRow
              key={member.id}
              to={isSelf ? undefined : `${base}/people/${member.id}`}
              leading={<EntityAvatar name={name} src={member.photoUrl} />}
              title={
                <span className="flex items-center gap-2">
                  <span className="truncate">{name}</span>
                  {isSelf ? (
                    <StatusBadge tone="sky" size="sm">
                      {t('people.thisPerson')}
                    </StatusBadge>
                  ) : null}
                </span>
              }
              subtitle={[
                localize(HOUSEHOLD_RELATIONSHIP_LABELS[member.relationship], locale),
                years !== null ? t('common.years', { count: years }) : null,
                member.isPrimaryContact ? t('people.primaryContact') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={<PersonStatusBadge status={member.membershipStatus} size="sm" />}
            />
          );
        })}
      </ListGroup>
      {onJoinHousehold ? (
        <Button variant="link" size="sm" className="w-fit px-0" onClick={onJoinHousehold}>
          {t('people.moveHousehold')}
        </Button>
      ) : null}
    </Section>
  );
}

export function GroupsTab({ profile }: { profile: PersonProfile }) {
  const { base } = useChurch();
  const { t, locale, formatDate } = useI18n();
  if (profile.groups.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        tone="violet"
        title={t('people.noGroups')}
        description={t('people.noGroupsHint')}
        action={
          <Button asChild variant="outline">
            <Link to={`${base}/groups`}>{t('people.browseGroups')}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ListGroup>
      {profile.groups.map((group) => (
        <ListRow
          key={group.id}
          to={`${base}/groups/${group.id}`}
          leading={<GroupCover type={group.type} color={group.coverColor} size="sm" />}
          title={
            <span className="flex items-center gap-2">
              <span className="truncate">{group.name}</span>
              {group.isLeader ? (
                <StatusBadge tone="amber" size="sm" icon={Crown}>
                  {t('people.leader')}
                </StatusBadge>
              ) : null}
            </span>
          }
          subtitle={`${localize(GROUP_TYPE_TEXT[group.type], locale)} · ${t('people.memberSince', { date: formatDate(group.addedAt, 'dateShort') })}`}
        />
      ))}
    </ListGroup>
  );
}

const TIMELINE_STYLE: Record<PersonTimelineKind, { icon: LucideIcon; tone: Tone }> = {
  joined: { icon: Sparkles, tone: 'success' },
  record: { icon: Milestone, tone: 'violet' },
  group_joined: { icon: UsersRound, tone: 'sky' },
  attendance: { icon: CalendarCheck, tone: 'teal' },
  household: { icon: Home, tone: 'amber' },
  note: { icon: IdCard, tone: 'neutral' },
};

const RECORD_LABELS: Record<string, MessageKey> = {
  baptism: 'people.recordBaptism',
  sidi: 'people.recordSidi',
  marriage: 'people.recordMarriage',
  child_dedication: 'people.recordDedication',
  transfer_in: 'people.recordTransferIn',
  transfer_out: 'people.recordTransferOut',
  death: 'people.recordDeath',
};

export function TimelineTab({ profile }: { profile: PersonProfile }) {
  const { churchId } = useChurch();
  const { t, formatDate, formatPercent, formatRelative } = useI18n();
  const timeline = useQuery(personTimelineQuery(churchId, profile.person.id));
  const attendance = useQuery({
    ...personAttendanceQuery(churchId, profile.person.id),
    enabled: profile.canViewAttendance,
  });

  if (timeline.isPending) return <SkeletonText lines={6} />;
  if (timeline.isError) {
    return (
      <ErrorState
        compact
        error={timeline.error}
        message={getErrorMessage(timeline.error)}
        onRetry={() => void timeline.refetch()}
      />
    );
  }
  const { items, attendance: summary } = timeline.data;
  const titleOf = (item: (typeof items)[number]) => {
    switch (item.kind) {
      case 'note':
        return t('people.timelineAdded');
      case 'joined':
        return t('people.timelineJoined');
      case 'record': {
        const key = RECORD_LABELS[item.title];
        return key ? t(key) : item.title;
      }
      case 'group_joined':
        return t('people.timelineGroup', { group: item.title });
      case 'household':
        return t('people.timelineHousehold', { household: item.title });
      case 'attendance':
        return t('people.timelineAttended', { title: item.title });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {profile.canViewAttendance ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label={t('people.attendanceRate')}
            value={summary.total > 0 ? formatPercent(summary.present / summary.total) : '—'}
            icon={CalendarCheck}
            tone="teal"
          />
          <StatCard
            label={t('people.attendancePresent')}
            value={`${summary.present}/${summary.total}`}
            icon={UsersRound}
            tone="sky"
          />
          <StatCard
            label={t('people.attendanceLast')}
            value={summary.lastPresentAt ? formatRelative(summary.lastPresentAt) : '—'}
            icon={Clock3}
            tone="amber"
            className="col-span-2 sm:col-span-1"
          />
        </div>
      ) : null}
      <Card>
        <CardContent>
          <Timeline>
            {items.map((item, index) => {
              const style = TIMELINE_STYLE[item.kind];
              const title = titleOf(item);
              return (
                <TimelineItem
                  key={`${item.kind}-${item.date}-${index}`}
                  icon={style.icon}
                  tone={style.tone}
                  last={index === items.length - 1}
                  title={
                    item.link ? (
                      <Link to={item.link} className="hover:underline">
                        {title}
                      </Link>
                    ) : (
                      title
                    )
                  }
                  time={formatDate(item.date, 'dateShort')}
                >
                  {item.kind === 'record' && item.subtitle ? item.subtitle : null}
                </TimelineItem>
              );
            })}
          </Timeline>
        </CardContent>
      </Card>
      {profile.canViewAttendance ? (
        <Section title={t('people.attendanceHistory')} icon={CalendarCheck}>
          {attendance.isPending ? (
            <SkeletonList rows={3} avatar={false} />
          ) : attendance.isError ? (
            <ErrorState
              compact
              message={getErrorMessage(attendance.error)}
              onRetry={() => void attendance.refetch()}
            />
          ) : attendance.data.items.length === 0 ? (
            <EmptyState compact icon={CalendarCheck} tone="teal" title={t('people.noAttendance')} />
          ) : (
            <ListGroup>
              {attendance.data.items.slice(0, 10).map((item) => (
                <ListRow
                  key={item.sessionId}
                  title={item.title}
                  subtitle={[formatDate(item.sessionAt, 'dateTime'), item.groupName]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <StatusBadge
                      size="sm"
                      dot
                      tone={
                        item.status === 'present'
                          ? 'success'
                          : item.status === 'excused'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {t(
                        item.status === 'present'
                          ? 'people.present'
                          : item.status === 'excused'
                            ? 'people.excused'
                            : 'people.absent',
                      )}
                    </StatusBadge>
                  }
                />
              ))}
            </ListGroup>
          )}
        </Section>
      ) : null}
    </div>
  );
}
