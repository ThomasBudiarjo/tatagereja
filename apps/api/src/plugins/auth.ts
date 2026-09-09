import type { Access, User } from '@tatagereja/shared';
import { and, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ChurchRow, MembershipRow } from '../db/schema';
import { churches, churchMemberships, groupLeaders, people, sessions, users } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { hashToken } from '../lib/tokens';
import { toUser } from '../serializers';

export type AuthContext = { user: User; sessionId: string };
export type ChurchContext = { church: ChurchRow; membership: MembershipRow; access: Access };

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function createAuthService(deps: Deps) {
  const { db } = deps;

  const authenticate = (headers: Record<string, string | undefined>): AuthContext => {
    const header = headers.authorization ?? headers.Authorization;
    if (!header) throw unauthorized();
    const [scheme, token, ...rest] = header.trim().split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
      throw unauthorized('Invalid authorization header');
    }
    const row = db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, hashToken(token)))
      .get();
    if (!row) throw unauthorized('Session is invalid or has expired');

    const now = Date.now();
    if (new Date(row.session.expiresAt).getTime() <= now) {
      db.delete(sessions).where(eq(sessions.id, row.session.id)).run();
      throw unauthorized('Session has expired');
    }
    if (now - new Date(row.session.lastUsedAt).getTime() > TOUCH_INTERVAL_MS) {
      db.update(sessions)
        .set({ lastUsedAt: new Date(now).toISOString() })
        .where(eq(sessions.id, row.session.id))
        .run();
    }
    return { user: toUser(row.user), sessionId: row.session.id };
  };

  const loadChurchContext = (churchId: string, userId: string): ChurchContext => {
    const church = db.select().from(churches).where(eq(churches.id, churchId)).get();
    if (!church) throw notFound('Church');
    const membership = db
      .select()
      .from(churchMemberships)
      .where(and(eq(churchMemberships.churchId, churchId), eq(churchMemberships.userId, userId)))
      .get();
    if (!membership) throw forbidden('You are not a member of this church');
    const leaderGroupIds = db
      .select({ groupId: groupLeaders.groupId })
      .from(groupLeaders)
      .where(and(eq(groupLeaders.churchId, churchId), eq(groupLeaders.userId, userId)))
      .all()
      .map((row) => row.groupId);
    const person = db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.churchId, churchId), eq(people.userId, userId)))
      .get();
    return {
      church,
      membership,
      access: {
        userId,
        role: membership.role,
        leaderGroupIds,
        personId: person?.id ?? null,
      },
    };
  };

  return { authenticate, loadChurchContext };
}

/**
 * Provides two route macros:
 *  - `auth: true`   → resolves `auth` ({ user, sessionId })
 *  - `church: true` → additionally resolves `church`, `membership` and `access`
 *                     from the `:churchId` route parameter
 */
export function authPlugin(deps: Deps) {
  const service = createAuthService(deps);
  return new Elysia().macro({
    auth: {
      resolve: ({ headers }) => ({ auth: service.authenticate(headers) }),
    },
    church: {
      resolve: ({ headers, params }) => {
        const auth = service.authenticate(headers);
        const churchId = (params as Record<string, string | undefined>).churchId;
        if (!churchId) throw notFound('Church');
        const context = service.loadChurchContext(churchId, auth.user.id);
        return { auth, ...context };
      },
    },
  });
}
