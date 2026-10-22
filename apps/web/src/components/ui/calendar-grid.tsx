import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from './button';
import type { Tone } from './tone';

export type CalendarItem = {
  id: string;
  /** Calendar day, `YYYY-MM-DD`, in the church time zone. */
  date: string;
  title: string;
  /** Short time label, e.g. "09:00". */
  time?: string;
  tone?: Tone;
  to?: string;
};

const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');

/**
 * A month grid for services, events and bookings. Phones show dots under each day (pick a day
 * to list its items below the grid); wider screens show the first items in each cell.
 * Arrow keys move between days.
 */
export function MonthGrid({
  month,
  onMonthChange,
  items = [],
  selected,
  onSelectDay,
  weekStartsOn = 0,
  maxPerDay = 3,
  className,
}: {
  /** Any day in the month to show. */
  month: Date;
  onMonthChange: (month: Date) => void;
  items?: CalendarItem[];
  selected?: string | null;
  onSelectDay?: (date: string) => void;
  /** 0 = Sunday (Minggu), the usual first day of a church week. */
  weekStartsOn?: 0 | 1;
  maxPerDay?: number;
  className?: string;
}) {
  const { t, formatDate } = useI18n();
  const today = dayKey(new Date());
  const start = startOfWeek(startOfMonth(month), { weekStartsOn });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn });
  const days = eachDayOfInterval({ start, end });
  const [focused, setFocused] = React.useState<string>(selected ?? today);
  const gridRef = React.useRef<HTMLDivElement>(null);

  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [items]);

  const weekdays = days
    .slice(0, 7)
    .map((day) => formatDate(dayKey(day), { preset: 'weekdayShort' }));

  const focusDay = (date: Date) => {
    const key = dayKey(date);
    setFocused(key);
    if (!isSameMonth(date, month)) onMonthChange(date);
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLElement>(`[data-day="${key}"]`)?.focus(),
    );
  };

  const onKeyDown = (event: React.KeyboardEvent, date: Date) => {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = moves[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      focusDay(addDays(date, delta));
    }
  };

  return (
    <div className={cn('rounded-xl border border-border/70 bg-card shadow-soft', className)}>
      <div className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-4">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold capitalize">
          {formatDate(dayKey(month), { preset: 'monthYear' })}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onMonthChange(new Date());
            setFocused(today);
            onSelectDay?.(today);
          }}
        >
          {t('common.today')}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('common.previousMonth')}
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('common.nextMonth')}
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      <div ref={gridRef}>
        <div className="grid grid-cols-7 border-b text-center" aria-hidden>
          {weekdays.map((weekday, index) => (
            <div
              key={index}
              className="py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
            >
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const key = dayKey(day);
            const dayItems = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, month);
            const isToday = key === today;
            const isSelected = key === selected;
            const isSunday = day.getDay() === 0;
            return (
              <div
                key={key}
                className={cn(
                  'relative min-h-14 border-b border-l border-border/60 sm:min-h-24',
                  index % 7 === 0 && 'border-l-0',
                  index >= days.length - 7 && 'border-b-0',
                  !inMonth && 'bg-sunken/50',
                )}
              >
                <button
                  type="button"
                  data-day={key}
                  tabIndex={key === focused ? 0 : -1}
                  aria-pressed={onSelectDay ? isSelected : undefined}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => {
                    setFocused(key);
                    onSelectDay?.(key);
                  }}
                  onKeyDown={(event) => onKeyDown(event, day)}
                  aria-label={`${formatDate(key, { preset: 'dateLong' })}${dayItems.length ? ` · ${dayItems.length}` : ''}`}
                  className={cn(
                    'absolute inset-0 flex flex-col items-center gap-1 p-1 text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:items-start sm:p-1.5',
                    isSelected && 'bg-accent/70 hover:bg-accent',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-[13px] font-medium tabular',
                      !inMonth && 'text-muted-foreground/60',
                      isSunday && inMonth && 'text-destructive',
                      isToday && 'bg-primary font-bold text-primary-foreground',
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {dayItems.length > 0 ? (
                    <span className="flex gap-0.5 sm:hidden" aria-hidden>
                      {dayItems.slice(0, 3).map((item) => (
                        <span
                          key={item.id}
                          data-tone={item.tone ?? 'brand'}
                          className="size-1.5 rounded-full bg-tone"
                        />
                      ))}
                    </span>
                  ) : null}
                </button>
                {dayItems.length > 0 ? (
                  <div className="pointer-events-none relative mt-9 hidden flex-col gap-0.5 px-1 pb-1 sm:flex">
                    {dayItems.slice(0, maxPerDay).map((item) => {
                      const chip = (
                        <span
                          data-tone={item.tone ?? 'brand'}
                          className="flex min-w-0 items-center gap-1 truncate rounded-md bg-tone-soft px-1.5 py-0.5 text-[11px] font-medium text-tone-ink"
                        >
                          {item.time ? (
                            <span className="tabular opacity-80">{item.time}</span>
                          ) : null}
                          <span className="truncate">{item.title}</span>
                        </span>
                      );
                      return item.to ? (
                        <Link
                          key={item.id}
                          to={item.to}
                          className="pointer-events-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          {chip}
                        </Link>
                      ) : (
                        <span key={item.id}>{chip}</span>
                      );
                    })}
                    {dayItems.length > maxPerDay ? (
                      <span className="px-1.5 text-[11px] font-medium text-muted-foreground">
                        +{dayItems.length - maxPerDay}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
