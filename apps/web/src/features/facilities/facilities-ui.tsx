import {
  ASSET_CONDITION_LABELS,
  ASSET_STATUS_LABELS,
  BOOKING_STATUS_LABELS,
  DEFAULT_TIMEZONE,
  canViewFacilities,
  canViewInventory,
  fullName,
  localize,
  type AssetCondition,
  type AssetStatus,
  type BookingConflict,
  type BookingOccurrence,
  type BookingStatus,
  type FacilityResource,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleDot,
  CircleX,
  Clock,
  Hourglass,
  Repeat,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { Link, NavLink } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { useDebounced } from '@/lib/use-debounced';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { peopleQuery } from './api';
import {
  ASSET_CONDITION_TONES,
  ASSET_STATUS_TONES,
  BOOKING_STATUS_TONES,
  RESOURCE_KIND_ICONS,
  fromZonedInput,
  minutesInDay,
  resourceTone,
  toZonedInput,
} from './facilities-lib';

const BOOKING_STATUS_ICONS: Record<BookingStatus, ComponentType<{ className?: string }>> = {
  pending: Hourglass,
  approved: CircleCheck,
  rejected: CircleX,
  cancelled: CircleX,
};

/** The sub navigation shared by every facilities page; sections the caller cannot use are left out. */
export function FacilitiesNav() {
  const { base, access } = useChurch();
  const { t } = useI18n();
  const facilities = canViewFacilities(access);
  const inventory = canViewInventory(access);
  const items: { to: string; label: MessageKey; end?: boolean; show: boolean }[] = [
    { to: `${base}/facilities`, label: 'facilities.tabOverview', end: true, show: true },
    { to: `${base}/facilities/rooms`, label: 'facilities.tabRooms', show: facilities },
    { to: `${base}/facilities/schedule`, label: 'facilities.tabSchedule', show: facilities },
    { to: `${base}/facilities/bookings`, label: 'facilities.tabBookings', show: facilities },
    { to: `${base}/facilities/inventory`, label: 'facilities.tabInventory', show: inventory },
    { to: `${base}/facilities/loans`, label: 'facilities.tabLoans', show: inventory },
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
      aria-label={t('facilities.sectionNav')}
      data-print="hide"
      className="-mx-4 -mt-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max gap-1 rounded-xl bg-muted p-1">
        {items
          .filter((item) => item.show)
          .map((item) => (
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

export function BookingStatusBadge({
  status,
  size = 'sm',
}: {
  status: BookingStatus;
  size?: 'sm' | 'md';
}) {
  const { locale } = useI18n();
  return (
    <StatusBadge
      tone={BOOKING_STATUS_TONES[status]}
      icon={BOOKING_STATUS_ICONS[status]}
      size={size}
    >
      {localize(BOOKING_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={ASSET_STATUS_TONES[status]} dot size="sm">
      {localize(ASSET_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

export function ConditionBadge({ condition }: { condition: AssetCondition }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={ASSET_CONDITION_TONES[condition]} size="sm">
      {localize(ASSET_CONDITION_LABELS[condition], locale)}
    </StatusBadge>
  );
}

/** A resource's photo, or its kind icon on its colour. */
export function ResourceThumb({
  resource,
  className,
}: {
  resource: Pick<FacilityResource, 'name' | 'kind' | 'photoUrl' | 'color'>;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = RESOURCE_KIND_ICONS[resource.kind];
  if (resource.photoUrl && !failed) {
    return (
      <img
        src={resource.photoUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('size-12 shrink-0 rounded-xl object-cover', className)}
      />
    );
  }
  return (
    <span
      data-tone={resourceTone(resource.kind)}
      aria-hidden
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded-xl bg-tone-soft text-tone-ink',
        className,
      )}
      style={resource.color ? { color: resource.color } : undefined}
    >
      <Icon className="size-[45%]" />
    </span>
  );
}

/** "Available now" or "In use until 12:00 · Rapat Majelis". */
export function AvailabilityBadge({
  resource,
  size = 'sm',
}: {
  resource: Pick<FacilityResource, 'availableNow' | 'currentBooking' | 'isActive'>;
  size?: 'sm' | 'md';
}) {
  const { t, formatTime } = useI18n();
  if (!resource.isActive) {
    return (
      <StatusBadge tone="neutral" size={size}>
        {t('facilities.inactive')}
      </StatusBadge>
    );
  }
  if (resource.availableNow || !resource.currentBooking) {
    return (
      <StatusBadge tone="success" dot size={size}>
        {t('facilities.availableNow')}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="warning" icon={CircleDot} size={size} title={resource.currentBooking.title}>
      {t('facilities.inUseUntil', { time: formatTime(resource.currentBooking.endsAt) })}
    </StatusBadge>
  );
}

export function CapacityLabel({ capacity }: { capacity: number | null }) {
  const { t } = useI18n();
  if (!capacity) return null;
  return (
    <span className="inline-flex items-center gap-1 tabular">
      <Users className="size-3.5" aria-hidden />
      {t('facilities.capacityValue', { count: capacity })}
    </span>
  );
}

/** Approved bookings that overlap, in plain words. */
export function ConflictList({
  conflicts,
  className,
}: {
  conflicts: readonly BookingConflict[];
  className?: string;
}) {
  const { t, formatDateRange } = useI18n();
  const { base } = useChurch();
  if (conflicts.length === 0) return null;
  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {conflicts.map((conflict) => (
        <li
          key={`${conflict.bookingId}-${conflict.startsAt}`}
          className="flex items-start gap-2 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-tone-ink" aria-hidden />
          <span className="min-w-0">
            <Link
              to={`${base}/facilities/bookings/${conflict.bookingId}`}
              className="font-medium underline-offset-2 hover:underline"
            >
              {conflict.title}
            </Link>
            <span className="text-muted-foreground">
              {' · '}
              {formatDateRange(conflict.startsAt, conflict.endsAt)}
              {conflict.requesterName
                ? ` · ${t('facilities.bookedBy', { name: conflict.requesterName })}`
                : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A person search for custodians and borrowers (managers only). */
export function PersonPicker({
  id,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const results = useQuery(peopleQuery(churchId, { q }));
  const selected = useQuery({
    ...peopleQuery(churchId, { ids: value ? [value] : [] }),
    enabled: !!value,
  });
  const people = [...(selected.data?.items ?? []), ...(results.data?.items ?? [])].filter(
    (person, index, all) => all.findIndex((other) => other.id === person.id) === index,
  );
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      clearable
      aria-invalid={invalid}
      loading={results.isFetching}
      onSearchChange={setSearch}
      placeholder={placeholder ?? t('facilities.choosePerson')}
      searchPlaceholder={t('facilities.searchPeople')}
      emptyText={t('facilities.noPeopleFound')}
      options={people.map((person) => ({
        value: person.id,
        label: fullName(person),
        leading: <EntityAvatar name={fullName(person)} src={person.photoUrl} size="xs" />,
      }))}
    />
  );
}

const HOUR_START = 6;
const HOUR_END = 22;

/**
 * One day of one resource as a horizontal strip of hours (06:00–22:00, widened when bookings
 * fall outside), with each occurrence as a coloured block. Scrolls sideways on phones.
 */
export function DayTimeline({
  day,
  occurrences,
  timeZone,
  nowIso,
  onSelect,
  hrefFor,
  compact = false,
}: {
  day: string;
  occurrences: readonly BookingOccurrence[];
  timeZone: string;
  nowIso: string;
  onSelect?: (startMinutes: number) => void;
  hrefFor: (occurrence: BookingOccurrence) => string;
  compact?: boolean;
}) {
  const { t, formatTime } = useI18n();
  const spans = occurrences.map((item) => ({
    item,
    start: minutesInDay(item.startsAt, day, timeZone),
    end: minutesInDay(item.endsAt, day, timeZone),
  }));
  const first = Math.min(HOUR_START, ...spans.map((span) => Math.floor(span.start / 60)));
  const last = Math.max(HOUR_END, ...spans.map((span) => Math.ceil(span.end / 60)));
  const hours = Array.from({ length: last - first }, (_, index) => first + index);
  const total = (last - first) * 60;
  const position = (minutes: number) => ((minutes - first * 60) / total) * 100;
  const now = minutesInDay(nowIso, day, timeZone);
  const showNow = now > first * 60 && now < last * 60;
  // On phones the strip scrolls sideways: start at the first booking, else at the current hour.
  const scroller = useRef<HTMLDivElement>(null);
  const focusMinutes =
    spans.length > 0 ? Math.min(...spans.map((span) => span.start)) : showNow ? now : null;
  useEffect(() => {
    const element = scroller.current;
    if (!element || focusMinutes === null || element.scrollWidth <= element.clientWidth) return;
    const ratio = (focusMinutes - 60 - first * 60) / total;
    element.scrollLeft = Math.max(0, ratio * element.scrollWidth);
  }, [day, focusMinutes, first, total]);

  return (
    <div ref={scroller} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className={cn('relative min-w-[40rem]', compact ? 'h-14' : 'h-20')}>
        <div className="absolute inset-x-0 top-0 flex h-5 text-[10px] text-muted-foreground tabular">
          {hours.map((hour) => (
            <span key={hour} className="flex-1 border-l border-border/60 pl-1">
              {String(hour).padStart(2, '0')}
            </span>
          ))}
        </div>
        <div className="absolute inset-x-0 top-5 bottom-0 flex rounded-lg bg-sunken/70">
          {hours.map((hour) =>
            onSelect ? (
              <button
                key={hour}
                type="button"
                onClick={() => onSelect(hour * 60)}
                className="flex-1 border-l border-border/50 transition-colors hover:bg-tone-soft/60 focus-visible:bg-tone-soft focus-visible:outline-none"
                aria-label={t('facilities.bookAt', { time: `${String(hour).padStart(2, '0')}:00` })}
              />
            ) : (
              <span key={hour} className="flex-1 border-l border-border/50" aria-hidden />
            ),
          )}
        </div>
        {spans.map(({ item, start, end }) => (
          <Link
            key={`${item.bookingId}-${item.startsAt}`}
            to={hrefFor(item)}
            data-tone={item.status === 'pending' ? 'warning' : 'olive'}
            className={cn(
              'absolute top-6 bottom-1 flex min-w-1 animate-rise-in flex-col justify-center overflow-hidden rounded-md border px-2 text-left text-xs shadow-xs transition-[filter] hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
              item.status === 'pending'
                ? 'border-dashed border-tone bg-card text-tone-ink'
                : 'border-y-0 border-r-0 border-l-4 border-tone bg-tone-soft text-tone-ink',
            )}
            style={{
              left: `${position(start)}%`,
              width: `${Math.max(0.8, position(end) - position(start))}%`,
            }}
            title={`${item.title} · ${formatTime(item.startsAt)}–${formatTime(item.endsAt)}`}
          >
            <span className="truncate font-semibold">{item.title}</span>
            {!compact ? (
              <span className="truncate opacity-85 tabular">
                {formatTime(item.startsAt)}–{formatTime(item.endsAt)}
              </span>
            ) : null}
          </Link>
        ))}
        {showNow ? (
          <span
            className="pointer-events-none absolute top-4 bottom-0 w-0.5 rounded-full bg-destructive"
            style={{ left: `${position(now)}%` }}
            aria-hidden
          >
            <span className="absolute -top-1 -left-[3px] size-2 rounded-full bg-destructive" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A compact row for one occurrence (lists on phones, the overview, upcoming bookings). */
export function OccurrenceRow({
  occurrence,
  resourceName,
  to,
  showDate = true,
}: {
  occurrence: Pick<
    BookingOccurrence,
    'title' | 'startsAt' | 'endsAt' | 'status' | 'recurrence' | 'requesterName' | 'groupName'
  >;
  resourceName?: string;
  to: string;
  showDate?: boolean;
}) {
  const { t, formatTime, formatDate } = useI18n();
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-soft pressable hover:border-border"
    >
      <span
        data-tone={occurrence.status === 'pending' ? 'warning' : 'olive'}
        className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-tone-soft py-1.5 text-tone-ink"
      >
        <span className="text-sm leading-tight font-bold tabular">
          {formatTime(occurrence.startsAt)}
        </span>
        <span className="text-[11px] leading-tight opacity-80 tabular">
          {formatTime(occurrence.endsAt)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{occurrence.title}</span>
          {occurrence.recurrence === 'weekly' ? (
            <Repeat
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label={t('facilities.weekly')}
            />
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[
            showDate ? formatDate(occurrence.startsAt) : null,
            resourceName,
            occurrence.groupName ?? occurrence.requesterName,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      {occurrence.status !== 'approved' ? (
        <BookingStatusBadge status={occurrence.status} />
      ) : (
        <Clock className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
      )}
    </Link>
  );
}

/**
 * A date and time picker on the church's wall clock, so a booking made from a device set to
 * another zone still means 18:00 at church, matching the schedule. Values are ISO.
 */
export function ChurchDateTimeInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (iso: string) => void;
}) {
  const { church } = useChurch();
  const timeZone = church.timezone || DEFAULT_TIMEZONE;
  return (
    <Input
      type="datetime-local"
      value={toZonedInput(value, timeZone)}
      onChange={(event) => onChange(fromZonedInput(event.target.value, timeZone))}
      {...props}
    />
  );
}
