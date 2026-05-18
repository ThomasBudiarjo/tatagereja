import { auth } from '$lib/stores/auth.svelte';

function tz(): string {
  return auth.user?.timezone ?? 'Asia/Jakarta';
}

function fmt(utc: string, opts: Intl.DateTimeFormatOptions): string {
  if (!utc) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', { timeZone: tz(), ...opts }).format(new Date(utc));
  } catch {
    return utc;
  }
}

/** "17 Mei" */
export function fmtDayMonth(utc: string): { day: string; month: string } {
  if (!utc) return { day: '', month: '' };
  try {
    const d = new Intl.DateTimeFormat('id-ID', { timeZone: tz(), day: 'numeric' }).format(new Date(utc));
    const m = new Intl.DateTimeFormat('id-ID', { timeZone: tz(), month: 'short' })
      .format(new Date(utc))
      .replace('.', '')
      .replace(/^./, (c) => c.toUpperCase());
    return { day: d, month: m };
  } catch {
    return { day: '', month: '' };
  }
}

/** "09:00" in the user's timezone */
export function fmtTime(utc: string): string {
  return fmt(utc, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "Sabtu" */
export function fmtWeekday(utc: string): string {
  return fmt(utc, { weekday: 'long' });
}

/** "Sabtu, 17 Mei 2026 · 09:00" */
export function fmtFullID(utc: string): string {
  const left = fmt(utc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const right = fmtTime(utc);
  return left && right ? `${left} · ${right}` : left || right;
}

/** "Sabtu, 17 Mei · 09:00" (no year) */
export function fmtMediumID(utc: string): string {
  const left = fmt(utc, { weekday: 'long', day: 'numeric', month: 'long' });
  const right = fmtTime(utc);
  return left && right ? `${left} · ${right}` : left || right;
}

/** Relative day label: "Hari ini", "Besok", "Sabtu", or fallback like "17 Mei". */
export function fmtRelativeID(utc: string): string {
  if (!utc) return '';
  const diff = (new Date(utc).getTime() - Date.now()) / 86_400_000;
  if (diff < -1) return 'Sudah lewat';
  if (diff < 1) return 'Hari ini';
  if (diff < 2) return 'Besok';
  if (diff < 7) return fmtWeekday(utc);
  const { day, month } = fmtDayMonth(utc);
  return `${day} ${month}`;
}
