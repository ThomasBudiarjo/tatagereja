import type { LoginEvent, MemberListItem } from '@tatagereja/shared';
import type { LoginEventRow } from '../../db/schema';
import { toMembership } from '../../serializers';
import type { MemberRow } from './members';

export const toLoginEvent = (row: LoginEventRow): LoginEvent => ({
  id: row.id,
  outcome: row.outcome,
  reason: row.reason,
  ip: row.ip,
  userAgent: row.userAgent,
  createdAt: row.createdAt,
});

/** A member row; security details only for callers who may see them. */
export const toMemberListItem = (row: MemberRow, showSecurity: boolean): MemberListItem => ({
  ...toMembership(row.membership, row.user, row.roleIds),
  suspendedAt: row.membership.suspendedAt,
  twoFactorEnabled: showSecurity ? row.twoFactorEnabled : null,
  manager: row.manager,
  isLeader: row.isLeader,
  personId: row.personId,
  permissions: row.permissions,
});
