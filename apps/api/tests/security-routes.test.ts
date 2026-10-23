import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createTestApp, seedChurch } from './helpers';
import { sampleBody } from './route-bodies';

/*
 * Generated from the router itself: every write route of the API is called without a session
 * and as a plain member who holds no extra permission, first with unknown ids and then with
 * the ids of rows the owner created through the same routes. Neither may reach a handler that
 * changes church data. New routes are covered automatically; a route a member may legitimately
 * use (their own RSVP, prayer request, booking request...) must be listed in MEMBER_WRITES
 * with the reason.
 */

type Route = { method: string; path: string; hooks?: { body?: unknown } };
type Seed = Awaited<ReturnType<typeof seedChurch>>;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Routes anyone may call: they create or resume a session. */
const PUBLIC_WRITES = new Set([
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/login/two-factor',
]);

/** Reads without a session: server identity, an invitation preview, a private iCal feed. */
const PUBLIC_READS = new Set([
  '/api/meta',
  '/api/invitations/:token',
  '/api/calendar/feeds/:token',
]);

/**
 * Account-level writes: every signed-in account manages its own account, notifications and
 * the churches it creates or joins. They still need a session.
 */
const ACCOUNT_PREFIXES = ['/api/auth/', '/api/notifications', '/api/invitations/'];
const ACCOUNT_WRITES = new Set(['POST /api/churches/']);

/**
 * Church writes a plain member may make, each about their own data or a request that someone
 * with the permission decides on. Everything else must answer 401, 403 or 404 for them.
 */
const MEMBER_WRITES = new Map<string, string>([
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
const BODY_OVERRIDES: Record<string, unknown> = {
  'POST /api/auth/login/two-factor': { challengeToken: 'x'.repeat(43), code: '123456' },
  'POST /api/auth/two-factor/disable': { password: 'password123', code: '123456' },
  'POST /api/auth/two-factor/recovery-codes': { password: 'password123', code: '123456' },
  'PATCH /api/churches/:churchId/modules': { modules: { finance: false } },
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

const keyOf = (route: Route) => `${route.method} ${route.path}`;
const trimSlash = (path: string) => path.replace(/\/+$/, '');

/** `service-types` → `serviceType`, the stem body fields use (`serviceTypeId`). */
const stemOf = (segment: string) =>
  segment
    .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    .replace(/ies$/, 'y')
    .replace(/(s|es)$/, '')
    .replace(/sse$/, 'ss');

/** One church as the test sees it: its seed and the rows its owner created through the API. */
type World = { seed: Seed; created: Map<string, string> };

describe('generated route permissions', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  const routes = ((t.app as unknown as { routes: Route[] }).routes ?? []).filter(
    (route) => WRITE_METHODS.has(route.method) && route.path.startsWith('/api/'),
  );
  let home: World;
  let other: World;

  const isChurchWrite = (route: Route) => {
    const key = keyOf(route);
    if (PUBLIC_WRITES.has(key) || ACCOUNT_WRITES.has(key)) return false;
    return !ACCOUNT_PREFIXES.some((prefix) => route.path.startsWith(prefix));
  };

  /**
   * Fills route parameters inside `home`'s church. Ids come from `rows` when it created one
   * (otherwise unknown ids); `used` is set when an id from `rows` was filled in.
   */
  const pathOf = (route: Route, rows: World | null, used = { value: false }) => {
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
        if (name === 'personId') return rows.seed.alice.id;
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
          if (/person$/i.test(stem)) return rows.seed.alice.id;
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
      body: {
        modules: {
          worship: true,
          care: true,
          records: true,
          finance: true,
          facilities: true,
          checkin: true,
        },
      },
    });
    expect(response.status).toBe(200);
  };

  /** The owner creates one row through every collection route, parents before children. */
  const createRows = async (world: World) => {
    const previous = home;
    home = world;
    const creators = routes
      .filter((route) => route.method === 'POST' && isChurchWrite(route))
      .filter((route) => !/\/:[a-zA-Z]+\/?$/.test(route.path))
      .filter((route) => !/\/(leave|transfer-ownership)$/.test(route.path))
      .sort((a, b) => a.path.split(':').length - b.path.split(':').length);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const route of creators) {
        const collection = trimSlash(route.path);
        if (world.created.has(collection)) continue;
        const response = await t.request('POST', pathOf(route, world), {
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
    home = previous;
  };

  const memberFailures = async (rows: World | null) => {
    const failures: string[] = [];
    for (const route of routes) {
      const key = keyOf(route);
      if (!isChurchWrite(route) || MEMBER_WRITES.has(key)) continue;
      const response = await t.request(route.method, pathOf(route, rows), {
        token: home.seed.member.token,
        body: bodyOf(route, rows),
      });
      if (![401, 403, 404].includes(response.status)) {
        failures.push(`${key} → ${response.status} ${JSON.stringify(response.json).slice(0, 160)}`);
      }
    }
    return failures;
  };

  beforeAll(async () => {
    home = { seed: await seedChurch(t), created: new Map() };
    other = { seed: await seedChurch(t), created: new Map() };
    await enableModules(home.seed);
    await enableModules(other.seed);
  });

  it('covers the write routes', () => {
    expect(routes.length).toBeGreaterThan(150);
    for (const route of routes) expect(() => bodyOf(route, null)).not.toThrow();
  });

  it('refuses every protected write without a session', async () => {
    const failures: string[] = [];
    for (const route of routes) {
      if (PUBLIC_WRITES.has(keyOf(route))) continue;
      // An empty body: the session is checked before the body is validated.
      const response = await t.request(route.method, pathOf(route, null), { body: {} });
      if (response.status !== 401) failures.push(`${keyOf(route)} → ${response.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('refuses every protected read without a session', async () => {
    const reads = ((t.app as unknown as { routes: Route[] }).routes ?? []).filter(
      (route) => route.method === 'GET' && route.path.startsWith('/api/'),
    );
    const failures: string[] = [];
    for (const route of reads) {
      if (PUBLIC_READS.has(route.path)) continue;
      const response = await t.request('GET', pathOf(route, null));
      if (response.status !== 401) failures.push(`GET ${route.path} → ${response.status}`);
    }
    expect(reads.length).toBeGreaterThan(150);
    expect(failures).toEqual([]);
  });

  it('refuses church writes to a member without permissions', async () => {
    expect(await memberFailures(null)).toEqual([]);
  });

  it('refuses church writes to a member on rows that exist', async () => {
    await createRows(home);
    expect(home.created.size).toBeGreaterThan(40);
    expect(await memberFailures(home)).toEqual([]);
  });

  it("never lets an owner act on another church's rows through their own church", async () => {
    await createRows(other);
    expect(other.created.size).toBeGreaterThan(40);
    const failures: string[] = [];
    for (const route of routes) {
      if (!isChurchWrite(route)) continue;
      const used = { value: false };
      const path = pathOf(route, other, used);
      const body = bodyOf(route, other, used);
      // Only requests that name a row of the other church say anything about IDOR.
      if (!used.value) continue;
      const response = await t.request(route.method, path, { token: home.seed.owner.token, body });
      if (response.status >= 200 && response.status < 300) {
        failures.push(
          `${keyOf(route)} → ${response.status} ${JSON.stringify(response.json).slice(0, 160)}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
