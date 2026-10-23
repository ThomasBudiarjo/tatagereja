import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { commsAudit, dayOf, inDays, seedComms, type CommsSeed } from './comms-fixtures';
import { createTestApp } from './helpers';

type Item = { key: string; source: string; title: string; cancelled: boolean; link: string | null };

describe('comms calendar and iCal feeds', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CommsSeed;
  let url: string;
  const range = () =>
    `from=${encodeURIComponent(inDays(-1, 0))}&to=${encodeURIComponent(inDays(29, 0))}`;

  beforeAll(async () => {
    c = await seedComms(t);
    url = `${c.church}/calendar`;
    const event = await t.request('POST', `${c.church}/events`, {
      token: c.s.admin.token,
      body: { title: 'Bazar Natal', startsAt: inDays(3, 3), location: 'Halaman gereja' },
    });
    expect(event.status).toBe(201);
    const cancelled = await t.request('POST', `${c.church}/events`, {
      token: c.s.admin.token,
      body: { title: 'Lomba Paduan Suara', startsAt: inDays(4, 3) },
    });
    await t.request('POST', `${c.church}/events/${cancelled.json.event.id}/cancel`, {
      token: c.s.admin.token,
      body: {},
    });
    for (const [title, status] of [
      ['Ibadah Minggu Pagi', 'published'],
      ['Ibadah Rancangan', 'draft'],
    ] as const) {
      const service = await t.request('POST', `${c.church}/worship/services`, {
        token: c.s.owner.token,
        body: { title, startsAt: inDays(5, 1), status },
      });
      expect(service.status).toBe(201);
    }
    const resource = await t.request('POST', `${c.church}/facilities/resources`, {
      token: c.s.owner.token,
      body: { name: 'Aula Serbaguna', kind: 'hall' },
    });
    expect(resource.status).toBe(201);
    const booking = await t.request('POST', `${c.church}/facilities/bookings`, {
      token: c.s.owner.token,
      body: {
        resourceId: resource.json.resource.id,
        title: 'Latihan Tari',
        startsAt: inDays(6, 8),
        endsAt: inDays(6, 10),
      },
    });
    expect(booking.status).toBe(201);
    const birthday = dayOf(inDays(7));
    await t.createPerson(c.s.owner.token, c.s.church.id, {
      firstName: 'Martha',
      lastName: 'Lubis',
      birthDate: `1960-${birthday.slice(5)}`,
    });
    const shy = await t.createPerson(c.s.owner.token, c.s.church.id, {
      firstName: 'Tabita',
      lastName: 'Sinaga',
      birthDate: `1985-${birthday.slice(5)}`,
    });
    const privacy = await t.request('PUT', `${c.church}/people/${shy.id}/privacy`, {
      token: c.s.owner.token,
      body: { showPhone: true, showEmail: true, showAddress: false, showBirthday: false },
    });
    expect(privacy.status).toBe(200);
  });

  const titlesOf = async (token: string, sources: string) => {
    const response = await t.request('GET', `${url}?${range()}&sources=${sources}`, { token });
    expect(response.status).toBe(200);
    return {
      titles: (response.json.items as Item[]).map((item) => item.title),
      items: response.json.items as Item[],
      available: response.json.available as string[],
    };
  };

  it('combines every source the owner may see', async () => {
    const { titles, items, available } = await titlesOf(
      c.s.owner.token,
      'events,services,bookings,birthdays',
    );
    expect(available).toEqual(['events', 'services', 'bookings', 'birthdays']);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Bazar Natal',
        'Lomba Paduan Suara',
        'Ibadah Minggu Pagi',
        'Ibadah Rancangan',
        'Latihan Tari',
        'Martha Lubis',
        'Tabita Sinaga',
      ]),
    );
    expect(items.find((item) => item.title === 'Lomba Paduan Suara')?.cancelled).toBe(true);
    expect(items.find((item) => item.title === 'Latihan Tari')?.link).toContain(
      '/facilities/bookings/',
    );
    // Sorted by start time.
    const starts = (items as unknown as { startsAt: string }[]).map((item) => item.startsAt);
    expect([...starts].sort()).toEqual(starts);
  });

  it('respects drafts, privacy and opt-in birthdays for members', async () => {
    const all = await titlesOf(c.s.member.token, 'events,services,bookings,birthdays');
    expect(all.titles).toContain('Ibadah Minggu Pagi');
    expect(all.titles).not.toContain('Ibadah Rancangan');
    expect(all.titles).toContain('Martha Lubis');
    expect(all.titles).not.toContain('Tabita Sinaga');
    const defaults = await t.request('GET', `${url}?${range()}`, { token: c.s.member.token });
    expect(defaults.json.items.some((item: Item) => item.source === 'birthdays')).toBe(false);
  });

  it('drops sources of switched-off modules', async () => {
    const off = await t.request('PATCH', `/api/churches/${c.s.church.id}/modules`, {
      token: c.s.owner.token,
      body: { modules: { facilities: false } },
    });
    expect(off.status).toBe(200);
    const { titles, available } = await titlesOf(c.s.owner.token, 'events,bookings');
    expect(available).not.toContain('bookings');
    expect(titles).not.toContain('Latihan Tari');
    await t.request('PATCH', `/api/churches/${c.s.church.id}/modules`, {
      token: c.s.owner.token,
      body: { modules: { facilities: true } },
    });
  });

  it('filters by group and validates the range', async () => {
    await t.request('POST', `${c.church}/events`, {
      token: c.s.leader.token,
      body: { title: 'Pemuda Camping', startsAt: inDays(8), groupId: c.s.group.id },
    });
    const group = await t.request(
      'GET',
      `${url}?${range()}&groupId=${c.s.group.id}&sources=events,services`,
      { token: c.s.member.token },
    );
    expect(group.json.items.map((item: Item) => item.title)).toEqual(['Pemuda Camping']);
    const tooLong = await t.request(
      'GET',
      `${url}?from=${encodeURIComponent(inDays(0))}&to=${encodeURIComponent(inDays(150))}`,
      { token: c.s.member.token },
    );
    expect(tooLong.status).toBe(422);
    const backwards = await t.request(
      'GET',
      `${url}?from=${encodeURIComponent(inDays(5))}&to=${encodeURIComponent(inDays(1))}`,
      { token: c.s.member.token },
    );
    expect(backwards.status).toBe(422);
    expect((await t.request('GET', `${url}?${range()}`, { token: c.other.token })).status).toBe(
      403,
    );
  });

  describe('private feeds', () => {
    let path = '';
    let feedId = '';

    it('creates a revocable feed whose URL is shown once', async () => {
      const created = await t.request('POST', `${url}/feeds`, {
        token: c.s.member.token,
        body: { label: 'Ponsel', sources: ['events', 'services', 'birthdays'] },
      });
      expect(created.status).toBe(201);
      path = created.json.path;
      feedId = created.json.feed.id;
      expect(path).toMatch(/^\/api\/calendar\/feeds\/[A-Za-z0-9_-]+\.ics$/);
      expect(created.json.url.endsWith(path)).toBe(true);
      const list = await t.request('GET', `${url}/feeds`, { token: c.s.member.token });
      expect(list.json.items).toHaveLength(1);
      expect(JSON.stringify(list.json)).not.toContain(path.split('/').pop()?.replace('.ics', ''));
      expect(
        (await t.request('GET', `${url}/feeds`, { token: c.s.admin.token })).json.items,
      ).toHaveLength(0);
      expect(
        (await commsAudit(t, c, 'calendar_feed.create')).some((entry) => entry.entityId === feedId),
      ).toBe(true);
    });

    it('serves an iCal file with what the person may see', async () => {
      const response = await t.request('GET', path);
      expect(response.status).toBe(200);
      const body = response.json as string;
      expect(body.startsWith('BEGIN:VCALENDAR')).toBe(true);
      expect(body).toContain('SUMMARY:Bazar Natal');
      expect(body).toContain('LOCATION:Halaman gereja');
      expect(body).toContain('SUMMARY:Ibadah Minggu Pagi');
      expect(body).not.toContain('Ibadah Rancangan');
      expect(body).not.toContain('Latihan Tari');
      expect(body).toContain('SUMMARY:Ulang tahun Martha Lubis');
      expect(body).not.toContain('Tabita');
      expect(body).toContain('STATUS:CANCELLED');
      expect(body).toContain('DTSTART;VALUE=DATE:');
      const list = await t.request('GET', `${url}/feeds`, { token: c.s.member.token });
      expect(list.json.items[0].lastUsedAt).toBeString();
    });

    it('refuses unknown, revoked and suspended feeds', async () => {
      expect(
        (await t.request('GET', '/api/calendar/feeds/abcdefghijklmnopqrstuvwxyz0123456789.ics'))
          .status,
      ).toBe(404);
      expect((await t.request('GET', '/api/calendar/feeds/short')).status).toBe(422);

      const second = await t.request('POST', `${url}/feeds`, {
        token: c.plain.token,
        body: { sources: ['events'] },
      });
      expect((await t.request('GET', second.json.path)).status).toBe(200);
      await t.request('PATCH', `${c.church}/members/${c.membershipOf(c.plain.user.id)}/status`, {
        token: c.s.owner.token,
        body: { status: 'suspended' },
      });
      expect((await t.request('GET', second.json.path)).status).toBe(404);
      await t.request('PATCH', `${c.church}/members/${c.membershipOf(c.plain.user.id)}/status`, {
        token: c.s.owner.token,
        body: { status: 'active' },
      });
      expect((await t.request('GET', second.json.path)).status).toBe(200);

      // Only the owner of a feed can revoke it.
      expect(
        (await t.request('DELETE', `${url}/feeds/${feedId}`, { token: c.s.owner.token })).status,
      ).toBe(404);
      expect(
        (
          await t.request('DELETE', `/api/churches/${c.otherChurch.id}/calendar/feeds/${feedId}`, {
            token: c.other.token,
          })
        ).status,
      ).toBe(404);
      const revoked = await t.request('DELETE', `${url}/feeds/${feedId}`, {
        token: c.s.member.token,
      });
      expect(revoked.status).toBe(200);
      expect((await t.request('GET', path)).status).toBe(404);
      expect(
        (await t.request('DELETE', `${url}/feeds/${feedId}`, { token: c.s.member.token })).status,
      ).toBe(404);
    });

    it('limits feeds per person', async () => {
      for (let index = 0; index < 5; index += 1) {
        const created = await t.request('POST', `${url}/feeds`, {
          token: c.s.admin.token,
          body: {},
        });
        expect(created.status).toBe(201);
      }
      const sixth = await t.request('POST', `${url}/feeds`, { token: c.s.admin.token, body: {} });
      expect(sixth.status).toBe(409);
      const invalid = await t.request('POST', `${url}/feeds`, {
        token: c.s.admin.token,
        body: { sources: [] },
      });
      expect(invalid.status).toBe(422);
    });
  });
});
