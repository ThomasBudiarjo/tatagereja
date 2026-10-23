import {
  ALERT_SEVERITY_LABELS,
  CHECKIN_SESSION_STATUS_LABELS,
  CHECKIN_STATUS_LABELS,
  CHILD_ALERT_KIND_LABELS,
  fullName,
  highestSeverity,
  localize,
  type Checkin,
  type CheckinSession,
  type CheckinSessionStatus,
  type CheckinStatus,
  type ChildAlert,
  type PersonSummary,
  type SessionClassStat,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, LogOut, TriangleAlert, Users } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { StatusBadge } from '@/components/ui/status-badge';
import { peopleListQuery } from '@/features/people/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  ALERT_KIND_ICONS,
  CHECKIN_STATUS_TONES,
  CHECKIN_TONE,
  SEVERITY_TONES,
  useCheckinAccess,
} from './checkin-lib';

/** The sub navigation shared by the volunteer pages of the module. */
export function CheckinNav() {
  const { base } = useChurch();
  const { t } = useI18n();
  const { canOperate } = useCheckinAccess();
  const items: { to: string; label: MessageKey; end?: boolean }[] = [
    { to: `${base}/checkin`, label: 'checkin.tabOverview', end: true },
    { to: `${base}/checkin/sessions`, label: 'checkin.tabSessions' },
    { to: `${base}/checkin/classes`, label: 'checkin.tabClasses' },
    { to: `${base}/checkin/children`, label: 'checkin.tabChildren' },
    { to: `${base}/checkin/me`, label: 'checkin.tabMine' },
  ];
  const ref = useRef<HTMLElement>(null);
  // On phones the strip scrolls; keep the current section in view.
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);
  if (!canOperate) return null;
  return (
    <nav
      ref={ref}
      aria-label={t('checkin.sectionNav')}
      data-print="hide"
      className="-mx-4 -mt-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max gap-1 rounded-xl bg-muted p-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                  isActive
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {t(item.label)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SessionStatusBadge({ status }: { status: CheckinSessionStatus }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={status === 'open' ? 'success' : 'neutral'} dot size="sm">
      {localize(CHECKIN_SESSION_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

export function CheckinStatusBadge({ status }: { status: CheckinStatus }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={CHECKIN_STATUS_TONES[status]} dot size="sm">
      {localize(CHECKIN_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

/** A small coloured dot for a class. */
export function ClassDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full bg-tone', className)}
      data-tone={color ? undefined : CHECKIN_TONE}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

/** One badge per active alert kind, coloured by the worst severity of that kind. */
export function AlertBadges({
  alerts,
  className,
  max = 3,
}: {
  alerts: readonly ChildAlert[];
  className?: string;
  max?: number;
}) {
  const { locale } = useI18n();
  const active = alerts.filter((alert) => alert.isActive);
  if (active.length === 0) return null;
  const kinds = [...new Set(active.map((alert) => alert.kind))];
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {kinds.slice(0, max).map((kind) => {
        const ofKind = active.filter((alert) => alert.kind === kind);
        const severity = highestSeverity(ofKind) ?? 'info';
        return (
          <StatusBadge
            key={kind}
            tone={SEVERITY_TONES[severity]}
            icon={ALERT_KIND_ICONS[kind]}
            size="sm"
            title={ofKind.map((alert) => alert.description).join(' · ')}
          >
            {localize(CHILD_ALERT_KIND_LABELS[kind], locale)}
          </StatusBadge>
        );
      })}
      {kinds.length > max ? (
        <StatusBadge tone="neutral" size="sm">
          +{kinds.length - max}
        </StatusBadge>
      ) : null}
    </span>
  );
}

/**
 * The full text of a child's active alerts, most severe first, for teachers on the roster and
 * at check-out. Custody alerts matter most at pick-up, so they are never truncated.
 */
export function AlertCallout({
  alerts,
  className,
}: {
  alerts: readonly ChildAlert[];
  className?: string;
}) {
  const { locale } = useI18n();
  const active = alerts.filter((alert) => alert.isActive);
  if (active.length === 0) return null;
  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {active.map((alert) => {
        const Icon = ALERT_KIND_ICONS[alert.kind];
        return (
          <li
            key={alert.id}
            data-tone={SEVERITY_TONES[alert.severity]}
            className="flex items-start gap-2.5 rounded-lg border border-tone/25 bg-tone-soft/70 px-3 py-2 text-sm"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-tone-ink" aria-hidden />
            <span className="min-w-0 flex-1 text-pretty">
              <span className="font-semibold text-tone-ink">
                {localize(CHILD_ALERT_KIND_LABELS[alert.kind], locale)}
                {alert.severity === 'critical'
                  ? ` · ${localize(ALERT_SEVERITY_LABELS.critical, locale)}`
                  : ''}
              </span>{' '}
              <span className="text-foreground">{alert.description}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A security code in large monospace letters (labels, the guardian card). */
export function SecurityCode({
  code,
  size = 'md',
  className,
}: {
  code: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      aria-label={t('checkin.codeAria', { code: code.split('').join(' ') })}
      className={cn(
        'inline-flex items-center justify-center rounded-lg border-2 border-dashed border-foreground/25 bg-card font-mono font-bold tracking-[0.25em] tabular',
        size === 'sm' && 'h-8 px-2 text-base',
        size === 'md' && 'h-12 px-3 text-2xl',
        size === 'lg' && 'h-16 px-4 text-4xl',
        className,
      )}
    >
      {code}
    </span>
  );
}

export function ChildAvatar({
  child,
  alerts = [],
  size = 'md',
}: {
  child: PersonSummary;
  alerts?: readonly ChildAlert[];
  size?: 'sm' | 'md' | 'lg';
}) {
  const severity = highestSeverity(alerts);
  return (
    <span className="relative shrink-0">
      <EntityAvatar name={fullName(child)} src={child.photoUrl} size={size} />
      {severity && severity !== 'info' ? (
        <span
          data-tone={SEVERITY_TONES[severity]}
          className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-tone text-white ring-2 ring-card"
          aria-hidden
        >
          <TriangleAlert className="size-2.5" />
        </span>
      ) : null}
    </span>
  );
}

/** A class tile in a session: headcount, teachers, alerts and the ratio warning. */
export function ClassStatTile({ stat, to }: { stat: SessionClassStat; to: string }) {
  const { t, formatNumber } = useI18n();
  const full = stat.capacity !== null && stat.presentCount >= stat.capacity;
  return (
    <Link
      to={to}
      className="group flex min-w-0 pressable flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      <div className="flex items-center gap-2">
        <ClassDot color={stat.color} />
        <span className="line-clamp-2 min-w-0 flex-1 leading-tight font-semibold tracking-tight">
          {stat.name}
        </span>
        <ChevronRight
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-3xl leading-none font-bold tracking-tight tabular">
          {formatNumber(stat.presentCount)}
          {stat.capacity !== null ? (
            <span className="text-base font-medium text-muted-foreground">
              {' '}
              / {formatNumber(stat.capacity)}
            </span>
          ) : null}
        </p>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3.5" aria-hidden />
          {t('checkin.teachersCount', { count: stat.teacherCount })}
        </span>
      </div>
      {stat.ratioExceeded || stat.alertCount > 0 || full ? (
        <div className="flex flex-wrap gap-1">
          {stat.ratioExceeded ? (
            <StatusBadge tone="warning" icon={TriangleAlert} size="sm">
              {t('checkin.ratioWarningShort')}
            </StatusBadge>
          ) : null}
          {full ? (
            <StatusBadge tone="danger" size="sm">
              {t('checkin.classFull')}
            </StatusBadge>
          ) : null}
          {stat.alertCount > 0 ? (
            <StatusBadge tone="rose" size="sm">
              {t('checkin.alertChildren', { count: stat.alertCount })}
            </StatusBadge>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

/** A searchable person picker over the church directory. */
export function PersonSelect({
  id,
  value,
  onChange,
  initial,
  excludeIds = [],
  placeholder,
  invalid,
}: {
  id?: string;
  value: string | null;
  onChange: (personId: string | null, person: PersonSummary | null) => void;
  initial?: PersonSummary | null;
  excludeIds?: readonly string[];
  placeholder?: string;
  invalid?: boolean;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const query = useQuery({
    ...peopleListQuery(churchId, { q: search || undefined, limit: 30 }),
    staleTime: 60_000,
  });
  const found = query.data?.items ?? [];
  const people: PersonSummary[] = [
    ...(initial && !found.some((person) => person.id === initial.id) ? [initial] : []),
    ...found,
  ].filter((person) => person.id === value || !excludeIds.includes(person.id));
  return (
    <Combobox
      id={id}
      value={value}
      onChange={(next) => onChange(next, people.find((person) => person.id === next) ?? null)}
      onSearchChange={setSearch}
      loading={query.isFetching}
      clearable
      placeholder={placeholder ?? t('checkin.choosePerson')}
      searchPlaceholder={t('checkin.searchPeople')}
      emptyText={t('checkin.nobodyFound')}
      aria-invalid={invalid}
      options={people.map((person) => ({
        value: person.id,
        label: fullName(person),
        leading: <EntityAvatar name={fullName(person)} src={person.photoUrl} size="xs" />,
      }))}
    />
  );
}

/** A calendar tile: weekday, day and month of a session. */
export function DateTile({ date, muted = false }: { date: string; muted?: boolean }) {
  const { formatDate } = useI18n();
  return (
    <div
      data-tone={muted ? 'neutral' : CHECKIN_TONE}
      aria-hidden
      className="flex w-14 shrink-0 flex-col items-center overflow-hidden rounded-xl border border-tone/20 bg-card text-center shadow-xs"
    >
      <span className="w-full bg-tone-soft py-0.5 text-[10px] font-bold tracking-wide text-tone-ink uppercase">
        {formatDate(date, 'weekdayShort')}
      </span>
      <span className="pt-1 text-xl leading-none font-bold tabular">
        {formatDate(date, { options: { day: 'numeric' } })}
      </span>
      <span className="pb-1.5 text-[11px] font-medium text-muted-foreground">
        {formatDate(date, { options: { month: 'short' } })}
      </span>
    </div>
  );
}

/** A session in a list: date, name, status and how many children came. */
export function SessionRow({ session }: { session: CheckinSession }) {
  const { base } = useChurch();
  const { t, formatDate, formatNumber } = useI18n();
  return (
    <Link
      to={`${base}/checkin/sessions/${session.id}`}
      className="flex min-w-0 pressable items-center gap-3.5 rounded-xl border border-border/70 bg-card p-3 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      <DateTile date={session.date} muted={session.status === 'closed'} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold tracking-tight">{session.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {formatDate(session.date, 'dateLong')}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <SessionStatusBadge status={session.status} />
          <span className="text-xs text-muted-foreground">
            {session.status === 'open'
              ? t('checkin.inClassOfTotal', {
                  present: formatNumber(session.checkedInCount),
                  total: formatNumber(session.totalCount),
                })
              : t('checkin.childrenCount', { count: session.totalCount })}
          </span>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/**
 * A checked-in child in a list: avatar with the alert marker, class, times, alert badges and
 * the check-out button while the child is in class.
 */
export function CheckinListRow({
  checkin,
  showClass = true,
  onCheckOut,
  actions,
  alertsInFull = false,
}: {
  checkin: Checkin;
  showClass?: boolean;
  onCheckOut?: () => void;
  actions?: ReactNode;
  /** Teachers on the roster read the whole alert text, not only the badges. */
  alertsInFull?: boolean;
}) {
  const { t, formatTime } = useI18n();
  const inClass = checkin.status === 'checked_in';
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-center gap-3">
        <ChildAvatar child={checkin.child} alerts={checkin.alerts} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-medium', !inClass && 'text-muted-foreground')}>
            {fullName(checkin.child)}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {checkin.securityCode ? (
              <span className="shrink-0 rounded bg-muted px-1.5 font-mono font-semibold tracking-widest text-foreground">
                {checkin.securityCode}
              </span>
            ) : null}
            <span className="truncate">
              {[
                showClass ? checkin.className : null,
                inClass
                  ? t('checkin.inSince', { time: formatTime(checkin.checkedInAt) })
                  : t('checkin.outAt', {
                      time: formatTime(checkin.checkedOutAt),
                      name: checkin.pickupName ?? '—',
                    }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
          {!alertsInFull ? <AlertBadges alerts={checkin.alerts} className="mt-1" /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {inClass && onCheckOut ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onCheckOut}
              aria-label={t('checkin.checkOutChild', { name: fullName(checkin.child) })}
            >
              <LogOut />
              <span className="hidden sm:inline">{t('checkin.checkOut')}</span>
            </Button>
          ) : !inClass ? (
            <span className="hidden sm:inline-flex">
              <CheckinStatusBadge status={checkin.status} />
            </span>
          ) : null}
          {actions}
        </div>
      </div>
      {alertsInFull ? <AlertCallout alerts={checkin.alerts} className="sm:pl-13" /> : null}
    </li>
  );
}
