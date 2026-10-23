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
  'group.member_remove': 'admin-security.actGroupMemberRemove',
  'group.members_add': 'admin-security.actGroupMembersAdd',
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
  'person.status_change': 'admin-security.actPersonStatusChange',
  'role.create': 'admin-security.actRoleCreate',
  'role.delete': 'admin-security.actRoleDelete',
  'role.update': 'admin-security.actRoleUpdate',
  'security.policy_update': 'admin-security.actSecurityPolicyUpdate',
};

const ENTITY_KEYS: Record<string, MessageKey> = {
  absence_alert: 'admin-security.entAbsenceAlert',
  announcement: 'admin-security.entAnnouncement',
  area: 'admin-security.entArea',
  attendance_session: 'admin-security.entAttendanceSession',
  bulletin: 'admin-security.entBulletin',
  calendar_feed: 'admin-security.entCalendarFeed',
  care_case: 'admin-security.entCareCase',
  care_note: 'admin-security.entCareNote',
  care_task: 'admin-security.entCareTask',
  care_visit: 'admin-security.entCareVisit',
  checkin: 'admin-security.entCheckin',
  checkin_alert: 'admin-security.entCheckinAlert',
  checkin_class: 'admin-security.entCheckinClass',
  checkin_pickup: 'admin-security.entCheckinPickup',
  checkin_session: 'admin-security.entCheckinSession',
  custom_field: 'admin-security.entCustomField',
  diakonia_aid: 'admin-security.entDiakoniaAid',
  event: 'admin-security.entEvent',
  event_series: 'admin-security.entEventSeries',
  expense_request: 'admin-security.entExpenseRequest',
  facility_booking: 'admin-security.entFacilityBooking',
  facility_resource: 'admin-security.entFacilityResource',
  finance_account: 'admin-security.entFinanceAccount',
  finance_budget: 'admin-security.entFinanceBudget',
  finance_campaign: 'admin-security.entFinanceCampaign',
  finance_category: 'admin-security.entFinanceCategory',
  finance_contribution: 'admin-security.entFinanceContribution',
  finance_entry: 'admin-security.entFinanceEntry',
  finance_fund: 'admin-security.entFinanceFund',
  finance_period: 'admin-security.entFinancePeriod',
  finance_pledge: 'admin-security.entFinancePledge',
  finance_setup: 'admin-security.entFinanceSetup',
  finance_transfer: 'admin-security.entFinanceTransfer',
  household: 'admin-security.entHousehold',
  inventory_asset: 'admin-security.entInventoryAsset',
  offering_batch: 'admin-security.entOfferingBatch',
  prayer_request: 'admin-security.entPrayerRequest',
  registry_record: 'admin-security.entRegistryRecord',
  report: 'admin-security.entReport',
  service: 'admin-security.entService',
  service_type: 'admin-security.entServiceType',
  serving_position: 'admin-security.entServingPosition',
  serving_team: 'admin-security.entServingTeam',
  song: 'admin-security.entSong',
  tag: 'admin-security.entTag',
  visitor_follow_up: 'admin-security.entVisitorFollowUp',
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

/** Verbs (the last word of an action key) described in the active language. */
const VERB_KEYS: Record<string, MessageKey> = {
  create: 'admin-security.verbCreate',
  update: 'admin-security.verbUpdate',
  change: 'admin-security.verbUpdate',
  correct: 'admin-security.verbUpdate',
  delete: 'admin-security.verbDelete',
  remove: 'admin-security.verbDelete',
  revoke: 'admin-security.verbDelete',
  add: 'admin-security.verbAdd',
  log: 'admin-security.verbAdd',
  void: 'admin-security.verbVoid',
  export: 'admin-security.verbExport',
  import: 'admin-security.verbImport',
  assign: 'admin-security.verbAssign',
  publish: 'admin-security.verbPublish',
  unpublish: 'admin-security.verbUnpublish',
  close: 'admin-security.verbClose',
  reopen: 'admin-security.verbReopen',
  approve: 'admin-security.verbApprove',
  verify: 'admin-security.verbApprove',
  submit: 'admin-security.verbSubmit',
  cancel: 'admin-security.verbCancel',
  restore: 'admin-security.verbRestore',
  merge: 'admin-security.verbMerge',
};

/** An action key ("member.suspend") in the active language, falling back on its verb. */
export function auditActionLabel(action: string, entityType: string, t: Translate): string {
  const key = ACTION_KEYS[action];
  if (key) return t(key);
  const entity = auditEntityLabel(entityType, t);
  // `group.leader_assign` → `assign`, `church.backup_export` → `export`.
  const verb = (action.split('.').pop() ?? action).split('_').pop() ?? action;
  const verbKey = VERB_KEYS[verb];
  if (verbKey) return t(verbKey, { entity });
  return t('admin-security.verbOther', { entity, action: humanize(verb) });
}

const NAME_FIELDS = ['name', 'title', 'label'] as const;

/**
 * Who and what an entry is about: the item's name and the member or person it concerns, from
 * the params the API recorded (older entries: from their recorded values).
 */
function auditSubject(entry: Pick<AuditLog, 'params' | 'before' | 'after'>): string | null {
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;
  const params = entry.params ?? {};
  const who = text(params.member) ?? text(params.person);
  let name = text(params.name);
  if (!name) {
    for (const side of [entry.after, entry.before]) {
      if (name || !side || typeof side !== 'object') continue;
      for (const field of NAME_FIELDS) name ??= text((side as Record<string, unknown>)[field]);
    }
  }
  const parts = [name, who && who !== name ? who : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The headline of an entry. English shows the summary the API recorded (it names everyone
 * involved); other languages name the action and, from its params, the item and the member.
 * An entry whose content the viewer may not read names only the action.
 */
export function auditHeadline(
  entry: Pick<
    AuditLog,
    'action' | 'entityType' | 'summary' | 'params' | 'redacted' | 'before' | 'after'
  >,
  locale: Locale,
  t: Translate,
): string {
  const label = auditActionLabel(entry.action, entry.entityType, t);
  if (entry.redacted) return `${label} · ${t('admin-security.auditHidden')}`;
  if (locale === 'en') return entry.summary;
  const subject = auditSubject(entry);
  return subject ? `${label}: ${subject}` : label;
}
