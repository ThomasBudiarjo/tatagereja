import {
  changePasswordBodySchema,
  idParamsSchema,
  loginBodySchema,
  registerBodySchema,
  updateProfileBodySchema,
} from '@tatagereja/shared';
import { and, desc, eq, ne } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { sessions, users } from '../db/schema';
import type { Deps } from '../deps';
import { HttpError, conflict, notFound, rateLimited, unauthorized } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/password';
import { clientIp } from '../lib/request';
import { addDays, nowIso } from '../lib/time';
import { generateToken, hashToken, newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toUser } from '../serializers';
import {
  acceptInvitation,
  assertInvitationUsable,
  findInvitationByToken,
} from '../services/invitations';

/** Constant-time-ish fallback so login timing does not reveal whether an email exists. */
const DUMMY_HASH_PROMISE = hashPassword('dummy-password-for-timing');

export const authModule = (deps: Deps) => {
  const { db, config } = deps;

  const createSession = (userId: string, userAgent: string | null) => {
    const token = generateToken(32);
    const now = new Date();
    const expiresAt = addDays(now, config.sessionTtlDays).toISOString();
    db.insert(sessions)
      .values({
        id: newId(),
        userId,
        tokenHash: hashToken(token),
        userAgent: userAgent ? userAgent.slice(0, 300) : null,
        createdAt: now.toISOString(),
        lastUsedAt: now.toISOString(),
        expiresAt,
      })
      .run();
    return { token, expiresAt };
  };

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
          joinedChurchId = acceptInvitation(db, body.invitationToken, user.id).churchId;
        }
        const session = createSession(user.id, request.headers.get('user-agent'));
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

        const user = db.select().from(users).where(eq(users.email, body.email)).get();
        const valid = user
          ? await verifyPassword(body.password, user.passwordHash)
          : await verifyPassword(body.password, await DUMMY_HASH_PROMISE).then(() => false);
        if (!user || !valid) throw unauthorized('Invalid email or password');

        deps.limiters.login.reset(`${ip}:${body.email}`);
        const session = createSession(user.id, request.headers.get('user-agent'));
        return {
          user: toUser(user),
          token: session.token,
          expiresAt: session.expiresAt,
          joinedChurchId: null,
        };
      },
      { body: loginBodySchema },
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
      async ({ auth, body }) => {
        const user = db.select().from(users).where(eq(users.id, auth.user.id)).get();
        if (!user) throw notFound('User');
        const valid = await verifyPassword(body.currentPassword, user.passwordHash);
        if (!valid) throw unauthorized('Current password is incorrect');
        const passwordHash = await hashPassword(body.newPassword);
        db.update(users)
          .set({ passwordHash, updatedAt: nowIso() })
          .where(eq(users.id, user.id))
          .run();
        // Sign out every other device.
        db.delete(sessions)
          .where(and(eq(sessions.userId, user.id), ne(sessions.id, auth.sessionId)))
          .run();
        return { ok: true as const };
      },
      { auth: true, body: changePasswordBodySchema },
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
