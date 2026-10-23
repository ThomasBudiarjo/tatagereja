import {
  daysUntilAnniversary,
  type GroupType,
  type PersonMembershipStatus,
} from '@tatagereja/shared';
import {
  BookOpen,
  Church,
  ClipboardList,
  HandHeart,
  MapPin,
  Music,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleTone, StatusTone } from '@/components/ui/tone';

/** Status colours: members green, regular attendees blue, visitors amber, inactive grey. */
export const STATUS_TONE: Record<PersonMembershipStatus, StatusTone> = {
  member: 'success',
  regular: 'info',
  visitor: 'warning',
  inactive: 'neutral',
};

export const GROUP_TYPE_STYLE: Record<GroupType, { icon: LucideIcon; tone: ModuleTone }> = {
  komisi: { icon: Church, tone: 'violet' },
  ministry: { icon: HandHeart, tone: 'sky' },
  small_group: { icon: BookOpen, tone: 'teal' },
  committee: { icon: ClipboardList, tone: 'amber' },
  choir: { icon: Music, tone: 'rose' },
  area: { icon: MapPin, tone: 'emerald' },
  other: { icon: UsersRound, tone: 'slate' },
};

/** Birthdays and anniversaries this close are highlighted in the directory. */
export const CELEBRATION_WINDOW_DAYS = 7;

/** Today in the church time zone (YYYY-MM-DD). */
export const todayInZone = (timeZone?: string): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

/** Days until the next anniversary of a date, when it is within the highlight window. */
export const upcomingInDays = (date: string | null, today: string): number | null => {
  if (!date) return null;
  const days = daysUntilAnniversary(date, today);
  return days <= CELEBRATION_WINDOW_DAYS ? days : null;
};

/** The first letter used for alphabetical sections ("#" for anything that is not a letter). */
export const sectionLetter = (name: string): string => {
  const letter = name
    .trim()
    .charAt(0)
    .toLocaleUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return /\p{L}/u.test(letter) ? letter : '#';
};

/** WhatsApp link for an Indonesian phone number (0812… → 62812…). */
export const whatsappLink = (phone: string): string | null => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const international = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
};

/** Colours offered for areas and groups; they read well on light and dark surfaces. */
export const SWATCHES = [
  '#2a78d6',
  '#1baf7a',
  '#eda100',
  '#eb6834',
  '#e87ba4',
  '#6250d6',
  '#0f8b8d',
  '#8a6a3b',
] as const;
