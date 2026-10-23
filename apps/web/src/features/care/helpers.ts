import type {
  CareCategory,
  CarePriority,
  CareStatus,
  FollowUpStage,
  PersonSummary,
} from '@tatagereja/shared';
import { fullName } from '@tatagereja/shared';
import { CircleDot, Flower2, HandCoins, Hospital, House, MessagesSquare } from 'lucide-react';
import { useMemo } from 'react';
import type { Tone } from '@/components/ui/tone';
import { useI18n } from '@/lib/i18n';

/* Tones, icons and small helpers shared by the care screens. */

export const CATEGORY_ICONS: Record<CareCategory, React.ComponentType<{ className?: string }>> = {
  visitation: House,
  counseling: MessagesSquare,
  hospital: Hospital,
  grief: Flower2,
  financial_aid: HandCoins,
  other: CircleDot,
};

export const CATEGORY_TONES: Record<CareCategory, Tone> = {
  visitation: 'sky',
  counseling: 'violet',
  hospital: 'rose',
  grief: 'slate',
  financial_aid: 'emerald',
  other: 'neutral',
};

export const STATUS_TONES: Record<CareStatus, Tone> = {
  open: 'info',
  in_progress: 'warning',
  closed: 'success',
};

export const PRIORITY_TONES: Record<CarePriority, Tone> = {
  low: 'neutral',
  normal: 'slate',
  high: 'warning',
  urgent: 'danger',
};

export const STAGE_TONES: Record<FollowUpStage, Tone> = {
  new: 'sky',
  contacted: 'amber',
  visited: 'violet',
  joined: 'success',
  closed: 'neutral',
};

export const personName = (person: PersonSummary | null | undefined) =>
  person ? fullName(person) : null;

/** Today's date (`YYYY-MM-DD`) in the church time zone. */
export function useToday(): string {
  const { timeZone } = useI18n();
  return useMemo(() => {
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
  }, [timeZone]);
}

/** Indonesian numbers for WhatsApp links: 0812… becomes 62812…. */
export const whatsappNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
};
