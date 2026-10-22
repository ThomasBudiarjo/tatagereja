import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import type { MessageKey } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

/** Calendar days, `YYYY-MM-DD`. */
export type DateRange = { from: string; to: string };

export type DateRangePreset =
  'thisWeek' | 'thisMonth' | 'lastMonth' | 'last30' | 'last90' | 'thisYear';

const day = (date: Date) => format(date, 'yyyy-MM-dd');

/** The range a preset covers today. Weeks start on Sunday (Minggu). */
export const presetRange = (preset: DateRangePreset, now = new Date()): DateRange => {
  switch (preset) {
    case 'thisWeek':
      return { from: day(startOfWeek(now)), to: day(endOfWeek(now)) };
    case 'thisMonth':
      return { from: day(startOfMonth(now)), to: day(endOfMonth(now)) };
    case 'lastMonth': {
      const last = subMonths(now, 1);
      return { from: day(startOfMonth(last)), to: day(endOfMonth(last)) };
    }
    case 'last30':
      return { from: day(subDays(now, 29)), to: day(now) };
    case 'last90':
      return { from: day(subDays(now, 89)), to: day(now) };
    case 'thisYear':
      return { from: day(startOfYear(now)), to: day(endOfYear(now)) };
  }
};

const PRESET_LABELS: Record<DateRangePreset, MessageKey> = {
  thisWeek: 'common.rangeThisWeek',
  thisMonth: 'common.rangeThisMonth',
  lastMonth: 'common.rangeLastMonth',
  last30: 'common.rangeLast30',
  last90: 'common.rangeLast90',
  thisYear: 'common.rangeThisYear',
};

/** Presets as rows first (nobody fights a calendar for "this month"), a custom range below. */
export function DateRangePicker({
  value,
  onChange,
  presets = ['thisMonth', 'lastMonth', 'last30', 'last90', 'thisYear'],
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: DateRangePreset[];
  className?: string;
}) {
  const { t, formatDate } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const fromId = React.useId();
  const toId = React.useId();

  const activePreset = presets.find((preset) => {
    const range = presetRange(preset);
    return range.from === value.from && range.to === value.to;
  });
  const label = activePreset
    ? t(PRESET_LABELS[activePreset])
    : value.from && value.to
      ? `${formatDate(value.from, 'dayMonth')} – ${formatDate(value.to, 'dateShort')}`
      : t('common.dateRange');
  const draftValid = !!draft.from && !!draft.to && draft.from <= draft.to;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-between gap-2 font-medium', className)}>
          <CalendarRange className="text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1.5">
        <ul className="flex flex-col">
          {presets.map((preset) => (
            <li key={preset}>
              <button
                type="button"
                onClick={() => {
                  onChange(presetRange(preset));
                  setOpen(false);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <span className="flex-1">{t(PRESET_LABELS[preset])}</span>
                {activePreset === preset ? (
                  <Check className="size-4 text-primary" strokeWidth={3} />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex flex-col gap-2.5 border-t px-1.5 pt-3 pb-1.5">
          <p className="text-overline text-muted-foreground">{t('common.rangeCustom')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={fromId} className="text-xs text-muted-foreground">
                {t('common.from')}
              </Label>
              <Input
                id={fromId}
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(event) => setDraft((range) => ({ ...range, from: event.target.value }))}
                className="h-10 px-2"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={toId} className="text-xs text-muted-foreground">
                {t('common.to')}
              </Label>
              <Input
                id={toId}
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(event) => setDraft((range) => ({ ...range, to: event.target.value }))}
                className="h-10 px-2"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={!draftValid}
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            {t('common.apply')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
