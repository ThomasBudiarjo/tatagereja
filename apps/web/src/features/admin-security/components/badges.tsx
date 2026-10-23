import type { ChurchRole, MembershipStatus } from '@tatagereja/shared';
import { Crown, ShieldCheck, ShieldOff, UserCog } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';
import { ROLE_TONES } from './tones';

export function RoleBadge({ role, size }: { role: ChurchRole; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  return (
    <StatusBadge
      tone={ROLE_TONES[role]}
      size={size}
      icon={role === 'owner' ? Crown : role === 'administrator' ? UserCog : undefined}
    >
      {t(ROLE_KEYS[role])}
    </StatusBadge>
  );
}

export function MemberStatusBadge({
  status,
  size,
}: {
  status: MembershipStatus;
  size?: 'sm' | 'md';
}) {
  const { t } = useI18n();
  return (
    <StatusBadge tone={status === 'active' ? 'success' : 'warning'} dot size={size}>
      {t(status === 'active' ? 'common.statusActive' : 'common.statusSuspended')}
    </StatusBadge>
  );
}

/** Two-step verification state; nothing when the caller may not see it. */
export function TwoFactorBadge({
  enabled,
  size = 'sm',
}: {
  enabled: boolean | null;
  size?: 'sm' | 'md';
}) {
  const { t } = useI18n();
  if (enabled === null) return null;
  return (
    <StatusBadge
      tone={enabled ? 'success' : 'warning'}
      size={size}
      icon={enabled ? ShieldCheck : ShieldOff}
    >
      {t(enabled ? 'admin-security.twoFactorOn' : 'admin-security.twoFactorOff')}
    </StatusBadge>
  );
}
