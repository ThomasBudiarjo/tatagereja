import {
  ROSTER_CONFLICT_LABELS,
  ROSTER_STATUS_LABELS,
  SERVICE_STATUS_LABELS,
  fullName,
  localize,
  type PersonSummary,
  type RosterConflict,
  type RosterStatus,
  type ServiceStatus,
  type WorshipService,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarOff,
  CircleCheck,
  CircleX,
  Clock,
  Hourglass,
  MapPin,
  Repeat,
  TriangleAlert,
  UserRoundX,
} from 'lucide-react';
import { useEffect, useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { Link, NavLink } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Tone } from '@/components/ui/tone';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { worshipPeopleQuery } from './api';
import {
  ROSTER_STATUS_TONES,
  SERVICE_STATUS_TONES,
  WORSHIP_TONE,
  preacherOf,
  useChurchTime,
  useDuration,
} from './worship-lib';

const ROSTER_STATUS_ICONS: Record<RosterStatus, ComponentType<{ className?: string }>> = {
  pending: Hourglass,
  accepted: CircleCheck,
  declined: CircleX,
};

/** The sub navigation shared by every worship page. */
export function WorshipNav() {
  const { base } = useChurch();
  const { t } = useI18n();
  const items: { to: string; label: MessageKey; end?: boolean }[] = [
    { to: `${base}/worship`, label: 'worship.tabOverview', end: true },
    { to: `${base}/worship/services`, label: 'worship.tabServices' },
    { to: `${base}/worship/songs`, label: 'worship.tabSongs' },
    { to: `${base}/worship/teams`, label: 'worship.tabTeams' },
    { to: `${base}/worship/me`, label: 'worship.tabMine' },
  ];
  const ref = useRef<HTMLElement>(null);
  // On phones the strip scrolls; keep the current section in view.
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);
  return (
    <nav
      ref={ref}
      aria-label={t('worship.sectionNav')}
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

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={SERVICE_STATUS_TONES[status]} dot size="sm">
      {localize(SERVICE_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

export function RosterStatusBadge({ status }: { status: RosterStatus }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={ROSTER_STATUS_TONES[status]} icon={ROSTER_STATUS_ICONS[status]} size="sm">
      {localize(ROSTER_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

const CONFLICT_STYLE: Record<
  RosterConflict['kind'],
  { tone: Tone; icon: ComponentType<{ className?: string }> }
> = {
  double_booked: { tone: 'warning', icon: Repeat },
  blockout: { tone: 'warning', icon: CalendarOff },
  declined: { tone: 'danger', icon: TriangleAlert },
  not_in_team: { tone: 'info', icon: UserRoundX },
};

/** Warnings on an assignment or candidate; `declined` is left out where the status says it. */
export function ConflictBadges({
  conflicts,
  hideDeclined = false,
  className,
}: {
  conflicts: readonly RosterConflict[];
  hideDeclined?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const shown = conflicts.filter((conflict) => !(hideDeclined && conflict.kind === 'declined'));
  if (shown.length === 0) return null;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {shown.map((conflict, index) => {
        const style = CONFLICT_STYLE[conflict.kind];
        const label = localize(ROSTER_CONFLICT_LABELS[conflict.kind], locale);
        return (
          <StatusBadge
            key={`${conflict.kind}-${index}`}
            tone={style.tone}
            icon={style.icon}
            size="sm"
            className="max-w-full whitespace-normal"
            title={conflict.detail ? `${label}: ${conflict.detail}` : label}
          >
            <span className="truncate">
              {label}
              {conflict.detail && conflict.kind !== 'declined' ? ` · ${conflict.detail}` : ''}
            </span>
          </StatusBadge>
        );
      })}
    </span>
  );
}

/** A calendar tile: weekday, day and month of a service. */
export function DateTile({
  iso,
  tone = WORSHIP_TONE,
  muted = false,
  className,
}: {
  iso: string;
  tone?: Tone;
  muted?: boolean;
  className?: string;
}) {
  const { formatDate } = useI18n();
  return (
    <div
      data-tone={muted ? 'neutral' : tone}
      aria-hidden
      className={cn(
        'flex w-14 shrink-0 flex-col items-center overflow-hidden rounded-xl border border-tone/20 bg-card text-center shadow-xs',
        className,
      )}
    >
      <span className="w-full bg-tone-soft py-0.5 text-[10px] font-bold tracking-wide text-tone-ink uppercase">
        {formatDate(iso, 'weekdayShort')}
      </span>
      <span className="pt-1 text-xl leading-none font-bold tabular">
        {formatDate(iso, { options: { day: 'numeric' } })}
      </span>
      <span className="pb-1.5 text-[11px] font-medium text-muted-foreground">
        {formatDate(iso, { options: { month: 'short' } })}
      </span>
    </div>
  );
}

/** Accepted / total as a slim bar. */
export function RosterProgress({
  accepted,
  total,
  className,
}: {
  accepted: number;
  total: number;
  className?: string;
}) {
  const { t } = useI18n();
  if (total === 0) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>
        {t('worship.rosterEmpty')}
      </span>
    );
  }
  const share = Math.round((accepted / total) * 100);
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <span
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={accepted}
        aria-label={t('worship.rosterProgress', { accepted, total })}
      >
        <span
          data-tone={share === 100 ? 'success' : WORSHIP_TONE}
          className="block h-full rounded-full bg-tone transition-[width] duration-300"
          style={{ width: `${share}%` }}
        />
      </span>
      <span className="truncate text-xs text-muted-foreground tabular">
        {t('worship.rosterProgress', { accepted, total })}
      </span>
    </span>
  );
}

/** One service as a row: date tile, title, time, place, preacher and roster progress. */
export function ServiceRow({
  service,
  className,
}: {
  service: WorshipService;
  className?: string;
}) {
  const { base } = useChurch();
  const { formatTime, t } = useI18n();
  const duration = useDuration();
  const preacher = preacherOf(service);
  const cancelled = service.status === 'cancelled';
  return (
    <Link
      to={`${base}/worship/services/${service.id}`}
      className={cn(
        'group flex min-w-0 items-start gap-3.5 rounded-xl border border-border/70 bg-card p-3.5 shadow-soft outline-none pressable hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:p-4',
        className,
      )}
    >
      <DateTile iso={service.startsAt} muted={cancelled} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className={cn(
              'min-w-0 truncate font-semibold tracking-tight',
              cancelled && 'text-muted-foreground line-through',
            )}
          >
            {service.title}
          </p>
          {service.status !== 'published' ? <ServiceStatusBadge status={service.status} /> : null}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular">
            <Clock className="size-3.5" aria-hidden />
            {formatTime(service.startsAt)}
            {service.endsAt ? `–${formatTime(service.endsAt)}` : ''}
          </span>
          {service.location ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{service.location}</span>
            </span>
          ) : null}
          {service.totalMinutes > 0 ? <span>{duration(service.totalMinutes)}</span> : null}
        </p>
        {service.theme || preacher ? (
          <p className="truncate text-sm">
            {service.theme ? <span className="italic">“{service.theme}”</span> : null}
            {service.theme && preacher ? <span className="text-muted-foreground"> · </span> : null}
            {preacher ? <span className="text-muted-foreground">{preacher}</span> : null}
          </p>
        ) : null}
        <RosterProgress
          accepted={service.rosterAccepted}
          total={service.rosterTotal}
          className="mt-0.5"
        />
      </div>
      <span className="sr-only">{t('common.open')}</span>
    </Link>
  );
}

export function PersonChip({ person, size = 'sm' }: { person: PersonSummary; size?: 'xs' | 'sm' }) {
  const name = fullName(person);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <EntityAvatar name={name} src={person.photoUrl} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * A searchable person picker backed by the worship people search (planners, schedulers and
 * team leaders). Pass `initial` so the chosen person's name shows before any search.
 */
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
  const [search, setSearch] = useState('');
  const query = useQuery(worshipPeopleQuery(churchId, search));
  const found = query.data?.items ?? [];
  const people = [
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
      placeholder={placeholder}
      aria-invalid={invalid}
      options={people.map((person) => ({
        value: person.id,
        label: fullName(person),
        leading: <EntityAvatar name={fullName(person)} src={person.photoUrl} size="xs" />,
      }))}
    />
  );
}

/**
 * A date and time picker in the church time zone (the zone every service is shown in), so a
 * planner on a device set to another zone still plans 07:00 church time. Values are ISO.
 */
export function ChurchDateTimeInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (iso: string) => void;
}) {
  const { toInput, fromInput } = useChurchTime();
  return (
    <Input
      type="datetime-local"
      value={toInput(value)}
      onChange={(event) => onChange(fromInput(event.target.value))}
      {...props}
    />
  );
}
