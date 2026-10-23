import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createRateLimiter } from '../src/lib/rate-limit';
import {
  addHours,
  createResource,
  dayOf,
  inDays,
  seedFacilities,
  type FacilitiesSeed,
} from './facilities-fixtures';
import { createTestApp, permissiveLimiters } from './helpers';

/**
 * Review findings: request flooding, the person picker, what deleting a room does to other
 * people's bookings, skipped dates surviving an edit and decisions on deactivated rooms.
 */
describe('facilities hardening', () => {
  const t = createTestApp(
    {},
    {
      limiters: {
        ...permissiveLimiters(),
        'facilities.booking_request': createRateLimiter({ windowMs: 60_000, max: 3 }),
      },
    },
  );
  afterAll(() => t.close());
  let f: FacilitiesSeed;

  const inbox = async (token: string) => {
    const response = await t.request('GET', '/api/notifications', { token });
    expect(response.status).toBe(200);
    return response.json.items as { type: string; title: string; link: string | null }[];
  };

  beforeAll(async () => {
    f = await seedFacilities(t);
  });

  it('limits how fast members send booking requests, but not managers', async () => {
    const resource = await createResource(t, f);
    const requester = await f.joinAs('Penguji Batas');
    const statuses: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const response = await t.request('POST', `${f.base}/bookings`, {
        token: requester.token,
        body: {
          resourceId: resource.id,
          title: `Permintaan ${index}`,
          startsAt: inDays(20 + index, 9),
          endsAt: inDays(20 + index, 10),
        },
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([201, 201, 201, 429]);

    for (let index = 0; index < 4; index += 1) {
      const response = await t.request('POST', `${f.base}/bookings`, {
        token: f.manager.token,
        body: {
          resourceId: resource.id,
          title: `Jadwal pengelola ${index}`,
          startsAt: inDays(30 + index, 9),
          endsAt: inDays(30 + index, 10),
        },
      });
      expect(response.status).toBe(201);
    }
  });

  it('finds people by their full name in the custodian and borrower picker', async () => {
    const found = await t.request('GET', `${f.base}/people?q=${encodeURIComponent('Alice Smi')}`, {
      token: f.keeper.token,
    });
    expect(found.status).toBe(200);
    expect(found.json.items.map((item: { id: string }) => item.id)).toContain(f.s.alice.id);
  });

  it('tells requesters when a deleted room takes their upcoming bookings with it', async () => {
    const resource = await createResource(t, f, { name: 'Ruang Sementara' });
    const requester = await f.joinAs('Peminjam Ruang Sementara');
    const upcoming = await t.request('POST', `${f.base}/bookings`, {
      token: requester.token,
      body: {
        resourceId: resource.id,
        title: 'Rapat Komisi Pemuda',
        startsAt: inDays(6, 10),
        endsAt: inDays(6, 12),
      },
    });
    expect(upcoming.status).toBe(201);
    const managerOwn = await t.request('POST', `${f.base}/bookings`, {
      token: f.manager.token,
      body: {
        resourceId: resource.id,
        title: 'Bersih-bersih',
        startsAt: inDays(7, 10),
        endsAt: inDays(7, 12),
      },
    });
    expect(managerOwn.status).toBe(201);

    const removed = await t.request('DELETE', `${f.base}/resources/${resource.id}`, {
      token: f.manager.token,
    });
    expect(removed.status).toBe(200);

    const told = (await inbox(requester.token)).filter((item) => item.type === 'booking.cancelled');
    expect(told).toHaveLength(1);
    expect(told[0]?.title).toContain('Ruang Sementara');
    // The booking is gone, so the link leads to the bookings list.
    expect(told[0]?.link).toBe(`/c/${f.s.church.id}/facilities/bookings`);
    expect(
      (await inbox(f.manager.token)).filter((item) => item.type === 'booking.cancelled'),
    ).toHaveLength(0);
  });

  it('keeps skipped dates that still match after a weekly booking is edited', async () => {
    const resource = await createResource(t, f);
    const startsAt = inDays(3, 10);
    const created = await t.request('POST', `${f.base}/bookings`, {
      token: f.manager.token,
      body: {
        resourceId: resource.id,
        title: 'Katekisasi',
        startsAt,
        endsAt: addHours(startsAt, 2),
        recurrence: 'weekly',
        recurrenceUntil: dayOf(inDays(3 + 7 * 4, 10)),
      },
    });
    expect(created.status).toBe(201);
    const id = created.json.booking.id as string;
    const skipped = dayOf(inDays(10, 10));
    const cancelled = await t.request('POST', `${f.base}/bookings/${id}/cancel`, {
      token: f.manager.token,
      body: { occurrenceDate: skipped },
    });
    expect(cancelled.status).toBe(200);

    const body = {
      resourceId: resource.id,
      title: 'Katekisasi Sidi',
      recurrence: 'weekly',
      recurrenceUntil: dayOf(inDays(3 + 7 * 4, 10)),
    };
    // Starting an hour later on the same days keeps the skipped date.
    const later = await t.request('PATCH', `${f.base}/bookings/${id}`, {
      token: f.manager.token,
      body: { ...body, startsAt: inDays(3, 11), endsAt: inDays(3, 13) },
    });
    expect(later.status).toBe(200);
    expect(later.json.booking.skippedDates).toEqual([skipped]);

    // Moving to another weekday drops it: that date no longer takes place.
    const moved = await t.request('PATCH', `${f.base}/bookings/${id}`, {
      token: f.manager.token,
      body: { ...body, startsAt: inDays(4, 11), endsAt: inDays(4, 13) },
    });
    expect(moved.status).toBe(200);
    expect(moved.json.booking.skippedDates).toEqual([]);
  });

  it('refuses to approve a request for a room that was deactivated meanwhile', async () => {
    const resource = await createResource(t, f, { name: 'Ruang Renovasi' });
    const request = await t.request('POST', `${f.base}/bookings`, {
      token: f.s.member.token,
      body: {
        resourceId: resource.id,
        title: 'Latihan Tari',
        startsAt: inDays(9, 15),
        endsAt: inDays(9, 17),
      },
    });
    expect(request.status).toBe(201);
    const deactivated = await t.request('PATCH', `${f.base}/resources/${resource.id}`, {
      token: f.manager.token,
      body: { name: 'Ruang Renovasi', kind: 'room', isActive: false },
    });
    expect(deactivated.status).toBe(200);

    const approve = await t.request(
      'POST',
      `${f.base}/bookings/${request.json.booking.id}/decision`,
      {
        token: f.manager.token,
        body: { decision: 'approved' },
      },
    );
    expect(approve.status).toBe(409);
    const reject = await t.request(
      'POST',
      `${f.base}/bookings/${request.json.booking.id}/decision`,
      {
        token: f.manager.token,
        body: { decision: 'rejected', note: 'Ruangan sedang direnovasi' },
      },
    );
    expect(reject.status).toBe(200);
  });
});
