import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import type { AppConfig } from './config';
import type { Db } from './db/client';
import type { Deps } from './deps';
import { bodyLimitFor } from './lib/abuse';
import { createResultCache, invalidateForRequest } from './lib/cache';
import { HttpError, badRequest } from './lib/errors';
import { createStaticHandler, finalizeResponse } from './lib/http';
import { createRateLimiter, type Limiters } from './lib/rate-limit';
import { securityHeaders } from './lib/security-headers';
import { createTurnstileVerifier } from './lib/turnstile';
import { adminSecurityModule } from './modules/admin-security';
import { announcementsModule } from './modules/announcements';
import { attendanceModule } from './modules/attendance';
import { auditModule } from './modules/audit';
import { authModule } from './modules/auth';
import { careModule } from './modules/care';
import { checkinModule } from './modules/checkin';
import { churchesModule } from './modules/churches';
import { commsModule } from './modules/comms';
import { dashboardModule } from './modules/dashboard';
import { eventsModule } from './modules/events';
import { facilitiesModule } from './modules/facilities';
import { financeModule } from './modules/finance';
import { groupsModule } from './modules/groups';
import { insightsModule } from './modules/insights';
import { invitationsModule } from './modules/invitations';
import { metaModule } from './modules/meta';
import { notificationsModule } from './modules/notifications';
import { peopleModule } from './modules/people';
import { peopleExtensionsModule } from './modules/people/index';
import { recordsModule } from './modules/records';
import { rolesModule } from './modules/roles';
import { worshipModule } from './modules/worship';
import { prepareDatabaseSecurity } from './services/security-startup';

type ValidationIssueLike = { path?: unknown; summary?: unknown; message?: unknown };

function normaliseIssues(all: unknown): { path: string; message: string }[] {
  if (!Array.isArray(all)) return [];
  return all.map((issue: ValidationIssueLike) => {
    const rawPath = issue.path;
    let path = 'root';
    if (Array.isArray(rawPath)) path = rawPath.map(String).join('.') || 'root';
    else if (typeof rawPath === 'string')
      path = rawPath.replace(/^\//, '').replace(/\//g, '.') || 'root';
    const message =
      typeof issue.summary === 'string'
        ? issue.summary
        : typeof issue.message === 'string'
          ? issue.message
          : 'Invalid value';
    return { path, message };
  });
}

/**
 * Paths that carry a credential are logged without it: calendar feeds, invitation and reset
 * links, both the API routes and the app pages they open (`/join/<token>`, `/reset-password/<token>`).
 */
const TOKEN_PATH =
  /^(\/api\/(?:calendar\/feeds|invitations|auth\/password-reset)\/|\/(?:join|reset-password)\/)[^/]+/;
export const loggedPath = (pathname: string): string => pathname.replace(TOKEN_PATH, '$1[token]');

/** Production rate limits. Registration is generous because many members share one IP (carrier NAT, church wifi). */
export function defaultLimiters(): Limiters {
  return {
    login: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
    // Generous: a church wifi or a carrier NAT puts a whole congregation behind one address.
    loginIp: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
    register: createRateLimiter({ windowMs: 60 * 60 * 1000, max: 30 }),
    invitation: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60 }),
    sessionRefresh: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 120 }),
    passwordReset: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
  };
}

export function createDeps(db: Db, config: AppConfig, overrides: Partial<Deps> = {}): Deps {
  const security = prepareDatabaseSecurity(db, config);
  return {
    db,
    config,
    security,
    limiters: defaultLimiters(),
    verifyTurnstile: config.turnstile ? createTurnstileVerifier(config.turnstile.secretKey) : null,
    cache: createResultCache(),
    ...overrides,
  };
}

export function createApp(deps: Deps) {
  const { config } = deps;

  const api = new Elysia({ prefix: '/api' })
    // core
    .use(metaModule(deps))
    .use(authModule(deps))
    .use(churchesModule(deps))
    .use(rolesModule(deps))
    .use(auditModule(deps))
    .use(invitationsModule(deps))
    .use(notificationsModule(deps))
    // feature modules: each registers its own routers in modules/<id>/index.ts
    .use(adminSecurityModule(deps))
    .use(peopleModule(deps))
    .use(groupsModule(deps))
    .use(peopleExtensionsModule(deps))
    .use(eventsModule(deps))
    .use(announcementsModule(deps))
    .use(commsModule(deps))
    .use(attendanceModule(deps))
    .use(dashboardModule(deps))
    .use(insightsModule(deps))
    .use(worshipModule(deps))
    .use(careModule(deps))
    .use(recordsModule(deps))
    .use(financeModule(deps))
    .use(facilitiesModule(deps))
    .use(checkinModule(deps));

  const app = new Elysia()
    .use(
      cors({
        origin: config.corsOrigins === true ? true : config.corsOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false,
      }),
    )
    .onRequest(({ request, set }) => {
      invalidateForRequest(deps.cache, request.method, new URL(request.url).pathname);
      if (config.logRequests) {
        console.log(
          `${new Date().toISOString()} ${request.method} ${loggedPath(new URL(request.url).pathname)}`,
        );
      }
      Object.assign(set.headers, securityHeaders(request, { trustedTypes: !config.turnstile }));
      // Bun also enforces `maxRequestBodySize`; this answers with a clear JSON error first.
      // Each kind of route has its own limit (`bodyLimitFor`): only imports take the largest.
      const length = Number(request.headers.get('content-length') ?? 0);
      const limit = bodyLimitFor(new URL(request.url).pathname, config.maxBodyBytes);
      if (length > limit) {
        set.status = 413;
        return {
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Request body is larger than ${Math.max(1, Math.floor(limit / 1024))} KB`,
          },
        };
      }
    })
    // JSON and text bodies: ETag with 304 on GET, and gzip or brotli when accepted.
    .mapResponse(({ request, responseValue, set }) => finalizeResponse(request, responseValue, set))
    .onAfterResponse(({ request }) => {
      invalidateForRequest(deps.cache, request.method, new URL(request.url).pathname);
    })
    .onError(({ code, error, set, request }) => {
      if (error instanceof HttpError) {
        set.status = error.statusCode;
        return error.toBody();
      }
      if (code === 'VALIDATION') {
        set.status = 422;
        const validation = error as unknown as { type?: string; all?: unknown };
        return {
          error: {
            code: 'VALIDATION',
            message: `Invalid request ${validation.type ?? 'input'}`,
            issues: normaliseIssues(validation.all),
          },
        };
      }
      if (code === 'NOT_FOUND') {
        set.status = 404;
        return { error: { code: 'NOT_FOUND', message: 'Route not found' } };
      }
      if (code === 'PARSE') {
        set.status = 400;
        return { error: { code: 'BAD_REQUEST', message: 'Malformed request body' } };
      }
      console.error(
        `Unhandled error on ${request.method} ${loggedPath(new URL(request.url).pathname)}`,
        error,
      );
      set.status = 500;
      return { error: { code: 'INTERNAL', message: 'Internal server error' } };
    })
    .use(api);

  if (config.webDistDir) {
    const serveStatic = createStaticHandler(config.webDistDir);
    app.get('/*', async ({ request, set }) => {
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        throw badRequest('Malformed URL');
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        throw new HttpError(404, 'NOT_FOUND', 'Route not found');
      }
      const response = await serveStatic(request, pathname);
      // The security headers set for every request travel with the file.
      for (const [name, value] of Object.entries(set.headers)) {
        if (value !== undefined && !response.headers.has(name)) {
          response.headers.set(name, String(value));
        }
      }
      return response;
    });
  }

  return app;
}

export type App = ReturnType<typeof createApp>;
