import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { attendanceRecords, attendanceSessions, worshipServices } from '../src/db/schema';
import { createRateLimiter } from '../src/lib/rate-limit';
import { nowIso } from '../src/lib/time';
import { newId } from '../src/lib/tokens';
import { checkIn, seedCheckin, type CheckinSeed } from './checkin-fixtures';
import { createTestApp, permissiveLimiters } from './helpers';

const dayOffset = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

describe('kids check-in hardening', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CheckinSeed;

  beforeAll(async () => {
    c = await seedCheckin(t);
  });

  const openSession = async (date: string, name = 'Ibadah Lain Hari') => {
    const response = await t.request('POST', `${c.base}/sessions`, {
      token: c.coordinator.token,
      body: { name, date },
    });
    expect(response.status).toBe(201);
    return response.json.session as { id: string };
  };

  describe('pick-up', () => {
    it('only takes a typed name for a child with nobody on record', async () => {
      const driver = await t.request('POST', `${c.base}/children/${c.maria.id}/pickups`, {
        token: c.guardian.token,
        body: { name: 'Pak Ujang', relationship: 'Sopir' },
      });
      expect(driver.status).toBe(201);
      const [maria] = await checkIn(t, c, { children: [{ personId: c.maria.id }] });
      const typed = await t.request('POST', `${c.base}/checkins/${maria!.id}/checkout`, {
        token: c.teacher.token,
        body: { securityCode: maria!.securityCode, pickupName: 'Orang Asing' },
      });
      expect(typed.status).toBe(403);
      // Another child's list entry does not count.
      const lukasDriver = await t.request('POST', `${c.base}/children/${c.lukas.id}/pickups`, {
        token: c.coordinator.token,
        body: { name: 'Bang Togar' },
      });
      expect(lukasDriver.status).toBe(201);
      const foreign = await t.request('POST', `${c.base}/checkins/${maria!.id}/checkout`, {
        token: c.teacher.token,
        body: { securityCode: maria!.securityCode, pickupId: lukasDriver.json.pickup.id },
      });
      expect(foreign.status).toBe(404);
      const listed = await t.request('POST', `${c.base}/checkins/${maria!.id}/checkout`, {
        token: c.teacher.token,
        body: { securityCode: maria!.securityCode, pickupId: driver.json.pickup.id },
      });
      expect(listed.status).toBe(200);
      expect(listed.json.checkin.pickupName).toBe('Pak Ujang');
    });

    it('accepts a typed name for a first-time child and on an override', async () => {
      const registered = await t.request('POST', `${c.base}/children`, {
        token: c.teacher.token,
        body: { firstName: 'Tamu', lastName: 'Pertama' },
      });
      expect(registered.status).toBe(201);
      const [guest] = await checkIn(t, c, {
        children: [{ personId: registered.json.child.id, classId: c.classId('Kelas Kecil') }],
      });
      const typed = await t.request('POST', `${c.base}/checkins/${guest!.id}/checkout`, {
        token: c.teacher.token,
        body: { securityCode: guest!.securityCode, pickupName: 'Ibu Tamu' },
      });
      expect(typed.status).toBe(200);
      expect(typed.json.checkin.pickupName).toBe('Ibu Tamu');

      const [lukas] = await checkIn(t, c, { children: [{ personId: c.lukas.id }] });
      const override = await t.request('POST', `${c.base}/checkins/${lukas!.id}/override`, {
        token: c.coordinator.token,
        body: { reason: 'Tag hilang, dicek KTP', pickupName: 'Om Lukas' },
      });
      expect(override.status).toBe(200);
      expect(override.json.checkin.pickupName).toBe('Om Lukas');
    });

    it("does not copy a chosen person's phone into the pick-up list", async () => {
      const added = await t.request('POST', `${c.base}/children/${c.yosua.id}/pickups`, {
        token: c.guardian.token,
        body: { pickupPersonId: c.hutapea.id },
      });
      expect(added.status).toBe(201);
      expect(added.json.pickup.name).toBe('Rina Hutapea');
      expect(added.json.pickup.phone).toBeNull();
    });

    it('limits how many codes one volunteer tries across check-ins', async () => {
      const strict = createTestApp(
        {},
        {
          limiters: {
            ...permissiveLimiters(),
            'checkin.checkout.user': createRateLimiter({ windowMs: 60_000, max: 2 }),
          },
        },
      );
      try {
        const c2 = await seedCheckin(strict);
        const items = await checkIn(strict, c2, {
          children: [
            { personId: c2.lukas.id },
            { personId: c2.yosua.id },
            { personId: c2.maria.id },
          ],
        });
        const wrong = (code: string) => (code === 'AAAA' ? 'BBBB' : 'AAAA');
        for (const item of items.slice(0, 2)) {
          const response = await strict.request('POST', `${c2.base}/checkins/${item.id}/checkout`, {
            token: c2.teacher.token,
            body: { securityCode: wrong(item.securityCode) },
          });
          expect(response.status).toBe(422);
        }
        const third = items[2]!;
        const blocked = await strict.request('POST', `${c2.base}/checkins/${third.id}/checkout`, {
          token: c2.teacher.token,
          body: { securityCode: third.securityCode },
        });
        expect(blocked.status).toBe(429);
        // Another volunteer is not affected.
        const other = await strict.request('POST', `${c2.base}/checkins/${third.id}/checkout`, {
          token: c2.coordinator.token,
          body: { securityCode: third.securityCode },
        });
        expect(other.status).toBe(200);
      } finally {
        strict.close();
      }
    });
  });

  describe('self check-in window', () => {
    it('offers and accepts only the sessions of today and yesterday', async () => {
      const future = await openSession(dayOffset(7), 'Minggu Depan');
      const old = await openSession(dayOffset(-14), 'Dua Minggu Lalu');
      const me = await t.request('GET', `${c.base}/me`, { token: c.guardian.token });
      const offered = (me.json.openSessions as { id: string }[]).map((session) => session.id);
      expect(offered).toContain(c.session.id);
      expect(offered).not.toContain(future.id);
      expect(offered).not.toContain(old.id);
      for (const session of [future, old]) {
        const response = await t.request('POST', `${c.base}/sessions/${session.id}/checkins`, {
          token: c.guardian.token,
          body: { children: [{ personId: c.yosua.id }], method: 'self' },
        });
        expect(response.status).toBe(409);
      }
      // Volunteers may still record a check-in on another day.
      const staff = await t.request('POST', `${c.base}/sessions/${old.id}/checkins`, {
        token: c.teacher.token,
        body: { children: [{ personId: c.lukas.id }] },
      });
      expect(staff.status).toBe(201);
    });
  });

  describe('children', () => {
    it('keeps adult directory records out of the child pages', async () => {
      for (const person of [c.sari, c.adultChild, c.opung]) {
        const response = await t.request('GET', `${c.base}/children/${person.id}`, {
          token: c.teacher.token,
        });
        expect(response.status).toBe(404);
        const alert = await t.request('POST', `${c.base}/children/${person.id}/alerts`, {
          token: c.coordinator.token,
          body: { kind: 'medical', description: 'Bukan anak' },
        });
        expect(alert.status).toBe(404);
      }
      const child = await t.request('GET', `${c.base}/children/${c.lukas.id}`, {
        token: c.teacher.token,
      });
      expect(child.status).toBe(200);
      const own = await t.request('GET', `${c.base}/children/${c.maria.id}`, {
        token: c.guardian.token,
      });
      expect(own.status).toBe(200);
    });
  });

  describe('attendance feed', () => {
    it('dates a late-recorded session on its own day and takes back removed check-ins', async () => {
      const date = dayOffset(-3);
      const session = await openSession(date, 'Rabu Lalu');
      const items = await checkIn(
        t,
        c,
        { children: [{ personId: c.yosua.id }, { personId: c.maria.id }] },
        c.teacher.token,
        `${c.base}/sessions/${session.id}`,
      );
      const closed = await t.request('POST', `${c.base}/sessions/${session.id}/close`, {
        token: c.coordinator.token,
      });
      expect(closed.status).toBe(200);
      const attendanceId = closed.json.session.attendanceSessionId as string;
      const attendance = t.db
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, attendanceId))
        .get()!;
      expect(attendance.headcountChildren).toBe(2);
      // 09:00 in Jakarta is 02:00 UTC on the same day.
      expect(attendance.sessionAt.slice(0, 10)).toBe(date);

      const removed = await t.request('DELETE', `${c.base}/checkins/${items[1]!.id}`, {
        token: c.coordinator.token,
      });
      expect(removed.status).toBe(200);
      const records = t.db
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.sessionId, attendanceId))
        .all();
      expect(records.map((record) => record.personId)).toEqual([c.yosua.id]);
      expect(
        t.db.select().from(attendanceSessions).where(eq(attendanceSessions.id, attendanceId)).get()!
          .headcountChildren,
      ).toBe(1);
    });
  });

  describe('worship services', () => {
    it('offers the services of the day and links a session to one', async () => {
      const date = dayOffset(1);
      const insertService = (churchId: string, title: string, startsAt: string) => {
        const id = newId();
        const now = nowIso();
        t.db
          .insert(worshipServices)
          .values({ id, churchId, title, startsAt, createdAt: now, updatedAt: now })
          .run();
        return id;
      };
      const morning = insertService(c.s.church.id, 'Ibadah Umum I', `${date}T00:30:00.000Z`);
      insertService(c.s.church.id, 'Ibadah Kemarin', `${dayOffset(-5)}T00:30:00.000Z`);
      const foreign = insertService(
        c.otherChurch.id,
        'Ibadah Gereja Lain',
        `${date}T01:00:00.000Z`,
      );

      const enabled = await t.request('PATCH', `/api/churches/${c.s.church.id}/modules`, {
        token: c.s.owner.token,
        body: { modules: { worship: true } },
      });
      expect(enabled.status).toBe(200);
      const listed = await t.request('GET', `${c.base}/sessions/services?date=${date}`, {
        token: c.coordinator.token,
      });
      expect(listed.status).toBe(200);
      expect(listed.json.items.map((item: { id: string }) => item.id)).toEqual([morning]);
      const teacher = await t.request('GET', `${c.base}/sessions/services?date=${date}`, {
        token: c.teacher.token,
      });
      expect(teacher.status).toBe(403);

      const crossChurch = await t.request('POST', `${c.base}/sessions`, {
        token: c.coordinator.token,
        body: { name: 'Sekolah Minggu', date, worshipServiceId: foreign },
      });
      expect(crossChurch.status).toBe(404);
      const linked = await t.request('POST', `${c.base}/sessions`, {
        token: c.coordinator.token,
        body: { name: 'Sekolah Minggu', date, worshipServiceId: morning },
      });
      expect(linked.status).toBe(201);
      expect(linked.json.session.serviceTitle).toBe('Ibadah Umum I');

      const off = await t.request('PATCH', `/api/churches/${c.s.church.id}/modules`, {
        token: c.s.owner.token,
        body: { modules: { worship: false } },
      });
      expect(off.status).toBe(200);
      const none = await t.request('GET', `${c.base}/sessions/services?date=${date}`, {
        token: c.coordinator.token,
      });
      expect(none.json.items).toEqual([]);
    });
  });
});
