import {
  Bell,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  HandHeart,
  HeartHandshake,
  Megaphone,
  Newspaper,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Tone } from '@/components/ui/tone';

/** An icon and tone per notification family, so the inbox reads at a glance. */
const VISUALS: [prefix: string, icon: LucideIcon, tone: Tone][] = [
  ['announcement.', Megaphone, 'amber'],
  ['event.registration', CalendarCheck, 'sky'],
  ['event.changed', CalendarClock, 'warning'],
  ['event.', CalendarDays, 'sky'],
  ['bulletin.', Newspaper, 'amber'],
  ['roster.', HandHeart, 'violet'],
  ['service', HandHeart, 'violet'],
  ['booking', Building2, 'olive'],
  ['facilit', Building2, 'olive'],
  ['loan', Building2, 'olive'],
  ['asset', Building2, 'olive'],
  ['prayer', HeartHandshake, 'rose'],
  ['care', HeartHandshake, 'rose'],
  ['visit', HeartHandshake, 'rose'],
  ['finance', Wallet, 'emerald'],
  ['expense', Wallet, 'emerald'],
  ['offering', Wallet, 'emerald'],
  ['record', ScrollText, 'indigo'],
  ['registry', ScrollText, 'indigo'],
  ['group', Users, 'teal'],
  ['household', Users, 'teal'],
  ['invitation', UserPlus, 'teal'],
  ['checkin', Sparkles, 'sun'],
  ['membership', ShieldCheck, 'slate'],
  ['church', ShieldCheck, 'slate'],
  ['security', ShieldCheck, 'slate'],
];

export function notificationVisual(type: string): { icon: LucideIcon; tone: Tone } {
  const match = VISUALS.find(([prefix]) => type.startsWith(prefix));
  return match ? { icon: match[1], tone: match[2] } : { icon: Bell, tone: 'brand' };
}
