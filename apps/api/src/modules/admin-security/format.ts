/** Minutes a time zone is ahead of UTC at one instant. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The UTC instant a calendar day (`YYYY-MM-DD`) starts in a time zone, e.g. 2026-10-22 in
 * Asia/Jakarta starts at 2026-10-21T17:00:00Z. `endOfDay` gives the start of the next day.
 */
export function zonedDayStart(day: string, timeZone: string, endOfDay = false): string {
  const [year, month, date] = day.split('-').map(Number);
  const midnightUtc = Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + (endOfDay ? 1 : 0));
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    zone = 'UTC';
  }
  const guess = new Date(midnightUtc);
  const offset = offsetMinutes(guess, zone);
  // A second pass settles days where the offset changes around midnight (DST zones).
  const corrected = offsetMinutes(new Date(midnightUtc - offset * 60_000), zone);
  return new Date(midnightUtc - corrected * 60_000).toISOString();
}

/** One CSV cell: quoted when needed, and guarded against spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvRow = (values: readonly unknown[]): string => values.map(csvCell).join(',');
