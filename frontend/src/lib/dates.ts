// Small date helpers for schedule range navigation. All values are local
// wall-clock dates formatted as YYYY-MM-DD, matching the API contract.

export interface DateRange {
  from: string;
  to: string;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, days: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// weekRange returns the Monday–Sunday week containing the given date.
export function weekRange(s: string): DateRange {
  const d = parseISODate(s);
  const offsetToMonday = (d.getDay() + 6) % 7; // Sunday=0 → 6, Monday=1 → 0
  const monday = addDays(s, -offsetToMonday);
  return { from: monday, to: addDays(monday, 6) };
}

// shiftMonth returns the first day of the month delta months away.
export function shiftMonth(s: string, delta: number): string {
  const d = parseISODate(s);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

// monthRange returns the first–last day of the month containing the given date.
export function monthRange(s: string): DateRange {
  const d = parseISODate(s);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: toISODate(first), to: toISODate(last) };
}

const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// formatDateID renders an ISO date as e.g. "Minggu, 5 Juli 2026".
export function formatDateID(s: string): string {
  const d = parseISODate(s);
  return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}

// formatMonthID renders the month of an ISO date as e.g. "Juli 2026".
export function formatMonthID(s: string): string {
  const d = parseISODate(s);
  return `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}
