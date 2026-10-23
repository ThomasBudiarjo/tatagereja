import type { AnnouncementDetails, AnnouncementState } from '@tatagereja/shared';
import { Globe2, ShieldCheck, Users } from 'lucide-react';
import type { Tone } from '@/components/ui/tone';
import type { Translate } from '@/lib/i18n';

export const ANNOUNCEMENT_TONE = 'amber' as const;

export const STATE_TONES: Record<AnnouncementState, Tone> = {
  draft: 'warning',
  scheduled: 'info',
  published: 'success',
  expired: 'neutral',
};

export const AUDIENCE_ICONS = { church: Globe2, group: Users, roles: ShieldCheck } as const;

/** Who it is for: the whole church, a group, or the holders of some roles. */
export function audienceText(
  announcement: Pick<AnnouncementDetails, 'audience' | 'groupName' | 'roleNames'>,
  t: Translate,
  formatList: (items: readonly string[]) => string,
) {
  if (announcement.audience === 'group') {
    return announcement.groupName ?? t('announcements.audienceGroup');
  }
  if (announcement.audience === 'roles') {
    return announcement.roleNames.length
      ? formatList(announcement.roleNames)
      : t('announcements.audienceRoles');
  }
  return t('announcements.audienceChurch');
}
