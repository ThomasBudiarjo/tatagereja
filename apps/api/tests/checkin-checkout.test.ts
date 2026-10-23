import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createRateLimiter } from '../src/lib/rate-limit';
import { checkIn, seedCheckin, type CheckinSeed } from './checkin-fixtures';
import { createTestApp } from './helpers';

describe('kids check-out', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CheckinSeed;

  beforeAll(async () => {
    c = await seedCheckin(t);
  });

  const audit = async (action: string) => {
    const response = await t.request(
      'GET',
      `${c.church}/audit-logs?module=checkin&action=${action}&limit=200`,
      { token: c.s.owner.token },
    );
    expect(response.status).toBe(200);
    return response.json.items as {
      action: string;
      entityId: string;
      summary: string;
      after: any;
    }[];
  };

  /** A code from the alphabet that is not `code`. */
  const wrongCode = (code: string) => (code === 'AAAA' ? 'BBBB' : 'AAAA');

  it('shows the guardians and the pick-up list in the check-out dialog', async () => {
    const pickup = await t.request('POST', `${c.base}/children/${c.yosua.id}/pickups`, {
      token: c.guardian.token,
      body: { pickupPersonId: c.opung.id, relationship: 'Opung (nenek)', phone: '0813 1111 2222' },
    });
    expect(pickup.status).toBe(201);
    expect(pickup.json.pickup.name).toBe('Opung Siregar');
    const [yosua] = await checkIn(t, c, {
      children: [{ personId: c.yosua.id }],
      guardianPersonId: c.sari.id,
    });
    const detail = await t.request('GET', `${c.base}/checkins/${yosua!.id}`, {
      token: c.teacher.token,
    });
    expect(detail.status).toBe(200);
    expect(detail.json.guardians.map((person: any) => person.firstName).sort()).toEqual([
      'Budi',
      'Sari',
    ]);
    expect(detail.json.pickups.map((item: any) => item.name)).toEqual(['Opung Siregar']);
    expect(detail.json.session.name).toBe('Ibadah Minggu Pagi');
    // The guardian sees their own child's code.
    const own = await t.request('GET', `${c.base}/checkins/${yosua!.id}`, {
      token: c.guardian.token,
    });
    expect(own.json.checkin.securityCode).toBe(yosua!.securityCode);
  });

  it('rejects a wrong code, audits it without the code, and accepts the right one', async () => {
    const roster = await t.request(
      'GET',
      `${c.sessionPath}/classes/${c.classId('Kelas Kecil')}/roster`,
      { token: c.coordinator.token },
    );
    const yosua = roster.json.checkins.find((item: any) => item.child.id === c.yosua.id);
    const wrong = await t.request('POST', `${c.base}/checkins/${yosua.id}/checkout`, {
      token: c.teacher.token,
      body: { securityCode: wrongCode(yosua.securityCode) },
    });
    expect(wrong.status).toBe(422);
    expect(wrong.json.error.issues[0].path).toBe('securityCode');
    const failures = await audit('checkin.checkout_failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]!.entityId).toBe(yosua.id);
    expect(JSON.stringify(failures)).not.toContain(yosua.securityCode);

    const malformed = await t.request('POST', `${c.base}/checkins/${yosua.id}/checkout`, {
      token: c.teacher.token,
      body: { securityCode: 'O0I1' },
    });
    expect(malformed.status).toBe(422);

    // Someone not on the list cannot collect the child, even with the code.
    const stranger = await t.request('POST', `${c.base}/checkins/${yosua.id}/checkout`, {
      token: c.teacher.token,
      body: { securityCode: yosua.securityCode, pickupPersonId: c.neighbour.id },
    });
    expect(stranger.status).toBe(403);

    const typed = yosua.securityCode.toLowerCase().split('').join(' ');
    const out = await t.request('POST', `${c.base}/checkins/${yosua.id}/checkout`, {
      token: c.teacher.token,
      body: { securityCode: typed, pickupPersonId: c.opung.id },
    });
    expect(out.status).toBe(200);
    expect(out.json.checkin).toMatchObject({
      status: 'checked_out',
      pickupName: 'Opung Siregar',
      overridden: false,
      securityCode: null,
    });

    const inbox = await t.request('GET', '/api/notifications', { token: c.guardian.token });
    const notice = inbox.json.items.find((item: any) => item.type === 'checkin.child_picked_up');
    expect(notice.title).toBe('Yosua Simanjuntak sudah dijemput');
    expect(notice.body).toBe('Dijemput oleh Opung Siregar');

    const twice = await t.request('POST', `${c.base}/checkins/${yosua.id}/checkout`, {
      token: c.teacher.token,
      body: { securityCode: yosua.securityCode },
    });
    expect(twice.status).toBe(409);
    const history = await t.request('GET', `${c.base}/children/${c.yosua.id}/attendance`, {
      token: c.guardian.token,
    });
    expect(history.json.items[0]).toMatchObject({
      sessionName: 'Ibadah Minggu Pagi',
      className: 'Kelas Kecil',
      pickupName: 'Opung Siregar',
    });
    expect(history.json.total).toBe(1);
  });

  it('defaults the pick-up to the guardian who brought the child', async () => {
    const [maria] = await checkIn(t, c, {
      children: [{ personId: c.maria.id }],
      guardianPersonId: c.budi.id,
    });
    const out = await t.request('POST', `${c.base}/checkins/${maria!.id}/checkout`, {
      token: c.teacher.token,
      body: { securityCode: maria!.securityCode },
    });
    expect(out.json.checkin.pickupName).toBe('Budi Simanjuntak');
  });

  it('lets coordinators override with a reason, audited', async () => {
    const [lukas] = await checkIn(t, c, { children: [{ personId: c.lukas.id }] });
    const noReason = await t.request('POST', `${c.base}/checkins/${lukas!.id}/override`, {
      token: c.coordinator.token,
      body: { reason: 'abc' },
    });
    expect(noReason.status).toBe(422);
    const overridden = await t.request('POST', `${c.base}/checkins/${lukas!.id}/override`, {
      token: c.coordinator.token,
      body: { reason: 'Label hilang, ibu dikenali Majelis', pickupName: 'Rina Hutapea' },
    });
    expect(overridden.status).toBe(200);
    expect(overridden.json.checkin).toMatchObject({
      status: 'checked_out',
      overridden: true,
      pickupName: 'Rina Hutapea',
    });
    const entries = await audit('checkin.checkout_override');
    expect(entries[0]!.after).toMatchObject({
      reason: 'Label hilang, ibu dikenali Majelis',
      pickupName: 'Rina Hutapea',
    });
    const again = await t.request('POST', `${c.base}/checkins/${lukas!.id}/override`, {
      token: c.coordinator.token,
      body: { reason: 'Sekali lagi dicoba' },
    });
    expect(again.status).toBe(409);
  });

  it('cools down after too many attempts on one check-in', async () => {
    const [lukas] = await checkIn(t, c, { children: [{ personId: c.lukas.id }] });
    for (let i = 0; i < 10; i += 1) {
      const response = await t.request('POST', `${c.base}/checkins/${lukas!.id}/checkout`, {
        token: c.teacher.token,
        body: { securityCode: wrongCode(lukas!.securityCode) },
      });
      expect(response.status).toBe(422);
    }
    const blocked = await t.request('POST', `${c.base}/checkins/${lukas!.id}/checkout`, {
      token: c.teacher.token,
      body: { securityCode: lukas!.securityCode },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe('RATE_LIMITED');
    // Other check-ins are not affected, and a coordinator can still help.
    const [maria] = await checkIn(t, c, { children: [{ personId: c.maria.id }] });
    const fine = await t.request('POST', `${c.base}/checkins/${maria!.id}/checkout`, {
      token: c.teacher.token,
      body: { securityCode: maria!.securityCode },
    });
    expect(fine.status).toBe(200);
    const helped = await t.request('POST', `${c.base}/checkins/${lukas!.id}/override`, {
      token: c.coordinator.token,
      body: { reason: 'Kode salah berkali-kali, dicek dengan KTP' },
    });
    expect(helped.status).toBe(200);
  });

  it('uses the limiter registered for check-out', async () => {
    const strict = createTestApp(
      {},
      {
        limiters: {
          login: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
          register: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
          invitation: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
          'checkin.checkout': createRateLimiter({ windowMs: 60_000, max: 1 }),
        },
      },
    );
    try {
      const c2 = await seedCheckin(strict);
      const [child] = await checkIn(strict, c2, { children: [{ personId: c2.lukas.id }] });
      const first = await strict.request('POST', `${c2.base}/checkins/${child!.id}/checkout`, {
        token: c2.teacher.token,
        body: { securityCode: wrongCode(child!.securityCode) },
      });
      expect(first.status).toBe(422);
      const second = await strict.request('POST', `${c2.base}/checkins/${child!.id}/checkout`, {
        token: c2.teacher.token,
        body: { securityCode: child!.securityCode },
      });
      expect(second.status).toBe(429);
    } finally {
      strict.close();
    }
  });
});
