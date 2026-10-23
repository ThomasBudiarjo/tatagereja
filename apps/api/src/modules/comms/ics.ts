import { churchDateOf, addDaysToDate, type CalendarItem } from '@tatagereja/shared';

/*
 * A minimal iCalendar (RFC 5545) writer for the private calendar feeds: one VEVENT per item,
 * UTC times, all-day items as church-local dates, escaped text and folded lines.
 */

const escapeText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

const utcStamp = (iso: string): string =>
  new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const dateStamp = (date: string): string => date.replace(/-/g, '');

/** Folds a content line at 75 octets, continuing with a space (RFC 5545 §3.1). */
const fold = (line: string): string => {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    if (size + length > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += length;
  }
  parts.push(current);
  return parts.join('\r\n ');
};

export function buildIcs(options: {
  name: string;
  timeZone: string;
  appUrl: string;
  items: readonly CalendarItem[];
  now?: Date;
}): string {
  const stamp = utcStamp((options.now ?? new Date()).toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TataGereja//Calendar//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name)}`,
    `X-WR-TIMEZONE:${options.timeZone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const item of options.items) {
    lines.push('BEGIN:VEVENT', `UID:${item.key.replace(/[^A-Za-z0-9:._-]/g, '')}@tatagereja`);
    lines.push(`DTSTAMP:${stamp}`);
    if (item.isAllDay) {
      const day = churchDateOf(item.startsAt, options.timeZone);
      const last = item.endsAt ? churchDateOf(item.endsAt, options.timeZone) : day;
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(day)}`);
      lines.push(`DTEND;VALUE=DATE:${dateStamp(addDaysToDate(last < day ? day : last, 1))}`);
    } else {
      lines.push(`DTSTART:${utcStamp(item.startsAt)}`);
      const end =
        item.endsAt ?? new Date(new Date(item.startsAt).getTime() + 60 * 60_000).toISOString();
      lines.push(`DTEND:${utcStamp(end)}`);
    }
    lines.push(`SUMMARY:${escapeText(item.source === 'birthdays' ? `Ulang tahun ${item.title}` : item.title)}`);
    if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
    if (item.subtitle) lines.push(`DESCRIPTION:${escapeText(item.subtitle)}`);
    if (item.link) lines.push(`URL:${options.appUrl}${item.link}`);
    lines.push(`CATEGORIES:${item.source.toUpperCase()}`);
    if (item.cancelled) lines.push('STATUS:CANCELLED');
    if (item.source === 'birthdays') lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
