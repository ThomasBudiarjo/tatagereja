import {
  Blocks,
  Building2,
  FileClock,
  KeyRound,
  QrCode,
  ShieldCheck,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import type { Tone } from '@/components/ui/tone';
import { useModuleContext } from '@/features/registry';
import type { MessageKey } from '@/lib/i18n';
import { evaluateAccess, type AccessRule } from '@/lib/modules';
import { SECTION_ACCESS } from './access';

export type SettingsSectionId =
  'profile' | 'members' | 'roles' | 'invitations' | 'modules' | 'security' | 'audit' | 'danger';

export type SettingsSection = {
  id: SettingsSectionId;
  icon: LucideIcon;
  tone: Tone;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  group: 'church' | 'people' | 'protection' | 'other';
  access?: AccessRule;
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'profile',
    icon: Building2,
    tone: 'brand',
    labelKey: 'admin-security.sectionProfile',
    descriptionKey: 'admin-security.sectionProfileHint',
    group: 'church',
  },
  {
    id: 'modules',
    icon: Blocks,
    tone: 'violet',
    labelKey: 'admin-security.sectionModules',
    descriptionKey: 'admin-security.sectionModulesHint',
    group: 'church',
    access: SECTION_ACCESS.modules,
  },
  {
    id: 'members',
    icon: Users,
    tone: 'sky',
    labelKey: 'admin-security.sectionMembers',
    descriptionKey: 'admin-security.sectionMembersHint',
    group: 'people',
    access: SECTION_ACCESS.members,
  },
  {
    id: 'roles',
    icon: KeyRound,
    tone: 'amber',
    labelKey: 'admin-security.sectionRoles',
    descriptionKey: 'admin-security.sectionRolesHint',
    group: 'people',
    access: SECTION_ACCESS.roles,
  },
  {
    id: 'invitations',
    icon: QrCode,
    tone: 'teal',
    labelKey: 'admin-security.sectionInvitations',
    descriptionKey: 'admin-security.sectionInvitationsHint',
    group: 'people',
    access: SECTION_ACCESS.invitations,
  },
  {
    id: 'security',
    icon: ShieldCheck,
    tone: 'emerald',
    labelKey: 'admin-security.sectionSecurity',
    descriptionKey: 'admin-security.sectionSecurityHint',
    group: 'protection',
    access: SECTION_ACCESS.security,
  },
  {
    id: 'audit',
    icon: FileClock,
    tone: 'indigo',
    labelKey: 'admin-security.sectionAudit',
    descriptionKey: 'admin-security.sectionAuditHint',
    group: 'protection',
    access: SECTION_ACCESS.audit,
  },
  {
    id: 'danger',
    icon: TriangleAlert,
    tone: 'danger',
    labelKey: 'admin-security.sectionDanger',
    descriptionKey: 'admin-security.sectionDangerHint',
    group: 'other',
  },
];

export const SECTION_GROUPS: readonly { id: SettingsSection['group']; labelKey: MessageKey }[] = [
  { id: 'church', labelKey: 'admin-security.groupChurch' },
  { id: 'people', labelKey: 'admin-security.groupPeople' },
  { id: 'protection', labelKey: 'admin-security.groupProtection' },
  { id: 'other', labelKey: 'admin-security.groupOther' },
];

/** The sections the caller may open, in display order. */
export function useSettingsSections() {
  const context = useModuleContext();
  return useMemo(
    () => SETTINGS_SECTIONS.filter((section) => evaluateAccess(section.access, context)),
    [context],
  );
}
