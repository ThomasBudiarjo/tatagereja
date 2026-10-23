import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { BODY_LIMIT_KB, accountLimitsFor, bodyLimitFor } from '../src/lib/abuse';
import { createRateLimiter } from '../src/lib/rate-limit';
import { notify } from '../src/services/notifications';
import { createTestApp, permissiveLimiters, seedChurch } from './helpers';

/*
 * Abuse limits that apply by kind of route: body sizes, per-account limits on writes, exports
 * and searches, and notifications that cannot be repeated in a loop.
 */

describe('abuse controls', () => {
  const t = createTestApp(
    {},
    {
      limiters: {
        ...permissiveLimiters(),
        'account.writes': createRateLimiter({ windowMs: 60_000, max: 40 }),
        'account.exports': createRateLimiter({ windowMs: 60_000, max: 2 }),
        'account.searches': createRateLimiter({ windowMs: 60_000, max: 3 }),
      },
    },
  );
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let church: string;

  beforeAll(async () => {
    s = await seedChurch(t);
    church = `/api/churches/${s.church.id}`;
  });

  it('classifies routes for body sizes and account limits', () => {
    const max = 2048 * 1024;
    expect(bodyLimitFor('/api/auth/login', max)).toBe(BODY_LIMIT_KB.auth * 1024);
    expect(bodyLimitFor(`${church}/people`, max)).toBe(BODY_LIMIT_KB.standard * 1024);
    expect(bodyLimitFor(`${church}/bulletins/x`, max)).toBe(BODY_LIMIT_KB.documents * 1024);
    expect(bodyLimitFor(`${church}/people/import`, max)).toBe(max);
    expect(bodyLimitFor(`${church}/people/import`, 64 * 1024)).toBe(64 * 1024);
    const kinds = (method: string, path: string) =>
      accountLimitsFor(method, new URL(`http://localhost${church}${path}`));
    expect(kinds('POST', '/people')).toEqual(['writes']);
    expect(kinds('GET', '/people/export')).toEqual(['exports']);
    expect(kinds('GET', '/finance/reports/summary')).toEqual(['exports']);
    expect(kinds('GET', '/people?q=budi')).toEqual(['searches']);
    expect(kinds('GET', '/people?q=')).toEqual([]);
    expect(kinds('GET', '/worship/services/x/roster')).toEqual([]);
  });

  it('refuses oversized bodies by kind of route', async () => {
    const big = 'x'.repeat((BODY_LIMIT_KB.standard + 1) * 1024);
    const refused = await t.request('POST', `${church}/people`, {
      token: s.owner.token,
      body: { firstName: big },
    });
    expect(refused.status).toBe(413);
    expect(refused.json.error.code).toBe('PAYLOAD_TOO_LARGE');
    const login = await t.request('POST', '/api/auth/login', {
      body: { email: 'a@example.com', password: 'x'.repeat(40 * 1024) },
    });
    expect(login.status).toBe(413);
    // An import may be as large as the server allows; this one fails validation instead.
    const imported = await t.request('POST', `${church}/people/import`, {
      token: s.owner.token,
      body: { csv: big },
    });
    expect(imported.status).not.toBe(413);
  });

  it('refuses a chunked body without a length outside imports', async () => {
    const chunked = { 'transfer-encoding': 'chunked' };
    const refused = await t.request('POST', `${church}/people`, {
      token: s.owner.token,
      headers: chunked,
    });
    expect(refused.status).toBe(411);
    expect(refused.json.error.code).toBe('LENGTH_REQUIRED');
    const imported = await t.request('POST', `${church}/people/import`, {
      token: s.owner.token,
      headers: chunked,
    });
    expect(imported.status).not.toBe(411);
  });

  it('limits searches and exports per account', async () => {
    const searches = [];
    for (let index = 0; index < 4; index += 1) {
      const response = await t.request('GET', `${church}/people?q=a${index}`, s.admin);
      searches.push(response.status);
    }
    expect(searches).toEqual([200, 200, 200, 429]);
    // Another account has its own allowance; browsing without a search is not counted.
    expect((await t.request('GET', `${church}/people?q=a`, { token: s.owner.token })).status).toBe(
      200,
    );
    expect((await t.request('GET', `${church}/people`, { token: s.admin.token })).status).toBe(200);
    const exports = [];
    for (let index = 0; index < 3; index += 1) {
      exports.push((await t.request('GET', `${church}/people/export`, s.admin)).status);
    }
    expect(exports).toEqual([200, 200, 429]);
  });

  it('limits writes per account', async () => {
    const writer = await t.register('Penulis Cepat');
    await t.join(writer.token, s.invitation.token);
    const statuses: number[] = [];
    for (let index = 0; index < 45; index += 1) {
      const response = await t.request('PUT', `${church}/dashboard/preferences`, {
        token: writer.token,
        body: { widgets: [] },
      });
      statuses.push(response.status);
    }
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
    expect(statuses.slice(0, 30).every((status) => status !== 429)).toBe(true);
  });

  it('does not repeat an identical unread notification', () => {
    const send = () =>
      notify(t.db, {
        churchId: s.church.id,
        userIds: [s.member.user.id],
        type: 'group.join_requested',
        title: 'Budi asked to join Youth Ministry',
        entityType: 'group',
        entityId: s.group.id,
      });
    expect(send()).toBe(1);
    expect(send()).toBe(0);
    // A different message about the same item still arrives.
    expect(
      notify(t.db, {
        churchId: s.church.id,
        userIds: [s.member.user.id],
        type: 'group.join_requested',
        title: 'Ani asked to join Youth Ministry',
        entityType: 'group',
        entityId: s.group.id,
      }),
    ).toBe(1);
  });
});
