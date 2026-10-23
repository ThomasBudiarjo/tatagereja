import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  commsAudit,
  dayOf,
  inDays,
  inMinutes,
  notificationsOf,
  seedComms,
  type CommsSeed,
} from './comms-fixtures';
import { createTestApp } from './helpers';

type EventItem = { id: string; title: string; startsAt: string; isSeriesException: boolean };

describe('comms events: series, registration, waitlist and check-in', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CommsSeed;
  let url: string;

  beforeAll(async () => {
    c = await seedComms(t);
    url = `${c.church}/events`;
  });

  const seriesEvents = async (seriesId: string) =>
    (
      (await t.request('GET', `${url}?scope=all&limit=200`, { token: c.s.owner.token })).json
        .items as (EventItem & { seriesId: string | null })[]
    )
      .filter((item) => item.seriesId === seriesId)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  describe('recurring series', () => {
    let seriesId = '';

    it('creates weekly occurrences at the same time', async () => {
      const startsAt = inDays(2, 11);
      const created = await t.request('POST', `${url}/series`, {
        token: c.coordinator.token,
        body: {
          title: 'Persekutuan Doa Rabu',
          location: 'Ruang Serbaguna',
          startsAt,
          durationMinutes: 90,
          frequency: 'weekly',
          untilDate: dayOf(inDays(23, 11)),
        },
      });
      expect(created.status).toBe(201);
      expect(created.json.series.occurrenceCount).toBe(4);
      expect(created.json.event.series).toEqual({
        frequency: 'weekly',
        untilDate: dayOf(inDays(23, 11)),
      });
      seriesId = created.json.series.id;
      const items = await seriesEvents(seriesId);
      expect(items.map((item) => item.startsAt)).toEqual([
        startsAt,
        inDays(9, 11),
        inDays(16, 11),
        inDays(23, 11),
      ]);
      const audit = await commsAudit(t, c, 'event_series.create');
      expect(audit.some((entry) => entry.entityId === seriesId)).toBe(true);
    });

    it('skips months without the day for monthly series', async () => {
      const created = await t.request('POST', `${url}/series`, {
        token: c.s.admin.token,
        body: {
          title: 'Rapat Majelis Bulanan',
          startsAt: '2027-01-31T12:00:00.000Z',
          frequency: 'monthly',
          untilDate: '2027-07-31',
        },
      });
      expect(created.status).toBe(201);
      const items = await seriesEvents(created.json.series.id);
      expect(items.map((item) => item.startsAt.slice(0, 10))).toEqual([
        '2027-01-31',
        '2027-03-31',
        '2027-05-31',
        '2027-07-31',
      ]);
    });

    it('validates series', async () => {
      const before = await t.request('POST', `${url}/series`, {
        token: c.s.admin.token,
        body: {
          title: 'Mundur',
          startsAt: inDays(5),
          frequency: 'weekly',
          untilDate: dayOf(inDays(1)),
        },
      });
      expect(before.status).toBe(422);
      expect(before.json.error.issues[0].path).toBe('untilDate');
      const tooLong = await t.request('POST', `${url}/series`, {
        token: c.s.admin.token,
        body: {
          title: 'Terlalu lama',
          startsAt: inDays(1),
          frequency: 'weekly',
          untilDate: dayOf(inDays(800)),
        },
      });
      expect(tooLong.status).toBe(422);
      const member = await t.request('POST', `${url}/series`, {
        token: c.s.member.token,
        body: {
          title: 'Tidak boleh',
          startsAt: inDays(1),
          frequency: 'weekly',
          untilDate: dayOf(inDays(10)),
        },
      });
      expect(member.status).toBe(403);
      const plain = await t.request('POST', `${url}/series`, {
        token: c.plain.token,
        body: {
          title: 'Tidak boleh',
          startsAt: inDays(1),
          frequency: 'weekly',
          untilDate: dayOf(inDays(10)),
        },
      });
      expect(plain.status).toBe(403);
    });

    it('edits one occurrence or every later one', async () => {
      const [first, second, third, fourth] = await seriesEvents(seriesId);
      if (!first || !second || !third || !fourth) throw new Error('missing occurrences');
      const one = await t.request('PATCH', `${url}/${fourth.id}?scope=this`, {
        token: c.coordinator.token,
        body: {
          title: 'Persekutuan Doa Rabu (Khusus)',
          location: 'Gedung Utama',
          startsAt: fourth.startsAt,
        },
      });
      expect(one.status).toBe(200);
      expect(one.json.event.isSeriesException).toBe(true);

      const shifted = new Date(new Date(second.startsAt).getTime() + 3_600_000).toISOString();
      const future = await t.request('PATCH', `${url}/${second.id}?scope=future`, {
        token: c.coordinator.token,
        body: {
          title: 'Persekutuan Doa',
          location: 'Ruang Serbaguna',
          startsAt: shifted,
          endsAt: new Date(new Date(shifted).getTime() + 90 * 60_000).toISOString(),
        },
      });
      expect(future.status).toBe(200);
      const after = await seriesEvents(seriesId);
      expect(after.map((item) => item.title)).toEqual([
        'Persekutuan Doa Rabu',
        'Persekutuan Doa',
        'Persekutuan Doa',
        'Persekutuan Doa Rabu (Khusus)',
      ]);
      expect(after[0]?.startsAt).toBe(first.startsAt);
      expect(after[2]?.startsAt).toBe(
        new Date(new Date(third.startsAt).getTime() + 3_600_000).toISOString(),
      );
      // The separately edited occurrence keeps its own time.
      expect(after[3]?.startsAt).toBe(fourth.startsAt);
    });

    it('deletes every later occurrence and ends the series', async () => {
      const items = await seriesEvents(seriesId);
      const third = items[2];
      if (!third) throw new Error('missing occurrence');
      const deleted = await t.request('DELETE', `${url}/${third.id}?scope=future`, {
        token: c.coordinator.token,
      });
      expect(deleted.status).toBe(200);
      expect(deleted.json.deleted).toBe(2);
      const left = await seriesEvents(seriesId);
      expect(left).toHaveLength(2);
      const detail = await t.request('GET', `${url}/${left[0]?.id}`, { token: c.s.member.token });
      expect(detail.json.event.series.untilDate < dayOf(third.startsAt)).toBe(true);
    });

    it('notifies the group of a leader’s new group event', async () => {
      const created = await t.request('POST', `${url}/series`, {
        token: c.s.leader.token,
        body: {
          title: 'Latihan Band Pemuda',
          groupId: c.s.group.id,
          startsAt: inDays(4, 10),
          frequency: 'biweekly',
          untilDate: dayOf(inDays(40)),
        },
      });
      expect(created.status).toBe(201);
      expect(created.json.series.occurrenceCount).toBe(3);
      const outside = await t.request('POST', `${url}/series`, {
        token: c.s.leader.token,
        body: {
          title: 'Bukan kelompoknya',
          groupId: c.s.otherGroup.id,
          startsAt: inDays(4, 10),
          frequency: 'weekly',
          untilDate: dayOf(inDays(20)),
        },
      });
      expect(outside.status).toBe(403);
    });
  });

  describe('registration and waitlist', () => {
    let eventId = '';

    it('registers people while places last, then puts them on the waitlist', async () => {
      const created = await t.request('POST', url, {
        token: c.coordinator.token,
        body: {
          title: 'Retret Keluarga',
          startsAt: inDays(10, 2),
          endsAt: inDays(11, 9),
          location: 'Wisma Kinasih',
          capacity: 3,
          registrationRequired: true,
          waitlistEnabled: true,
        },
      });
      expect(created.status).toBe(201);
      eventId = created.json.event.id;
      expect(created.json.event.placesLeft).toBe(3);

      const member = await t.request('POST', `${url}/${eventId}/registrations`, {
        token: c.s.member.token,
        body: { partySize: 2, note: 'Suami dan istri' },
      });
      expect(member.status).toBe(201);
      expect(member.json.registration.status).toBe('registered');
      expect(member.json.event.myRegistration.status).toBe('registered');
      expect(member.json.event.placesLeft).toBe(1);

      const plain = await t.request('POST', `${url}/${eventId}/registrations`, {
        token: c.plain.token,
        body: { partySize: 2 },
      });
      expect(plain.status).toBe(201);
      expect(plain.json.registration.status).toBe('waitlisted');
      expect(plain.json.registration.waitlistPosition).toBe(1);

      // One place is left, but someone is waiting: nobody jumps the queue.
      const leader = await t.request('POST', `${url}/${eventId}/registrations`, {
        token: c.s.leader.token,
        body: {},
      });
      expect(leader.status).toBe(201);
      expect(leader.json.registration.status).toBe('waitlisted');
      expect(leader.json.registration.waitlistPosition).toBe(2);

      const again = await t.request('POST', `${url}/${eventId}/registrations`, {
        token: c.s.member.token,
        body: {},
      });
      expect(again.status).toBe(409);

      const waitNote = await notificationsOf(t, c.plain.token, c.s.church.id, 'event.registration');
      expect(waitNote).toHaveLength(0); // they registered themselves: no notice to the actor
    });

    it('shows registrations to organisers only', async () => {
      expect(
        (await t.request('GET', `${url}/${eventId}/registrations`, { token: c.s.member.token }))
          .status,
      ).toBe(403);
      const list = await t.request('GET', `${url}/${eventId}/registrations`, {
        token: c.coordinator.token,
      });
      expect(list.status).toBe(200);
      expect(list.json.registeredCount).toBe(2);
      expect(list.json.waitlistCount).toBe(2);
      expect(list.json.items.map((item: { status: string }) => item.status)).toEqual([
        'registered',
        'waitlisted',
        'waitlisted',
      ]);
    });

    it('promotes the waitlist when someone cancels and tells them', async () => {
      const mine = await t.request('GET', `${url}/${eventId}`, { token: c.s.member.token });
      const registrationId = mine.json.event.myRegistration.id as string;
      const others = await t.request(
        'POST',
        `${url}/${eventId}/registrations/${registrationId}/cancel`,
        { token: c.plain.token },
      );
      expect(others.status).toBe(403);
      const cancelled = await t.request(
        'POST',
        `${url}/${eventId}/registrations/${registrationId}/cancel`,
        { token: c.s.member.token },
      );
      expect(cancelled.status).toBe(200);
      expect(cancelled.json.registration.status).toBe('cancelled');

      const plain = await t.request('GET', `${url}/${eventId}`, { token: c.plain.token });
      expect(plain.json.event.myRegistration.status).toBe('registered');
      const leader = await t.request('GET', `${url}/${eventId}`, { token: c.s.leader.token });
      expect(leader.json.event.myRegistration.status).toBe('registered');
      expect(leader.json.event.placesLeft).toBe(0);

      const promoted = await notificationsOf(t, c.plain.token, c.s.church.id, 'event.registration');
      expect(promoted).toHaveLength(1);
      expect(promoted[0]?.body).toContain('daftar tunggu');
      expect(promoted[0]?.link).toBe(`/c/${c.s.church.id}/events/${eventId}`);

      const twice = await t.request(
        'POST',
        `${url}/${eventId}/registrations/${registrationId}/cancel`,
        { token: c.s.member.token },
      );
      expect(twice.status).toBe(409);
    });

    it('refuses a full event without a waitlist, closed and non-registration events', async () => {
      const full = await t.request('POST', url, {
        token: c.s.admin.token,
        body: {
          title: 'Kelas Katekisasi',
          startsAt: inDays(6),
          capacity: 1,
          registrationRequired: true,
          waitlistEnabled: false,
        },
      });
      const fullId = full.json.event.id as string;
      expect(
        (
          await t.request('POST', `${url}/${fullId}/registrations`, {
            token: c.s.member.token,
            body: {},
          })
        ).status,
      ).toBe(201);
      const refused = await t.request('POST', `${url}/${fullId}/registrations`, {
        token: c.plain.token,
        body: {},
      });
      expect(refused.status).toBe(409);
      expect(refused.json.error.message).toBe('This event is full');

      const closed = await t.request('POST', url, {
        token: c.s.admin.token,
        body: {
          title: 'Pendaftaran tutup',
          startsAt: inDays(6),
          registrationRequired: true,
          registrationClosesAt: inMinutes(-10),
        },
      });
      expect(
        (
          await t.request('POST', `${url}/${closed.json.event.id}/registrations`, {
            token: c.plain.token,
            body: {},
          })
        ).status,
      ).toBe(409);

      const open = await t.request('POST', url, {
        token: c.s.admin.token,
        body: { title: 'Tanpa pendaftaran', startsAt: inDays(6) },
      });
      expect(
        (
          await t.request('POST', `${url}/${open.json.event.id}/registrations`, {
            token: c.plain.token,
            body: {},
          })
        ).status,
      ).toBe(409);

      const bad = await t.request('POST', `${url}/${fullId}/registrations`, {
        token: c.plain.token,
        body: { partySize: 0 },
      });
      expect(bad.status).toBe(422);
      const badCapacity = await t.request('POST', url, {
        token: c.s.admin.token,
        body: { title: 'Kapasitas nol', startsAt: inDays(6), capacity: 0 },
      });
      expect(badCapacity.status).toBe(422);
    });

    it('registers household members, and managers register anyone', async () => {
      const event = await t.request('POST', url, {
        token: c.s.admin.token,
        body: { title: 'Sekolah Minggu Liburan', startsAt: inDays(8), registrationRequired: true },
      });
      const id = event.json.event.id as string;
      const notFamily = await t.request('POST', `${url}/${id}/registrations`, {
        token: c.s.member.token,
        body: { personId: c.s.alice.id },
      });
      expect(notFamily.status).toBe(403);
      const household = await t.request('POST', `${c.church}/households`, {
        token: c.s.owner.token,
        body: {
          name: 'Keluarga Ber',
          members: [
            { personId: c.s.memberPerson.id, relationship: 'head' },
            { personId: c.s.alice.id, relationship: 'child' },
          ],
        },
      });
      expect(household.status).toBe(201);
      const family = await t.request('POST', `${url}/${id}/registrations`, {
        token: c.s.member.token,
        body: { personId: c.s.alice.id },
      });
      expect(family.status).toBe(201);
      const detail = await t.request('GET', `${url}/${id}`, { token: c.s.member.token });
      expect(detail.json.registrablePeople.map((p: { id: string }) => p.id)).toEqual([
        c.s.memberPerson.id,
        c.s.alice.id,
      ]);
      expect(detail.json.householdRegistrations).toHaveLength(1);
      const byManager = await t.request('POST', `${url}/${id}/registrations`, {
        token: c.s.admin.token,
        body: { personId: c.s.bob.id },
      });
      expect(byManager.status).toBe(201);
    });

    it('promotes the waitlist when the capacity grows', async () => {
      const event = await t.request('POST', url, {
        token: c.coordinator.token,
        body: {
          title: 'Bakti Sosial',
          startsAt: inDays(12),
          capacity: 1,
          registrationRequired: true,
        },
      });
      const id = event.json.event.id as string;
      await t.request('POST', `${url}/${id}/registrations`, { token: c.s.member.token, body: {} });
      const waiting = await t.request('POST', `${url}/${id}/registrations`, {
        token: c.plain.token,
        body: {},
      });
      expect(waiting.json.registration.status).toBe('waitlisted');
      const grown = await t.request('PATCH', `${url}/${id}`, {
        token: c.coordinator.token,
        body: {
          title: 'Bakti Sosial',
          startsAt: event.json.event.startsAt,
          capacity: 5,
          registrationRequired: true,
        },
      });
      expect(grown.status).toBe(200);
      expect(grown.json.event.waitlistCount).toBe(0);
      expect(grown.json.event.registeredCount).toBe(2);
    });

    it('notifies organisers of registrations once they opt in', async () => {
      const prefs = await t.request('PUT', '/api/notifications/preferences', {
        token: c.coordinator.token,
        body: { items: [{ type: 'event.registrations', inApp: true, email: false }] },
      });
      expect(prefs.status).toBe(200);
      const event = await t.request('POST', url, {
        token: c.coordinator.token,
        body: { title: 'Seminar Pernikahan', startsAt: inDays(15), registrationRequired: true },
      });
      await t.request('POST', `${url}/${event.json.event.id}/registrations`, {
        token: c.plain.token,
        body: { partySize: 2 },
      });
      const notes = await notificationsOf(
        t,
        c.coordinator.token,
        c.s.church.id,
        'event.registrations',
      );
      expect(
        notes.some((note) => note.title === 'Seminar Pernikahan' && note.body?.includes('Ruth')),
      ).toBe(true);
    });

    it('lists the events I signed up for', async () => {
      const mine = await t.request('GET', `${url}?mine=true`, { token: c.plain.token });
      expect(mine.status).toBe(200);
      expect(mine.json.items.map((item: { title: string }) => item.title)).toEqual(
        expect.arrayContaining(['Retret Keluarga', 'Bakti Sosial', 'Seminar Pernikahan']),
      );
      expect(
        mine.json.items.every((item: { myRegistration: unknown }) => item.myRegistration !== null),
      ).toBe(true);
    });
  });

  describe('check-in', () => {
    let eventId = '';

    it('lets organisers check people in, which records attendance', async () => {
      const event = await t.request('POST', url, {
        token: c.coordinator.token,
        body: { title: 'Ibadah Pemuda', startsAt: inMinutes(30), checkInEnabled: true },
      });
      eventId = event.json.event.id;
      await t.request('PATCH', `${url}/${eventId}/participants/${c.s.memberPerson.id}`, {
        token: c.s.member.token,
        body: { status: 'going' },
      });
      const denied = await t.request('POST', `${url}/${eventId}/check-in`, {
        token: c.s.member.token,
        body: { personIds: [c.s.bob.id] },
      });
      expect(denied.status).toBe(403);
      const checked = await t.request('POST', `${url}/${eventId}/check-in`, {
        token: c.coordinator.token,
        body: { personIds: [c.s.memberPerson.id, c.s.bob.id] },
      });
      expect(checked.status).toBe(200);
      expect(checked.json.checkedIn).toBe(2);
      const session = await t.request(
        'GET',
        `${c.church}/attendance/sessions/${checked.json.sessionId}`,
        {
          token: c.s.owner.token,
        },
      );
      expect(session.status).toBe(200);
      expect(session.json.session.presentCount).toBe(2);
      expect(session.json.session.eventId).toBe(eventId);

      const list = await t.request('GET', `${url}/${eventId}/check-in`, {
        token: c.coordinator.token,
      });
      expect(list.status).toBe(200);
      expect(list.json.checkedInCount).toBe(2);
      const sources = Object.fromEntries(
        list.json.items.map((item: { person: { id: string }; source: string }) => [
          item.person.id,
          item.source,
        ]),
      );
      expect(sources[c.s.memberPerson.id]).toBe('rsvp');
      expect(sources[c.s.bob.id]).toBe('walk_in');

      const undo = await t.request('DELETE', `${url}/${eventId}/check-in/${c.s.bob.id}`, {
        token: c.coordinator.token,
      });
      expect(undo.status).toBe(200);
      const afterUndo = await t.request('GET', `${url}/${eventId}/check-in`, {
        token: c.coordinator.token,
      });
      expect(afterUndo.json.checkedInCount).toBe(1);
      const foreignPerson = await t.createPerson(c.other.token, c.otherChurch.id, {
        firstName: 'Asing',
      });
      expect(
        (
          await t.request('POST', `${url}/${eventId}/check-in`, {
            token: c.coordinator.token,
            body: { personIds: [foreignPerson.id] },
          })
        ).status,
      ).toBe(404);
    });

    it('lets members check themselves in while check-in is open', async () => {
      const self = await t.request('POST', `${url}/${eventId}/check-in/me`, {
        token: c.plain.token,
        body: { personIds: [c.plainPerson.id] },
      });
      expect(self.status).toBe(200);
      const someoneElse = await t.request('POST', `${url}/${eventId}/check-in/me`, {
        token: c.plain.token,
        body: { personIds: [c.s.bob.id] },
      });
      expect(someoneElse.status).toBe(403);

      const later = await t.request('POST', url, {
        token: c.coordinator.token,
        body: { title: 'Belum mulai', startsAt: inDays(3), checkInEnabled: true },
      });
      expect(
        (
          await t.request('POST', `${url}/${later.json.event.id}/check-in/me`, {
            token: c.plain.token,
            body: { personIds: [c.plainPerson.id] },
          })
        ).status,
      ).toBe(409);

      const registrationOnly = await t.request('POST', url, {
        token: c.coordinator.token,
        body: {
          title: 'Khusus pendaftar',
          startsAt: inMinutes(20),
          checkInEnabled: true,
          registrationRequired: true,
        },
      });
      expect(
        (
          await t.request('POST', `${url}/${registrationOnly.json.event.id}/check-in/me`, {
            token: c.plain.token,
            body: { personIds: [c.plainPerson.id] },
          })
        ).status,
      ).toBe(409);
    });
  });

  describe('changes and cancellation', () => {
    it('tells registered people and RSVPs when an event moves or is cancelled', async () => {
      const event = await t.request('POST', url, {
        token: c.coordinator.token,
        body: { title: 'Kebaktian Padang', startsAt: inDays(20, 1), registrationRequired: true },
      });
      const id = event.json.event.id as string;
      await t.request('POST', `${url}/${id}/registrations`, { token: c.plain.token, body: {} });
      await t.request('PATCH', `${url}/${id}/participants/${c.s.memberPerson.id}`, {
        token: c.s.member.token,
        body: { status: 'going' },
      });
      const moved = await t.request('PATCH', `${url}/${id}`, {
        token: c.coordinator.token,
        body: { title: 'Kebaktian Padang', startsAt: inDays(21, 1), registrationRequired: true },
      });
      expect(moved.status).toBe(200);
      const changed = await notificationsOf(t, c.plain.token, c.s.church.id, 'event.changed');
      expect(
        changed.some(
          (note) => note.title === 'Kebaktian Padang' && note.body?.startsWith('Jadwal berubah'),
        ),
      ).toBe(true);

      expect(
        (await t.request('POST', `${url}/${id}/cancel`, { token: c.s.member.token, body: {} }))
          .status,
      ).toBe(403);
      const cancelled = await t.request('POST', `${url}/${id}/cancel`, {
        token: c.coordinator.token,
        body: { reason: 'Cuaca buruk' },
      });
      expect(cancelled.status).toBe(200);
      expect(cancelled.json.event.cancelledAt).toBeString();
      const memberNotes = await notificationsOf(
        t,
        c.s.member.token,
        c.s.church.id,
        'event.changed',
      );
      expect(memberNotes.some((note) => note.body?.includes('Cuaca buruk'))).toBe(true);
      expect(
        (await t.request('POST', `${url}/${id}/cancel`, { token: c.coordinator.token, body: {} }))
          .status,
      ).toBe(409);
      expect(
        (
          await t.request('POST', `${url}/${id}/registrations`, {
            token: c.s.leader.token,
            body: {},
          })
        ).status,
      ).toBe(409);
      const restored = await t.request('POST', `${url}/${id}/restore`, {
        token: c.coordinator.token,
      });
      expect(restored.status).toBe(200);
      expect(restored.json.event.cancelledAt).toBeNull();
      expect((await commsAudit(t, c, 'event.cancel')).some((entry) => entry.entityId === id)).toBe(
        true,
      );
    });
  });

  it('refuses ids from another church', async () => {
    const foreign = await t.request('POST', `/api/churches/${c.otherChurch.id}/events`, {
      token: c.other.token,
      body: {
        title: 'Acara lain',
        startsAt: inMinutes(10),
        registrationRequired: true,
        checkInEnabled: true,
      },
    });
    expect(foreign.status).toBe(201);
    const id = foreign.json.event.id as string;
    for (const [method, path, body] of [
      ['GET', `${url}/${id}`, undefined],
      ['PATCH', `${url}/${id}`, { title: 'Ubah', startsAt: inDays(1) }],
      ['DELETE', `${url}/${id}`, undefined],
      ['POST', `${url}/${id}/cancel`, {}],
      ['GET', `${url}/${id}/registrations`, undefined],
      ['POST', `${url}/${id}/registrations`, {}],
      ['GET', `${url}/${id}/check-in`, undefined],
      ['POST', `${url}/${id}/check-in`, { personIds: [c.s.bob.id] }],
    ] as const) {
      const response = await t.request(method, path, { token: c.s.owner.token, body });
      expect(`${method} ${path} ${response.status}`).toBe(`${method} ${path} 404`);
    }
    const registration = await t.request(
      'POST',
      `/api/churches/${c.otherChurch.id}/events/${id}/registrations`,
      {
        token: c.other.token,
        body: {},
      },
    );
    // The other owner has no person yet, so they register nobody.
    expect(registration.status).toBe(400);
  });
});
