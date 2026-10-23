import {
  PASSWORD_RESET_TTL_MINUTES,
  can,
  churchIdParamsSchema,
  completePasswordResetBodySchema,
  createPasswordResetBodySchema,
  effectivePermissions,
  passwordResetTokenParamsSchema,
  recoveryPasswordResetBodySchema,
  type PasswordResetLink,
} from '@tatagereja/shared';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { PasswordResetTokenRow, UserRow } from '../../db/schema';
import { churches, churchMemberships, passwordResetTokens, users } from '../../db/schema';
import type { Deps } from '../../deps';
import { HttpError, forbidden, notFound, rateLimited, validationError } from '../../lib/errors';
import { assertStrongPassword, hashPassword } from '../../lib/password';
import { clientIp, requestMeta, type RequestMeta } from '../../lib/request';
import { nowIso } from '../../lib/time';
import { generateToken, hashToken, newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { customRolesOf, loadAccess } from '../../services/access';
import { recordAudit, type AuditContext } from '../../services/audit';
import { notify } from '../../services/notifications';
import { revokeOtherSessions, voidPendingCredentials } from '../../services/sessions';
import {
  accountLocked,
  clearLoginFailures,
  enabledTwoFactor,
  lockedUntilOf,
  recordLoginEvent,
  registerLoginFailure,
  useSecondFactor,
} from './two-factor';

/*
 * Password reset without email. Two ways back into an account:
 *
 *  - An owner or administrator with `members.manage` makes a one-time link for a member after
 *    checking who is asking. It works for 30 minutes and once, only its hash is stored, and an
 *    account with two-step verification still needs a code from it. Nobody can make one for
 *    the owner, for themselves, for someone holding permissions they lack, or for an account
 *    that also belongs to a church where they could not do the same.
 *  - Someone with two-step verification resets it themselves with an unused recovery code.
 *
 * Either way every session of the account ends and the account owner is notified.
 */

const resetLinkInvalid = () =>
  new HttpError(
    410,
    'RESET_LINK_INVALID',
    'This reset link is not valid any more. Ask your church administrator for a new one',
  );

/** `ruth@example.com` → `ru***@example.com`: enough to recognise, not to harvest. */
export const maskEmail = (email: string): string => {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}***@${domain}`;
};

export const passwordResetRouter = (deps: Deps) => {
  const { db, config } = deps;

  const resetUrl = (token: string) =>
    `${config.appUrl}/reset-password/${encodeURIComponent(token)}`;

  /** Whether the caller could make this link in every church the account belongs to. */
  const mayResetEverywhere = (actorUserId: string, target: UserRow, churchId: string) => {
    const others = db
      .select({ membership: churchMemberships, church: churches })
      .from(churchMemberships)
      .innerJoin(churches, eq(churches.id, churchMemberships.churchId))
      .where(and(eq(churchMemberships.userId, target.id), ne(churchMemberships.churchId, churchId)))
      .all();
    return others.every(({ membership, church }) => {
      const actor = db
        .select()
        .from(churchMemberships)
        .where(
          and(eq(churchMemberships.churchId, church.id), eq(churchMemberships.userId, actorUserId)),
        )
        .get();
      if (!actor || actor.status !== 'active') return false;
      return can.resetMemberPassword(loadAccess(db, church, actor), {
        role: membership.role,
        userId: target.id,
        permissions: effectivePermissions(
          membership.role,
          customRolesOf(db, membership.id).permissionLists,
        ),
      });
    });
  };

  const loadUsableLink = (token: string): { link: PasswordResetTokenRow; user: UserRow } => {
    const row = db
      .select({ link: passwordResetTokens, user: users })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, nowIso()),
        ),
      )
      .get();
    if (!row) throw resetLinkInvalid();
    return row;
  };

  /** Sets the new password, ends every session and tells the account owner. */
  const applyNewPassword = (
    tx: Queryable,
    user: UserRow,
    passwordHash: string,
    audit: AuditContext,
    method: 'admin_link' | 'recovery_code',
    meta: RequestMeta,
  ) => {
    const now = nowIso();
    tx.update(users)
      .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
      .where(eq(users.id, user.id))
      .run();
    const revoked = revokeOtherSessions(tx, user.id, null);
    voidPendingCredentials(tx, user.id);
    clearLoginFailures(tx, user.id);
    recordLoginEvent(tx, {
      userId: user.id,
      email: user.email,
      outcome: 'password_reset',
      reason: method,
      meta,
    });
    recordAudit(tx, audit, {
      module: 'admin-security',
      action: 'account.password_reset',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} reset their password${method === 'admin_link' ? ' with a link from an administrator' : ' with a recovery code'}`,
      after: { method, revokedSessions: revoked },
    });
    notify(tx, {
      churchId: null,
      userIds: [user.id],
      type: 'account.password_reset',
      title: { id: 'Kata sandi Anda diatur ulang', en: 'Your password was reset' },
      body: {
        id: 'Semua perangkat sudah dikeluarkan. Jika ini bukan Anda, segera hubungi pengurus gereja.',
        en: 'Every device was signed out. If this was not you, contact your church administrator now.',
      },
      link: '/profile?tab=security',
      entityType: 'user',
      entityId: user.id,
    });
  };

  const churchScoped = new Elysia({ prefix: '/churches/:churchId/members' })
    .use(authPlugin(deps))
    .post(
      '/:id/password-reset',
      ({ church, access, audit, auth, params, set }) => {
        const row = db
          .select({ membership: churchMemberships, user: users })
          .from(churchMemberships)
          .innerJoin(users, eq(users.id, churchMemberships.userId))
          .where(
            and(eq(churchMemberships.id, params.id), eq(churchMemberships.churchId, church.id)),
          )
          .get();
        if (!row) throw notFound('Membership');
        const target = {
          role: row.membership.role,
          userId: row.user.id,
          permissions: effectivePermissions(
            row.membership.role,
            customRolesOf(db, row.membership.id).permissionLists,
          ),
        };
        if (!can.resetMemberPassword(access, target)) {
          throw forbidden('You cannot make a reset link for this member');
        }
        if (!mayResetEverywhere(auth.user.id, row.user, church.id)) {
          throw new HttpError(
            403,
            'ESCALATION_DENIED',
            'This account also belongs to another church where you cannot reset it. Ask the server administrator',
          );
        }
        const token = generateToken(32);
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000,
        ).toISOString();
        const twoFactorRequired = !!enabledTwoFactor(db, row.user.id);
        db.transaction((tx) => {
          // One link at a time: a new one voids any earlier link that was not used.
          tx.update(passwordResetTokens)
            .set({ usedAt: now.toISOString() })
            .where(
              and(eq(passwordResetTokens.userId, row.user.id), isNull(passwordResetTokens.usedAt)),
            )
            .run();
          tx.insert(passwordResetTokens)
            .values({
              id: newId(),
              userId: row.user.id,
              tokenHash: hashToken(token),
              issuedBy: auth.user.id,
              issuedInChurchId: church.id,
              expiresAt,
              createdAt: now.toISOString(),
            })
            .run();
          recordAudit(tx, audit, {
            module: 'admin-security',
            action: 'member.password_reset_link',
            entityType: 'membership',
            entityId: row.membership.id,
            summary: `${auth.user.name} made a password reset link for ${row.user.name}`,
            after: { expiresAt, twoFactorRequired, identityConfirmed: true },
          });
          notify(tx, {
            churchId: null,
            userIds: [row.user.id],
            type: 'account.password_reset',
            title: {
              id: 'Tautan atur ulang kata sandi dibuat',
              en: 'A password reset link was made',
            },
            body: {
              id: `${auth.user.name} (${church.name}) membuat tautan untuk akun Anda. Jika Anda tidak memintanya, hubungi gereja.`,
              en: `${auth.user.name} (${church.name}) made one for your account. If you did not ask for it, contact the church.`,
            },
            link: '/profile?tab=security',
            entityType: 'user',
            entityId: row.user.id,
          });
        });
        set.status = 201;
        const link: PasswordResetLink = {
          url: resetUrl(token),
          token,
          expiresAt,
          twoFactorRequired,
        };
        return link;
      },
      {
        church: { permission: 'members.manage' },
        params: churchIdParamsSchema,
        body: createPasswordResetBodySchema,
      },
    );

  const publicRoutes = new Elysia({ prefix: '/auth/password-reset' })
    .get(
      '/:token',
      ({ params, request, server }) => {
        const wait = deps.limiters.passwordReset.check(
          `preview:${clientIp(request, server ?? undefined, config.trustProxy)}`,
        );
        if (wait > 0) throw rateLimited(wait);
        const { link, user } = loadUsableLink(params.token);
        return {
          name: user.name,
          email: maskEmail(user.email),
          expiresAt: link.expiresAt,
          twoFactorRequired: !!enabledTwoFactor(db, user.id),
        };
      },
      { params: passwordResetTokenParamsSchema },
    )
    .post(
      '/',
      async ({ body, request, server }) => {
        const meta = requestMeta(request, server ?? undefined, config.trustProxy);
        const wait = deps.limiters.passwordReset.check(meta.ip ?? 'unknown');
        if (wait > 0) throw rateLimited(wait);
        const { link, user } = loadUsableLink(body.token);
        const lockedUntil = lockedUntilOf(user);
        if (lockedUntil) throw accountLocked(lockedUntil);
        assertStrongPassword(body.newPassword, 'newPassword', user);
        const twoFactor = enabledTwoFactor(db, user.id);
        if (twoFactor && !body.code && !body.recoveryCode) {
          const message = 'Enter a code from your authenticator app or a recovery code';
          throw validationError(message, [{ path: 'code', message }]);
        }
        const passwordHash = await hashPassword(body.newPassword, config.passwordHashing);
        const audit: AuditContext = {
          ...meta,
          churchId: link.issuedInChurchId,
          actorUserId: user.id,
        };
        const result = db.transaction((tx) => {
          if (twoFactor && !useSecondFactor(tx, twoFactor, body)) {
            // Wrong codes count towards the account's lockout like at sign-in.
            return (
              registerLoginFailure(tx, user, 'two_factor_failure', meta, 'password_reset') ?? false
            );
          }
          const claimed = tx
            .update(passwordResetTokens)
            .set({ usedAt: nowIso() })
            .where(and(eq(passwordResetTokens.id, link.id), isNull(passwordResetTokens.usedAt)))
            .returning({ id: passwordResetTokens.id })
            .get();
          if (!claimed) throw resetLinkInvalid();
          applyNewPassword(tx, user, passwordHash, audit, 'admin_link', meta);
          return true;
        });
        if (result instanceof Date) throw accountLocked(result);
        if (!result) {
          const message = body.recoveryCode
            ? 'This recovery code is not valid or was already used'
            : 'The code is not valid. Check the time on your phone and try again';
          throw validationError(message, [
            { path: body.recoveryCode ? 'recoveryCode' : 'code', message },
          ]);
        }
        return { ok: true as const };
      },
      { body: completePasswordResetBodySchema },
    )
    .post(
      '/recovery',
      async ({ body, request, server }) => {
        const meta = requestMeta(request, server ?? undefined, config.trustProxy);
        const wait = deps.limiters.passwordReset.check(meta.ip ?? 'unknown');
        if (wait > 0) throw rateLimited(wait);
        const emailWait = deps.limiters.login.check(`${meta.ip ?? 'unknown'}:${body.email}`);
        if (emailWait > 0) throw rateLimited(emailWait);
        const user = db.select().from(users).where(eq(users.email, body.email)).get();
        // Checked against the email only: refusing a password because it is the account's
        // name would tell that the account exists.
        assertStrongPassword(body.newPassword, 'newPassword', { email: body.email });
        /*
         * One answer for an unknown address, an account without 2FA, a wrong code and a
         * locked account (a lock would tell that the account exists). Recovery codes are long
         * random strings, so the per-address limit is enough against guessing, and a valid
         * code lets its owner back in even while someone else keeps the account locked.
         */
        const refused = () =>
          validationError('This email and recovery code do not match', [
            { path: 'recoveryCode', message: 'This email and recovery code do not match' },
          ]);
        const twoFactor = user ? enabledTwoFactor(db, user.id) : null;
        const passwordHash = await hashPassword(body.newPassword, config.passwordHashing);
        if (!user || !twoFactor) {
          recordLoginEvent(db, {
            userId: user?.id ?? null,
            email: body.email,
            outcome: 'password_reset_failure',
            reason: user ? 'no_two_factor' : 'unknown_account',
            meta,
          });
          throw refused();
        }
        const audit: AuditContext = { ...meta, churchId: null, actorUserId: user.id };
        const result = db.transaction((tx) => {
          if (!useSecondFactor(tx, twoFactor, { recoveryCode: body.recoveryCode })) {
            recordLoginEvent(tx, {
              userId: user.id,
              email: user.email,
              outcome: 'password_reset_failure',
              reason: 'wrong_recovery_code',
              meta,
            });
            registerLoginFailure(tx, user, 'two_factor_failure', meta, 'recovery_reset');
            return false;
          }
          applyNewPassword(tx, user, passwordHash, audit, 'recovery_code', meta);
          return true;
        });
        if (!result) throw refused();
        return { ok: true as const };
      },
      { body: recoveryPasswordResetBodySchema },
    );

  return new Elysia().use(churchScoped).use(publicRoutes);
};
