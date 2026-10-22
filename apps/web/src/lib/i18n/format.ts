import {
  currencyMinorDigits,
  DEFAULT_CURRENCY,
  isCurrencyCode,
  type Locale,
} from '@tatagereja/shared';

/**
 * Locale-aware formatting on top of `Intl`. Dates follow the church time zone when one is
 * given; date-only values (`YYYY-MM-DD`) are calendar days and never shift with time zones.
 */

/** BCP 47 tags used for formatting. English uses day-month order, which reads naturally here. */
export const INTL_LOCALE: Record<Locale, string> = { id: 'id-ID', en: 'en-GB' };

export type DatePreset =
  | 'date'
  | 'dateShort'
  | 'dateLong'
  | 'dayMonth'
  | 'monthYear'
  | 'month'
  | 'weekday'
  | 'weekdayShort'
  | 'time'
  | 'dateTime'
  | 'dateTimeLong';

const PRESETS: Record<DatePreset, Intl.DateTimeFormatOptions> = {
  date: { weekday: 'short', day: 'numeric', month: 'short' },
  dateShort: { day: 'numeric', month: 'short', year: 'numeric' },
  dateLong: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  dayMonth: { day: 'numeric', month: 'short' },
  monthYear: { month: 'long', year: 'numeric' },
  month: { month: 'long' },
  weekday: { weekday: 'long' },
  weekdayShort: { weekday: 'short' },
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  dateTime: {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
  dateTimeLong: {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const cache = new Map<string, Intl.DateTimeFormat>();
const dateFormatter = (locale: Locale, options: Intl.DateTimeFormatOptions, timeZone?: string) => {
  const key = `${locale}|${timeZone ?? ''}|${JSON.stringify(options)}`;
  let formatter = cache.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone });
    } catch {
      formatter = new Intl.DateTimeFormat(INTL_LOCALE[locale], options);
    }
    cache.set(key, formatter);
  }
  return formatter;
};

/** Parses an ISO date-time or a `YYYY-MM-DD` day. Returns null for empty or invalid values. */
export const parseDateValue = (
  value: string | Date | null | undefined,
): { date: Date; dateOnly: boolean } | null => {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : { date: value, dateOnly: false };
  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
    return Number.isNaN(date.getTime()) ? null : { date, dateOnly: true };
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
};

export type DateFormatOptions = {
  preset?: DatePreset;
  /** Custom Intl options instead of a preset. */
  options?: Intl.DateTimeFormatOptions;
  timeZone?: string;
  /** Adds the year to `date`/`dateTime` when the value is not in the current year (default true). */
  smartYear?: boolean;
  fallback?: string;
};

export function formatDate(
  value: string | Date | null | undefined,
  locale: Locale,
  { preset = 'date', options, timeZone, smartYear = true, fallback = '—' }: DateFormatOptions = {},
): string {
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;
  let resolved = options ?? PRESETS[preset];
  const zone = parsed.dateOnly ? 'UTC' : timeZone;
  if (
    !options &&
    smartYear &&
    (preset === 'date' || preset === 'dateTime' || preset === 'dayMonth') &&
    parsed.date.getUTCFullYear() !== new Date().getUTCFullYear()
  ) {
    resolved = { ...resolved, year: 'numeric', weekday: undefined };
  }
  return dateFormatter(locale, resolved, zone).format(parsed.date);
}

/** "Sun, 25 Oct · 09:00–11:00", "Sun, 25 Oct · All day" (the all-day label comes from the caller). */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: Locale,
  {
    timeZone,
    allDay = false,
    allDayLabel = '',
  }: { timeZone?: string; allDay?: boolean; allDayLabel?: string } = {},
): string {
  const from = parseDateValue(start);
  if (!from) return '—';
  const to = parseDateValue(end);
  const day = formatDate(start, locale, { preset: 'date', timeZone });
  const sameDay =
    !!to &&
    formatDate(start, locale, { preset: 'dateShort', timeZone }) ===
      formatDate(end, locale, { preset: 'dateShort', timeZone });
  if (allDay || from.dateOnly) {
    if (to && !sameDay)
      return `${day} – ${formatDate(end, locale, { preset: 'dayMonth', timeZone })}`;
    return allDayLabel ? `${day} · ${allDayLabel}` : day;
  }
  const startTime = formatDate(start, locale, { preset: 'time', timeZone });
  if (!to) return `${day} · ${startTime}`;
  const endTime = formatDate(end, locale, { preset: 'time', timeZone });
  if (sameDay) return `${day} · ${startTime}–${endTime}`;
  return `${day} ${startTime} – ${formatDate(end, locale, { preset: 'dayMonth', timeZone })} ${endTime}`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

/** "3 hours ago", "in 2 days", "kemarin". */
export function formatRelative(
  value: string | Date | null | undefined,
  locale: Locale,
  now: Date = new Date(),
): string {
  const parsed = parseDateValue(value);
  if (!parsed) return '';
  const seconds = (parsed.date.getTime() - now.getTime()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      const amount = Math.round(seconds / size);
      if (unit === 'second' && Math.abs(amount) < 45) return formatter.format(0, 'second');
      return formatter.format(amount, unit);
    }
  }
  return '';
}

export function formatNumber(
  value: number | null | undefined,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}

export function formatPercent(
  value: number | null | undefined,
  locale: Locale,
  digits = 0,
): string {
  return formatNumber(value, locale, {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

/**
 * Formats integer minor units in a currency: `formatCurrency(150000, 'IDR', 'id')` →
 * "Rp 150.000". IDR has no minor unit, so it is shown without decimals.
 */
export function formatCurrency(
  minor: number | null | undefined,
  currency: string,
  locale: Locale,
  {
    compact = false,
    signDisplay,
  }: { compact?: boolean; signDisplay?: Intl.NumberFormatOptions['signDisplay'] } = {},
): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return '—';
  const code = isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY;
  const digits = currencyMinorDigits(code);
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: compact ? 0 : digits,
    maximumFractionDigits: compact ? 1 : digits,
    notation: compact ? 'compact' : 'standard',
    signDisplay,
  }).format(minor / 10 ** digits);
}

/** "Ani, Budi dan Citra" / "Ani, Budi and Citra". */
export function formatList(items: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(INTL_LOCALE[locale], { style: 'long', type: 'conjunction' }).format(
    items,
  );
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
export const pluralCategory = (count: number, locale: Locale): Intl.LDMLPluralRule => {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALE[locale]);
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
};
