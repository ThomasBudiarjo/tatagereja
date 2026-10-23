import {
  CALENDAR_SOURCES,
  CALENDAR_SOURCE_LABELS,
  addDaysToDate,
  can,
  churchDateOf,
  localize,
  type CalendarItem,
  type CalendarSource,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  List,
  MapPin,
  Rss,
  Rows3,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { MonthGrid, type CalendarItem as GridItem } from '@/components/ui/calendar-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/misc';
import { Skeleton, SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { churchToday } from '@/features/comms/church-time';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { calendarQuery } from './api';
import {
  CALENDAR_VIEWS,
  SOURCE_ICONS,
  SOURCE_TONES,
  rangeOf,
  shiftAnchor,
  viewDays,
  weekStart,
  type CalendarView,
} from './calendar-lib';
import { FeedsSheet } from './feeds-sheet';

const DEFAULT_SOURCES: CalendarSource[] = ['events', 'services', 'bookings'];

/** Every church-local day an item covers (multi-day events show on each day, up to two weeks). */
function daysOf(item: CalendarItem, timeZone: string): string[] {
  const first = churchDateOf(item.startsAt, timeZone);
  if (!item.endsAt) return [first];
  const last = churchDateOf(new Date(new Date(item.endsAt).getTime() - 1).toISOString(), timeZone);
  const days: string[] = [];
  for (let day = first; day <= last && days.length < 14; day = addDaysToDate(day, 1))
    days.push(day);
  return days.length ? days : [first];
}

/**
 * The church calendar: events, worship services, room bookings and (opt-in) birthdays in a
 * month, week or agenda view. Every source follows the caller's permissions on the server.
 */
export function CalendarPage() {
  const { churchId, base, access } = useChurch();
  const { t, locale, timeZone, formatDate, formatTime } = useI18n();
  const zone = timeZone ?? 'Asia/Jakarta';
  const today = churchToday(zone);
  const [state, setState] = useUrlState({
    view: 'month',
    date: '',
    day: '',
    sources: DEFAULT_SOURCES as readonly string[],
  });
  const view: CalendarView = (CALENDAR_VIEWS as readonly string[]).includes(state.view)
    ? (state.view as CalendarView)
    : 'month';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(state.date) ? state.date : today;
  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(state.day) ? state.day : anchor;
  const sources = state.sources.filter((source): source is CalendarSource =>
    (CALENDAR_SOURCES as readonly string[]).includes(source),
  );
  const days = viewDays(view, anchor);
  const query = useQuery(calendarQuery(churchId, { ...rangeOf(days, zone), sources }));
  const [feedsOpen, setFeedsOpen] = useState(false);
  const available = query.data?.available ?? [];

  const byDay = new Map<string, CalendarItem[]>();
  for (const item of query.data?.items ?? []) {
    for (const day of daysOf(item, zone)) {
      const list = byDay.get(day) ?? [];
      list.push(item);
      byDay.set(day, list);
    }
  }
  const timeLabel = (item: CalendarItem) =>
    item.isAllDay ? t('common.allDay') : formatTime(item.startsAt);

  const toggleSource = (source: CalendarSource) => {
    // At least one source stays on; an empty calendar is never what someone wants.
    if (sources.length === 1 && sources[0] === source) return;
    setState({
      sources: sources.includes(source)
        ? sources.filter((item) => item !== source)
        : [...sources, source],
    });
  };

  const title =
    view === 'month'
      ? formatDate(anchor, 'monthYear')
      : view === 'week'
        ? `${formatDate(days[0], 'dayMonth')} – ${formatDate(days[1], 'dayMonth')}`
        : `${formatDate(days[0], 'dayMonth')} – ${formatDate(days[1], 'dateShort')}`;

  const dayList = (day: string, compact = false, badge = true) => {
    const items = byDay.get(day) ?? [];
    if (items.length === 0) {
      return compact ? null : (
        <p className="px-1 py-3 text-sm text-muted-foreground">{t('comms.calendarFreeDay')}</p>
      );
    }
    return (
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <CalendarRow
            key={`${item.key}:${day}`}
            item={item}
            time={timeLabel(item)}
            compact={compact}
            badge={badge}
          />
        ))}
      </ul>
    );
  };

  return (
    <Page size="wide">
      <PageHeader
        title={t('comms.calendar')}
        description={t('comms.calendarDescription')}
        icon={CalendarRange}
        tone="sky"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFeedsOpen(true)}
              aria-label={t('comms.subscribe')}
            >
              <Rss />
              <span className="hidden sm:inline">{t('comms.subscribe')}</span>
            </Button>
            {can.createAnyEvent(access) ? (
              <Button asChild size="sm">
                <Link to={`${base}/events/new`} aria-label={t('comms.newEvent')}>
                  <CalendarPlus />
                  <span className="hidden sm:inline">{t('comms.newEvent')}</span>
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* The month grid has its own month navigation. */}
        <div className={cn('flex items-center gap-2', view === 'month' && 'hidden')}>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('comms.calendarPrevious')}
            onClick={() => setState({ date: shiftAnchor(view, anchor, -1), day: '' })}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('comms.calendarNext')}
            onClick={() => setState({ date: shiftAnchor(view, anchor, 1), day: '' })}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10"
            onClick={() => setState({ date: '', day: '' })}
          >
            {t('common.today')}
          </Button>
          <h2
            className="min-w-0 flex-1 truncate text-lg font-semibold capitalize"
            aria-live="polite"
          >
            {title}
          </h2>
        </div>
        <Segmented
          aria-label={t('comms.calendarView')}
          className="lg:ml-auto lg:w-80"
          value={view}
          onChange={(next) => setState({ view: next }, { push: true })}
          options={[
            { value: 'month', label: t('comms.viewMonth'), icon: CalendarDays },
            { value: 'week', label: t('comms.viewWeek'), icon: Rows3 },
            { value: 'agenda', label: t('comms.viewAgenda'), icon: List },
          ]}
        />
      </div>

      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0"
        role="group"
        aria-label={t('comms.calendarSources')}
      >
        {(query.data ? available : DEFAULT_SOURCES).map((source) => {
          const Icon = SOURCE_ICONS[source];
          const active = sources.includes(source);
          return (
            <button
              key={source}
              type="button"
              aria-pressed={active}
              data-tone={SOURCE_TONES[source]}
              onClick={() => toggleSource(source)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                active
                  ? 'border-tone/40 bg-tone-soft text-tone-ink'
                  : 'border-input bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'size-2.5 rounded-full',
                  active ? 'bg-tone' : 'bg-muted-foreground/40',
                )}
                aria-hidden
              />
              <Icon className="size-4" aria-hidden />
              {localize(CALENDAR_SOURCE_LABELS[source], locale)}
            </button>
          );
        })}
      </div>

      {query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : view === 'month' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {query.isPending ? (
            <Skeleton className="h-[26rem] rounded-xl" />
          ) : (
            <MonthGrid
              month={new Date(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1, 1)}
              onMonthChange={(month) =>
                setState({
                  date: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`,
                  day: '',
                })
              }
              items={[...byDay].flatMap(([day, items]): GridItem[] =>
                items.map((item) => ({
                  id: `${item.key}:${day}`,
                  date: day,
                  title: item.title,
                  time: item.isAllDay ? undefined : formatTime(item.startsAt),
                  tone: item.cancelled ? 'neutral' : SOURCE_TONES[item.source],
                  to: item.link ?? undefined,
                })),
              )}
              selected={selectedDay}
              onSelectDay={(day) => setState({ day })}
            />
          )}
          <section aria-label={formatDate(selectedDay, 'dateLong')} className="flex flex-col gap-2">
            <h3 className="text-overline px-1 text-muted-foreground">
              {formatDate(selectedDay, 'dateLong')}
            </h3>
            {query.isPending ? (
              <SkeletonList rows={3} avatar={false} />
            ) : (
              dayList(selectedDay, false, false)
            )}
          </section>
        </div>
      ) : query.isPending ? (
        <SkeletonList rows={6} avatar={false} />
      ) : view === 'week' ? (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, index) => addDaysToDate(weekStart(anchor), index)).map(
            (day) => (
              <section
                key={day}
                aria-label={formatDate(day, 'dateLong')}
                className={cn(
                  'flex min-w-0 flex-col gap-2 rounded-xl border border-border/70 bg-card p-2.5 shadow-soft md:min-h-64',
                  day === today && 'border-primary/40 ring-1 ring-primary/15',
                  // Free days stay one line on phones, so the week fits on a screen.
                  !byDay.has(day) &&
                    'flex-row items-center gap-3 py-1.5 md:flex-col md:items-stretch md:py-2.5',
                )}
              >
                <h3 className="flex items-baseline gap-1.5 px-1">
                  <span
                    className={cn(
                      'text-xs font-semibold uppercase',
                      new Date(`${day}T00:00:00Z`).getUTCDay() === 0
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {formatDate(day, 'weekdayShort')}
                  </span>
                  <span
                    className={cn('text-lg font-bold tabular', day === today && 'text-primary')}
                  >
                    {formatDate(day, { options: { day: 'numeric' } })}
                  </span>
                </h3>
                {dayList(day, true) ?? (
                  <p className="px-1 text-xs text-muted-foreground/70 md:hidden">
                    {t('comms.calendarFreeDay')}
                  </p>
                )}
              </section>
            ),
          )}
        </div>
      ) : byDay.size === 0 ? (
        <EmptyState
          icon={CalendarDays}
          tone="sky"
          title={t('comms.calendarEmpty')}
          description={
            sources.length === 0 ? t('comms.calendarNoSources') : t('comms.calendarEmptyHint')
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {[...byDay.keys()].sort().map((day) => (
            <section
              key={day}
              aria-label={formatDate(day, 'dateLong')}
              className="flex flex-col gap-2"
            >
              <h3
                className={cn(
                  'text-overline px-1',
                  day === today ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {day === today ? `${t('common.today')} · ` : ''}
                {formatDate(day, 'dateLong')}
              </h3>
              {dayList(day)}
            </section>
          ))}
        </div>
      )}

      <FeedsSheet
        open={feedsOpen}
        onOpenChange={setFeedsOpen}
        available={available.length ? available : DEFAULT_SOURCES}
      />
    </Page>
  );
}

function CalendarRow({
  item,
  time,
  compact,
  badge,
}: {
  item: CalendarItem;
  time: string;
  compact: boolean;
  badge: boolean;
}) {
  const { t, locale } = useI18n();
  const Icon = SOURCE_ICONS[item.source];
  const content = (
    <>
      <span
        className="w-1 self-stretch rounded-full"
        style={{ backgroundColor: item.cancelled ? undefined : item.color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate font-medium',
            compact ? 'text-[13px]' : 'text-sm',
            item.cancelled && 'text-muted-foreground line-through',
          )}
        >
          {item.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="tabular">{time}</span>
          {!compact && item.subtitle ? <span className="truncate">· {item.subtitle}</span> : null}
          {!compact && item.location ? (
            <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
              · <MapPin className="size-3 shrink-0" aria-hidden />
              {item.location}
            </span>
          ) : null}
        </span>
      </span>
      {!compact && badge ? (
        <span
          data-tone={SOURCE_TONES[item.source]}
          className="hidden shrink-0 items-center gap-1 rounded-full bg-tone-soft px-2 py-0.5 text-[11px] font-semibold text-tone-ink sm:inline-flex"
        >
          <Icon className="size-3" aria-hidden />
          {item.cancelled
            ? t('events.cancelled')
            : localize(CALENDAR_SOURCE_LABELS[item.source], locale)}
        </span>
      ) : null}
    </>
  );
  const classes = cn(
    'flex items-stretch gap-2.5 rounded-lg border border-border/70 bg-card text-left outline-none',
    compact ? 'px-2 py-1.5' : 'min-h-14 px-3 py-2.5 shadow-soft',
    item.link &&
      'pressable transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/40',
  );
  return (
    <li>
      {item.link ? (
        <Link to={item.link} className={classes}>
          {content}
        </Link>
      ) : (
        <div className={classes}>{content}</div>
      )}
    </li>
  );
}
