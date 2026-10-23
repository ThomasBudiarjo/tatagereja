import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createResource, inDays, seedFacilities, type FacilitiesSeed } from './facilities-fixtures';
import { createTestApp } from './helpers';

describe('facilities: who may act on whose booking', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let f: FacilitiesSeed;
  let resourceId: string;
  let bookingId: string;

  beforeAll(async () => {
    f = await seedFacilities(t);
    resourceId = (await createResource(t, f, { name: 'Ruang Pemuda', capacity: 40 })).id;
    const created = await t.request('POST', `${f.base}/bookings`, {
      token: f.s.member.token,
      body: {
        resourceId,
        title: 'Persekutuan Doa Pemuda',
        startsAt: inDays(4, 11),
        endsAt: inDays(4, 13),
        notes: 'Nomor kontak: 0812-0000-1111',
      },
    });
    expect(created.status).toBe(201);
    bookingId = created.json.booking.id;
    const approved = await t.request('POST', `${f.base}/bookings/${bookingId}/decision`, {
      token: f.manager.token,
      body: { decision: 'approved', note: 'Kunci diambil di kantor gereja' },
    });
    expect(approved.status).toBe(200);
  });

  it('shows approved bookings to every viewer but keeps notes for the requester and managers', async () => {
    const asOther = await t.request('GET', `${f.base}/bookings/${bookingId}`, {
      token: f.s.leader.token,
    });
    expect(asOther.status).toBe(200);
    expect(asOther.json.booking).toMatchObject({
      title: 'Persekutuan Doa Pemuda',
      status: 'approved',
      notes: null,
      decisionNote: null,
    });

    const asRequester = await t.request('GET', `${f.base}/bookings/${bookingId}`, {
      token: f.s.member.token,
    });
    expect(asRequester.json.booking.notes).toBe('Nomor kontak: 0812-0000-1111');
    expect(asRequester.json.booking.decisionNote).toBe('Kunci diambil di kantor gereja');

    // The list redacts the same way.
    const list = await t.request('GET', `${f.base}/bookings?resourceId=${resourceId}`, {
      token: f.keeper.token,
    });
    expect(list.status).toBe(200);
    const row = list.json.items.find((item: { id: string }) => item.id === bookingId);
    expect(row).toMatchObject({ notes: null, decisionNote: null });
  });

  it('refuses changes, cancellations and decisions by members who did not make the booking', async () => {
    const body = {
      resourceId,
      title: 'Diambil alih',
      startsAt: inDays(4, 11),
      endsAt: inDays(4, 14),
    };
    for (const token of [f.s.leader.token, f.keeper.token, f.viewer.token]) {
      expect(
        (await t.request('PATCH', `${f.base}/bookings/${bookingId}`, { token, body })).status,
      ).toBe(403);
      expect(
        (await t.request('POST', `${f.base}/bookings/${bookingId}/cancel`, { token, body: {} }))
          .status,
      ).toBe(403);
      expect(
        (
          await t.request('POST', `${f.base}/bookings/${bookingId}/decision`, {
            token,
            body: { decision: 'rejected' },
          })
        ).status,
      ).toBe(403);
    }
    const still = await t.request('GET', `${f.base}/bookings/${bookingId}`, {
      token: f.s.owner.token,
    });
    expect(still.json.booking).toMatchObject({
      title: 'Persekutuan Doa Pemuda',
      status: 'approved',
    });
  });

  it('lets administrators act as managers on any booking', async () => {
    const cancelled = await t.request('POST', `${f.base}/bookings/${bookingId}/cancel`, {
      token: f.s.admin.token,
      body: { reason: 'Gedung dipakai untuk Ibadah Pemakaman' },
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.json.booking.status).toBe('cancelled');

    // A cancelled booking cannot be edited or decided any more.
    expect(
      (
        await t.request('PATCH', `${f.base}/bookings/${bookingId}`, {
          token: f.s.member.token,
          body: {
            resourceId,
            title: 'Persekutuan Doa Pemuda',
            startsAt: inDays(4, 11),
            endsAt: inDays(4, 13),
          },
        })
      ).status,
    ).toBe(403);
    const decided = await t.request('POST', `${f.base}/bookings/${bookingId}/decision`, {
      token: f.s.owner.token,
      body: { decision: 'approved' },
    });
    expect(decided.status).toBe(409);

    // The time is free again for someone else.
    const rebooked = await t.request('POST', `${f.base}/bookings`, {
      token: f.s.owner.token,
      body: {
        resourceId,
        title: 'Ibadah Penghiburan',
        startsAt: inDays(4, 11),
        endsAt: inDays(4, 13),
      },
    });
    expect(rebooked.status).toBe(201);
    expect(rebooked.json.booking.status).toBe('approved');
  });

  it('keeps inactive rooms out of new bookings', async () => {
    const closed = await createResource(t, f, { name: 'Gedung Lama', isActive: false });
    const response = await t.request('POST', `${f.base}/bookings`, {
      token: f.s.member.token,
      body: {
        resourceId: closed.id,
        title: 'Latihan Tari',
        startsAt: inDays(8, 9),
        endsAt: inDays(8, 10),
      },
    });
    // Members cannot see the room at all; managers are told it is closed.
    expect(response.status).toBe(404);
    const asManager = await t.request('POST', `${f.base}/bookings`, {
      token: f.manager.token,
      body: {
        resourceId: closed.id,
        title: 'Latihan Tari',
        startsAt: inDays(8, 9),
        endsAt: inDays(8, 10),
      },
    });
    expect(asManager.status).toBe(409);
  });
});
