import { invitationStatusOf } from '@tatagereja/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Db, Queryable } from '../db/client';
import type { InvitationRow } from '../db/schema';
import { churchMemberships, invitations, users } from '../db/schema';
import { HttpError } from '../lib/errors';
import type { RequestMeta } from '../lib/request';
import { newId } from '../lib/tokens';
import { nowIso } from '../lib/time';
import { recordAudit } from './audit';
import { notify } from './notifications';

export function findInvitationByToken(db: Queryable, token: string): InvitationRow | undefined {
  return db.select().from(invitations).where(eq(invitations.token, token)).get();
}

export function assertInvitationUsable(invitation: InvitationRow | undefined): InvitationRow {
  if (!invitation) {
    throw new HttpError(404, 'INVITATION_INVALID', 'This invitation does not exist');
  }
  const status = invitationStatusOf(invitation);
  if (status !== 'active') {
    const reasons = {
      expired: 'This invitation has expired',
      exhausted: 'This invitation has reached its usage limit',
      revoked: 'This invitation has been revoked',
    } as const;
    throw new HttpError(410, 'INVITATION_INVALID', reasons[status]);
  }
  return invitation;
}

/**
 * Joins the user to the invitation's church. Runs inside a transaction so the
 * usage counter and membership stay consistent. Returns whether the user was
 * already a member (in which case the invitation is not consumed).
 */
export function acceptInvitation(
  db: Db,
  token: string,
  userId: string,
  meta: RequestMeta = { ip: null, userAgent: null },
): { churchId: string; alreadyMember: boolean; role: 'member' | 'administrator' } {
  return db.transaction((tx) => {
    const invitation = assertInvitationUsable(findInvitationByToken(tx, token));
    const existing = tx
      .select({ id: churchMemberships.id, role: churchMemberships.role })
      .from(churchMemberships)
      .where(
        and(
          eq(churchMemberships.churchId, invitation.churchId),
          eq(churchMemberships.userId, userId),
        ),
      )
      .get();
    if (existing) {
      return { churchId: invitation.churchId, alreadyMember: true, role: invitation.role };
    }
    const membershipId = newId();
    tx.insert(churchMemberships)
      .values({
        id: membershipId,
        churchId: invitation.churchId,
        userId,
        role: invitation.role,
        joinedAt: nowIso(),
      })
      .run();
    tx.update(invitations)
      .set({ useCount: sql`${invitations.useCount} + 1` })
      .where(eq(invitations.id, invitation.id))
      .run();
    const name = tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .get()?.name;
    recordAudit(
      tx,
      { ...meta, churchId: invitation.churchId, actorUserId: userId },
      {
        module: 'core',
        action: 'invitation.accept',
        entityType: 'invitation',
        entityId: invitation.id,
        summary: `${name ?? 'Someone'} joined as ${invitation.role} through an invitation`,
        after: { membershipId, role: invitation.role },
      },
    );
    notify(tx, {
      churchId: invitation.churchId,
      userIds: [invitation.createdBy],
      excludeUserIds: [userId],
      type: 'invitation.accepted',
      title: `${name ?? 'Someone'} joined through your invitation`,
      body: invitation.label,
      link: `/c/${invitation.churchId}/settings`,
      entityType: 'invitation',
      entityId: invitation.id,
    });
    return { churchId: invitation.churchId, alreadyMember: false, role: invitation.role };
  });
}
