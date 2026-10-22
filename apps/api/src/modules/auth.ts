import {
  ADMIN_SECURITY_LIMITS,
  idParamsSchema,
  loginBodySchema,
  loginTwoFactorBodySchema,
  registerBodySchema,
  securePasswordChangeBodySchema,
  updateProfileBodySchema,
} from '@tatagereja/shared';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { UserRow } from '../db/schema';
import { sessions, twoFactorChallenges, users } from '../db/schema';
import type { Deps } from '../deps';
import {
  HttpError,
  conflict,
  notFound,
  rateLimited,
  unauthorized,
  validationError,
} from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/password';
import { enforceRateLimit } from '../lib/rate-limit';
import { clientIp, requestMeta, type RequestMeta } from '../lib/request';
import { addDays, nowIso } from '../lib/time';
import { generateToken, hashToken, newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toUser } from '../serializers';
import { recordAudit } from '../services/audit';
import {
  acceptInvitation,
  assertInvitationUsable,
  findInvitationByToken,
} from '../services/invitations';
import { notify } from '../services/notifications';
import {
  accountLocked,
  clearLoginFailures,
  enabledTwoFactor,
  lockedUntilOf,
  recordLoginEvent,
  registerLoginFailure,
  useSecondFactor,
} from './admin-security/two-factor';

/** Constant-time-ish fallback so login timing does not reveal whether an email exists. */
const DUMMY_HASH_PROMISE = hashPassword('dummy-password-for-timing');

export const authModule = (deps: Deps) => {
  const { db, config } = deps;

  const createSession = (userId: string, meta: RequestMeta) => {
    const token = generateToken(32);
    const now = new Date();
    const expiresAt = addDays(now, config.sessionTtlDays).toISOString();
    db.insert(sessions)
      .values({
        id: newId(),
        userId,
        tokenHash: hashToken(token),
        userAgent: meta.userAgent,
        ip: meta.ip,
        createdAt: now.toISOString(),
        lastUsedAt: now.toISOString(),
        expiresAt,
      })
      .run();
    return { token, expiresAt };
  };

  /** The password (and second factor, when on) checked out: start a session. */
  const completeSignIn = (
    user: UserRow,
    meta: RequestMeta,
    outcome: 'success' | 'two_factor_success' | 'recovery_code_used',
  ) => {
    const session = db.transaction(() => {
      clearLoginFailures(db, user.id);
      recordLoginEvent(db, { userId: user.id, email: user.email, outcome, meta });
      return createSession(user.id, meta);
    });
    return {
      user: toUser(user),
      token: session.token,
      expiresAt: session.expiresAt,
      joinedChurchId: null,
    };
  };

  const challengeExpired = () =>
    new HttpError(401, 'TWO_FACTOR_INVALID', 'This sign-in has expired. Log in again');

  return new Elysia({ prefix: '/auth' })
    .use(authPlugin(deps))
    .post(
      '/register',
      async ({ body, request, server, set }) => {
        const ip = clientIp(request, server ?? undefined);
        const wait = deps.limiters.register.check(ip);
        if (wait > 0) throw rateLimited(wait);

        if (config.registrationMode === 'disabled') {
          throw new HttpError(
            403,
            'REGISTRATION_DISABLED',
            'Registration is disabled on this server',
          );
        }
        if (body.invitationToken) {
          assertInvitationUsable(findInvitationByToken(db, body.invitationToken));
        } else if (config.registrationMode === 'invite_only') {
          throw new HttpError(
            403,
            'INVITATION_REQUIRED',
            'An invitation is required to create an account on this server',
          );
        }
        if (deps.verifyTurnstile) {
          if (!body.turnstileToken) {
            throw new HttpError(400, 'TURNSTILE_REQUIRED', 'Please complete the bot check');
          }
          const ok = await deps.verifyTurnstile(body.turnstileToken, ip === 'unknown' ? null : ip);
          if (!ok)
            throw new HttpError(400, 'TURNSTILE_FAILED', 'Bot check failed, please try again');
        }

        const existing = db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, body.email))
          .get();
        if (existing) throw conflict('An account with this email already exists');

        const passwordHash = await hashPassword(body.password);
        const now = nowIso();
        const user = db
          .insert(users)
          .values({
            id: newId(),
            email: body.email,
            name: body.name,
            passwordHash,
            avatarUrl: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();

        let joinedChurchId: string | null = null;
        if (body.invitationToken) {
          joinedChurchId = acceptInvitation(
            db,
            body.invitationToken,
            user.id,
            requestMeta(request, server ?? undefined),
          ).churchId;
        }
        // Sign-in history starts with the first login; registering is not one.
        const session = createSession(user.id, requestMeta(request, server ?? undefined));
        set.status = 201;
        return {
          user: toUser(user),
          token: session.token,
          expiresAt: session.expiresAt,
          joinedChurchId,
        };
      },
      { body: registerBodySchema },
    )
    .post(
      '/login',
      async ({ body, request, server }) => {
        const ip = clientIp(request, server ?? undefined);
        const wait = deps.limiters.login.check(`${ip}:${body.email}`);
        if (wait > 0) throw rateLimited(wait);
        const meta = requestMeta(request, server ?? undefined);

        const user = db.select().from(users).where(eq(users.email, body.email)).get();
        const lockedUntil = user ? lockedUntilOf(user) : null;
        if (user && lockedUntil) {
          // Refused before the password is checked, so a lock cannot be used to test guesses.
          recordLoginEvent(db, { userId: user.id, email: user.email, outcome: 'locked', meta });
          throw accountLocked(lockedUntil);
        }
        const valid = user
          ? await verifyPassword(body.password, user.passwordHash)
          : await verifyPassword(body.password, await DUMMY_HASH_PROMISE).then(() => false);
        if (!user || !valid) {
          if (user) {
            const locked = db.transaction((tx) => registerLoginFailure(tx, user, 'failure', meta));
            if (locked) throw accountLocked(locked);
          } else {
            recordLoginEvent(db, {
              userId: null,
              email: body.email,
              outcome: 'failure',
              reason: 'unknown_account',
              meta,
            });
          }
          throw unauthorized('Invalid email or password');
        }

        deps.limiters.login.reset(`${ip}:${body.email}`);
        if (enabledTwoFactor(db, user.id)) {
          const challengeToken = generateToken(32);
          const now = new Date();
          const expiresAt = new Date(
            now.getTime() + ADMIN_SECURITY_LIMITS.challengeTtlMinutes * 60_000,
          ).toISOString();
          db.transaction((tx) => {
            tx.insert(twoFactorChallenges)
              .values({
                id: newId(),
                userId: user.id,
                tokenHash: hashToken(challengeToken),
                attempts: 0,
                ip: meta.ip,
                userAgent: meta.userAgent,
                expiresAt,
                createdAt: now.toISOString(),
              })
              .run();
            recordLoginEvent(tx, {
              userId: user.id,
              email: user.email,
              outcome: 'two_factor_required',
              meta,
            });
          });
          return { twoFactorRequired: true as const, challengeToken, expiresAt };
        }
        return completeSignIn(user, meta, 'success');
      },
      { body: loginBodySchema },
    )
    .post(
      '/login/two-factor',
      ({ body, request, server }) => {
        const meta = requestMeta(request, server ?? undefined);
        enforceRateLimit(deps.limiters, 'auth.two_factor', meta.ip ?? 'unknown', {
          windowMs: 15 * 60_000,
          max: 30,
        });
        const challenge = db
          .select()
          .from(twoFactorChallenges)
          .where(
            and(
              eq(twoFactorChallenges.tokenHash, hashToken(body.challengeToken)),
              isNull(twoFactorChallenges.consumedAt),
              gt(twoFactorChallenges.expiresAt, nowIso()),
            ),
          )
          .get();
        if (!challenge || challenge.attempts >= ADMIN_SECURITY_LIMITS.challengeMaxAttempts) {
          throw challengeExpired();
        }
        const user = db.select().from(users).where(eq(users.id, challenge.userId)).get();
        const twoFactor = user ? enabledTwoFactor(db, user.id) : null;
        if (!user || !twoFactor) throw challengeExpired();
        const lockedUntil = lockedUntilOf(user);
        if (lockedUntil) throw accountLocked(lockedUntil);

        const result = db.transaction((tx) => useSecondFactor(tx, config, twoFactor, body));
        if (!result) {
          const attempts = challenge.attempts + 1;
          const locked = db.transaction((tx) => {
            tx.update(twoFactorChallenges)
              .set({
                attempts,
                consumedAt:
                  attempts >= ADMIN_SECURITY_LIMITS.challengeMaxAttempts ? nowIso() : null,
              })
              .where(eq(twoFactorChallenges.id, challenge.id))
              .run();
            return registerLoginFailure(tx, user, 'two_factor_failure', meta);
          });
          if (locked) throw accountLocked(locked);
          if (attempts >= ADMIN_SECURITY_LIMITS.challengeMaxAttempts) throw challengeExpired();
          throw new HttpError(
            401,
            'TWO_FACTOR_INVALID',
            body.recoveryCode
              ? 'This recovery code is not valid or was already used'
              : 'The code is not valid. Check the time on your phone and try again',
          );
        }
        db.update(twoFactorChallenges)
          .set({ consumedAt: nowIso() })
          .where(eq(twoFactorChallenges.id, challenge.id))
          .run();
        if (result.method === 'recovery') {
          notify(db, {
            churchId: null,
            userIds: [user.id],
            type: 'account.two_factor_changed',
            title: 'A recovery code was used to sign in',
            body: `${result.remainingRecoveryCodes} recovery code${result.remainingRecoveryCodes === 1 ? '' : 's'} left. Make new ones if you are running low.`,
            link: '/profile?tab=security',
            entityType: 'user',
            entityId: user.id,
          });
        }
        return completeSignIn(
          user,
          meta,
          result.method === 'recovery' ? 'recovery_code_used' : 'two_factor_success',
        );
      },
      { body: loginTwoFactorBodySchema },
    )
    .post(
      '/logout',
      ({ auth }) => {
        db.delete(sessions).where(eq(sessions.id, auth.sessionId)).run();
        return { ok: true as const };
      },
      { auth: true },
    )
    .get('/me', ({ auth }) => ({ user: auth.user }), { auth: true })
    .patch(
      '/me',
      ({ auth, body }) => {
        const user = db
          .update(users)
          .set({ name: body.name, avatarUrl: body.avatarUrl, updatedAt: nowIso() })
          .where(eq(users.id, auth.user.id))
          .returning()
          .get();
        if (!user) throw notFound('User');
        return { user: toUser(user) };
      },
      { auth: true, body: updateProfileBodySchema },
    )
    .post(
      '/change-password',
      async ({ auth, audit, body }) => {
        const user = db.select().from(users).where(eq(users.id, auth.user.id)).get();
        if (!user) throw notFound('User');
        const valid = await verifyPassword(body.currentPassword, user.passwordHash);
        if (!valid) throw unauthorized('Current password is incorrect');
        if (body.newPassword === body.currentPassword) {
          const message = 'Choose a password different from the current one';
          throw validationError(message, [{ path: 'newPassword', message }]);
        }
        const passwordHash = await hashPassword(body.newPassword);
        const revokedSessions = db.transaction((tx) => {
          const now = nowIso();
          tx.update(users)
            .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
            .where(eq(users.id, user.id))
            .run();
          const revoked = body.revokeOtherSessions
            ? tx
                .delete(sessions)
                .where(and(eq(sessions.userId, user.id), ne(sessions.id, auth.sessionId)))
                .returning({ id: sessions.id })
                .all().length
            : 0;
          recordAudit(tx, audit, {
            module: 'admin-security',
            action: 'account.password_change',
            entityType: 'user',
            entityId: user.id,
            summary: `${user.name} changed their password`,
            after: { revokedSessions: revoked },
          });
          notify(tx, {
            churchId: null,
            userIds: [user.id],
            type: 'account.password_changed',
            title: 'Your password was changed',
            body:
              revoked > 0
                ? `Other devices were signed out (${revoked}). If this was not you, contact your church administrator.`
                : 'If this was not you, change it again right away.',
            link: '/profile?tab=security',
            entityType: 'user',
            entityId: user.id,
          });
          return revoked;
        });
        return { ok: true as const, revokedSessions };
      },
      { auth: true, body: securePasswordChangeBodySchema },
    )
    .get(
      '/sessions',
      ({ auth }) => {
        const rows = db
          .select()
          .from(sessions)
          .where(eq(sessions.userId, auth.user.id))
          .orderBy(desc(sessions.lastUsedAt))
          .all();
        return {
          items: rows.map((row) => ({
            id: row.id,
            createdAt: row.createdAt,
            lastUsedAt: row.lastUsedAt,
            expiresAt: row.expiresAt,
            userAgent: row.userAgent,
            ip: row.ip,
            current: row.id === auth.sessionId,
          })),
        };
      },
      { auth: true },
    )
    .delete(
      '/sessions/:id',
      ({ auth, params }) => {
        const deleted = db
          .delete(sessions)
          .where(and(eq(sessions.id, params.id), eq(sessions.userId, auth.user.id)))
          .returning({ id: sessions.id })
          .get();
        if (!deleted) throw notFound('Session');
        return { ok: true as const };
      },
      { auth: true, params: idParamsSchema },
    );
};
