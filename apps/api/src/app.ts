import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { AppConfig } from './config';
import type { Db } from './db/client';
import type { Deps } from './deps';
import { HttpError } from './lib/errors';
import { createRateLimiter } from './lib/rate-limit';
import { createTurnstileVerifier } from './lib/turnstile';
import { announcementsModule } from './modules/announcements';
import { attendanceModule } from './modules/attendance';
import { authModule } from './modules/auth';
import { churchesModule } from './modules/churches';
import { dashboardModule } from './modules/dashboard';
import { eventsModule } from './modules/events';
import { groupsModule } from './modules/groups';
import { invitationsModule } from './modules/invitations';
import { metaModule } from './modules/meta';
import { peopleModule } from './modules/people';

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

/** Production rate limits. Registration is generous because many members share one IP (carrier NAT, church wifi). */
export function defaultLimiters(): Deps['limiters'] {
  return {
    login: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
    register: createRateLimiter({ windowMs: 60 * 60 * 1000, max: 30 }),
    invitation: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60 }),
  };
}

export function createDeps(db: Db, config: AppConfig, overrides: Partial<Deps> = {}): Deps {
  return {
    db,
    config,
    limiters: defaultLimiters(),
    verifyTurnstile: config.turnstile ? createTurnstileVerifier(config.turnstile.secretKey) : null,
    ...overrides,
  };
}

export function createApp(deps: Deps) {
  const { config } = deps;

  const api = new Elysia({ prefix: '/api' })
    .use(metaModule(deps))
    .use(authModule(deps))
    .use(churchesModule(deps))
    .use(invitationsModule(deps))
    .use(peopleModule(deps))
    .use(groupsModule(deps))
    .use(eventsModule(deps))
    .use(attendanceModule(deps))
    .use(announcementsModule(deps))
    .use(dashboardModule(deps));

  const app = new Elysia()
    .use(
      cors({
        origin: config.corsOrigins === true ? true : config.corsOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false,
      }),
    )
    .onRequest(({ request }) => {
      if (config.logRequests) {
        console.log(
          `${new Date().toISOString()} ${request.method} ${new URL(request.url).pathname}`,
        );
      }
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
      console.error(`Unhandled error on ${request.method} ${new URL(request.url).pathname}`, error);
      set.status = 500;
      return { error: { code: 'INTERNAL', message: 'Internal server error' } };
    })
    .use(api);

  if (config.webDistDir) {
    const dist = resolve(config.webDistDir);
    const indexFile = join(dist, 'index.html');
    app.get('/*', async ({ request, set }) => {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        throw new HttpError(404, 'NOT_FOUND', 'Route not found');
      }
      const relative = pathname.replace(/^\/+/, '');
      if (relative) {
        const target = resolve(dist, relative);
        if (target.startsWith(dist + sep)) {
          const info = await stat(target).catch(() => null);
          if (info?.isFile()) {
            if (relative.startsWith('assets/')) {
              set.headers['cache-control'] = 'public, max-age=31536000, immutable';
            }
            return Bun.file(target);
          }
        }
      }
      set.headers['cache-control'] = 'no-cache';
      return Bun.file(indexFile);
    });
  }

  return app;
}

export type App = ReturnType<typeof createApp>;
