import { FileClock, KeyRound, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';
import { SECTION_ACCESS } from './settings/access';

/** The security centre: anyone who manages people, roles, the audit log or the policy. */
const center: AccessRule = {
  anyOf: [
    'security.view',
    'security.manage',
    'backup.export',
    'roles.manage',
    'audit.view',
    'members.view',
    'members.manage',
  ],
};

export const adminSecurityModule = defineModule({
  id: 'admin-security',
  icon: ShieldCheck,
  accent: 'slate',
  labelKey: 'admin-security.nav',
  descriptionKey: 'admin-security.description',
  section: 'admin',
  routes: [
    {
      path: 'security',
      lazy: lazyPage(() => import('./security-home-page'), 'SecurityHomePage'),
      handle: { access: center },
    },
    // Church settings sections; `settings` itself (the list of sections) is routed by core.
    {
      path: 'settings/profile',
      lazy: lazyPage(() => import('./settings/profile-page'), 'ChurchProfileSettingsPage'),
    },
    {
      path: 'settings/members',
      lazy: lazyPage(() => import('./settings/members-page'), 'MembersSettingsPage'),
      handle: { access: SECTION_ACCESS.members },
    },
    {
      path: 'settings/members/:membershipId',
      lazy: lazyPage(() => import('./settings/member-detail-page'), 'MemberDetailPage'),
      handle: { access: SECTION_ACCESS.members },
    },
    {
      path: 'settings/roles',
      lazy: lazyPage(() => import('./settings/roles-page'), 'RolesSettingsPage'),
      handle: { access: SECTION_ACCESS.roles },
    },
    {
      path: 'settings/roles/new',
      lazy: lazyPage(() => import('./settings/role-editor-page'), 'RoleEditorPage'),
      handle: { access: { anyOf: ['roles.manage'] } },
    },
    {
      path: 'settings/roles/:roleId',
      lazy: lazyPage(() => import('./settings/role-editor-page'), 'RoleEditorPage'),
      handle: { access: SECTION_ACCESS.roles },
    },
    {
      path: 'settings/invitations',
      lazy: lazyPage(() => import('./settings/invitations-page'), 'InvitationsSettingsPage'),
      handle: { access: SECTION_ACCESS.invitations },
    },
    {
      path: 'settings/modules',
      lazy: lazyPage(() => import('./settings/modules-page'), 'ModulesSettingsPage'),
      handle: { access: SECTION_ACCESS.modules },
    },
    {
      path: 'settings/security',
      lazy: lazyPage(() => import('./settings/security-page'), 'SecuritySettingsPage'),
      handle: { access: SECTION_ACCESS.security },
    },
    {
      path: 'settings/audit',
      lazy: lazyPage(() => import('./settings/audit-page'), 'AuditLogPage'),
      handle: { access: SECTION_ACCESS.audit },
    },
    {
      path: 'settings/danger',
      lazy: lazyPage(() => import('./settings/danger-page'), 'DangerZonePage'),
    },
  ],
  nav: [
    {
      id: 'admin-security',
      to: 'security',
      labelKey: 'admin-security.nav',
      descriptionKey: 'admin-security.description',
      icon: ShieldCheck,
      order: 80,
      access: center,
      keywords: ['keamanan', 'peran', 'hak akses', 'audit', '2fa', 'roles', 'permissions'],
    },
  ],
  quickActions: [
    {
      id: 'invite-members',
      to: 'settings/invitations?new=1',
      labelKey: 'admin-security.inviteMembers',
      icon: UserPlus,
      tone: 'teal',
      order: 90,
      access: SECTION_ACCESS.invitations,
    },
  ],
  commands: [
    {
      id: 'members',
      to: 'settings/members',
      labelKey: 'admin-security.sectionMembers',
      icon: Users,
      keywords: ['anggota', 'akun', 'tangguhkan', 'members', 'suspend'],
      access: SECTION_ACCESS.members,
    },
    {
      id: 'roles',
      to: 'settings/roles',
      labelKey: 'admin-security.sectionRoles',
      icon: KeyRound,
      keywords: ['peran', 'hak akses', 'majelis', 'bendahara', 'roles', 'permissions'],
      access: SECTION_ACCESS.roles,
    },
    {
      id: 'new-role',
      to: 'settings/roles/new',
      labelKey: 'admin-security.newRole',
      icon: KeyRound,
      keywords: ['peran baru', 'new role'],
      access: { anyOf: ['roles.manage'] },
    },
    {
      id: 'audit',
      to: 'settings/audit',
      labelKey: 'admin-security.sectionAudit',
      icon: FileClock,
      keywords: ['log', 'riwayat', 'perubahan', 'history', 'audit'],
      access: SECTION_ACCESS.audit,
    },
  ],
});
