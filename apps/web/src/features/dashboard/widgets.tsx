import { can, fullName, has, type Dashboard } from '@tatagereja/shared';
import {
  Baby,
  Bell,
  BellRing,
  Cake,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardCheck,
  Flame,
  HandHeart,
  Heart,
  Megaphone,
  Music,
  Pin,
  Plus,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sparkline } from '@/components/ui/charts';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import type { Tone } from '@/components/ui/tone';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { useCompleteMyTask, useMarkNotificationRead } from './api';

/** The frame every home card shares: icon, title, a count or hint, an action and the body. */
export function Widget({
  icon,
  tone,
  title,
  hint,
  action,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 animate-rise-in flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft',
        className,
      )}
    >
      <header className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5">
        <ToneIcon icon={icon} tone={tone} size="sm" />
        <div className="min-w-0 flex-1">
          <h2 id={id} className="truncate text-[0.9375rem] font-semibold tracking-tight">
            {title}
          </h2>
          {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** A plain row list inside a widget. */
function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-border/60 border-t border-border/60">{children}</ul>;
}

function Row({
  to,
  leading,
  title,
  subtitle,
  trailing,
}: {
  to?: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const body = (
    <>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </>
  );
  const classes = 'flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5';
  return (
    <li>
      {to ? (
        <Link
          to={to}
          className={cn(
            classes,
            'outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset',
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={classes}>{body}</div>
      )}
    </li>
  );
}

function SeeAll({ to, label }: { to: string; label?: string }) {
  const { t } = useI18n();
  return (
    <Button asChild variant="link" size="sm" className="h-9 px-1">
      <Link to={to}>{label ?? t('common.seeAll')}</Link>
    </Button>
  );
}

/** The day of an event or service as a small calendar chip. */
export function DateChip({ value, tone = 'amber' }: { value: string; tone?: Tone }) {
  const { formatDate } = useI18n();
  return (
    <span
      data-tone={tone}
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

const Empty = (props: React.ComponentProps<typeof EmptyState>) => (
  <div className="px-4 pb-4 sm:px-5 sm:pb-5">
    <EmptyState compact {...props} />
  </div>
);

// ---- Widgets ------------------------------------------------------------------------------------

export function NotificationsWidget({ data }: { data: Dashboard['notifications'] }) {
  const { churchId } = useChurch();
  const { t, formatRelative } = useI18n();
  const mark = useMutationToast(useMarkNotificationRead(churchId));
  return (
    <Widget
      icon={Bell}
      tone="amber"
      title={t('dashboard.notifications')}
      hint={data.unreadCount > 0 ? t('dashboard.unread', { count: data.unreadCount }) : undefined}
      action={
        data.unreadCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => void mark.run({ id: null })}>
            <CheckCheck />
            <span className="hidden sm:inline">{t('dashboard.markAllRead')}</span>
          </Button>
        ) : undefined
      }
    >
      {data.items.length === 0 ? (
        <Empty
          icon={Bell}
          tone="amber"
          title={t('dashboard.allCaughtUp')}
          description={t('dashboard.allCaughtUpHint')}
        />
      ) : (
        <Rows>
          {data.items.map((item) => (
            <li key={item.id} className="flex min-h-14 items-center gap-1 pr-2 sm:pr-3">
              {item.link?.startsWith('/') ? (
                <Link
                  to={item.link}
                  onClick={() => void mark.run({ id: item.id })}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 sm:px-5"
                >
                  <NotificationText item={item} relative={formatRelative(item.createdAt)} />
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 sm:px-5">
                  <NotificationText item={item} relative={formatRelative(item.createdAt)} />
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-11 text-muted-foreground"
                aria-label={t('dashboard.markRead')}
                title={t('dashboard.markRead')}
                onClick={() => void mark.run({ id: item.id })}
              >
                <Check />
              </Button>
            </li>
          ))}
        </Rows>
      )}
    </Widget>
  );
}

function NotificationText({
  item,
  relative,
}: {
  item: Dashboard['notifications']['items'][number];
  relative: string;
}) {
  return (
    <>
      <span data-tone="amber" className="size-2 shrink-0 rounded-full bg-tone" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.body ? `${item.body} · ` : ''}
          {relative}
        </span>
      </span>
    </>
  );
}

export function ScheduleWidget({ items }: { items: NonNullable<Dashboard['mySchedule']> }) {
  const { base } = useChurch();
  const { t, formatDateTime } = useI18n();
  return (
    <Widget
      icon={Music}
      tone="violet"
      title={t('dashboard.mySchedule')}
      action={<SeeAll to={`${base}/worship/me`} label={t('dashboard.openSchedule')} />}
    >
      {items.length === 0 ? (
        <Empty
          icon={Music}
          tone="violet"
          title={t('dashboard.myScheduleEmpty')}
          description={t('dashboard.myScheduleEmptyHint')}
        />
      ) : (
        <Rows>
          {items.map((item) => (
            <Row
              key={item.id}
              to={`${base}/worship/me`}
              leading={<DateChip value={item.serviceStartsAt} tone="violet" />}
              title={item.serviceTitle}
              subtitle={`${formatDateTime(item.serviceStartsAt)} · ${item.positionName} · ${item.teamName}`}
              trailing={
                item.status === 'pending' ? (
                  <StatusBadge tone="warning" size="sm" dot>
                    {t('dashboard.rosterPending')}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="success" size="sm" dot>
                    {t('dashboard.rosterAccepted')}
                  </StatusBadge>
                )
              }
            />
          ))}
        </Rows>
      )}
    </Widget>
  );
}

export function TasksWidget({ data }: { data: NonNullable<Dashboard['myTasks']> }) {
  const { base, churchId } = useChurch();
  const { t, formatDate } = useI18n();
  const complete = useMutationToast(useCompleteMyTask(churchId), {
    success: t('dashboard.taskDone'),
  });
  return (
    <Widget
      icon={HandHeart}
      tone="rose"
      title={t('dashboard.myTasks')}
      hint={
        data.openCount > 0 ? (
          <>
            {t('dashboard.myTasksHint', { count: data.openCount })}
            {data.overdueCount > 0
              ? ` · ${data.overdueCount} ${t('dashboard.overdue').toLowerCase()}`
              : ''}
          </>
        ) : undefined
      }
      action={<SeeAll to={`${base}/care/tasks`} label={t('dashboard.openTasks')} />}
    >
      {data.items.length === 0 ? (
        <Empty
          icon={HandHeart}
          tone="rose"
          title={t('dashboard.noTasks')}
          description={t('dashboard.noTasksHint')}
        />
      ) : (
        <Rows>
          {data.items.map((task) => (
            <li key={task.id} className="flex min-h-14 items-center gap-2 pl-2 sm:pl-3">
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 rounded-full text-muted-foreground hover:text-success"
                aria-label={t('dashboard.markDone', { title: task.title })}
                title={t('dashboard.markDone', { title: task.title })}
                disabled={!task.canComplete}
                onClick={() => void complete.run({ id: task.id })}
              >
                <span className="flex size-5 items-center justify-center rounded-full border-2 border-current">
                  <Check className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </Button>
              <Link
                to={`${base}/care/tasks`}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 outline-none sm:pr-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{task.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {task.person ? `${fullName(task.person)} · ` : ''}
                    {task.dueDate
                      ? t('dashboard.due', { date: formatDate(task.dueDate, 'dayMonth') })
                      : t('dashboard.noDueDate')}
                  </span>
                </span>
                {task.isOverdue ? (
                  <StatusBadge tone="danger" size="sm">
                    {t('dashboard.overdue')}
                  </StatusBadge>
                ) : null}
              </Link>
            </li>
          ))}
        </Rows>
      )}
    </Widget>
  );
}

export function KidsWidget({ items }: { items: NonNullable<Dashboard['myKids']> }) {
  const { base } = useChurch();
  const { t, formatTime } = useI18n();
  return (
    <Widget
      icon={Baby}
      tone="sun"
      title={t('dashboard.myKids')}
      hint={items.length > 0 ? t('dashboard.myKidsHint') : undefined}
      action={<SeeAll to={`${base}/checkin/me`} label={t('dashboard.openCheckin')} />}
    >
      {items.length === 0 ? (
        <Empty
          icon={Baby}
          tone="sun"
          title={t('dashboard.noKids')}
          description={t('dashboard.noKidsHint')}
        />
      ) : (
        <Rows>
          {items.map((checkin) => (
            <Row
              key={checkin.id}
              leading={<EntityAvatar name={fullName(checkin.child)} src={checkin.child.photoUrl} />}
              title={fullName(checkin.child)}
              subtitle={`${checkin.className} · ${t('dashboard.checkedInAt', { time: formatTime(checkin.checkedInAt) })}`}
              trailing={
                checkin.securityCode ? (
                  <span
                    data-tone="sun"
                    className="flex flex-col items-end rounded-lg bg-tone-soft px-2.5 py-1 text-tone-ink"
                  >
                    <span className="text-[10px] font-semibold uppercase">
                      <ShieldCheck className="mr-0.5 inline size-3" aria-hidden />
                      {t('dashboard.securityCode')}
                    </span>
                    <span className="font-mono text-base font-bold tracking-widest">
                      {checkin.securityCode}
                    </span>
                  </span>
                ) : null
              }
            />
          ))}
        </Rows>
      )}
    </Widget>
  );
}

export function EventsWidget({ items }: { items: NonNullable<Dashboard['upcomingEvents']> }) {
  const { base, access } = useChurch();
  const { t, formatDateRange } = useI18n();
  return (
    <Widget
      icon={CalendarDays}
      tone="amber"
      title={t('dashboard.upcomingEvents')}
      action={<SeeAll to={`${base}/events`} />}
    >
      {items.length === 0 ? (
        <Empty
          icon={CalendarDays}
          tone="amber"
          title={t('dashboard.nothingScheduled')}
          description={t('dashboard.nothingScheduledHint')}
          action={
            can.createAnyEvent(access) ? (
              <Button asChild size="sm">
                <Link to={`${base}/events/new`}>
                  <Plus />
                  {t('dashboard.newEvent')}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Rows>
          {items.map((event) => (
            <Row
              key={event.id}
              to={`${base}/events/${event.id}`}
              leading={<DateChip value={event.startsAt} />}
              title={event.title}
              subtitle={formatDateRange(event.startsAt, event.endsAt, event.isAllDay)}
              trailing={
                event.groupName ? (
                  <StatusBadge tone="neutral" size="sm" className="hidden sm:inline-flex">
                    {event.groupName}
                  </StatusBadge>
                ) : null
              }
            />
          ))}
        </Rows>
      )}
    </Widget>
  );
}

export function AnnouncementsWidget({ data }: { data: NonNullable<Dashboard['announcements']> }) {
  const { base, access } = useChurch();
  const { t, formatRelative } = useI18n();
  const empty = data.pinned.length === 0 && data.latest.length === 0;
  return (
    <Widget
      icon={Megaphone}
      tone="brand"
      title={t('dashboard.latestAnnouncements')}
      action={<SeeAll to={`${base}/announcements`} />}
    >
      {empty ? (
        <Empty
          icon={Megaphone}
          tone="brand"
          title={t('dashboard.noAnnouncements')}
          description={t('dashboard.noAnnouncementsHint')}
          action={
            can.createAnyAnnouncement(access) ? (
              <Button asChild size="sm">
                <Link to={`${base}/announcements/new`}>
                  <Plus />
                  {t('dashboard.newAnnouncement')}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {data.pinned.length > 0 ? (
            <div className="flex flex-col gap-2 px-4 pb-3 sm:px-5">
              {data.pinned.map((announcement) => (
                <Link
                  key={announcement.id}
                  to={`${base}/announcements/${announcement.id}`}
                  data-tone="brand"
                  className="pressable flex flex-col gap-1 rounded-xl border border-tone/25 bg-tone-soft/60 p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-tone-ink uppercase">
                    <Pin className="size-3" aria-hidden />
                    {t('dashboard.pinned')}
                  </span>
                  <span className="line-clamp-1 text-sm font-semibold">{announcement.title}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {announcement.body}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          {data.latest.length > 0 ? (
            <Rows>
              {data.latest.map((announcement) => (
                <Row
                  key={announcement.id}
                  to={`${base}/announcements/${announcement.id}`}
                  title={announcement.title}
                  subtitle={`${announcement.authorName} · ${formatRelative(announcement.publishedAt ?? announcement.createdAt)}`}
                />
              ))}
            </Rows>
          ) : null}
        </>
      )}
    </Widget>
  );
}

export function CelebrationsWidget({ items }: { items: NonNullable<Dashboard['celebrations']> }) {
  const { base } = useChurch();
  const { t, formatDate } = useI18n();
  const when = (inDays: number) =>
    inDays === 0
      ? t('dashboard.today')
      : inDays === 1
        ? t('dashboard.tomorrow')
        : t('dashboard.inDays', { count: inDays });
  return (
    <Widget
      icon={Cake}
      tone="rose"
      title={t('dashboard.birthdays')}
      hint={t('dashboard.birthdaysHint')}
    >
      {items.length === 0 ? (
        <Empty
          icon={Cake}
          tone="rose"
          title={t('dashboard.noCelebrations')}
          description={t('dashboard.noCelebrationsHint')}
        />
      ) : (
        <Rows>
          {items.map((item) => {
            const name = fullName(item.person);
            const birthday = item.kind === 'birthday';
            return (
              <Row
                key={`${item.kind}-${item.person.id}`}
                to={`${base}/people/${item.person.id}`}
                leading={
                  <span className="relative">
                    <EntityAvatar name={name} src={item.person.photoUrl} />
                    <span
                      data-tone={birthday ? 'rose' : 'violet'}
                      className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-tone text-tone-foreground ring-2 ring-card"
                      aria-hidden
                    >
                      {birthday ? <Cake className="size-3" /> : <Heart className="size-3" />}
                    </span>
                  </span>
                }
                title={name}
                subtitle={`${birthday ? t('dashboard.birthday') : t('dashboard.anniversary')} · ${
                  birthday
                    ? t('dashboard.turnsYears', { count: item.years })
                    : t('dashboard.marriedYears', { count: item.years })
                }`}
                trailing={
                  <span className="text-right text-xs">
                    <span
                      className={cn(
                        'block font-semibold',
                        item.inDays === 0 ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {when(item.inDays)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDate(item.date, { preset: 'dayMonth', smartYear: false })}
                    </span>
                  </span>
                }
              />
            );
          })}
        </Rows>
      )}
    </Widget>
  );
}

export function AttendanceWidget({ data }: { data: Dashboard['attendance'] }) {
  const { base, access } = useChurch();
  const { t, formatPercent, formatNumber, formatDate } = useI18n();
  const mine = data.mine;
  const absent = mine ? mine.currentAbsentStreak > 0 : false;
  const recent = data.recent ? [...data.recent].reverse() : null;
  return (
    <Widget
      icon={ClipboardCheck}
      tone="teal"
      title={t('dashboard.attendance')}
      action={
        <SeeAll
          to={`${base}/attendance${has(access, 'attendance.view') || data.recent ? '' : '/me'}`}
          label={t('dashboard.openAttendance')}
        />
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
        {mine ? (
          <Link
            to={`${base}/attendance/me`}
            className="pressable flex items-center gap-3 rounded-xl border border-border/70 p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <ToneIcon icon={Flame} tone={absent ? 'danger' : 'success'} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t('dashboard.myStreak')}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {mine.currentPresentStreak === 0 && mine.currentAbsentStreak === 0
                  ? t('dashboard.noMarks')
                  : absent
                    ? t('dashboard.myStreakAbsent', { count: mine.currentAbsentStreak })
                    : t('dashboard.myStreakPresent', { count: mine.currentPresentStreak })}
              </span>
            </span>
            <span className="text-sm font-bold tabular">{formatPercent(mine.presentRate)}</span>
          </Link>
        ) : null}
        {recent && recent.length > 0 ? (
          <div className="flex items-end justify-between gap-3 rounded-xl border border-border/70 p-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('dashboard.recentAttendance')}</p>
              <p className="text-2xl font-bold tracking-tight tabular">
                {formatNumber(recent[recent.length - 1]?.attendeeCount ?? 0)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {recent[recent.length - 1]?.title} ·{' '}
                {formatDate(recent[recent.length - 1]?.sessionAt, 'dayMonth')}
              </p>
            </div>
            <Sparkline
              values={recent.map((session) => session.attendeeCount)}
              width={112}
              height={40}
            />
          </div>
        ) : null}
        {data.openAbsences !== null ? (
          <Link
            to={`${base}/attendance/absences`}
            data-tone={data.openAbsences > 0 ? 'danger' : 'success'}
            className="pressable flex items-center gap-3 rounded-xl bg-tone-soft p-3 text-tone-ink outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <BellRing className="size-4 shrink-0" aria-hidden />
            <span className="text-sm font-medium">
              {data.openAbsences > 0
                ? t('dashboard.openAbsences', { count: data.openAbsences })
                : t('dashboard.noAbsences')}
            </span>
          </Link>
        ) : null}
        {!mine && (!recent || recent.length === 0) && data.openAbsences === null ? (
          <p className="text-sm text-muted-foreground">{t('dashboard.noMarks')}</p>
        ) : null}
      </div>
    </Widget>
  );
}

export function GroupsWidget({ items }: { items: Dashboard['myGroups'] }) {
  const { base } = useChurch();
  const { t } = useI18n();
  return (
    <Widget icon={UsersRound} tone="violet" title={t('dashboard.myGroups')}>
      <Rows>
        {items.map((group) => (
          <Row
            key={group.id}
            to={`${base}/groups/${group.id}`}
            leading={<ToneIcon icon={UsersRound} tone="violet" size="sm" />}
            title={group.name}
            trailing={
              group.isLeader ? (
                <StatusBadge tone="violet" size="sm">
                  {t('dashboard.leader')}
                </StatusBadge>
              ) : null
            }
          />
        ))}
      </Rows>
    </Widget>
  );
}
