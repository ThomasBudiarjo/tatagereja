import { canRequestBooking, type BookingOccurrence } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, DoorOpen } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { scheduleQuery } from './api';
import {
  FACILITIES_TONE,
  isValidDate,
  shiftDate,
  startOfZonedDay,
  todayIn,
} from './facilities-lib';
import {
  AvailabilityBadge,
  DayTimeline,
  FacilitiesNav,
  OccurrenceRow,
  ResourceThumb,
} from './facilities-ui';

const DAY_MS = 86_400_000;

/** Every room on one day, side by side, to find a free slot at a glance. */
export function SchedulePage() {
  const { churchId, base, church, access } = useChurch();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const timeZone = church.timezone;
  const today = todayIn(timeZone);
  const [state, setState] = useUrlState({ date: '' });
  const date = isValidDate(state.date) ? state.date : today;
  const from = startOfZonedDay(date, timeZone);
  const to = new Date(from.getTime() + DAY_MS);
  const [nowIso] = useState(() => new Date().toISOString());
  const query = useQuery(scheduleQuery(churchId, { from: from.toISOString(), to: to.toISOString() }));
  const canBook = canRequestBooking(access);
  const hrefFor = (item: BookingOccurrence) => `${base}/facilities/bookings/${item.bookingId}`;
  const bookAt = (resourceId: string, minutes: number) => {
    const startsAt = new Date(from.getTime() + minutes * 60_000);
    void navigate(
      `${base}/facilities/bookings/new?resourceId=${resourceId}&startsAt=${encodeURIComponent(startsAt.toISOString())}`,
    );
  };

  return (
    <Page size="wide">
      <PageHeader
        title={t('facilities.scheduleTitle')}
        description={t('facilities.scheduleDescription')}
        breadcrumbs={[
          { label: t('facilities.nav'), to: `${base}/facilities` },
          { label: t('facilities.scheduleTitle') },
        ]}
        actions={
          canBook ? (
            <Button asChild size="sm">
              <Link to={`${base}/facilities/bookings/new`}>
                <CalendarPlus />
                {t('facilities.book')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FacilitiesNav />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('facilities.previousDay')}
          onClick={() => setState({ date: shiftDate(date, -1) })}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('facilities.nextDay')}
          onClick={() => setState({ date: shiftDate(date, 1) })}
        >
          <ChevronRight />
        </Button>
        <p className="min-w-0 flex-1 truncate text-base font-semibold" aria-live="polite">
          {formatDate(date, 'dateLong')}
        </p>
        <Input
          type="date"
          aria-label={t('facilities.pickDate')}
          value={date}
          onChange={(event) =>
            setState({ date: isValidDate(event.target.value) ? event.target.value : '' })
          }
          className="w-auto"
        />
        {date !== today ? (
          <Button variant="ghost" size="sm" onClick={() => setState({ date: '' })}>
            {t('common.today')}
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <SkeletonList rows={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          tone={FACILITIES_TONE}
          title={t('facilities.noRooms')}
          description={t('facilities.noRoomsView')}
        />
      ) : (
        <ul className="flex flex-col gap-2.5" aria-busy={query.isFetching || undefined}>
          {query.data.items.map(({ resource, occurrences }) => (
            <li
              key={resource.id}
              className="grid gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-soft md:grid-cols-[13rem_minmax(0,1fr)] md:items-center"
            >
              <Link
                to={`${base}/facilities/rooms/${resource.id}?date=${date}`}
                className="flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
              >
                <ResourceThumb resource={resource} className="size-10" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{resource.name}</span>
                  {date === today ? (
                    <AvailabilityBadge resource={resource} />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t('facilities.bookingsCount', { count: occurrences.length })}
                    </span>
                  )}
                </span>
              </Link>
              <div className="hidden md:block">
                <DayTimeline
                  day={date}
                  occurrences={occurrences}
                  timeZone={timeZone}
                  nowIso={nowIso}
                  hrefFor={hrefFor}
                  compact
                  onSelect={canBook ? (minutes) => bookAt(resource.id, minutes) : undefined}
                />
              </div>
              <div className="flex flex-col gap-1.5 md:hidden">
                {occurrences.length === 0 ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" aria-hidden />
                    {t('facilities.dayFree')}
                  </p>
                ) : (
                  occurrences.map((item) => (
                    <OccurrenceRow
                      key={`${item.bookingId}-${item.startsAt}`}
                      occurrence={item}
                      showDate={false}
                      to={hrefFor(item)}
                    />
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
