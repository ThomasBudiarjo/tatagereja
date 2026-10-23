import {
  CSRF_HEADER,
  hasAny,
  type Access,
  type ModuleId,
  type Permission,
  type SessionTransport,
  type User,
} from '@tatagereja/shared';
import { and, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ChurchRow, MembershipRow } from '../db/schema';
import { churches, churchMemberships, sessions, users } from '../db/schema';
import type { Deps } from '../deps';
import { HttpError, forbidden, notFound, unauthorized } from '../lib/errors';
import { crossSiteReason } from '../lib/origin';
import { requestMeta } from '../lib/request';
import { hashToken, safeEqual } from '../lib/tokens';
import { toUser } from '../serializers';
import { loadAccess, seedRoleTemplates } from '../services/access';
import type { AuditContext } from '../services/audit';
import { assertModuleEnabled } from '../services/modules';
import { enforceChurchSecurityPolicy } from '../services/security-policy';
import { csrfTokenFor, readSessionCookie, sessionEnded } from '../services/sessions';

export type AuthContext = { user: User; sessionId: string; transport: SessionTransport };
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
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type ServerLike = { requestIP?: (req: Request) => { address: string } | null } | null | undefined;

export function createAuthService(deps: Deps) {
  const { db } = deps;

  const authenticate = (
    request: Request,
    headers: Record<string, string | undefined>,
  ): AuthContext => {
    const header = headers.authorization ?? headers.Authorization;
    let token: string;
    let transport: SessionTransport;
    if (header) {
      const [scheme, value, ...rest] = header.trim().split(/\s+/);
      if (!scheme || scheme.toLowerCase() !== 'bearer' || !value || rest.length > 0) {
        throw unauthorized('Invalid authorization header');
      }
      if (value.length > 512) throw unauthorized('Invalid authorization header');
      token = value;
      transport = 'bearer';
    } else {
      const cookie = readSessionCookie(request);
      if (!cookie) throw unauthorized();
      token = cookie;
      transport = 'cookie';
    }
    const row = db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, hashToken(token)))
      .get();
    // A cookie token is never accepted as a bearer token, nor the other way round.
    if (!row || row.session.transport !== transport) {
      throw unauthorized('Session is invalid or has expired');
    }

    const now = Date.now();
    if (sessionEnded(row.session, deps.config, now)) {
      db.delete(sessions).where(eq(sessions.id, row.session.id)).run();
      throw unauthorized('Session has expired');
    }
    if (
      transport === 'bearer' &&
      (!row.session.accessExpiresAt || new Date(row.session.accessExpiresAt).getTime() <= now)
    ) {
      throw unauthorized('Access token has expired');
    }
    if (transport === 'cookie' && UNSAFE_METHODS.has(request.method)) {
      // The cookie travels with any request the browser makes; writes must prove they come
      // from this app: same origin, and the CSRF token only same-origin script can read.
      const crossSite = crossSiteReason(request, deps.config);
      const csrf = request.headers.get(CSRF_HEADER);
      if (crossSite || !csrf || !safeEqual(csrf, csrfTokenFor(token))) {
        throw new HttpError(
          403,
          'CSRF_FAILED',
          'This request did not come from the app. Reload the page and try again',
        );
      }
    }
    if (now - new Date(row.session.lastUsedAt).getTime() > TOUCH_INTERVAL_MS) {
      db.update(sessions)
        .set({ lastUsedAt: new Date(now).toISOString() })
        .where(eq(sessions.id, row.session.id))
        .run();
    }
    return { user: toUser(row.user), sessionId: row.session.id, transport };
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
    ...requestMeta(request, server ?? undefined, deps.config.trustProxy),
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
  /*
   * The session is checked in `transform`, which runs before body, query and params are
   * validated, so a request without a valid session gets 401 and never learns the schema.
   * The result is kept per request for `resolve`.
   */
  const verified = new WeakMap<Request, AuthContext>();
  const authenticate = (request: Request, headers: Record<string, string | undefined>) => {
    const known = verified.get(request);
    if (known) return known;
    const auth = service.authenticate(request, headers);
    verified.set(request, auth);
    return auth;
  };
  return new Elysia().macro({
    auth: {
      transform: ({ headers, request }) => {
        authenticate(request, headers);
      },
      resolve: ({ headers, request, server }) => {
        const auth = authenticate(request, headers);
        return { auth, audit: service.auditContext(request, server, null, auth.user.id) };
      },
    },
    church: (guard: ChurchGuard) => ({
      transform: ({ headers, request }) => {
        authenticate(request, headers);
      },
      resolve: ({ headers, params, request, server }) => {
        const auth = authenticate(request, headers);
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
