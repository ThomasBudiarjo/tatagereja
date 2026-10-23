export const fullName = (person: { firstName: string; lastName: string | null }): string =>
  [person.firstName, person.lastName].filter(Boolean).join(' ');

/** Titles that come before a name in Indonesian churches ("Pdt. Imanuel", "Pnt. Bonar"). */
const NAME_TITLES = /^(pdt|pnt|dkn|ev|em|bpk|bapak|ibu|ny|nn|sdr|sdri|dr|drs|ir|prof|st|br)\.?$/i;

/** The name to greet someone with: their first name, skipping titles such as "Pdt." or "Pnt.". */
export const callName = (name: string): string => {
  const words = name.trim().split(/\s+/);
  return words.find((word) => !NAME_TITLES.test(word)) ?? words[0] ?? '';
};

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';

export const invitationStatusOf = (invitation: {
  revokedAt: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
}): 'active' | 'expired' | 'exhausted' | 'revoked' => {
  if (invitation.revokedAt) return 'revoked';
  if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() <= Date.now())
    return 'expired';
  if (invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) return 'exhausted';
  return 'active';
};

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * A cached `Intl.DateTimeFormat`. Creating one costs about fifty times as much as formatting
 * with it, and reports and calendars format thousands of dates per request. Throws like the
 * constructor for an unknown time zone (nothing is cached then).
 */
export function dateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateTimeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    // Keys come from a handful of call sites times the time zones in use; the cap only guards
    // against an unexpected spread of options.
    if (dateTimeFormats.size >= 500) dateTimeFormats.clear();
    dateTimeFormats.set(key, format);
  }
  return format;
}
