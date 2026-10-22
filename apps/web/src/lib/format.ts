import { format, parseISO } from 'date-fns';
import { currentLocale, translate } from '@/lib/i18n';
import * as intl from '@/lib/i18n/format';

/*
 * Formatting helpers for screens that do not use `useI18n()` yet. They follow the active
 * interface language; inside components prefer `useI18n().formatDate(...)`, which also
 * follows the church time zone and currency.
 */

const safeDate = (value: string | Date): Date | null => {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: string | null | undefined): string =>
  intl.formatDate(value, currentLocale(), { preset: 'date' });

export const formatLongDate = (value: string | null | undefined): string =>
  intl.formatDate(value, currentLocale(), { preset: 'dateLong' });

export const formatTime = (value: string | null | undefined): string =>
  intl.formatDate(value, currentLocale(), { preset: 'time', fallback: '' });

export const formatDateTime = (value: string | null | undefined): string =>
  intl.formatDate(value, currentLocale(), { preset: 'dateTime' });

export const formatEventRange = (
  startsAt: string,
  endsAt: string | null,
  isAllDay: boolean,
): string => {
  const locale = currentLocale();
  return intl.formatDateRange(startsAt, endsAt, locale, {
    allDay: isAllDay,
    allDayLabel: translate(locale, 'common.allDay'),
  });
};

export const formatRelative = (value: string | null | undefined): string =>
  intl.formatRelative(value, currentLocale());

/** Converts an ISO datetime to the value expected by <input type="datetime-local"> (local time). */
export const isoToLocalInput = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = safeDate(value);
  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
};

/** Converts a datetime-local input value (local time) to an ISO string in UTC. */
export const localInputToIso = (value: string): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

export const ageFromBirthDate = (birthDate: string | null | undefined): number | null => {
  if (!birthDate) return null;
  const date = safeDate(birthDate);
  if (!date) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const beforeBirthday =
    now.getMonth() < date.getMonth() ||
    (now.getMonth() === date.getMonth() && now.getDate() < date.getDate());
  if (beforeBirthday) age -= 1;
  return age;
};
