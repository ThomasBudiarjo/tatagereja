import type {
  AssetCondition,
  AssetStatus,
  BookingStatus,
  MaintenanceKind,
  ResourceKind,
} from '@tatagereja/shared';
import {
  Armchair,
  Bus,
  Church,
  DoorOpen,
  GraduationCap,
  Package,
  Projector,
  Search,
  Sparkles,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleTone, Tone } from '@/components/ui/tone';

/** The module accent (see module.tsx). */
export const FACILITIES_TONE: ModuleTone = 'olive';
export const INVENTORY_TONE: ModuleTone = 'teal';

export const RESOURCE_KIND_ICONS: Record<ResourceKind, LucideIcon> = {
  sanctuary: Church,
  hall: Warehouse,
  classroom: GraduationCap,
  room: DoorOpen,
  vehicle: Bus,
  equipment: Projector,
  other: Armchair,
};

export const RESOURCE_KIND_TONES: Record<ResourceKind, ModuleTone> = {
  sanctuary: 'violet',
  hall: 'amber',
  classroom: 'sky',
  room: 'olive',
  vehicle: 'indigo',
  equipment: 'teal',
  other: 'slate',
};

export const BOOKING_STATUS_TONES: Record<BookingStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export const ASSET_STATUS_TONES: Record<AssetStatus, Tone> = {
  available: 'success',
  on_loan: 'info',
  maintenance: 'warning',
  retired: 'neutral',
  lost: 'danger',
};

export const ASSET_CONDITION_TONES: Record<AssetCondition, Tone> = {
  new: 'emerald',
  good: 'success',
  fair: 'sun',
  poor: 'warning',
  broken: 'danger',
};

export const MAINTENANCE_KIND_ICONS: Record<MaintenanceKind, LucideIcon> = {
  inspection: Search,
  repair: Wrench,
  service: Sparkles,
  cleaning: Sparkles,
  other: Package,
};

const DAY_MS = 86_400_000;

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(at: Date, timeZone: string) {
  const parts: Record<string, string> = {};
  try {
    for (const part of new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    }).formatToParts(at)) {
      parts[part.type] = part.value;
    }
  } catch {
    return zonedParts(at, 'UTC');
  }
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: Math.max(0, weekdays.indexOf(parts.weekday ?? 'Sun')),
  };
}

/** Today (`YYYY-MM-DD`) in the church time zone. */
export const todayIn = (timeZone: string) => zonedParts(new Date(), timeZone).date;

/** `YYYY-MM-DD` plus whole days. */
export const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The instant a local day starts in the church time zone. */
export function startOfZonedDay(date: string, timeZone: string): Date {
  const noon = new Date(`${date}T12:00:00Z`);
  const local = zonedParts(noon, timeZone);
  const offsetMinutes =
    (Date.parse(`${local.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 60_000 +
    local.hour * 60 +
    local.minute -
    12 * 60;
  return new Date(Date.parse(`${date}T00:00:00Z`) - offsetMinutes * 60_000);
}

/** Monday of the week that contains `date`. */
export function weekStartOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}

/** Minutes since local midnight of `day`, clamped to the day. */
export function minutesInDay(iso: string, day: string, timeZone: string): number {
  const start = startOfZonedDay(day, timeZone).getTime();
  const minutes = (new Date(iso).getTime() - start) / 60_000;
  return Math.min(24 * 60, Math.max(0, minutes));
}

export const isValidDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** A stable colour for a resource: its own colour, else one derived from the kind. */
export const resourceTone = (kind: ResourceKind): ModuleTone => RESOURCE_KIND_TONES[kind];
