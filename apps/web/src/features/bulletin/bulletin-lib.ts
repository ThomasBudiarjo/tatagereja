import {
  addDaysToDate,
  type BulletinRenderedSection,
  type BulletinSectionKind,
} from '@tatagereja/shared';
import {
  Cake,
  CalendarDays,
  Church,
  HandHeart,
  Heart,
  Megaphone,
  PenLine,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleTone } from '@/components/ui/tone';
import { weekdayOf } from '@/features/calendar/calendar-lib';

export const BULLETIN_TONE: ModuleTone = 'amber';

export const SECTION_ICONS: Record<BulletinSectionKind, LucideIcon> = {
  text: PenLine,
  announcements: Megaphone,
  services: Church,
  rosters: HandHeart,
  events: CalendarDays,
  birthdays: Cake,
  anniversaries: Heart,
  finance: Wallet,
};

export const SECTION_TONES: Record<BulletinSectionKind, ModuleTone> = {
  text: 'amber',
  announcements: 'amber',
  services: 'violet',
  rosters: 'indigo',
  events: 'sky',
  birthdays: 'rose',
  anniversaries: 'rose',
  finance: 'emerald',
};

/** The coming Sunday (or today when it is Sunday): the usual issue date of a Warta Jemaat. */
export const nextSunday = (today: string) => {
  const weekday = weekdayOf(today);
  return weekday === 0 ? today : addDaysToDate(today, 7 - weekday);
};

export const newSectionId = () => crypto.randomUUID().slice(0, 8);

/** Whether a generated section has anything to show this week. */
export const hasContent = (section: BulletinRenderedSection) =>
  section.kind === 'text'
    ? !!section.body?.trim()
    : section.kind === 'finance'
      ? !!section.finance
      : section.items.length > 0;
