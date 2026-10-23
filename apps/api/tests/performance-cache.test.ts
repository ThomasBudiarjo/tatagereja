import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createResultCache, invalidateForRequest } from '../src/lib/cache';
import { createRateLimiter } from '../src/lib/rate-limit';
import { createTestApp, seedChurch } from './helpers';

/*
 * The result cache behind reports, absence lists and directory counts: it must never show a
 * stale answer after a write, must keep churches apart, and must only rate-limit computations.
 */

type Seed = Awaited<ReturnType<typeof seedChurch>>;

/** A session time `weeks` weeks ago, Sunday morning UTC. */
const weeksAgo = (weeks: number) => {
  const date = new Date(Date.now() - weeks * 7 * 86_400_000);
  date.setUTCHours(2, 0, 0, 0);
  return date.toISOString();
};
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
/** Report ranges end after today wherever the church is; the API stops them at its today. */
const until = daysAgo(-2);

describe('result cache', () => {
  it('returns the stored value until its church changes, its TTL passes or everything is dropped', () => {
    const cache = createResultCache({ ttlMs: 60_000, maxEntries: 10 });
    let computed = 0;
    const compute = () => ({ value: (computed += 1) });
    expect(cache.remember('a', 'k', compute).value).toBe(1);
    expect(cache.remember('a', 'k', compute).value).toBe(1);
    expect(cache.has('a', 'k')).toBe(true);
    // Another church and another key are separate entries.
    expect(cache.remember('b', 'k', compute).value).toBe(2);
    expect(cache.remember('a', 'other', compute).value).toBe(3);

    cache.invalidateChurch('a');
    expect(cache.has('a', 'k')).toBe(false);
    expect(cache.has('b', 'k')).toBe(true);
    expect(cache.remember('a', 'k', compute).value).toBe(4);

    cache.invalidateAll();
    expect(cache.has('a', 'k')).toBe(false);
    expect(cache.has('b', 'k')).toBe(false);
    expect(cache.size).toBe(0);
  });

  it('expires entries after the TTL', async () => {
    const cache = createResultCache({ ttlMs: 20, maxEntries: 10 });
    let computed = 0;
    cache.remember('a', 'k', () => (computed += 1));
    await Bun.sleep(40);
    expect(cache.has('a', 'k')).toBe(false);
    expect(cache.remember('a', 'k', () => (computed += 1))).toBe(2);
  });

  it('does not keep a value computed while a write to its church happened', () => {
    const cache = createResultCache({ ttlMs: 60_000, maxEntries: 10 });
    const value = cache.remember('a', 'k', () => {
      cache.invalidateChurch('a');
      return 'suspect';
    });
    expect(value).toBe('suspect');
    expect(cache.has('a', 'k')).toBe(false);
  });

  it('drops the least recently used entries beyond its size', () => {
    const cache = createResultCache({ ttlMs: 60_000, maxEntries: 2 });
    cache.remember('a', '1', () => 1);
    cache.remember('a', '2', () => 2);
    cache.remember('a', '1', () => 0); // a hit makes it the newest
    cache.remember('a', '3', () => 3);
    expect(cache.has('a', '1')).toBe(true);
    expect(cache.has('a', '2')).toBe(false);
    expect(cache.has('a', '3')).toBe(true);
  });

  it('maps requests to what they may change', () => {
    const cache = createResultCache();
    const seed = () => {
      cache.invalidateAll();
      cache.remember('c1', 'k', () => 1);
      cache.remember('c2', 'k', () => 2);
    };
    seed();
    invalidateForRequest(cache, 'GET', '/api/churches/c1/people');
    expect(cache.has('c1', 'k') && cache.has('c2', 'k')).toBe(true);

    invalidateForRequest(cache, 'POST', '/api/churches/c1/people');
    expect(cache.has('c1', 'k')).toBe(false);
    expect(cache.has('c2', 'k')).toBe(true);

    seed();
    invalidateForRequest(cache, 'PATCH', '/api/churches/c2');
    expect(cache.has('c1', 'k')).toBe(true);
    expect(cache.has('c2', 'k')).toBe(false);

    // Sign-in, sessions and notifications cannot change church results.
    seed();
    for (const path of [
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/sessions/abc',
      '/api/auth/two-factor/setup',
      '/api/notifications',
      '/api/notifications/abc',
    ]) {
      invalidateForRequest(cache, 'POST', path);
    }
    expect(cache.has('c1', 'k') && cache.has('c2', 'k')).toBe(true);

    // Profile changes, account deletion and joining a church (also by registering with an
    // invitation) can: every church is dropped. So does a church path that cannot be decoded.
    for (const [method, path] of [
      ['PATCH', '/api/auth/me'],
      ['DELETE', '/api/auth/account'],
      ['POST', '/api/auth/register'],
      ['POST', '/api/invitations/token/accept'],
      ['POST', '/api/churches'],
      ['POST', '/api/churches/%E0%A4%A/people'],
    ] as const) {
      seed();
      invalidateForRequest(cache, method, path);
      expect(cache.has('c1', 'k') || cache.has('c2', 'k')).toBe(false);
    }
  });
});

describe('cached church results stay correct after writes', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;
  let base: string;

  const get = async (path: string, token = s.owner.token) => {
    const response = await t.request('GET', `${base}${path}`, { token });
    expect(response.status).toBe(200);
    return response.json;
  };

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}`;
  });

  it('shows a new absence streak, then drops it as soon as the person attends', async () => {
    const sessionIds: string[] = [];
    for (const weeks of [4, 3, 2]) {
      const created = await t.request('POST', `${base}/attendance/sessions`, {
        token: s.owner.token,
        body: { title: 'Ibadah Umum', sessionAt: weeksAgo(weeks) },
      });
      expect(created.status).toBe(201);
      sessionIds.push(created.json.session.id);
    }
    const before = await get('/attendance/absences?threshold=3');
    expect(before.items).toEqual([]);
    const dashboardBefore = await get('/dashboard');

    for (const sessionId of sessionIds) {
      const marked = await t.request('PUT', `${base}/attendance/sessions/${sessionId}/records`, {
        token: s.owner.token,
        body: { records: [{ personId: s.bob.id, status: 'absent', note: null }] },
      });
      expect(marked.status).toBe(200);
    }
    const missing = await get('/attendance/absences?threshold=3');
    expect(missing.items.map((item: { person: { id: string } }) => item.person.id)).toEqual([
      s.bob.id,
    ]);
    expect(missing.items[0].streak).toBe(3);
    const dashboard = await get('/dashboard');
    expect(dashboard.attendance.openAbsences).toBe(dashboardBefore.attendance.openAbsences + 1);

    const latest = await t.request('POST', `${base}/attendance/sessions`, {
      token: s.owner.token,
      body: { title: 'Ibadah Umum', sessionAt: weeksAgo(1) },
    });
    await t.request('PUT', `${base}/attendance/sessions/${latest.json.session.id}/records`, {
      token: s.owner.token,
      body: { records: [{ personId: s.bob.id, status: 'present', note: null }] },
    });
    expect((await get('/attendance/absences?threshold=3')).items).toEqual([]);
    expect((await get('/dashboard')).attendance.openAbsences).toBe(
      dashboardBefore.attendance.openAbsences,
    );
  });

  it('counts a new person in the directory summary and the reports at once', async () => {
    const summary = await get('/directory/summary');
    const range = `from=${daysAgo(30)}&to=${until}`;
    const growth = await get(`/insights/reports/membership_growth?${range}`);
    await t.createPerson(s.owner.token, s.church.id, { firstName: 'Cache', lastName: 'Fresh' });
    expect((await get('/directory/summary')).people).toBe(summary.people + 1);
    expect((await get(`/insights/reports/membership_growth?${range}`)).totals.total).toBe(
      growth.totals.total + 1,
    );
  });

  it('includes a new gift in the finance and giving reports at once', async () => {
    const setup = await t.request('POST', `${base}/finance/setup/defaults`, {
      token: s.owner.token,
      body: { openingDate: daysAgo(60) },
    });
    expect(setup.status).toBe(200);
    const fundId = setup.json.funds[0].id as string;
    const accountId = setup.json.accounts[0].id as string;
    const range = `from=${daysAgo(30)}&to=${until}`;
    const income = await get(`/finance/reports/income_expense?${range}`);
    const giving = await get(`/insights/reports/giving_trend?${range}`);
    const recorded = await t.request('POST', `${base}/finance/contributions`, {
      token: s.owner.token,
      body: {
        kind: 'tithe',
        donorName: 'NN',
        fundId,
        accountId,
        method: 'cash',
        amount: 250_000,
        receivedAt: daysAgo(1),
      },
    });
    expect(recorded.status).toBe(201);
    expect((await get(`/finance/reports/income_expense?${range}`)).totals.income).toBe(
      income.totals.income + 250_000,
    );
    expect((await get(`/insights/reports/giving_trend?${range}`)).totals.total).toBe(
      giving.totals.total + 250_000,
    );
  });

  it('never shows a hidden birthday to a viewer who may not see it, whoever asked first', async () => {
    // A birthday three days from now, 40 years ago; the church day may differ by one from UTC.
    const soon = new Date(Date.now() + 3 * 86_400_000);
    soon.setUTCFullYear(soon.getUTCFullYear() - 40);
    const person = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Tersembunyi',
      lastName: 'Ulang Tahun',
      birthDate: soon.toISOString().slice(0, 10),
    });
    const celebrates = async (token: string) =>
      (await get('/directory/summary', token)).celebrations.some(
        (item: { person: { id: string } }) => item.person.id === person.id,
      );
    expect(await celebrates(s.owner.token)).toBe(true);
    expect(await celebrates(s.member.token)).toBe(true);

    const hide = await t.request('PUT', `${base}/people/${person.id}/privacy`, {
      token: s.owner.token,
      body: { showPhone: true, showEmail: true, showAddress: false, showBirthday: false },
    });
    expect(hide.status).toBe(200);
    // The private view is computed (and cached) first; the member still gets their own answer.
    expect(await celebrates(s.owner.token)).toBe(true);
    expect(await celebrates(s.member.token)).toBe(false);
    expect(await celebrates(s.owner.token)).toBe(true);
    expect(await celebrates(s.member.token)).toBe(false);
  });

  it('keeps each church to its own answers', async () => {
    const other = await t.register('Other Owner');
    const church = await t.createChurch(other.token, 'GKI Lain');
    const mine = await get('/directory/summary');
    const theirs = await t.request('GET', `/api/churches/${church.id}/directory/summary`, {
      token: other.token,
    });
    expect(theirs.status).toBe(200);
    expect(theirs.json.people).toBe(0);
    expect(mine.people).toBeGreaterThan(0);
  });
});

describe('report rate limit', () => {
  const t = createTestApp(
    {},
    {
      limiters: {
        login: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
        register: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
        invitation: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
        'insights.report': createRateLimiter({ windowMs: 60_000, max: 2 }),
      },
    },
  );
  afterAll(() => t.close());

  it('counts computations only: cached answers stay available once the budget is spent', async () => {
    const s = await seedChurch(t);
    const report = (from: string) =>
      t.request(
        'GET',
        `/api/churches/${s.church.id}/insights/reports/status_breakdown?from=${from}&to=${until}`,
        { token: s.owner.token },
      );
    expect((await report(daysAgo(10))).status).toBe(200);
    expect((await report(daysAgo(10))).status).toBe(200);
    expect((await report(daysAgo(20))).status).toBe(200);
    const limited = await report(daysAgo(30));
    expect(limited.status).toBe(429);
    expect(limited.json.error.code).toBe('RATE_LIMITED');
    expect((await report(daysAgo(10))).status).toBe(200);
  });
});
