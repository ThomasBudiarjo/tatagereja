import { randomUUID } from 'node:crypto';
import { expect } from 'bun:test';
import type { ChurchGuard } from '../src/plugins/auth';
import { CHURCH_GUARD_DETAIL } from '../src/plugins/auth';
import type { createTestApp, seedChurch } from './helpers';
import { sampleBody } from './route-bodies';

/*
 * The router as data, for the generated route tests: every route with its church guard, a valid
 * sample body, and a "world" (a seeded church plus one row its owner created through every
 * collection route) to fill route parameters and body ids from.
 */

export type Route = {
  method: string;
  path: string;
  hooks?: { body?: unknown; detail?: Record<string, unknown> };
};
export type Seed = Awaited<ReturnType<typeof seedChurch>>;
export type TestApp = ReturnType<typeof createTestApp>;

/** One church as the test sees it: its seed and the rows its owner created through the API. */
export type World = { seed: Seed; created: Map<string, string> };

export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Routes anyone may call: they create or resume a session. */
export const PUBLIC_WRITES = new Set([
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/login/two-factor',
  'POST /api/auth/refresh',
  'POST /api/auth/password-reset/',
  'POST /api/auth/password-reset/recovery',
]);

/** Reads without a session: server identity, an invitation preview, a private iCal feed. */
export const PUBLIC_READS = new Set([
  '/api/meta',
  '/api/invitations/:token',
  '/api/auth/password-reset/:token',
  '/api/calendar/feeds/:token',
]);

/**
 * Account-level routes: every signed-in account manages its own account, notifications and
 * the churches it creates or joins. They still need a session.
 */
export const ACCOUNT_PREFIXES = ['/api/auth/', '/api/notifications', '/api/invitations/'];
export const ACCOUNT_WRITES = new Set(['POST /api/churches/']);

/**
 * Church writes a plain member may make, each about their own data or a request that someone
 * with the permission decides on. Everything else must answer 401, 403 or 404 for them.
 */
export const MEMBER_WRITES = new Map<string, string>([
  ['POST /api/churches/:churchId/leave', 'leaving is always their own choice'],
  ['POST /api/churches/:churchId/calendar/feeds', 'their own private calendar feed'],
  ['PUT /api/churches/:churchId/dashboard/preferences', 'their own home screen'],
  ['POST /api/churches/:churchId/worship/blockouts', 'dates they cannot serve themselves'],
  ['POST /api/churches/:churchId/care/prayer-requests/', 'prayer requests wait for moderation'],
  ['POST /api/churches/:churchId/care/prayer-requests/:id/pray', '"I prayed" on a visible request'],
  ['POST /api/churches/:churchId/groups/:id/join-requests', 'leaders decide on join requests'],
  ['DELETE /api/churches/:churchId/groups/:id/join-requests/mine', 'withdrawing their own request'],
  ['POST /api/churches/:churchId/events/:id/registrations', 'registering themselves'],
  ['POST /api/churches/:churchId/events/:id/check-in/me', 'checking themselves in'],
]);

/** Bodies whose refinements the generator cannot satisfy on its own. */
export const BODY_OVERRIDES: Record<string, unknown> = {
  'POST /api/auth/login/two-factor': { challengeToken: 'x'.repeat(43), code: '123456' },
  'POST /api/auth/two-factor/disable': { password: 'kidung-pujian-91', code: '123456' },
  'POST /api/auth/two-factor/recovery-codes': { password: 'kidung-pujian-91', code: '123456' },
  'PATCH /api/churches/:churchId/modules': { modules: { finance: false } },
  'POST /api/auth/password-reset/recovery': {
    email: 'nobody@example.com',
    recoveryCode: 'AAAAA-AAAAA',
    newPassword: 'kidung-pujian-91',
  },
  'POST /api/churches/:churchId/care/follow-ups/': { personId: randomUUID() },
};

const OFFERING = {
  serviceDate: '2031-03-02',
  accountId: randomUUID(),
  lines: [{ fundId: randomUUID(), amount: 1000 }],
  counter1Name: 'Counter One',
  counter2Name: 'Counter Two',
};
BODY_OVERRIDES['POST /api/churches/:churchId/finance/offerings/'] = OFFERING;
BODY_OVERRIDES['PATCH /api/churches/:churchId/finance/offerings/:id'] = OFFERING;

const RECORD = {
  type: 'baptism',
  subtype: 'adult',
  date: '2031-03-02',
  people: [{ role: 'subject', name: 'Route Test' }],
};
BODY_OVERRIDES['POST /api/churches/:churchId/records/entries/preview'] = { record: RECORD };
BODY_OVERRIDES['POST /api/churches/:churchId/records/entries/'] = RECORD;
BODY_OVERRIDES['PUT /api/churches/:churchId/records/entries/:id'] = {
  record: RECORD,
  correctionNote: 'Route test',
};

export const keyOf = (route: Route) => `${route.method} ${route.path}`;
export const trimSlash = (path: string) => path.replace(/\/+$/, '');

/** The route's `church` guard, or null for account and public routes. */
export const guardOf = (route: Route): ChurchGuard | null =>
  (route.hooks?.detail?.[CHURCH_GUARD_DETAIL] as ChurchGuard | undefined) ?? null;

/** `service-types` → `serviceType`, the stem body fields use (`serviceTypeId`). */
const stemOf = (segment: string) =>
  segment
    .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    .replace(/ies$/, 'y')
    .replace(/(s|es)$/, '')
    .replace(/sse$/, 'ss');

export const OPTIONAL_MODULES = {
  worship: true,
  care: true,
  records: true,
  finance: true,
  facilities: true,
  checkin: true,
} as const;

export function routeWorld(t: TestApp) {
  const allRoutes = ((t.app as unknown as { routes: Route[] }).routes ?? []).filter((route) =>
    route.path.startsWith('/api/'),
  );
  const writes = allRoutes.filter((route) => WRITE_METHODS.has(route.method));
  const reads = allRoutes.filter((route) => route.method === 'GET');

  const isChurchWrite = (route: Route) => {
    const key = keyOf(route);
    if (PUBLIC_WRITES.has(key) || ACCOUNT_WRITES.has(key)) return false;
    return !ACCOUNT_PREFIXES.some((prefix) => route.path.startsWith(prefix));
  };

  /** Ids a world prefers for named parameters (`personId` is Alice unless set). */
  const personOf = (world: World) => world.created.get(':personId') ?? world.seed.alice.id;

  /**
   * Fills route parameters inside `home`'s church. Ids come from `rows` when it created one
   * (otherwise unknown ids); `used` is set when an id from `rows` was filled in.
   */
  const pathOf = (home: World, route: Route, rows: World | null, used = { value: false }) => {
    const segments = route.path.split('/');
    return segments
      .map((segment, index) => {
        if (!segment.startsWith(':')) return segment;
        const name = segment.slice(1);
        if (name === 'churchId') return home.seed.church.id;
        if (name === 'token') return 'x'.repeat(32);
        if (name === 'year') return '2031';
        if (name === 'month') return '3';
        if (name === 'kind') return 'summary';
        if (!rows) return randomUUID();
        used.value = true;
        if (name === 'personId') return personOf(rows);
        if (name === 'userId') return rows.seed.admin.user.id;
        const id = rows.created.get(segments.slice(0, index).join('/'));
        if (!id) used.value = false;
        return id ?? randomUUID();
      })
      .join('/');
  };

  /** Replaces generated ids in a body with rows of `rows`, matched by field name. */
  const withIdsOf = (rows: World, value: unknown, used = { value: false }): unknown => {
    if (Array.isArray(value)) return value.map((item) => withIdsOf(rows, item, used));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => {
        const many = key.endsWith('Ids') && Array.isArray(field);
        if (!many && (typeof field !== 'string' || !key.endsWith('Id'))) {
          return [key, withIdsOf(rows, field, used)];
        }
        const stem = key
          .slice(0, many ? -3 : -2)
          .replace(/^(borrower|recipient|subject|target)/i, '');
        const found = (() => {
          if (/person$/i.test(stem)) return personOf(rows);
          if (/^group$/i.test(stem)) return rows.seed.group.id;
          if (/user$/i.test(stem)) return rows.seed.admin.user.id;
          for (const [path, id] of rows.created) {
            const last = path.split('/').pop() ?? '';
            if (stemOf(last).toLowerCase() === stem.toLowerCase()) return id;
          }
          return null;
        })();
        if (!found) return [key, field];
        used.value = true;
        return [key, many ? [found] : found];
      }),
    );
  };

  const bodyOf = (route: Route, rows: World | null, used = { value: false }) => {
    const key = keyOf(route);
    const { body, valid } =
      key in BODY_OVERRIDES
        ? { body: BODY_OVERRIDES[key], valid: true }
        : sampleBody(route.hooks?.body);
    if (!valid) throw new Error(`No valid sample body for ${key}; add it to BODY_OVERRIDES`);
    return rows ? withIdsOf(rows, body, used) : body;
  };

  const enableModules = async (seed: Seed) => {
    const response = await t.request('PATCH', `/api/churches/${seed.church.id}/modules`, {
      token: seed.owner.token,
      body: { modules: OPTIONAL_MODULES },
    });
    expect(response.status).toBe(200);
  };

  /** The owner creates one row through every collection route, parents before children. */
  const createRows = async (world: World) => {
    const creators = writes
      .filter((route) => route.method === 'POST' && isChurchWrite(route))
      .filter((route) => !/\/:[a-zA-Z]+\/?$/.test(route.path))
      .filter((route) => !/\/(leave|transfer-ownership)$/.test(route.path))
      .sort((a, b) => a.path.split(':').length - b.path.split(':').length);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const route of creators) {
        const collection = trimSlash(route.path);
        if (world.created.has(collection)) continue;
        const response = await t.request('POST', pathOf(world, route, world), {
          token: world.seed.owner.token,
          body: bodyOf(route, world),
        });
        if (response.status !== 200 && response.status !== 201) continue;
        const entity = Object.values(response.json ?? {}).find(
          (value): value is { id: string } =>
            !!value &&
            typeof value === 'object' &&
            typeof (value as { id?: unknown }).id === 'string',
        );
        if (entity) world.created.set(collection, entity.id);
      }
    }
  };

  return {
    routes: allRoutes,
    writes,
    reads,
    isChurchWrite,
    pathOf,
    bodyOf,
    enableModules,
    createRows,
  };
}
