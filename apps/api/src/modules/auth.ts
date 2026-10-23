import {
  ADMIN_SECURITY_LIMITS,
  idParamsSchema,
  lockoutDelayMinutes,
  loginBodySchema,
  loginTwoFactorBodySchema,
  refreshBodySchema,
  registerBodySchema,
  securePasswordChangeBodySchema,
  updateProfileBodySchema,
  type SessionTransport,
} from '@tatagereja/shared';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { UserRow } from '../db/schema';
import { sessionRefreshTokens, sessions, twoFactorChallenges, users } from '../db/schema';
import type { Deps } from '../deps';
import {
  HttpError,
  conflict,
  forbidden,
  notFound,
  rateLimited,
  unauthorized,
  validationError,
} from '../lib/errors';
import { crossSiteReason } from '../lib/origin';
import {
  assertStrongPassword,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../lib/password';
import { enforceRateLimit } from '../lib/rate-limit';
import { clientIp, requestMeta, type RequestMeta } from '../lib/request';
import { nowIso } from '../lib/time';
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
  clearedSessionCookie,
  createSession,
  csrfTokenFor,
  idleExpiryOf,
  readSessionCookie,
  revokeOtherSessions,
  rotateSession,
  sessionEnded,
  sessionResponse,
} from '../services/sessions';
import {
  accountLocked,
  clearLoginFailures,
  enabledTwoFactor,
  lockedUntilOf,
  PASSWORD_CHECK_LIMIT,
  recordLoginEvent,
  registerLoginFailure,
  useSecondFactor,
} from './admin-security/two-factor';

/** Failures on an unknown address are forgotten after a day, like an account's. */
const UNKNOWN_FAILURE_MEMORY_MS = 24 * 60 * 60 * 1000;

export const authModule = (deps: Deps) => {
  const { db, config } = deps;

  /*
   * Every sign-in spends the same work whether or not the account exists, is locked or the
   * password is right: one argon2id verification with this server's parameters.
   */
  const dummyHash = hashPassword('dummy-password-for-timing', config.passwordHashing);
  const spendPasswordCheck = async (password: string) => {
    await verifyPassword(password, await dummyHash);
  };

  /*
   * Unknown email addresses lock exactly like accounts do, so a lock does not reveal that an
   * account exists. Kept in memory: it only has to look the same while someone is guessing.
   */
  const unknownFailures = new Map<string, { count: number; last: number; lockedUntil: number }>();
  const unknownAccountFailure = (email: string): Date | null => {
    const now = Date.now();
    if (unknownFailures.size > 10_000) unknownFailures.clear();
    const previous = unknownFailures.get(email);
    const recent = previous && now - previous.last < UNKNOWN_FAILURE_MEMORY_MS;
    const count = (recent ? previous.count : 0) + 1;
    const delay = lockoutDelayMinutes(count);
    const lockedUntil = delay > 0 ? now + delay * 60_000 : 0;
    unknownFailures.set(email, { count, last: now, lockedUntil });
    return lockedUntil ? new Date(lockedUntil) : null;
  };
  const unknownAccountLock = (email: string): Date | null => {
    const entry = unknownFailures.get(email);
    return entry && entry.lockedUntil > Date.now() ? new Date(entry.lockedUntil) : null;
  };

  /** Cookie sessions are only handed to this app's own pages (no login CSRF). */
  const assertTransportAllowed = (request: Request, transport: SessionTransport) => {
    if (transport === 'cookie' && crossSiteReason(request, config)) {
      throw new HttpError(
        403,
        'CSRF_FAILED',
        'Cookie sessions are only available to the app served by this server',
      );
    }
  };

  /** A new sign-in replaces the session the browser already presented (session fixation). */
  const dropPresentedSession = (request: Request) => {
    const token = readSessionCookie(request);
    if (token) db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
  };

  /** The password (and second factor, when on) checked out: start a session. */
  const completeSignIn = (
    set: { headers: Record<string, string | number> },
    request: Request,
    user: UserRow,
    meta: RequestMeta,
    transport: SessionTransport,
    outcome: 'success' | 'two_factor_success' | 'recovery_code_used',
  ) => {
    dropPresentedSession(request);
    const issued = db.transaction((tx) => {
      clearLoginFailures(tx, user.id);
      recordLoginEvent(tx, { userId: user.id, email: user.email, outcome, meta });
      return createSession(tx, config, { userId: user.id, transport, meta });
    });
    return sessionResponse(set, request, issued, toUser(user));
  };

  const challengeExpired = () =>
    new HttpError(401, 'TWO_FACTOR_INVALID', 'This sign-in has expired. Log in again');

  return new Elysia({ prefix: '/auth' })
    .use(authPlugin(deps))
    .post(
      '/register',
      async ({ body, request, server, set }) => {
        const ip = clientIp(request, server ?? undefined, config.trustProxy);
        const wait = deps.limiters.register.check(ip);
        if (wait > 0) throw rateLimited(wait);
        assertTransportAllowed(request, body.transport);

        if (config.registrationMode === 'disabled') {
          throw new HttpError(
            403,
            'REGISTRATION_DISABLED',
            'Registration is disabled on this server',
          );
        }
        if (body.invitationToken) {
          assertInvitationUsable(db, findInvitationByToken(db, body.invitationToken));
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
        assertStrongPassword(body.password, 'password', body);

        const existing = db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, body.email))
          .get();
        // Without email there is no way to answer the same in both cases; the message points to
        // signing in without spelling out that the account exists, and registration is limited.
        if (existing) {
          throw conflict(
            'An account could not be created with these details. If you already have one, sign in instead',
          );
        }

        const passwordHash = await hashPassword(body.password, config.passwordHashing);
        const now = nowIso();
        const meta = requestMeta(request, server ?? undefined, config.trustProxy);
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
          joinedChurchId = acceptInvitation(db, body.invitationToken, user.id, meta).churchId;
        }
        dropPresentedSession(request);
        // Sign-in history starts with the first login; registering is not one.
        const issued = createSession(db, config, {
          userId: user.id,
          transport: body.transport,
          meta,
        });
        set.status = 201;
        return sessionResponse(set, request, issued, toUser(user), joinedChurchId);
      },
      { body: registerBodySchema },
    )
    .post(
      '/login',
      async ({ body, request, server, set }) => {
        const ip = clientIp(request, server ?? undefined, config.trustProxy);
        const ipWait = deps.limiters.loginIp.check(ip);
        if (ipWait > 0) throw rateLimited(ipWait);
        const wait = deps.limiters.login.check(`${ip}:${body.email}`);
        if (wait > 0) throw rateLimited(wait);
        assertTransportAllowed(request, body.transport);
        const meta = requestMeta(request, server ?? undefined, config.trustProxy);

        const user = db.select().from(users).where(eq(users.email, body.email)).get();
        const lockedUntil = user ? lockedUntilOf(user) : unknownAccountLock(body.email);
        if (lockedUntil) {
          // Refused before the password is checked, so a lock cannot be used to test guesses;
          // the same work is still spent, so the answer takes as long as any other.
          await spendPasswordCheck(body.password);
          recordLoginEvent(db, {
            userId: user?.id ?? null,
            email: body.email,
            outcome: 'locked',
            reason: user ? null : 'unknown_account',
            meta,
          });
          throw accountLocked(lockedUntil);
        }
        const valid = user
          ? await verifyPassword(body.password, user.passwordHash)
          : await spendPasswordCheck(body.password).then(() => false);
        if (!user || !valid) {
          if (user) {
            const locked = db.transaction((tx) => registerLoginFailure(tx, user, 'failure', meta));
            if (locked) throw accountLocked(locked);
          } else {
            const locked = unknownAccountFailure(body.email);
            recordLoginEvent(db, {
              userId: null,
              email: body.email,
              outcome: 'failure',
              reason: 'unknown_account',
              meta,
            });
            if (locked) throw accountLocked(locked);
          }
          throw unauthorized('Invalid email or password');
        }

        deps.limiters.login.reset(`${ip}:${body.email}`);
        // Hashes made with older (weaker) parameters are upgraded while the password is known.
        if (needsRehash(user.passwordHash, config.passwordHashing)) {
          const passwordHash = await hashPassword(body.password, config.passwordHashing);
          db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
        }
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
        return completeSignIn(set, request, user, meta, body.transport, 'success');
      },
      { body: loginBodySchema },
    )
    .post(
      '/login/two-factor',
      ({ body, request, server, set }) => {
        const meta = requestMeta(request, server ?? undefined, config.trustProxy);
        enforceRateLimit(deps.limiters, 'auth.two_factor', meta.ip ?? 'unknown', {
          windowMs: 15 * 60_000,
          max: 30,
        });
        assertTransportAllowed(request, body.transport);
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

        const result = db.transaction((tx) => useSecondFactor(tx, twoFactor, body));
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
            return registerLoginFailure(
              tx,
              user,
              'two_factor_failure',
              meta,
              body.recoveryCode ? 'recovery_code' : 'totp',
            );
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
            title: {
              id: 'Kode pemulihan dipakai untuk masuk',
              en: 'A recovery code was used to sign in',
            },
            body: {
              id: `Sisa ${result.remainingRecoveryCodes} kode pemulihan. Buat yang baru bila hampir habis.`,
              en: `${result.remainingRecoveryCodes} recovery code${result.remainingRecoveryCodes === 1 ? '' : 's'} left. Make new ones if you are running low.`,
            },
            link: '/profile?tab=security',
            entityType: 'user',
            entityId: user.id,
          });
        }
        return completeSignIn(
          set,
          request,
          user,
          meta,
          body.transport,
          result.method === 'recovery' ? 'recovery_code_used' : 'two_factor_success',
        );
      },
      { body: loginTwoFactorBodySchema },
    )
    .post(
      '/refresh',
      ({ body, request, server, set }) => {
        const meta = requestMeta(request, server ?? undefined, config.trustProxy);
        const wait = deps.limiters.sessionRefresh.check(meta.ip ?? 'unknown');
        if (wait > 0) throw rateLimited(wait);
        const tokenHash = hashToken(body.refreshToken);
        const row = db
          .select({ session: sessions, user: users })
          .from(sessions)
          .innerJoin(users, eq(users.id, sessions.userId))
          .where(and(eq(sessions.refreshTokenHash, tokenHash), eq(sessions.transport, 'bearer')))
          .get();
        if (row) {
          if (sessionEnded(row.session, config)) {
            db.delete(sessions).where(eq(sessions.id, row.session.id)).run();
            throw unauthorized('Session has expired');
          }
          const issued = db.transaction((tx) => rotateSession(tx, config, row.session.id));
          return sessionResponse(set, request, issued, toUser(row.user));
        }
        // A refresh token that was already exchanged: whoever holds the newer one and whoever
        // presents this one cannot be told apart, so the whole session (the family) ends.
        const reused = db
          .select({ session: sessions, user: users })
          .from(sessionRefreshTokens)
          .innerJoin(sessions, eq(sessions.id, sessionRefreshTokens.sessionId))
          .innerJoin(users, eq(users.id, sessions.userId))
          .where(eq(sessionRefreshTokens.tokenHash, tokenHash))
          .get();
        if (reused) {
          const { session, user } = reused;
          db.transaction((tx) => {
            tx.delete(sessions).where(eq(sessions.id, session.id)).run();
            recordLoginEvent(tx, {
              userId: user.id,
              email: user.email,
              outcome: 'refresh_reuse',
              meta,
            });
            recordAudit(
              tx,
              { ...meta, churchId: null, actorUserId: user.id },
              {
                module: 'admin-security',
                action: 'account.session_reuse_revoke',
                entityType: 'user',
                entityId: user.id,
                summary: `A session of ${user.name} was ended because its refresh token was used twice`,
                before: { sessionId: session.id, userAgent: session.userAgent, ip: session.ip },
              },
            );
            notify(tx, {
              churchId: null,
              userIds: [user.id],
              type: 'account.session_revoked',
              title: {
                id: 'Satu sesi masuk Anda diakhiri',
                en: 'One of your sign-ins was ended',
              },
              body: {
                id: 'Sesi itu dipakai dari dua tempat sekaligus. Masuk lagi di perangkat itu; jika ini bukan Anda, ganti kata sandi.',
                en: 'It was used from two places at once. Sign in again on that device; if this was not you, change your password.',
              },
              link: '/profile?tab=activity',
              entityType: 'user',
              entityId: user.id,
            });
          });
          throw new HttpError(
            401,
            'SESSION_REVOKED',
            'This session was ended for your safety. Sign in again',
          );
        }
        throw unauthorized('Session is invalid or has expired');
      },
      { body: refreshBodySchema },
    )
    .post(
      '/logout',
      ({ auth, request, set }) => {
        db.delete(sessions).where(eq(sessions.id, auth.sessionId)).run();
        if (auth.transport === 'cookie') set.headers['set-cookie'] = clearedSessionCookie(request);
        return { ok: true as const };
      },
      { auth: true },
    )
    .post(
      '/logout/everywhere',
      ({ auth, audit, request, set }) => {
        const revoked = db.transaction((tx) => {
          const count = revokeOtherSessions(tx, auth.user.id, null);
          recordAudit(tx, audit, {
            module: 'admin-security',
            action: 'account.sessions_revoke_all',
            entityType: 'user',
            entityId: auth.user.id,
            summary: `${auth.user.name} signed out everywhere`,
            after: { revokedSessions: count },
          });
          return count;
        });
        if (auth.transport === 'cookie') set.headers['set-cookie'] = clearedSessionCookie(request);
        return { ok: true as const, revokedSessions: revoked };
      },
      { auth: true },
    )
    .get('/me', ({ auth }) => ({ user: auth.user }), { auth: true })
    .get(
      '/session',
      ({ auth, request }) => {
        const session = db.select().from(sessions).where(eq(sessions.id, auth.sessionId)).get();
        if (!session) throw unauthorized('Session is invalid or has expired');
        const cookie = auth.transport === 'cookie' ? readSessionCookie(request) : null;
        return {
          user: auth.user,
          transport: auth.transport,
          csrfToken: cookie ? csrfTokenFor(cookie) : null,
          sessionExpiresAt: session.expiresAt,
        };
      },
      { auth: true },
    )
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
      async ({ auth, audit, body, request, set }) => {
        enforceRateLimit(deps.limiters, 'auth.password_check', auth.user.id, PASSWORD_CHECK_LIMIT);
        const user = db.select().from(users).where(eq(users.id, auth.user.id)).get();
        if (!user) throw notFound('User');
        const valid = await verifyPassword(body.currentPassword, user.passwordHash);
        if (!valid) throw unauthorized('Current password is incorrect');
        if (body.newPassword === body.currentPassword) {
          const message = 'Choose a password different from the current one';
          throw validationError(message, [{ path: 'newPassword', message }]);
        }
        assertStrongPassword(body.newPassword, 'newPassword', user);
        const passwordHash = await hashPassword(body.newPassword, config.passwordHashing);
        const result = db.transaction((tx) => {
          const now = nowIso();
          tx.update(users)
            .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
            .where(eq(users.id, user.id))
            .run();
          // Whoever knew the old password is signed out everywhere, and this device gets new
          // credentials so a copy of the old ones stops working too.
          const revoked = revokeOtherSessions(tx, user.id, auth.sessionId);
          const issued = rotateSession(tx, config, auth.sessionId);
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
            title: { id: 'Kata sandi Anda diganti', en: 'Your password was changed' },
            body:
              revoked > 0
                ? {
                    id: `Perangkat lain sudah dikeluarkan (${revoked}). Jika ini bukan Anda, hubungi pengurus gereja.`,
                    en: `Other devices were signed out (${revoked}). If this was not you, contact your church administrator.`,
                  }
                : {
                    id: 'Jika ini bukan Anda, segera ganti lagi kata sandinya.',
                    en: 'If this was not you, change it again right away.',
                  },
            link: '/profile?tab=security',
            entityType: 'user',
            entityId: user.id,
          });
          return { revoked, issued };
        });
        return {
          ok: true as const,
          revokedSessions: result.revoked,
          session: sessionResponse(set, request, result.issued, auth.user),
        };
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
            idleExpiresAt: idleExpiryOf(row, config).toISOString(),
            userAgent: row.userAgent,
            ip: row.ip,
            transport: row.transport,
            current: row.id === auth.sessionId,
          })),
        };
      },
      { auth: true },
    )
    .delete(
      '/sessions/:id',
      ({ auth, audit, params }) => {
        if (params.id === auth.sessionId) throw forbidden('Sign out to end this session');
        db.transaction((tx) => {
          const deleted = tx
            .delete(sessions)
            .where(and(eq(sessions.id, params.id), eq(sessions.userId, auth.user.id)))
            .returning({ id: sessions.id, userAgent: sessions.userAgent, ip: sessions.ip })
            .get();
          if (!deleted) throw notFound('Session');
          recordAudit(tx, audit, {
            module: 'admin-security',
            action: 'account.session_revoke',
            entityType: 'user',
            entityId: auth.user.id,
            summary: `${auth.user.name} signed out a session`,
            before: { sessionId: deleted.id, userAgent: deleted.userAgent, ip: deleted.ip },
          });
        });
        return { ok: true as const };
      },
      { auth: true, params: idParamsSchema },
    );
};
