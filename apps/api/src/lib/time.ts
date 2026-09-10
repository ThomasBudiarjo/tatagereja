export const nowIso = (): string => new Date().toISOString();

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/** Normalises any ISO-8601 datetime (with offset) to a UTC ISO string. */
export const toUtcIso = (value: string): string => new Date(value).toISOString();

export const isPast = (iso: string | null | undefined, now = Date.now()): boolean =>
  !!iso && new Date(iso).getTime() <= now;
