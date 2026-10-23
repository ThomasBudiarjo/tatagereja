import { addDaysToDate, type CalendarSource } from '@tatagereja/shared';
import { CalendarDays, Cake, Church, DoorOpen, type LucideIcon } from 'lucide-react';
import type { ModuleTone } from '@/components/ui/tone';
import { startOfChurchDay } from '@/features/comms/church-time';

export const CALENDAR_VIEWS = ['month', 'week', 'agenda'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** Each source keeps one tone everywhere: chips, dots, the legend and the agenda bars. */
export const SOURCE_TONES: Record<CalendarSource, ModuleTone> = {
  events: 'sky',
  services: 'violet',
  bookings: 'teal',
  birthdays: 'rose',
};

export const SOURCE_ICONS: Record<CalendarSource, LucideIcon> = {
  events: CalendarDays,
  services: Church,
  bookings: DoorOpen,
  birthdays: Cake,
};

/** 0 = Sunday (Minggu) for a YYYY-MM-DD date. */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** The Sunday a church week starts on. */
export const weekStart = (date: string) => addDaysToDate(date, -weekdayOf(date));

const AGENDA_DAYS = 31;

/** The church-local days a view shows, as `[firstDay, lastDay]`. */
export function viewDays(view: CalendarView, anchor: string): [string, string] {
  if (view === 'week') {
    const first = weekStart(anchor);
    return [first, addDaysToDate(first, 6)];
  }
  if (view === 'agenda') return [anchor, addDaysToDate(anchor, AGENDA_DAYS - 1)];
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const [year, month] = anchor.split('-').map(Number) as [number, number];
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return [weekStart(monthStart), addDaysToDate(weekStart(monthEnd), 6)];
}

/** The instants a range of church days covers, for the API. */
export const rangeOf = (days: [string, string], timeZone: string) => ({
  from: startOfChurchDay(days[0], timeZone).toISOString(),
  to: startOfChurchDay(addDaysToDate(days[1], 1), timeZone).toISOString(),
});

/** Moves the anchor a whole view back or forward. */
export function shiftAnchor(view: CalendarView, anchor: string, direction: 1 | -1): string {
  if (view === 'week') return addDaysToDate(anchor, 7 * direction);
  if (view === 'agenda') return addDaysToDate(anchor, AGENDA_DAYS * direction);
  const [year, month] = anchor.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 + direction, 1)).toISOString().slice(0, 10);
}
