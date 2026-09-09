import { format, formatDistanceToNow, isSameDay, isThisYear, parseISO } from 'date-fns';

const safeDate = (value: string | Date): Date | null => {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = safeDate(value);
  if (!date) return '—';
  return format(date, isThisYear(date) ? 'EEE, d MMM' : 'd MMM yyyy');
};

export const formatLongDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = safeDate(value);
  return date ? format(date, 'EEEE, d MMMM yyyy') : '—';
};

export const formatTime = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = safeDate(value);
  return date ? format(date, 'HH:mm') : '';
};

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = safeDate(value);
  if (!date) return '—';
  return format(date, isThisYear(date) ? 'EEE, d MMM · HH:mm' : 'd MMM yyyy · HH:mm');
};

export const formatEventRange = (
  startsAt: string,
  endsAt: string | null,
  isAllDay: boolean,
): string => {
  const start = safeDate(startsAt);
  if (!start) return '—';
  const end = endsAt ? safeDate(endsAt) : null;
  const dayLabel = format(start, isThisYear(start) ? 'EEE, d MMM' : 'd MMM yyyy');
  if (isAllDay) {
    if (end && !isSameDay(start, end)) return `${dayLabel} – ${format(end, 'd MMM')}`;
    return `${dayLabel} · All day`;
  }
  if (end) {
    if (isSameDay(start, end))
      return `${dayLabel} · ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`;
    return `${dayLabel} ${format(start, 'HH:mm')} – ${format(end, 'd MMM HH:mm')}`;
  }
  return `${dayLabel} · ${format(start, 'HH:mm')}`;
};

export const formatRelative = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = safeDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : '';
};

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
