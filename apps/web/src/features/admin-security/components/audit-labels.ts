import type { AuditLog, Locale } from '@tatagereja/shared';
import type { MessageKey, Translate } from '@/lib/i18n';

const ACTION_KEYS: Record<string, MessageKey> = {
  'account.data_export': 'admin-security.actAccountDataExport',
  'account.delete': 'admin-security.actAccountDelete',
  'account.password_change': 'admin-security.actAccountPasswordChange',
  'account.recovery_codes_regenerate': 'admin-security.actAccountRecoveryCodesRegenerate',
  'account.session_revoke': 'admin-security.actAccountSessionRevoke',
  'account.sessions_revoke': 'admin-security.actAccountSessionsRevoke',
  'account.two_factor_disable': 'admin-security.actAccountTwoFactorDisable',
  'account.two_factor_enable': 'admin-security.actAccountTwoFactorEnable',
  'audit.export': 'admin-security.actAuditExport',
  'church.backup_export': 'admin-security.actChurchBackupExport',
  'church.create': 'admin-security.actChurchCreate',
  'church.delete': 'admin-security.actChurchDelete',
  'church.modules_update': 'admin-security.actChurchModulesUpdate',
  'church.transfer': 'admin-security.actChurchTransfer',
  'church.update': 'admin-security.actChurchUpdate',
  'group.delete': 'admin-security.actGroupDelete',
  'group.leader_assign': 'admin-security.actGroupLeaderAssign',
  'group.leader_remove': 'admin-security.actGroupLeaderRemove',
  'invitation.accept': 'admin-security.actInvitationAccept',
  'invitation.create': 'admin-security.actInvitationCreate',
  'invitation.revoke': 'admin-security.actInvitationRevoke',
  'member.account_delete': 'admin-security.actMemberAccountDelete',
  'member.leave': 'admin-security.actMemberLeave',
  'member.reactivate': 'admin-security.actMemberReactivate',
  'member.remove': 'admin-security.actMemberRemove',
  'member.role_change': 'admin-security.actMemberRoleChange',
  'member.roles_update': 'admin-security.actMemberRolesUpdate',
  'member.suspend': 'admin-security.actMemberSuspend',
  'person.delete': 'admin-security.actPersonDelete',
  'person.private_update': 'admin-security.actPersonPrivateUpdate',
  'role.create': 'admin-security.actRoleCreate',
  'role.delete': 'admin-security.actRoleDelete',
  'role.update': 'admin-security.actRoleUpdate',
  'security.policy_update': 'admin-security.actSecurityPolicyUpdate',
};

const ENTITY_KEYS: Record<string, MessageKey> = {
  audit_log: 'admin-security.entAuditLog',
  church: 'admin-security.entChurch',
  group: 'admin-security.entGroup',
  invitation: 'admin-security.entInvitation',
  membership: 'admin-security.entMembership',
  person: 'admin-security.entPerson',
  role: 'admin-security.entRole',
  user: 'admin-security.entUser',
};

const humanize = (value: string) => value.replace(/[_-]+/g, ' ');

/** An entity type ("membership") in the active language, or made readable. */
export const auditEntityLabel = (entityType: string, t: Translate): string => {
  const key = ENTITY_KEYS[entityType];
  return key ? t(key) : humanize(entityType);
};

/** An action key ("member.suspend") in the active language, falling back on its verb. */
export function auditActionLabel(action: string, entityType: string, t: Translate): string {
  const key = ACTION_KEYS[action];
  if (key) return t(key);
  const entity = auditEntityLabel(entityType, t);
  const verb = action.split('.').pop() ?? action;
  if (verb === 'create') return t('admin-security.verbCreate', { entity });
  if (verb === 'update') return t('admin-security.verbUpdate', { entity });
  if (verb === 'delete' || verb === 'remove') return t('admin-security.verbDelete', { entity });
  return t('admin-security.verbOther', { entity, action: humanize(verb) });
}

const NAME_FIELDS = ['name', 'title', 'label'] as const;

/** The name of the item an entry is about, when its recorded values carry one. */
function auditSubject(entry: Pick<AuditLog, 'before' | 'after'>): string | null {
  for (const side of [entry.after, entry.before]) {
    if (!side || typeof side !== 'object') continue;
    for (const field of NAME_FIELDS) {
      const value = (side as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

/**
 * The headline of an entry. English shows the summary the API recorded (it names everyone
 * involved); other languages name the action and, when known, the item.
 */
export function auditHeadline(
  entry: Pick<AuditLog, 'action' | 'entityType' | 'summary' | 'before' | 'after'>,
  locale: Locale,
  t: Translate,
): string {
  if (locale === 'en') return entry.summary;
  const label = auditActionLabel(entry.action, entry.entityType, t);
  const subject = auditSubject(entry);
  return subject ? `${label}: ${subject}` : label;
}
