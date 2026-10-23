import { churchDateOf, timeZoneOffsetMs, zonedInstant } from '@tatagereja/shared';

/*
 * Date and time inputs in the church time zone: a member travelling abroad still plans the
 * Sunday service at 09.00 WIB. Values are ISO instants, so shared schemas validate them.
 */

const DEFAULT_ZONE = 'Asia/Jakarta';

/** `YYYY-MM-DDTHH:mm` of an instant in the church time zone, for `datetime-local`. */
export function toChurchInput(iso: string | null | undefined, timeZone = DEFAULT_ZONE): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  return new Date(time + timeZoneOffsetMs(time, timeZone)).toISOString().slice(0, 16);
}

/** The instant of a `datetime-local` value read in the church time zone. */
export function fromChurchInput(value: string, timeZone = DEFAULT_ZONE): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return '';
  const msOfDay = (Number(match[2]) * 60 + Number(match[3])) * 60_000;
  return new Date(zonedInstant(match[1] as string, msOfDay, timeZone)).toISOString();
}

/** Today (YYYY-MM-DD) in the church time zone. */
export const churchToday = (timeZone = DEFAULT_ZONE) => churchDateOf(new Date(), timeZone);

/** Midnight at the start of a church-local day. */
export const startOfChurchDay = (date: string, timeZone = DEFAULT_ZONE) =>
  new Date(zonedInstant(date, 0, timeZone));
