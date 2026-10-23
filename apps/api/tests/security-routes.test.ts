import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp, seedChurch } from './helpers';
import {
  MEMBER_WRITES,
  PUBLIC_READS,
  PUBLIC_WRITES,
  keyOf,
  routeWorld,
  type World,
} from './route-world';

/*
 * Generated from the router itself: every write route of the API is called without a session
 * and as a plain member who holds no extra permission, first with unknown ids and then with
 * the ids of rows the owner created through the same routes. Neither may reach a handler that
 * changes church data. New routes are covered automatically; a route a member may legitimately
 * use (their own RSVP, prayer request, booking request...) must be listed in MEMBER_WRITES
 * with the reason.
 */

describe('generated route permissions', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  const world = routeWorld(t);
  const routes = world.writes;
  const { isChurchWrite, bodyOf } = world;
  let home: World;
  let other: World;

  const pathOf = (
    route: Parameters<typeof world.pathOf>[1],
    rows: World | null,
    used?: { value: boolean },
  ) => world.pathOf(home, route, rows, used);

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
    await world.enableModules(home.seed);
    await world.enableModules(other.seed);
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
    const { reads } = world;
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
    await world.createRows(home);
    expect(home.created.size).toBeGreaterThan(40);
    expect(await memberFailures(home)).toEqual([]);
  });

  it("never lets an owner act on another church's rows through their own church", async () => {
    await world.createRows(other);
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
