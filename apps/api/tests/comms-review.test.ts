import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { announcements } from '../src/db/schema';
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

/** Audience, schedule and waitlist rules seen from the places that show them second-hand. */
describe('comms visibility and waitlist edges', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CommsSeed;

  beforeAll(async () => {
    c = await seedComms(t);
  });

  const post = async (token: string, body: Record<string, unknown>) => {
    const response = await t.request('POST', `${c.church}/announcements`, {
      token,
      body: { body: 'Isi pengumuman', status: 'published', ...body },
    });
    expect(response.status).toBe(201);
    return response.json.announcement.id as string;
  };

  it('keeps role, group and scheduled posts off the home dashboard of others', async () => {
    await post(c.announcer.token, {
      title: 'Rapat Majelis Tertutup',
      audience: 'roles',
      roleIds: [c.roles.plain],
    });
    await post(c.announcer.token, { title: 'Natal Terjadwal', publishAt: inDays(3) });
    await post(c.s.leader.token, {
      title: 'Kabar Komisi Pemuda',
      audience: 'group',
      groupId: c.s.group.id,
    });
    await post(c.announcer.token, { title: 'Kabar Seluruh Jemaat' });

    const titlesOn = async (token: string) =>
      (
        (await t.request('GET', `${c.church}/dashboard`, { token })).json.recentAnnouncements as {
          title: string;
        }[]
      ).map((item) => item.title);
    const member = await titlesOn(c.s.member.token);
    expect(member).toContain('Kabar Seluruh Jemaat');
    expect(member).not.toContain('Rapat Majelis Tertutup');
    expect(member).not.toContain('Natal Terjadwal');
    expect(member).not.toContain('Kabar Komisi Pemuda');
    expect(await titlesOn(c.plain.token)).toContain('Rapat Majelis Tertutup');
    expect(await titlesOn(c.s.leader.token)).toContain('Kabar Komisi Pemuda');
  });

  it('keeps scheduled group posts off the group page until their time', async () => {
    const id = await post(c.s.leader.token, {
      title: 'Retret Terjadwal',
      audience: 'group',
      groupId: c.s.group.id,
      publishAt: inDays(2),
    });
    const recent = async (token: string) =>
      (
        (await t.request('GET', `${c.church}/groups/${c.s.group.id}`, { token })).json.stats
          .recentAnnouncements as { id: string }[]
      ).map((item) => item.id);
    expect(await recent(c.s.member.token)).not.toContain(id);
    expect(await recent(c.s.leader.token)).toContain(id);
  });

  it('does not count a manager opening a scheduled post as a read', async () => {
    const id = await post(c.announcer.token, { title: 'Belum Terbit', publishAt: inMinutes(30) });
    expect(
      (
        await t.request('POST', `${c.church}/announcements/${id}/read`, {
          token: c.announcer.token,
        })
      ).status,
    ).toBe(200);
    t.db
      .update(announcements)
      .set({ publishAt: inMinutes(-1) })
      .where(eq(announcements.id, id))
      .run();
    const readers = await t.request('GET', `${c.church}/announcements/${id}/readers`, {
      token: c.announcer.token,
    });
    expect(readers.json.seenCount).toBe(0);
  });

  it('records pinning in the audit log', async () => {
    const id = await post(c.announcer.token, { title: 'Pengumuman Disematkan' });
    const pinned = await t.request('PUT', `${c.church}/announcements/${id}/pin`, {
      token: c.announcer.token,
      body: { pinned: true },
    });
    expect(pinned.status).toBe(200);
    expect(
      (await commsAudit(t, c, 'announcement.pin')).some((entry) => entry.entityId === id),
    ).toBe(true);
  });

  it('keeps scheduled announcements out of a published bulletin until they go live', async () => {
    await post(c.announcer.token, { title: 'Bazar Akhir Pekan', publishAt: inDays(2) });
    const created = await t.request('POST', `${c.church}/bulletins`, {
      token: c.editor.token,
      body: {
        title: 'Warta Minggu Ini',
        issueDate: dayOf(inDays(0)),
        sections: [{ id: 'a', kind: 'announcements', title: 'Pengumuman' }],
      },
    });
    expect(created.status).toBe(201);
    const id = created.json.bulletin.id as string;
    await t.request('POST', `${c.church}/bulletins/${id}/publish`, { token: c.editor.token });
    const read = await t.request('GET', `${c.church}/bulletins/${id}`, {
      token: c.s.member.token,
    });
    expect(read.status).toBe(200);
    const titles = (read.json.rendered[0].items as { title: string }[]).map((item) => item.title);
    expect(titles).toContain('Kabar Seluruh Jemaat');
    expect(titles).not.toContain('Bazar Akhir Pekan');
  });

  it('moves the waitlist up when the person at its head gives up their place', async () => {
    const created = await t.request('POST', `${c.church}/events`, {
      token: c.coordinator.token,
      body: {
        title: 'Kelas Pranikah',
        startsAt: inDays(12),
        capacity: 3,
        registrationRequired: true,
        waitlistEnabled: true,
      },
    });
    const id = created.json.event.id as string;
    const register = (token: string, partySize: number) =>
      t.request('POST', `${c.church}/events/${id}/registrations`, {
        token,
        body: { partySize },
      });
    expect((await register(c.s.member.token, 2)).json.registration.status).toBe('registered');
    const head = await register(c.plain.token, 2);
    expect(head.json.registration.status).toBe('waitlisted');
    expect((await register(c.s.leader.token, 1)).json.registration.status).toBe('waitlisted');

    const cancelled = await t.request(
      'POST',
      `${c.church}/events/${id}/registrations/${head.json.registration.id}/cancel`,
      { token: c.plain.token },
    );
    expect(cancelled.status).toBe(200);
    const leader = await t.request('GET', `${c.church}/events/${id}`, {
      token: c.s.leader.token,
    });
    expect(leader.json.event.myRegistration.status).toBe('registered');
    expect(leader.json.event.placesLeft).toBe(0);
  });

  it('tells people registered for later occurrences when the whole series moves', async () => {
    const series = await t.request('POST', `${c.church}/events/series`, {
      token: c.coordinator.token,
      body: {
        title: 'Katekisasi Sidi',
        startsAt: inDays(3, 10),
        durationMinutes: 60,
        frequency: 'weekly',
        untilDate: dayOf(inDays(17, 10)),
        registrationRequired: true,
      },
    });
    expect(series.status).toBe(201);
    const list = await t.request('GET', `${c.church}/events?scope=all&limit=200`, {
      token: c.coordinator.token,
    });
    const occurrences = (list.json.items as { id: string; seriesId: string; startsAt: string }[])
      .filter((item) => item.seriesId === series.json.series.id)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    expect(occurrences).toHaveLength(3);
    const last = occurrences[2]!;
    await t.request('POST', `${c.church}/events/${last.id}/registrations`, {
      token: c.plain.token,
      body: {},
    });
    const moved = await t.request(
      'PATCH',
      `${c.church}/events/${occurrences[0]!.id}?scope=future`,
      {
        token: c.coordinator.token,
        body: {
          title: 'Katekisasi Sidi',
          startsAt: inDays(3, 11),
          endsAt: inDays(3, 12),
          registrationRequired: true,
        },
      },
    );
    expect(moved.status).toBe(200);
    const notes = await notificationsOf(t, c.plain.token, c.s.church.id, 'event.changed');
    expect(notes.some((note) => note.title === 'Katekisasi Sidi')).toBe(true);
  });
});
