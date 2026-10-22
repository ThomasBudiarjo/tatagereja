import { hasAny, type Access, type ModuleId, type Permission, type User } from '@tatagereja/shared';
import { and, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ChurchRow, MembershipRow } from '../db/schema';
import { churches, churchMemberships, sessions, users } from '../db/schema';
import type { Deps } from '../deps';
import { HttpError, forbidden, notFound, unauthorized } from '../lib/errors';
import { requestMeta } from '../lib/request';
import { hashToken } from '../lib/tokens';
import { toUser } from '../serializers';
import { loadAccess, seedRoleTemplates } from '../services/access';
import type { AuditContext } from '../services/audit';
import { assertModuleEnabled } from '../services/modules';
import { enforceChurchSecurityPolicy } from '../services/security-policy';

export type AuthContext = { user: User; sessionId: string };
export type ChurchContext = { church: ChurchRow; membership: MembershipRow; access: Access };

/**
 * What a church route requires, given as the `church` macro value:
 *  - `true`                     any active member
 *  - `'finance'`                any active member, and the module must be enabled
 *  - `{ module, permission }`   module enabled and at least one of the permissions held
 */
export type ChurchGuard =
  | true
  | ModuleId
  | { module?: ModuleId; permission?: Permission | readonly Permission[]; message?: string };

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

type ServerLike = { requestIP?: (req: Request) => { address: string } | null } | null | undefined;

export function createAuthService(deps: Deps) {
  const { db } = deps;

  const authenticate = (headers: Record<string, string | undefined>): AuthContext => {
    const header = headers.authorization ?? headers.Authorization;
    if (!header) throw unauthorized();
    const [scheme, token, ...rest] = header.trim().split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
      throw unauthorized('Invalid authorization header');
    }
    if (token.length > 512) throw unauthorized('Invalid authorization header');
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
    let church = db.select().from(churches).where(eq(churches.id, churchId)).get();
    if (!church) throw notFound('Church');
    const membership = db
      .select()
      .from(churchMemberships)
      .where(and(eq(churchMemberships.churchId, churchId), eq(churchMemberships.userId, userId)))
      .get();
    if (!membership) throw forbidden('You are not a member of this church');
    if (membership.status !== 'active') {
      throw new HttpError(
        403,
        'MEMBERSHIP_SUSPENDED',
        'Your access to this church is suspended. Contact a church administrator.',
      );
    }
    // Churches created before custom roles existed get their suggested roles on first use.
    if (!church.roleTemplatesSeededAt) {
      db.transaction((tx) => seedRoleTemplates(tx, churchId));
      church = db.select().from(churches).where(eq(churches.id, churchId)).get() ?? church;
    }
    return { church, membership, access: loadAccess(db, church, membership) };
  };

  const auditContext = (
    request: Request,
    server: ServerLike,
    churchId: string | null,
    userId: string,
  ): AuditContext => ({
    ...requestMeta(request, server ?? undefined),
    churchId,
    actorUserId: userId,
  });

  return { authenticate, loadChurchContext, auditContext };
}

/** Applies a route's `ChurchGuard` to a loaded church context. */
export function applyChurchGuard(context: ChurchContext, guard: ChurchGuard): void {
  if (guard === true) return;
  const { module, permission, message } =
    typeof guard === 'string'
      ? { module: guard, permission: undefined, message: undefined }
      : guard;
  if (module) assertModuleEnabled(context.church, module);
  if (permission) {
    const wanted: readonly Permission[] =
      typeof permission === 'string' ? [permission] : permission;
    if (!hasAny(context.access, wanted)) throw forbidden(message);
  }
}

/**
 * Provides two route macros:
 *  - `auth: true`        → resolves `auth` ({ user, sessionId }) and `audit` (account-level)
 *  - `church: <guard>`   → additionally resolves `church`, `membership`, `access` and a
 *                          church-scoped `audit` context from the `:churchId` route parameter,
 *                          rejecting suspended members, disabled modules and missing permissions
 *                          (see `ChurchGuard`).
 */
export function authPlugin(deps: Deps) {
  const service = createAuthService(deps);
  return new Elysia().macro({
    auth: {
      resolve: ({ headers, request, server }) => {
        const auth = service.authenticate(headers);
        return { auth, audit: service.auditContext(request, server, null, auth.user.id) };
      },
    },
    church: (guard: ChurchGuard) => ({
      resolve: ({ headers, params, request, server }) => {
        const auth = service.authenticate(headers);
        const churchId = (params as Record<string, string | undefined>).churchId;
        if (!churchId) throw notFound('Church');
        const context = service.loadChurchContext(churchId, auth.user.id);
        enforceChurchSecurityPolicy(deps.db, { ...context, user: auth.user });
        applyChurchGuard(context, guard);
        return {
          auth,
          ...context,
          audit: service.auditContext(request, server, context.church.id, auth.user.id),
        };
      },
    }),
  });
}
