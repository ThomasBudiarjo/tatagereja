import { can, invitationStatusOf } from '@tatagereja/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Db, Queryable } from '../db/client';
import type { InvitationRow } from '../db/schema';
import { churches, churchMemberships, invitations, users } from '../db/schema';
import { HttpError } from '../lib/errors';
import type { RequestMeta } from '../lib/request';
import { hashToken, newId } from '../lib/tokens';
import { nowIso } from '../lib/time';
import { loadAccess } from './access';
import { recordAudit } from './audit';
import { notify } from './notifications';

/** Invitations are found by the hash of their link token; the token itself is never stored. */
export function findInvitationByToken(db: Queryable, token: string): InvitationRow | undefined {
  return db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)))
    .get();
}

/**
 * Replaces the plain link tokens of invitations made before tokens were hashed with their
 * hash. Runs at startup; a hash is 64 hex characters and no plain token is, so rows already
 * hashed are left alone and it is idempotent.
 */
export function hashLegacyInvitationTokens(db: Queryable): number {
  const rows = db
    .select({ id: invitations.id, tokenHash: invitations.tokenHash })
    .from(invitations)
    .all()
    .filter((row) => !/^[0-9a-f]{64}$/.test(row.tokenHash));
  for (const row of rows) {
    db.update(invitations)
      .set({ tokenHash: hashToken(row.tokenHash) })
      .where(eq(invitations.id, row.id))
      .run();
  }
  return rows.length;
}

/**
 * Whether the person who created an administrator invitation could still create it today. An
 * administrator link must not outlive its creator's own rights (demoted, removed, suspended);
 * member links keep working, since they are often printed in the Warta Jemaat.
 */
function inviterStillEntitled(db: Queryable, invitation: InvitationRow): boolean {
  if (invitation.role === 'member') return true;
  const church = db.select().from(churches).where(eq(churches.id, invitation.churchId)).get();
  const membership = db
    .select()
    .from(churchMemberships)
    .where(
      and(
        eq(churchMemberships.churchId, invitation.churchId),
        eq(churchMemberships.userId, invitation.createdBy),
      ),
    )
    .get();
  if (!church || !membership || membership.status !== 'active') return false;
  return can.inviteWithRole(loadAccess(db, church, membership), invitation.role);
}

/** The status people see: an administrator link whose creator lost the right reads as revoked. */
export const effectiveInvitationStatus = (db: Queryable, invitation: InvitationRow) => {
  const status = invitationStatusOf(invitation);
  return status === 'active' && !inviterStillEntitled(db, invitation) ? 'revoked' : status;
};

export function assertInvitationUsable(
  db: Queryable,
  invitation: InvitationRow | undefined,
): InvitationRow {
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
  if (!inviterStillEntitled(db, invitation)) {
    throw new HttpError(
      410,
      'INVITATION_INVALID',
      'This invitation is no longer valid. Ask the church for a new one',
    );
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
    const invitation = assertInvitationUsable(tx, findInvitationByToken(tx, token));
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
      title: {
        id: `${name ?? 'Seseorang'} bergabung lewat undangan Anda`,
        en: `${name ?? 'Someone'} joined through your invitation`,
      },
      body: invitation.label,
      link: `/c/${invitation.churchId}/settings`,
      entityType: 'invitation',
      entityId: invitation.id,
    });
    return { churchId: invitation.churchId, alreadyMember: false, role: invitation.role };
  });
}
