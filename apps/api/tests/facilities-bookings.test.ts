import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { facilityBookings } from '../src/db/schema';
import {
  addHours,
  createResource,
  dayOf,
  inDays,
  seedFacilities,
  type FacilitiesSeed,
} from './facilities-fixtures';
import { createTestApp, seedChurch } from './helpers';

describe('facilities: resources and bookings', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let f: FacilitiesSeed;

  const auditActions = async (query = '') => {
    const response = await t.request(
      'GET',
      `/api/churches/${f.s.church.id}/audit-logs?module=facilities${query}`,
      { token: f.s.owner.token },
    );
    expect(response.status).toBe(200);
    return response.json.items as { action: string; entityId: string; summary: string }[];
  };

  const inbox = async (token: string) => {
    const response = await t.request('GET', '/api/notifications', { token });
    expect(response.status).toBe(200);
    return response.json.items as { type: string; title: string; link: string | null }[];
  };

  const book = (token: string, body: Record<string, unknown>) =>
    t.request('POST', `${f.base}/bookings`, {
      token,
      body: { title: 'Latihan Paduan Suara', ...body },
    });

  beforeAll(async () => {
    f = await seedFacilities(t);
  });

  describe('resources', () => {
    it('lets managers create, update and delete resources, with audit entries', async () => {
      const created = await t.request('POST', `${f.base}/resources`, {
        token: f.manager.token,
        body: {
          name: 'Aula Serbaguna',
          kind: 'hall',
          capacity: 200,
          features: ['Proyektor', 'Sound system', 'Proyektor'],
          location: 'Gedung B lantai 2',
          color: '#2563eb',
          photoUrl: 'https://example.com/aula.jpg',
        },
      });
      expect(created.status).toBe(201);
      const resource = created.json.resource;
      expect(resource).toMatchObject({
        name: 'Aula Serbaguna',
        kind: 'hall',
        capacity: 200,
        features: ['Proyektor', 'Sound system'],
        requiresApproval: true,
        isActive: true,
        availableNow: true,
        currentBooking: null,
        nextBooking: null,
      });

      const updated = await t.request('PATCH', `${f.base}/resources/${resource.id}`, {
        token: f.manager.token,
        body: { ...resource, capacity: 180, photoUrl: null },
      });
      expect(updated.status).toBe(200);
      expect(updated.json.resource.capacity).toBe(180);

      const actions = await auditActions(`&entityId=${resource.id}`);
      expect(actions.map((item) => item.action).sort()).toEqual([
        'resource.create',
        'resource.update',
      ]);

      const removed = await t.request('DELETE', `${f.base}/resources/${resource.id}`, {
        token: f.s.admin.token,
      });
      expect(removed.status).toBe(200);
      expect(
        (await t.request('GET', `${f.base}/resources/${resource.id}`, { token: f.s.owner.token }))
          .status,
      ).toBe(404);
      expect((await auditActions(`&action=resource.delete`)).length).toBe(1);
    });

    it('enforces the permission matrix on resources', async () => {
      const body = { name: 'Ruang Kelas Sekolah Minggu', kind: 'classroom', capacity: 30 };
      for (const token of [f.s.member.token, f.s.leader.token, f.keeper.token, f.viewer.token]) {
        expect((await t.request('POST', `${f.base}/resources`, { token, body })).status).toBe(403);
      }
      const resource = await createResource(t, f, body);
      for (const token of [f.s.member.token, f.keeper.token]) {
        expect(
          (
            await t.request('PATCH', `${f.base}/resources/${resource.id}`, {
              token,
              body: { ...body, capacity: 1 },
            })
          ).status,
        ).toBe(403);
        expect(
          (await t.request('DELETE', `${f.base}/resources/${resource.id}`, { token })).status,
        ).toBe(403);
      }
      // Members view resources by default; inventory-only roles add nothing here but members
      // already hold `facilities.view`.
      const list = await t.request('GET', `${f.base}/resources`, { token: f.s.member.token });
      expect(list.status).toBe(200);
      expect(list.json.items.some((item: { id: string }) => item.id === resource.id)).toBe(true);
    });

    it('validates resources and refuses duplicate names', async () => {
      const invalid = await t.request('POST', `${f.base}/resources`, {
        token: f.s.owner.token,
        body: { name: 'X', kind: 'castle', capacity: 0, photoUrl: 'javascript:alert(1)' },
      });
      expect(invalid.status).toBe(422);
      const paths = invalid.json.error.issues.map((issue: { path: string }) => issue.path);
      expect(paths).toEqual(expect.arrayContaining(['name', 'kind', 'capacity', 'photoUrl']));

      await createResource(t, f, { name: 'Gereja Utama', kind: 'sanctuary' });
      const duplicate = await t.request('POST', `${f.base}/resources`, {
        token: f.s.owner.token,
        body: { name: 'gereja utama', kind: 'sanctuary' },
      });
      expect(duplicate.status).toBe(409);
    });

    it('hides inactive resources from everyone but managers', async () => {
      const resource = await createResource(t, f, {
        name: 'Mobil Gereja',
        kind: 'vehicle',
        isActive: false,
      });
      const memberList = await t.request('GET', `${f.base}/resources?includeInactive=true`, {
        token: f.s.member.token,
      });
      expect(memberList.json.items.some((item: { id: string }) => item.id === resource.id)).toBe(
        false,
      );
      const managerList = await t.request('GET', `${f.base}/resources?includeInactive=true`, {
        token: f.manager.token,
      });
      expect(managerList.json.items.some((item: { id: string }) => item.id === resource.id)).toBe(
        true,
      );
      expect(
        (await t.request('GET', `${f.base}/resources/${resource.id}`, { token: f.s.member.token }))
          .status,
      ).toBe(404);
      const booking = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(3, 9),
        endsAt: inDays(3, 11),
      });
      expect(booking.status).toBe(404);
      const managerBooking = await book(f.manager.token, {
        resourceId: resource.id,
        startsAt: inDays(3, 9),
        endsAt: inDays(3, 11),
      });
      expect(managerBooking.status).toBe(409);
    });

    it('filters resources by kind and search', async () => {
      await createResource(t, f, { name: 'Proyektor Portabel', kind: 'equipment' });
      const byKind = await t.request('GET', `${f.base}/resources?kind=equipment`, {
        token: f.s.member.token,
      });
      expect(byKind.json.items.every((item: { kind: string }) => item.kind === 'equipment')).toBe(
        true,
      );
      const bySearch = await t.request('GET', `${f.base}/resources?q=portabel`, {
        token: f.s.member.token,
      });
      expect(bySearch.json.items.map((item: { name: string }) => item.name)).toEqual([
        'Proyektor Portabel',
      ]);
    });
  });

  describe('bookings', () => {
    it('queues member requests for approval and notifies managers', async () => {
      const resource = await createResource(t, f, { name: 'Ruang Konsistori', capacity: 20 });
      const created = await book(f.s.member.token, {
        resourceId: resource.id,
        title: 'Rapat Komisi Remaja',
        purpose: 'Persiapan retret',
        startsAt: inDays(5, 10),
        endsAt: inDays(5, 12),
        expectedAttendees: 15,
        groupId: f.s.group.id,
        notes: 'Butuh papan tulis',
      });
      expect(created.status).toBe(201);
      const booking = created.json.booking;
      expect(booking).toMatchObject({
        status: 'pending',
        requestedBy: f.s.member.user.id,
        requesterName: 'Member',
        resourceName: 'Ruang Konsistori',
        groupName: 'Youth Ministry',
        notes: 'Butuh papan tulis',
        recurrence: 'none',
      });
      expect(booking.nextOccurrence.startsAt).toBe(inDays(5, 10));

      for (const token of [f.manager.token, f.s.owner.token, f.s.admin.token]) {
        const notices = await inbox(token);
        const notice = notices.find((item) => item.type === 'booking.requested');
        expect(notice?.link).toBe(`/c/${f.s.church.id}/facilities/bookings/${booking.id}`);
      }
      expect(
        (await inbox(f.s.member.token)).some((item) => item.type === 'booking.requested'),
      ).toBe(false);
      expect((await inbox(f.keeper.token)).some((item) => item.type === 'booking.requested')).toBe(
        false,
      );

      // Notes stay with the requester and managers.
      const asOther = await t.request('GET', `${f.base}/bookings/${booking.id}`, {
        token: f.s.leader.token,
      });
      expect(asOther.status).toBe(404); // pending bookings of others are not visible
      const asManager = await t.request('GET', `${f.base}/bookings/${booking.id}`, {
        token: f.manager.token,
      });
      expect(asManager.json.booking.notes).toBe('Butuh papan tulis');
    });

    it('approves bookings of managers and of resources without approval at once', async () => {
      const resource = await createResource(t, f, { name: 'Ruang Doa' });
      const managerBooking = await book(f.manager.token, {
        resourceId: resource.id,
        startsAt: inDays(6, 9),
        endsAt: inDays(6, 10),
      });
      expect(managerBooking.status).toBe(201);
      expect(managerBooking.json.booking.status).toBe('approved');

      const open = await createResource(t, f, { name: 'Ruang Baca', requiresApproval: false });
      const memberBooking = await book(f.s.member.token, {
        resourceId: open.id,
        startsAt: inDays(6, 9),
        endsAt: inDays(6, 10),
      });
      expect(memberBooking.json.booking.status).toBe('approved');
      expect(memberBooking.json.booking.deciderName).toBe('Member');
    });

    it('refuses overlapping approved bookings, including weekly repeats', async () => {
      const resource = await createResource(t, f, { name: 'Gedung Serbaguna' });
      const weekly = await book(f.manager.token, {
        resourceId: resource.id,
        title: 'Persekutuan Doa Rabu',
        startsAt: inDays(7, 11),
        endsAt: inDays(7, 13),
        recurrence: 'weekly',
        recurrenceUntil: dayOf(inDays(7 + 7 * 8, 11)),
      });
      expect(weekly.status).toBe(201);
      expect(weekly.json.booking.status).toBe('approved');

      // The fourth repeat overlaps by half an hour.
      const clash = await book(f.s.member.token, {
        resourceId: resource.id,
        title: 'Latihan Tari',
        startsAt: inDays(7 + 21, 12, 30),
        endsAt: inDays(7 + 21, 14),
      });
      expect(clash.status).toBe(409);
      expect(clash.json.error.code).toBe('SCHEDULING_CONFLICT');
      expect(clash.json.error.message).toContain('Persekutuan Doa Rabu');
      expect(clash.json.error.conflicts).toHaveLength(1);
      expect(clash.json.error.conflicts[0]).toMatchObject({
        bookingId: weekly.json.booking.id,
        startsAt: inDays(7 + 21, 11),
        requesterName: 'Sekretaris Sarana',
      });

      // Back to back is fine, and so is the week after the repeats end.
      const adjacent = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(7 + 21, 13),
        endsAt: inDays(7 + 21, 14),
      });
      expect(adjacent.status).toBe(201);
      const after = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(7 + 7 * 9, 11),
        endsAt: inDays(7 + 7 * 9, 13),
      });
      expect(after.status).toBe(201);

      // A weekly request that would hit a single approved booking later on conflicts too.
      const single = await book(f.manager.token, {
        resourceId: resource.id,
        title: 'Pemberkatan Nikah',
        startsAt: inDays(7 + 7 * 12 + 1, 10),
        endsAt: inDays(7 + 7 * 12 + 1, 12),
      });
      expect(single.status).toBe(201);
      const weeklyClash = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(7 + 7 * 10 + 1, 11),
        endsAt: inDays(7 + 7 * 10 + 1, 12),
        recurrence: 'weekly',
        recurrenceUntil: dayOf(inDays(7 + 7 * 14, 11)),
      });
      expect(weeklyClash.status).toBe(409);
      expect(weeklyClash.json.error.message).toContain('Pemberkatan Nikah');

      // Other resources are independent.
      const other = await createResource(t, f, { name: 'Ruang Kelas 2' });
      expect(
        (
          await book(f.s.member.token, {
            resourceId: other.id,
            startsAt: inDays(7 + 21, 12, 30),
            endsAt: inDays(7 + 21, 14),
          })
        ).status,
      ).toBe(201);
    });

    it('answers the availability check without booking', async () => {
      const resource = await createResource(t, f, { name: 'Studio Multimedia' });
      const taken = await book(f.manager.token, {
        resourceId: resource.id,
        title: 'Rekaman Ibadah',
        startsAt: inDays(9, 8),
        endsAt: inDays(9, 10),
      });
      await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(9, 12),
        endsAt: inDays(9, 13),
      });
      const check = await t.request('POST', `${f.base}/bookings/check`, {
        token: f.s.member.token,
        body: { resourceId: resource.id, startsAt: inDays(9, 9), endsAt: inDays(9, 12, 30) },
      });
      expect(check.status).toBe(200);
      expect(check.json).toMatchObject({
        available: false,
        pendingOverlaps: 1,
        occurrenceCount: 1,
        autoApproved: false,
      });
      expect(check.json.conflicts[0].title).toBe('Rekaman Ibadah');

      const editing = await t.request('POST', `${f.base}/bookings/check`, {
        token: f.manager.token,
        body: {
          resourceId: resource.id,
          startsAt: inDays(9, 9),
          endsAt: inDays(9, 10),
          excludeBookingId: taken.json.booking.id,
        },
      });
      expect(editing.json).toMatchObject({ available: true, autoApproved: true });

      const weekly = await t.request('POST', `${f.base}/bookings/check`, {
        token: f.s.member.token,
        body: {
          resourceId: resource.id,
          startsAt: inDays(10, 9),
          endsAt: inDays(10, 10),
          recurrence: 'weekly',
          recurrenceUntil: dayOf(inDays(10 + 21, 9)),
        },
      });
      expect(weekly.json.occurrenceCount).toBe(4);
    });

    it('validates booking times, capacity, links and the past', async () => {
      const resource = await createResource(t, f, { name: 'Ruang Rapat Majelis', capacity: 12 });
      const reversed = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(4, 12),
        endsAt: inDays(4, 10),
      });
      expect(reversed.status).toBe(422);
      expect(reversed.json.error.issues[0].path).toBe('endsAt');

      const noEnd = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(4, 10),
        endsAt: inDays(4, 12),
        recurrence: 'weekly',
      });
      expect(noEnd.status).toBe(422);
      expect(noEnd.json.error.issues[0].path).toBe('recurrenceUntil');

      const tooLong = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(4, 10),
        endsAt: inDays(4, 12),
        recurrence: 'weekly',
        recurrenceUntil: dayOf(inDays(4 + 7 * 110)),
      });
      expect(tooLong.status).toBe(422);

      const crowded = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(4, 10),
        endsAt: inDays(4, 12),
        expectedAttendees: 40,
      });
      expect(crowded.status).toBe(422);
      expect(crowded.json.error.issues[0]).toMatchObject({ path: 'expectedAttendees' });

      const past = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(-2, 10),
        endsAt: inDays(-2, 12),
      });
      expect(past.status).toBe(422);
      expect(past.json.error.issues[0].path).toBe('startsAt');
      // Managers may record what already happened.
      expect(
        (
          await book(f.manager.token, {
            resourceId: resource.id,
            startsAt: inDays(-2, 10),
            endsAt: inDays(-2, 12),
          })
        ).status,
      ).toBe(201);

      const ghostGroup = await book(f.s.member.token, {
        resourceId: resource.id,
        startsAt: inDays(4, 13),
        endsAt: inDays(4, 14),
        groupId: crypto.randomUUID(),
      });
      expect(ghostGroup.status).toBe(404);
    });

    it('lets managers approve and reject, notifying the requester', async () => {
      const resource = await createResource(t, f, { name: 'Ruang Pemuda' });
      const first = await book(f.s.member.token, {
        resourceId: resource.id,
        title: 'Persekutuan Pemuda',
        startsAt: inDays(11, 10),
        endsAt: inDays(11, 12),
      });
      const second = await book(f.s.leader.token, {
        resourceId: resource.id,
        title: 'Kelas Katekisasi',
        startsAt: inDays(11, 11),
        endsAt: inDays(11, 13),
      });
      expect(first.json.booking.status).toBe('pending');
      expect(second.json.booking.status).toBe('pending');

      for (const token of [f.s.member.token, f.s.leader.token, f.keeper.token]) {
        const denied = await t.request(
          'POST',
          `${f.base}/bookings/${first.json.booking.id}/decision`,
          { token, body: { decision: 'approved' } },
        );
        expect([403, 404]).toContain(denied.status);
      }

      // The manager sees the overlap with the other request before deciding.
      const pendingDetail = await t.request('GET', `${f.base}/bookings/${first.json.booking.id}`, {
        token: f.manager.token,
      });
      expect(pendingDetail.json.conflicts).toEqual([]);

      const approved = await t.request(
        'POST',
        `${f.base}/bookings/${first.json.booking.id}/decision`,
        { token: f.manager.token, body: { decision: 'approved', note: 'Kunci di pos satpam' } },
      );
      expect(approved.status).toBe(200);
      expect(approved.json.booking).toMatchObject({
        status: 'approved',
        deciderName: 'Sekretaris Sarana',
        decisionNote: 'Kunci di pos satpam',
      });

      const detail = await t.request('GET', `${f.base}/bookings/${second.json.booking.id}`, {
        token: f.manager.token,
      });
      expect(detail.json.conflicts.map((item: { title: string }) => item.title)).toEqual([
        'Persekutuan Pemuda',
      ]);
      const clash = await t.request(
        'POST',
        `${f.base}/bookings/${second.json.booking.id}/decision`,
        { token: f.manager.token, body: { decision: 'approved' } },
      );
      expect(clash.status).toBe(409);
      expect(clash.json.error.code).toBe('SCHEDULING_CONFLICT');

      const rejected = await t.request(
        'POST',
        `${f.base}/bookings/${second.json.booking.id}/decision`,
        { token: f.manager.token, body: { decision: 'rejected', note: 'Sudah dipakai' } },
      );
      expect(rejected.json.booking.status).toBe('rejected');
      const again = await t.request(
        'POST',
        `${f.base}/bookings/${second.json.booking.id}/decision`,
        { token: f.manager.token, body: { decision: 'approved' } },
      );
      expect(again.status).toBe(409);

      const memberInbox = await inbox(f.s.member.token);
      expect(memberInbox.find((item) => item.type === 'booking.decided')?.title).toContain(
        'disetujui',
      );
      const leaderInbox = await inbox(f.s.leader.token);
      expect(leaderInbox.find((item) => item.type === 'booking.decided')?.title).toContain(
        'tidak disetujui',
      );

      const actions = (await auditActions()).map((item) => item.action);
      expect(actions).toEqual(expect.arrayContaining(['booking.approve', 'booking.reject']));
    });

    it('cancels whole bookings or single dates of weekly ones', async () => {
      const resource = await createResource(t, f, { name: 'Ruang Sekolah Minggu' });
      const weekly = await book(f.s.member.token, {
        resourceId: resource.id,
        title: 'Sekolah Minggu Kelas Kecil',
        startsAt: inDays(14, 8),
        endsAt: inDays(14, 10),
        recurrence: 'weekly',
        recurrenceUntil: dayOf(inDays(14 + 28, 8)),
      });
      const id = weekly.json.booking.id;
      await t.request('POST', `${f.base}/bookings/${id}/decision`, {
        token: f.manager.token,
        body: { decision: 'approved' },
      });

      // Somebody else's booking cannot be cancelled by a member.
      expect(
        (
          await t.request('POST', `${f.base}/bookings/${id}/cancel`, {
            token: f.s.leader.token,
            body: {},
          })
        ).status,
      ).toBe(403);

      const wrongDate = await t.request('POST', `${f.base}/bookings/${id}/cancel`, {
        token: f.s.member.token,
        body: { occurrenceDate: dayOf(inDays(15)) },
      });
      expect(wrongDate.status).toBe(422);

      const skip = await t.request('POST', `${f.base}/bookings/${id}/cancel`, {
        token: f.manager.token,
        body: { occurrenceDate: dayOf(inDays(21)), reason: 'Ibadah gabungan' },
      });
      expect(skip.status).toBe(200);
      expect(skip.json.booking.status).toBe('approved');
      expect(skip.json.booking.skippedDates).toEqual([dayOf(inDays(21))]);
      expect(
        (await inbox(f.s.member.token)).some((item) => item.type === 'booking.cancelled'),
      ).toBe(true);

      // The skipped week is free again.
      const freed = await book(f.s.leader.token, {
        resourceId: resource.id,
        startsAt: inDays(21, 8),
        endsAt: inDays(21, 9),
      });
      expect(freed.status).toBe(201);
      const stillTaken = await book(f.s.leader.token, {
        resourceId: resource.id,
        startsAt: inDays(28, 8),
        endsAt: inDays(28, 9),
      });
      expect(stillTaken.status).toBe(409);

      const schedule = await t.request(
        'GET',
        `${f.base}/schedule?from=${encodeURIComponent(inDays(13, 0))}&to=${encodeURIComponent(inDays(43, 0))}&resourceId=${resource.id}`,
        { token: f.s.member.token },
      );
      expect(schedule.status).toBe(200);
      const weeklyDates = schedule.json.items[0].occurrences
        .filter((item: { bookingId: string }) => item.bookingId === id)
        .map((item: { startsAt: string }) => dayOf(item.startsAt));
      expect(weeklyDates).toEqual([
        dayOf(inDays(14)),
        dayOf(inDays(28)),
        dayOf(inDays(35)),
        dayOf(inDays(42)),
      ]);

      const cancelled = await t.request('POST', `${f.base}/bookings/${id}/cancel`, {
        token: f.s.member.token,
        body: { reason: 'Pindah ke gedung baru' },
      });
      expect(cancelled.json.booking.status).toBe('cancelled');
      expect(cancelled.json.booking.nextOccurrence).toBeNull();
      const twice = await t.request('POST', `${f.base}/bookings/${id}/cancel`, {
        token: f.s.member.token,
        body: {},
      });
      expect(twice.status).toBe(409);
      const actions = (await auditActions(`&entityId=${id}`)).map((item) => item.action);
      expect(actions).toEqual(
        expect.arrayContaining(['booking.create', 'booking.cancel_occurrence', 'booking.cancel']),
      );
    });

    it('sends changed times of approved requests back for approval', async () => {
      const resource = await createResource(t, f, { name: 'Ruang Musik' });
      const created = await book(f.s.member.token, {
        resourceId: resource.id,
        title: 'Latihan Band',
        startsAt: inDays(16, 15),
        endsAt: inDays(16, 17),
      });
      const id = created.json.booking.id;
      await t.request('POST', `${f.base}/bookings/${id}/decision`, {
        token: f.manager.token,
        body: { decision: 'approved' },
      });
      const base = {
        resourceId: resource.id,
        title: 'Latihan Band Pemuda',
        startsAt: inDays(16, 15),
        endsAt: inDays(16, 17),
      };
      const renamed = await t.request('PATCH', `${f.base}/bookings/${id}`, {
        token: f.s.member.token,
        body: base,
      });
      expect(renamed.status).toBe(200);
      expect(renamed.json.booking).toMatchObject({
        title: 'Latihan Band Pemuda',
        status: 'approved',
      });

      const moved = await t.request('PATCH', `${f.base}/bookings/${id}`, {
        token: f.s.member.token,
        body: { ...base, startsAt: inDays(16, 16), endsAt: inDays(16, 18) },
      });
      expect(moved.json.booking.status).toBe('pending');
      expect(moved.json.booking.decidedAt).toBeNull();

      expect(
        (
          await t.request('PATCH', `${f.base}/bookings/${id}`, {
            token: f.s.leader.token,
            body: base,
          })
        ).status,
      ).toBe(404);

      const managed = await t.request('PATCH', `${f.base}/bookings/${id}`, {
        token: f.manager.token,
        body: { ...base, startsAt: inDays(16, 14), endsAt: inDays(16, 16) },
      });
      expect(managed.json.booking.status).toBe('pending');
    });

    it('lists bookings by visibility, scope, status and owner, with pagination', async () => {
      const resource = await createResource(t, f, { name: 'Ruang Arsip' });
      for (let index = 0; index < 3; index += 1) {
        await book(f.s.leader.token, {
          resourceId: resource.id,
          title: `Rapat Panitia ${index + 1}`,
          startsAt: inDays(30 + index, 9),
          endsAt: inDays(30 + index, 10),
        });
      }
      await book(f.manager.token, {
        resourceId: resource.id,
        title: 'Inventarisasi Arsip',
        startsAt: inDays(29, 9),
        endsAt: inDays(29, 10),
      });

      const asMember = await t.request('GET', `${f.base}/bookings?resourceId=${resource.id}`, {
        token: f.s.member.token,
      });
      expect(asMember.json.items.map((item: { title: string }) => item.title)).toEqual([
        'Inventarisasi Arsip',
      ]);
      const asLeader = await t.request('GET', `${f.base}/bookings?resourceId=${resource.id}`, {
        token: f.s.leader.token,
      });
      expect(asLeader.json.total).toBe(4);
      const mine = await t.request(
        'GET',
        `${f.base}/bookings?resourceId=${resource.id}&mine=true&status=pending&limit=2`,
        { token: f.s.leader.token },
      );
      expect(mine.json).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(mine.json.items.map((item: { title: string }) => item.title)).toEqual([
        'Rapat Panitia 1',
        'Rapat Panitia 2',
      ]);
      const page2 = await t.request(
        'GET',
        `${f.base}/bookings?resourceId=${resource.id}&mine=true&limit=2&page=2`,
        { token: f.s.leader.token },
      );
      expect(page2.json.items.map((item: { title: string }) => item.title)).toEqual([
        'Rapat Panitia 3',
      ]);
      const searched = await t.request('GET', `${f.base}/bookings?q=panitia%202`, {
        token: f.manager.token,
      });
      expect(searched.json.items.map((item: { title: string }) => item.title)).toEqual([
        'Rapat Panitia 2',
      ]);

      const past = await t.request('GET', `${f.base}/bookings?scope=past`, {
        token: f.manager.token,
      });
      expect(
        past.json.items.every(
          (item: { endsAt: string; recurrence: string }) =>
            item.recurrence === 'weekly' || item.endsAt <= new Date().toISOString(),
        ),
      ).toBe(true);
      expect(
        (await t.request('GET', `${f.base}/bookings?scope=later`, { token: f.manager.token }))
          .status,
      ).toBe(422);
    });

    it('shows when a resource is in use right now', async () => {
      const resource = await createResource(t, f, { name: 'Kapel' });
      const start = new Date(Date.now() - 30 * 60_000).toISOString();
      const created = await book(f.manager.token, {
        resourceId: resource.id,
        title: 'Doa Pagi',
        startsAt: start,
        endsAt: addHours(start, 1),
      });
      expect(created.status).toBe(201);
      const next = await book(f.manager.token, {
        resourceId: resource.id,
        title: 'Konseling Pranikah',
        startsAt: inDays(2, 9),
        endsAt: inDays(2, 10),
      });
      expect(next.status).toBe(201);
      const detail = await t.request('GET', `${f.base}/resources/${resource.id}`, {
        token: f.s.member.token,
      });
      expect(detail.json.resource).toMatchObject({
        availableNow: false,
        currentBooking: { title: 'Doa Pagi' },
        nextBooking: { title: 'Konseling Pranikah' },
      });
      const overview = await t.request('GET', `${f.base}/overview`, { token: f.s.member.token });
      expect(overview.status).toBe(200);
      expect(overview.json.resources.total).toBeGreaterThan(overview.json.resources.availableNow);
      expect(overview.json.inventory).toBeNull();
    });

    it('validates the schedule window', async () => {
      const tooLong = await t.request(
        'GET',
        `${f.base}/schedule?from=${encodeURIComponent(inDays(0, 0))}&to=${encodeURIComponent(inDays(60, 0))}`,
        { token: f.s.member.token },
      );
      expect(tooLong.status).toBe(422);
      const reversed = await t.request(
        'GET',
        `${f.base}/schedule?from=${encodeURIComponent(inDays(2, 0))}&to=${encodeURIComponent(inDays(1, 0))}`,
        { token: f.s.member.token },
      );
      expect(reversed.status).toBe(422);
    });

    it('keeps pending requests of others out of the schedule', async () => {
      const resource = await createResource(t, f, { name: 'Ruang Tamu' });
      await book(f.s.leader.token, {
        resourceId: resource.id,
        title: 'Pertemuan Tertutup',
        startsAt: inDays(3, 14),
        endsAt: inDays(3, 15),
      });
      const query = `?from=${encodeURIComponent(inDays(3, 0))}&to=${encodeURIComponent(inDays(4, 0))}&resourceId=${resource.id}`;
      const asMember = await t.request('GET', `${f.base}/schedule${query}`, {
        token: f.s.member.token,
      });
      expect(asMember.json.items[0].occurrences).toEqual([]);
      const asLeader = await t.request('GET', `${f.base}/schedule${query}`, {
        token: f.s.leader.token,
      });
      expect(asLeader.json.items[0].occurrences).toHaveLength(1);
      const asManager = await t.request('GET', `${f.base}/schedule${query}`, {
        token: f.manager.token,
      });
      expect(asManager.json.items[0].occurrences[0].status).toBe('pending');
    });
  });

  describe('isolation', () => {
    it('answers 404 for ids from another church', async () => {
      const other = await seedChurch(t);
      const otherBase = `/api/churches/${other.church.id}/facilities`;
      const theirs = await t.request('POST', `${otherBase}/resources`, {
        token: other.owner.token,
        body: { name: 'Aula Gereja Lain', kind: 'hall' },
      });
      expect(theirs.status).toBe(201);
      const theirBooking = await t.request('POST', `${otherBase}/bookings`, {
        token: other.owner.token,
        body: {
          resourceId: theirs.json.resource.id,
          title: 'Acara Mereka',
          startsAt: inDays(5, 9),
          endsAt: inDays(5, 10),
        },
      });
      expect(theirBooking.status).toBe(201);
      const resourceId = theirs.json.resource.id;
      const bookingId = theirBooking.json.booking.id;

      const attempts = [
        t.request('GET', `${f.base}/resources/${resourceId}`, { token: f.s.owner.token }),
        t.request('PATCH', `${f.base}/resources/${resourceId}`, {
          token: f.s.owner.token,
          body: { name: 'Dibajak', kind: 'hall' },
        }),
        t.request('DELETE', `${f.base}/resources/${resourceId}`, { token: f.s.owner.token }),
        book(f.s.owner.token, {
          resourceId,
          startsAt: inDays(8, 9),
          endsAt: inDays(8, 10),
        }),
        t.request('GET', `${f.base}/bookings/${bookingId}`, { token: f.s.owner.token }),
        t.request('POST', `${f.base}/bookings/${bookingId}/decision`, {
          token: f.s.owner.token,
          body: { decision: 'rejected' },
        }),
        t.request('POST', `${f.base}/bookings/${bookingId}/cancel`, {
          token: f.s.owner.token,
          body: {},
        }),
        t.request('POST', `${f.base}/bookings/check`, {
          token: f.s.owner.token,
          body: { resourceId, startsAt: inDays(8, 9), endsAt: inDays(8, 10) },
        }),
        t.request(
          'GET',
          `${f.base}/schedule?from=${encodeURIComponent(inDays(0))}&to=${encodeURIComponent(inDays(7))}&resourceId=${resourceId}`,
          { token: f.s.owner.token },
        ),
      ];
      for (const response of await Promise.all(attempts)) expect(response.status).toBe(404);

      // A member of this church is not a member there.
      expect(
        (await t.request('GET', `${otherBase}/resources`, { token: f.s.member.token })).status,
      ).toBe(403);
      const untouched = t.db
        .select()
        .from(facilityBookings)
        .where(eq(facilityBookings.id, bookingId))
        .get();
      expect(untouched?.status).toBe('approved');
    });

    it('answers 403 MODULE_DISABLED when the church turns facilities off', async () => {
      const other = await seedChurch(t);
      const otherBase = `/api/churches/${other.church.id}`;
      const off = await t.request('PATCH', `${otherBase}/modules`, {
        token: other.owner.token,
        body: { modules: { facilities: false } },
      });
      expect(off.status).toBe(200);
      for (const path of [
        '/facilities/status',
        '/facilities/overview',
        '/facilities/resources',
        '/facilities/bookings',
        '/inventory/assets',
        '/inventory/loans',
      ]) {
        const response = await t.request('GET', `${otherBase}${path}`, {
          token: other.owner.token,
        });
        expect(response.status).toBe(403);
        expect(response.json.error.code).toBe('MODULE_DISABLED');
      }
    });
  });
});
