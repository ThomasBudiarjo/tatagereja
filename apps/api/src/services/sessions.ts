import type { AuthResponse, SessionTransport, User } from '@tatagereja/shared';
import { and, eq, isNull, lte, ne, or } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import type { AppConfig } from '../config';
import type { Queryable } from '../db/client';
import type { SessionRow } from '../db/schema';
import {
  passwordResetTokens,
  sessionRefreshTokens,
  sessions,
  twoFactorChallenges,
} from '../db/schema';
import { isHttpsRequest, type RequestMeta } from '../lib/request';
import { addDays } from '../lib/time';
import { generateToken, hashToken, newId } from '../lib/tokens';

/*
 * Sessions. One row per signed-in device; its id never changes, while the credential the
 * client presents is rotated (new sign-in, refresh, password or two-step change).
 *
 *  - `cookie` sessions (the web app on the server's own origin): the token lives in an httpOnly,
 *    SameSite=Strict cookie (`__Host-` and Secure over HTTPS). Writes also need the CSRF token,
 *    an HMAC of the cookie token that only same-origin JavaScript can learn from the API.
 *  - `bearer` sessions (other origins, scripts): an access token valid for
 *    ACCESS_TOKEN_TTL_MINUTES, and a refresh token that is exchanged once for a new pair.
 *    Presenting a refresh token that was already exchanged revokes the whole session.
 *
 * Every session ends SESSION_TTL_DAYS after sign-in (absolute) or after SESSION_IDLE_DAYS
 * without use (idle). See docs/SECURITY.md.
 */

export const SESSION_COOKIE = 'tg_session';
/** Over HTTPS the cookie is `__Host-` prefixed: Secure, host-only and on `/` by construction. */
export const SECURE_SESSION_COOKIE = `__Host-${SESSION_COOKIE}`;

export type SessionConfig = Pick<
  AppConfig,
  'sessionTtlDays' | 'sessionIdleDays' | 'accessTokenTtlMinutes'
>;

/** The credentials a client receives once, when a session starts or rotates. */
export type IssuedSession = {
  session: SessionRow;
  token: string;
  refreshToken: string | null;
};

/** The CSRF token of a cookie session, derived from its cookie token (nothing to store). */
export const csrfTokenFor = (cookieToken: string): string =>
  createHmac('sha256', cookieToken).update('tatagereja-csrf').digest('base64url');

export const idleExpiryOf = (
  session: Pick<SessionRow, 'lastUsedAt' | 'expiresAt'>,
  config: SessionConfig,
): Date => {
  const idle = addDays(new Date(session.lastUsedAt), config.sessionIdleDays);
  const absolute = new Date(session.expiresAt);
  return idle < absolute ? idle : absolute;
};

/** Whether a session has ended, by its absolute lifetime or by being idle. */
export const sessionEnded = (session: SessionRow, config: SessionConfig, now = Date.now()) =>
  new Date(session.expiresAt).getTime() <= now || idleExpiryOf(session, config).getTime() <= now;

const accessExpiry = (config: SessionConfig, now: Date) =>
  new Date(now.getTime() + config.accessTokenTtlMinutes * 60_000).toISOString();

/** Starts a session. Run it inside the transaction of the sign-in it completes. */
export function createSession(
  db: Queryable,
  config: SessionConfig,
  input: { userId: string; transport: SessionTransport; meta: RequestMeta },
): IssuedSession {
  const now = new Date();
  const token = generateToken(32);
  const refreshToken = input.transport === 'bearer' ? generateToken(32) : null;
  const session = db
    .insert(sessions)
    .values({
      id: newId(),
      userId: input.userId,
      tokenHash: hashToken(token),
      transport: input.transport,
      accessExpiresAt: input.transport === 'bearer' ? accessExpiry(config, now) : null,
      refreshTokenHash: refreshToken ? hashToken(refreshToken) : null,
      userAgent: input.meta.userAgent,
      ip: input.meta.ip,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      expiresAt: addDays(now, config.sessionTtlDays).toISOString(),
    })
    .returning()
    .get();
  return { session, token, refreshToken };
}

/**
 * Gives an existing session new credentials and forgets the old ones (session fixation and
 * privilege changes: password, two-step verification). The id and its history stay.
 */
export function rotateSession(
  db: Queryable,
  config: SessionConfig,
  sessionId: string,
): IssuedSession {
  const current = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!current) throw new Error('Session to rotate is gone');
  const now = new Date();
  const token = generateToken(32);
  const refreshToken = current.transport === 'bearer' ? generateToken(32) : null;
  if (current.refreshTokenHash) {
    db.insert(sessionRefreshTokens)
      .values({
        tokenHash: current.refreshTokenHash,
        sessionId: current.id,
        rotatedAt: now.toISOString(),
      })
      .onConflictDoNothing()
      .run();
  }
  const session = db
    .update(sessions)
    .set({
      tokenHash: hashToken(token),
      accessExpiresAt: current.transport === 'bearer' ? accessExpiry(config, now) : null,
      refreshTokenHash: refreshToken ? hashToken(refreshToken) : null,
      lastUsedAt: now.toISOString(),
    })
    .where(eq(sessions.id, current.id))
    .returning()
    .get();
  if (!session) throw new Error('Session to rotate is gone');
  return { session, token, refreshToken };
}

/**
 * Deletes sessions that ended (absolute lifetime or idle) but were never presented again, so
 * they do not linger in session lists or keep their refresh-token history. One account, or all.
 */
export function purgeEndedSessions(
  db: Queryable,
  config: SessionConfig,
  userId: string | null = null,
): number {
  const now = new Date();
  const ended = or(
    lte(sessions.expiresAt, now.toISOString()),
    lte(sessions.lastUsedAt, addDays(now, -config.sessionIdleDays).toISOString()),
  );
  return db
    .delete(sessions)
    .where(userId ? and(eq(sessions.userId, userId), ended) : ended)
    .returning({ id: sessions.id })
    .all().length;
}

/** Ends every session of an account except `keepSessionId`. Returns how many ended. */
export function revokeOtherSessions(
  db: Queryable,
  userId: string,
  keepSessionId: string | null,
): number {
  const where = keepSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId))
    : eq(sessions.userId, userId);
  return db.delete(sessions).where(where).returning({ id: sessions.id }).all().length;
}

/**
 * Voids what was issued on the strength of an earlier password: two-step sign-ins still
 * waiting for their code, and reset links not used yet. Run with every password change or reset.
 */
export function voidPendingCredentials(db: Queryable, userId: string): void {
  db.delete(twoFactorChallenges).where(eq(twoFactorChallenges.userId, userId)).run();
  db.update(passwordResetTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)))
    .run();
}

/** The cookie name a request uses: `__Host-` over HTTPS. */
export const sessionCookieName = (request: Request): string =>
  isHttpsRequest(request) ? SECURE_SESSION_COOKIE : SESSION_COOKIE;

export function sessionCookie(request: Request, token: string, expiresAt: string): string {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const secure = isHttpsRequest(request) ? '; Secure' : '';
  return `${sessionCookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export const clearedSessionCookie = (request: Request): string =>
  `${sessionCookieName(request)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isHttpsRequest(request) ? '; Secure' : ''}`;

/**
 * The session token from the request's cookie. Over HTTPS only the `__Host-` cookie counts, so
 * a cookie planted from a sibling domain or over plain HTTP is never read.
 */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  const name = sessionCookieName(request);
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value && value.length <= 512 ? value : null;
  }
  return null;
}

type HeaderSetter = { headers: Record<string, string | number> };

/**
 * The body a client receives when a session starts or rotates, setting the cookie for cookie
 * sessions. Bearer tokens appear in the body only; the cookie token never does.
 */
export function sessionResponse(
  set: HeaderSetter,
  request: Request,
  issued: IssuedSession,
  user: User,
  joinedChurchId: string | null = null,
): AuthResponse {
  const { session } = issued;
  if (session.transport === 'cookie') {
    set.headers['set-cookie'] = sessionCookie(request, issued.token, session.expiresAt);
    return {
      user,
      transport: 'cookie',
      token: null,
      expiresAt: session.expiresAt,
      refreshToken: null,
      sessionExpiresAt: session.expiresAt,
      csrfToken: csrfTokenFor(issued.token),
      joinedChurchId,
    };
  }
  return {
    user,
    transport: 'bearer',
    token: issued.token,
    expiresAt: session.accessExpiresAt ?? session.expiresAt,
    refreshToken: issued.refreshToken,
    sessionExpiresAt: session.expiresAt,
    csrfToken: null,
    joinedChurchId,
  };
}
