import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { auth } from '$lib/stores/auth.svelte';

export function tz(): string {
  return auth.user?.timezone ?? 'Asia/Jakarta';
}

export function formatDateTime(utc: string, fmt = 'EEEE, d MMM yyyy HH:mm'): string {
  if (!utc) return '';
  try {
    return formatInTimeZone(utc, tz(), fmt);
  } catch {
    return utc;
  }
}

/**
 * Convert a value from an `<input type="datetime-local">` (no timezone)
 * into a UTC ISO string, treating the input as wall-clock in the user's tz.
 */
export function localToUTC(local: string): string {
  if (!local) return '';
  // local is "YYYY-MM-DDTHH:mm" — interpret in user's timezone, get UTC instant.
  return fromZonedTime(local, tz()).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Convert a UTC ISO timestamp into a value suitable for
 * `<input type="datetime-local">` (no Z, no seconds).
 */
export function utcToLocalInput(utc: string): string {
  if (!utc) return '';
  return formatInTimeZone(utc, tz(), "yyyy-MM-dd'T'HH:mm");
}

export function formatDate(ymd: string, fmt = 'd MMM yyyy'): string {
  if (!ymd) return '';
  try {
    return formatInTimeZone(ymd + 'T00:00:00Z', 'UTC', fmt);
  } catch {
    return ymd;
  }
}
