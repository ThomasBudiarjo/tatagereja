import type { EventDetails } from '@tatagereja/shared';
import { CalendarCheck, Hourglass, MapPin, Repeat, Users, XCircle } from 'lucide-react';
import { Link } from 'react-router';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { EVENT_TONE, registrationBadge } from './event-lib';

/** The calendar-page tile: weekday, day and month, coloured by the event. */
export function EventDateTile({
  startsAt,
  color,
  muted = false,
  size = 'md',
}: {
  startsAt: string;
  color?: string | null;
  muted?: boolean;
  size?: 'md' | 'lg';
}) {
  const { formatDate } = useI18n();
  return (
    <span
      data-tone={muted ? 'neutral' : EVENT_TONE}
      className={cn(
        'relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl bg-tone-soft text-tone-ink',
        size === 'md' ? 'w-12 py-1.5' : 'w-16 py-2.5',
      )}
      aria-hidden
    >
      {color && !muted ? (
        <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
      ) : null}
      <span className="text-[10px] font-semibold uppercase">
        {formatDate(startsAt, 'weekdayShort')}
      </span>
      <span
        className={cn('leading-tight font-bold tabular', size === 'md' ? 'text-lg' : 'text-2xl')}
      >
        {formatDate(startsAt, { options: { day: 'numeric' } })}
      </span>
      <span className="text-[10px] font-medium uppercase opacity-80">
        {formatDate(startsAt, { options: { month: 'short' } })}
      </span>
    </span>
  );
}

/** Status chips of an event: cancelled, registration and the caller's own place. */
export function EventBadges({ event }: { event: EventDetails }) {
  const { t, formatNumber } = useI18n();
  const registration = registrationBadge(event);
  return (
    <>
      {event.cancelledAt ? (
        <StatusBadge tone="danger" icon={XCircle} size="sm">
          {t('events.cancelled')}
        </StatusBadge>
      ) : null}
      {event.myRegistration?.status === 'registered' ? (
        <StatusBadge tone="success" icon={CalendarCheck} size="sm">
          {event.myRegistration.checkedInAt ? t('events.checkedIn') : t('events.youAreRegistered')}
        </StatusBadge>
      ) : event.myRegistration?.status === 'waitlisted' ? (
        <StatusBadge tone="warning" icon={Hourglass} size="sm">
          {t('events.waitlistNumber', { position: event.myRegistration.waitlistPosition ?? 0 })}
        </StatusBadge>
      ) : event.myRsvp === 'going' ? (
        <StatusBadge tone="success" icon={CalendarCheck} size="sm">
          {t('events.youAreGoing')}
        </StatusBadge>
      ) : registration ? (
        <StatusBadge tone={registration.tone} dot size="sm">
          {t(registration.key, {
            count: registration.params?.count ?? 0,
            value: formatNumber(registration.params?.count ?? 0),
          })}
        </StatusBadge>
      ) : null}
    </>
  );
}

/** A row of the events list. */
export function EventCard({ event, to }: { event: EventDetails; to: string }) {
  const { t, formatDateRange, formatNumber } = useI18n();
  const cancelled = !!event.cancelledAt;
  const attending = event.registrationRequired ? event.registeredCount : event.goingCount;
  return (
    <Link
      to={to}
      className="group pressable flex items-center gap-3.5 rounded-xl border border-border/70 bg-card p-3.5 shadow-soft outline-none transition-colors hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:p-4"
    >
      <EventDateTile startsAt={event.startsAt} color={event.coverColor} muted={cancelled} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className={cn(
            'flex min-w-0 items-center gap-1.5 font-semibold tracking-tight',
            cancelled && 'text-muted-foreground line-through',
          )}
        >
          <span className="truncate">{event.title}</span>
          {event.seriesId ? (
            <Repeat
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label={t('events.recurring')}
            />
          ) : null}
        </p>
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          <span>{formatDateRange(event.startsAt, event.endsAt, event.isAllDay)}</span>
          {event.location ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{event.location}</span>
            </span>
          ) : null}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <EventBadges event={event} />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {event.groupName ?? t('events.churchWide')}
          </span>
          {attending > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3.5" aria-hidden />
              {formatNumber(attending)}
              {event.capacity ? `/${formatNumber(event.capacity)}` : ''}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/** Places taken out of the capacity, as a bar with numbers. */
export function CapacityMeter({ event }: { event: EventDetails }) {
  const { t, formatNumber } = useI18n();
  if (!event.capacity) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('events.registeredNoLimit', {
          count: event.registeredCount,
          value: formatNumber(event.registeredCount),
        })}
      </p>
    );
  }
  const ratio = Math.min(1, event.registeredCount / event.capacity);
  const tone = ratio >= 1 ? 'danger' : ratio >= 0.85 ? 'warning' : 'success';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold tabular">
          {t('events.placesTaken', {
            taken: formatNumber(event.registeredCount),
            capacity: formatNumber(event.capacity),
          })}
        </span>
        {event.waitlistCount > 0 ? (
          <span className="text-xs text-muted-foreground">
            {t('events.waitlistCount', {
              count: event.waitlistCount,
              value: formatNumber(event.waitlistCount),
            })}
          </span>
        ) : null}
      </div>
      <div
        data-tone={tone}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={event.capacity}
        aria-valuenow={event.registeredCount}
        aria-label={t('events.capacity')}
      >
        <div
          className="h-full rounded-full bg-tone transition-[width] duration-300"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
