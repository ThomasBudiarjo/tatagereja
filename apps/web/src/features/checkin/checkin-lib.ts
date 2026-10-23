import {
  canManageCheckin,
  canOperateCheckin,
  type AlertSeverity,
  type CheckinClass,
  type CheckinStatus,
  type ChildAlertKind,
} from '@tatagereja/shared';
import { HeartPulse, Info, ShieldAlert, Wheat } from 'lucide-react';
import type { ComponentType } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import type { Tone } from '@/components/ui/tone';
import { useI18n } from '@/lib/i18n';

/* Constants, helpers and hooks shared by the check-in screens (components live in checkin-ui). */

/** The module accent (also set in `module.tsx`). */
export const CHECKIN_TONE = 'sun' satisfies Tone;

export const SEVERITY_TONES: Record<AlertSeverity, Tone> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

export const ALERT_KIND_ICONS: Record<ChildAlertKind, ComponentType<{ className?: string }>> = {
  allergy: Wheat,
  medical: HeartPulse,
  custody: ShieldAlert,
  other: Info,
};

export const CHECKIN_STATUS_TONES: Record<CheckinStatus, Tone> = {
  checked_in: 'success',
  checked_out: 'neutral',
};

/** Class colours offered in the class form (the first is the default sun tone). */
export const CLASS_COLORS = [
  '#e0a526',
  '#e07a5f',
  '#d9577b',
  '#9b6bd3',
  '#4f86d9',
  '#2fa39a',
  '#5aa454',
  '#8a8f98',
] as const;

/** What the caller may do in the module. */
export function useCheckinAccess() {
  const { access } = useChurch();
  return { canOperate: canOperateCheckin(access), canManage: canManageCheckin(access) };
}

/** "4–6 years", "13+ years" or null for a class without an age range. */
export function useAgeRange() {
  const { t } = useI18n();
  return (item: Pick<CheckinClass, 'minAge' | 'maxAge'>): string | null => {
    if (item.minAge === null && item.maxAge === null) return null;
    if (item.maxAge === null) return t('checkin.agesFrom', { min: item.minAge ?? 0 });
    if (item.minAge === null) return t('checkin.agesUpTo', { max: item.maxAge });
    return t('checkin.agesRange', { min: item.minAge, max: item.maxAge });
  };
}

/** Today's date (YYYY-MM-DD) in a time zone, for new sessions. */
export const todayIn = (timeZone: string | undefined): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};
