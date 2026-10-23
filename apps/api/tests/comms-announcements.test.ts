import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { announcements } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { commsAudit, inMinutes, notificationsOf, seedComms, type CommsSeed } from './comms-fixtures';
import { createTestApp } from './helpers';

describe('comms announcements', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CommsSeed;
  let url: string;

  beforeAll(async () => {
    c = await seedComms(t);
    url = `${c.church}/announcements`;
  });

  const titles = async (token: string, query = '') =>
    (await t.request('GET', `${url}${query}`, { token })).json.items.map(
      (item: { title: string }) => item.title,
    ) as string[];

  it('lets announcers post to the whole church and notifies every member', async () => {
    const created = await t.request('POST', url, {
      token: c.announcer.token,
      body: {
        title: 'Ibadah Syukur HUT Gereja',
        body: 'Mari hadir **bersama** keluarga.\n\n- Pukul 09.00\n- Gedung utama',
        status: 'published',
        coverImageUrl: 'https://example.com/hut.jpg',
      },
    });
    expect(created.status).toBe(201);
    const announcement = created.json.announcement;
    expect(announcement.audience).toBe('church');
    expect(announcement.state).toBe('published');
    expect(announcement.coverImageUrl).toBe('https://example.com/hut.jpg');
    expect(announcement.seenCount).toBe(0);

    const memberNotes = await notificationsOf(
      t,
      c.s.member.token,
      c.s.church.id,
      'announcement.published',
    );
    expect(memberNotes).toHaveLength(1);
    expect(memberNotes[0]?.title).toBe('Ibadah Syukur HUT Gereja');
    expect(memberNotes[0]?.body).toBe('Mari hadir bersama keluarga. Pukul 09.00 Gedung utama');
    expect(memberNotes[0]?.link).toBe(`/c/${c.s.church.id}/announcements/${announcement.id}`);
    // The author does not hear about their own post.
    expect(
      await notificationsOf(t, c.announcer.token, c.s.church.id, 'announcement.published'),
    ).toHaveLength(0);

    const audit = await commsAudit(t, c, 'announcement.create');
    expect(audit.some((entry) => entry.entityId === announcement.id)).toBe(true);
  });

  it('enforces the posting matrix', async () => {
    const churchWide = { title: 'Rapat Majelis', body: 'Kamis malam', status: 'published' };
    expect((await t.request('POST', url, { token: c.s.member.token, body: churchWide })).status).toBe(403);
    expect((await t.request('POST', url, { token: c.plain.token, body: churchWide })).status).toBe(403);
    expect((await t.request('POST', url, { token: c.coordinator.token, body: churchWide })).status).toBe(403);
    expect((await t.request('POST', url, { token: c.s.leader.token, body: churchWide })).status).toBe(403);
    expect(
      (
        await t.request('POST', url, {
          token: c.s.leader.token,
          body: { ...churchWide, audience: 'roles', roleIds: [c.roles.plain] },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await t.request('POST', url, {
          token: c.s.leader.token,
          body: { ...churchWide, audience: 'group', groupId: c.s.otherGroup.id },
        })
      ).status,
    ).toBe(403);
    const leaderPost = await t.request('POST', url, {
      token: c.s.leader.token,
      body: { title: 'Latihan Pemuda', body: 'Sabtu sore', status: 'draft', audience: 'group', groupId: c.s.group.id },
    });
    expect(leaderPost.status).toBe(201);
    expect((await t.request('POST', url, { token: c.s.admin.token, body: churchWide })).status).toBe(201);
  });

  it('validates the form', async () => {
    const missingGroup = await t.request('POST', url, {
      token: c.s.admin.token,
      body: { title: 'Kelompok', body: 'x', audience: 'group' },
    });
    expect(missingGroup.status).toBe(422);
    expect(missingGroup.json.error.issues[0].path).toBe('groupId');
    const noRoles = await t.request('POST', url, {
      token: c.s.admin.token,
      body: { title: 'Peran', body: 'x', audience: 'roles', roleIds: [] },
    });
    expect(noRoles.status).toBe(422);
    const badWindow = await t.request('POST', url, {
      token: c.s.admin.token,
      body: { title: 'Jadwal', body: 'x', publishAt: inMinutes(60), expiresAt: inMinutes(30) },
    });
    expect(badWindow.status).toBe(422);
    expect(badWindow.json.error.issues[0].path).toBe('expiresAt');
    const badCover = await t.request('POST', url, {
      token: c.s.admin.token,
      body: { title: 'Sampul', body: 'x', coverImageUrl: 'javascript:alert(1)' },
    });
    expect(badCover.status).toBe(422);
  });

  it('shows group and role announcements only to their audience', async () => {
    const group = await t.request('POST', url, {
      token: c.s.leader.token,
      body: {
        title: 'Retret Pemuda',
        body: 'Untuk anggota komisi pemuda',
        status: 'published',
        audience: 'group',
        groupId: c.s.group.id,
      },
    });
    expect(group.status).toBe(201);
    const roles = await t.request('POST', url, {
      token: c.announcer.token,
      body: {
        title: 'Latihan Paduan Suara',
        body: 'Khusus anggota paduan suara',
        status: 'published',
        audience: 'roles',
        roleIds: [c.roles.plain],
      },
    });
    expect(roles.status).toBe(201);
    expect(roles.json.announcement.roleNames).toEqual(['Paduan Suara']);

    expect(await titles(c.s.member.token)).not.toContain('Retret Pemuda');
    expect(await titles(c.s.member.token)).not.toContain('Latihan Paduan Suara');
    expect(await titles(c.plain.token)).toContain('Latihan Paduan Suara');
    expect(await titles(c.s.leader.token)).toContain('Retret Pemuda');
    expect(await titles(c.s.admin.token)).toEqual(
      expect.arrayContaining(['Retret Pemuda', 'Latihan Paduan Suara']),
    );
    const hidden = await t.request('GET', `${url}/${roles.json.announcement.id}`, {
      token: c.s.member.token,
    });
    expect(hidden.status).toBe(404);

    // Only the role holders were notified.
    expect(
      (await notificationsOf(t, c.plain.token, c.s.church.id, 'announcement.published')).map(
        (item) => item.title,
      ),
    ).toContain('Latihan Paduan Suara');
    expect(
      (await notificationsOf(t, c.s.member.token, c.s.church.id, 'announcement.published')).map(
        (item) => item.title,
      ),
    ).not.toContain('Latihan Paduan Suara');
  });

  it('publishes scheduled posts on time and notifies once', async () => {
    const created = await t.request('POST', url, {
      token: c.announcer.token,
      body: {
        title: 'Persiapan Natal',
        body: 'Pendaftaran panitia dibuka',
        status: 'published',
        publishAt: inMinutes(30),
      },
    });
    expect(created.status).toBe(201);
    const id = created.json.announcement.id as string;
    expect(created.json.announcement.state).toBe('scheduled');
    expect(await titles(c.s.member.token)).not.toContain('Persiapan Natal');
    expect(await titles(c.announcer.token, '?state=scheduled')).toEqual(['Persiapan Natal']);
    expect(
      (await notificationsOf(t, c.s.member.token, c.s.church.id)).map((item) => item.title),
    ).not.toContain('Persiapan Natal');

    // Time passes: the publish time is now in the past.
    t.db
      .update(announcements)
      .set({ publishAt: inMinutes(-1) })
      .where(eq(announcements.id, id))
      .run();
    const count = await t.request('GET', `/api/notifications/unread-count`, {
      token: c.s.member.token,
    });
    expect(count.status).toBe(200);
    const notes = await notificationsOf(t, c.s.member.token, c.s.church.id, 'announcement.published');
    expect(notes.filter((item) => item.title === 'Persiapan Natal')).toHaveLength(1);
    // A second read does not notify again.
    await t.request('GET', url, { token: c.s.member.token });
    const again = await notificationsOf(t, c.s.member.token, c.s.church.id, 'announcement.published');
    expect(again.filter((item) => item.title === 'Persiapan Natal')).toHaveLength(1);
    expect(await titles(c.s.member.token)).toContain('Persiapan Natal');
  });

  it('hides expired posts from members but keeps them for managers', async () => {
    const created = await t.request('POST', url, {
      token: c.announcer.token,
      body: { title: 'Lowongan Koster', body: 'Sampai akhir bulan', status: 'published' },
    });
    const id = created.json.announcement.id as string;
    t.db
      .update(announcements)
      .set({ expiresAt: inMinutes(-5) })
      .where(eq(announcements.id, id))
      .run();
    expect(await titles(c.s.member.token)).not.toContain('Lowongan Koster');
    expect((await t.request('GET', `${url}/${id}`, { token: c.s.member.token })).status).toBe(404);
    expect(await titles(c.announcer.token, '?state=expired')).toContain('Lowongan Koster');
  });

  it('pins posts to the top', async () => {
    const created = await t.request('POST', url, {
      token: c.announcer.token,
      body: { title: 'Penting: Jadwal Baru', body: 'Mulai bulan depan', status: 'published' },
    });
    const id = created.json.announcement.id as string;
    const older = (await titles(c.s.member.token))[0];
    expect(older).toBe('Penting: Jadwal Baru');
    await t.request('POST', url, {
      token: c.announcer.token,
      body: { title: 'Kabar Terbaru', body: 'Lebih baru', status: 'published' },
    });
    expect((await titles(c.s.member.token))[0]).toBe('Kabar Terbaru');
    expect(
      (await t.request('PUT', `${url}/${id}/pin`, { token: c.s.member.token, body: { pinned: true } }))
        .status,
    ).toBe(403);
    const pinned = await t.request('PUT', `${url}/${id}/pin`, {
      token: c.announcer.token,
      body: { pinned: true },
    });
    expect(pinned.status).toBe(200);
    expect(pinned.json.announcement.pinned).toBe(true);
    expect((await titles(c.s.member.token))[0]).toBe('Penting: Jadwal Baru');
  });

  it('tracks reads and shows "seen by" to managers only', async () => {
    const created = await t.request('POST', url, {
      token: c.announcer.token,
      body: { title: 'Perjamuan Kudus', body: 'Minggu depan', status: 'published' },
    });
    const id = created.json.announcement.id as string;
    const read = await t.request('POST', `${url}/${id}/read`, { token: c.s.member.token });
    expect(read.status).toBe(200);
    expect(read.json.announcement.readByMe).toBe(true);
    expect(read.json.announcement.seenCount).toBeNull();
    await t.request('POST', `${url}/${id}/read`, { token: c.s.member.token });
    await t.request('POST', `${url}/${id}/read`, { token: c.plain.token });

    const detail = await t.request('GET', `${url}/${id}`, { token: c.announcer.token });
    expect(detail.json.announcement.seenCount).toBe(2);
    expect(detail.json.canManage).toBe(true);
    const readers = await t.request('GET', `${url}/${id}/readers`, { token: c.announcer.token });
    expect(readers.status).toBe(200);
    expect(readers.json.seenCount).toBe(2);
    expect(readers.json.audienceCount).toBeGreaterThanOrEqual(9);
    expect(readers.json.items.map((item: { name: string }) => item.name).sort()).toEqual(
      ['Anggota Biasa', 'Member'].sort(),
    );
    expect((await t.request('GET', `${url}/${id}/readers`, { token: c.s.member.token })).status).toBe(403);
    expect((await t.request('GET', `${url}/${id}/readers`, { token: c.s.leader.token })).status).toBe(403);
  });

  it('lets leaders edit their group posts but not move them church-wide', async () => {
    const created = await t.request('POST', url, {
      token: c.s.leader.token,
      body: { title: 'Doa Pagi Pemuda', body: 'Setiap Selasa', status: 'draft', groupId: c.s.group.id },
    });
    expect(created.status).toBe(201);
    expect(created.json.announcement.audience).toBe('group');
    const id = created.json.announcement.id as string;
    const moved = await t.request('PATCH', `${url}/${id}`, {
      token: c.s.leader.token,
      body: { title: 'Doa Pagi', body: 'x', status: 'published', audience: 'church' },
    });
    expect(moved.status).toBe(403);
    const published = await t.request('PATCH', `${url}/${id}`, {
      token: c.s.leader.token,
      body: {
        title: 'Doa Pagi Pemuda',
        body: 'Setiap Selasa pukul 06.00',
        status: 'published',
        audience: 'group',
        groupId: c.s.group.id,
      },
    });
    expect(published.status).toBe(200);
    expect(published.json.announcement.state).toBe('published');
    const editByMember = await t.request('PATCH', `${url}/${id}`, {
      token: c.s.member.token,
      body: { title: 'Ubah', body: 'x', status: 'draft' },
    });
    expect(editByMember.status).toBe(403);
    const deleteByCoordinator = await t.request('DELETE', `${url}/${id}`, { token: c.coordinator.token });
    expect(deleteByCoordinator.status).toBe(403);
    const deleted = await t.request('DELETE', `${url}/${id}`, { token: c.s.leader.token });
    expect(deleted.status).toBe(200);
    expect((await commsAudit(t, c, 'announcement.delete')).some((entry) => entry.entityId === id)).toBe(true);
  });

  it('refuses ids from another church', async () => {
    const foreign = await t.request('POST', `/api/churches/${c.otherChurch.id}/announcements`, {
      token: c.other.token,
      body: { title: 'Gereja lain', body: 'Rahasia', status: 'published' },
    });
    expect(foreign.status).toBe(201);
    const foreignId = foreign.json.announcement.id as string;
    expect((await t.request('GET', `${url}/${foreignId}`, { token: c.s.owner.token })).status).toBe(404);
    expect(
      (
        await t.request('PATCH', `${url}/${foreignId}`, {
          token: c.s.owner.token,
          body: { title: 'Ubah', body: 'x' },
        })
      ).status,
    ).toBe(404);
    expect((await t.request('DELETE', `${url}/${foreignId}`, { token: c.s.owner.token })).status).toBe(404);
    expect((await t.request('POST', `${url}/${foreignId}/read`, { token: c.s.owner.token })).status).toBe(404);
    // Another church's group or role cannot be targeted.
    const otherGroup = await t.createGroup(c.other.token, c.otherChurch.id, { name: 'Pemuda Lain' });
    expect(
      (
        await t.request('POST', url, {
          token: c.s.owner.token,
          body: { title: 'Ubah', body: 'x', groupId: otherGroup.id },
        })
      ).status,
    ).toBe(404);
    const otherRoles = await t.request('GET', `/api/churches/${c.otherChurch.id}/roles`, {
      token: c.other.token,
    });
    const otherRoleId = otherRoles.json.items[0].id as string;
    expect(
      (
        await t.request('POST', url, {
          token: c.s.owner.token,
          body: { title: 'Ubah', body: 'x', audience: 'roles', roleIds: [otherRoleId] },
        })
      ).status,
    ).toBe(404);
    // And the other church cannot read ours.
    expect((await t.request('GET', url, { token: c.other.token })).status).toBe(403);
  });
});
