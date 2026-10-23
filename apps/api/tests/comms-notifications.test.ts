import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { seedComms, type CommsSeed } from './comms-fixtures';
import { createTestApp } from './helpers';

describe('comms notification inbox and preferences', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CommsSeed;

  const post = (title: string) =>
    t.request('POST', `${c.church}/announcements`, {
      token: c.announcer.token,
      body: { title, body: 'Isi pengumuman', status: 'published' },
    });

  beforeAll(async () => {
    c = await seedComms(t);
    for (const title of ['Kabar Satu', 'Kabar Dua', 'Kabar Tiga']) {
      expect((await post(title)).status).toBe(201);
    }
  });

  it('lists the inbox newest first with the unread count', async () => {
    const inbox = await t.request('GET', `/api/notifications?churchId=${c.s.church.id}`, {
      token: c.s.member.token,
    });
    expect(inbox.status).toBe(200);
    expect(inbox.json.items.map((item: { title: string }) => item.title).slice(0, 3)).toEqual([
      'Kabar Tiga',
      'Kabar Dua',
      'Kabar Satu',
    ]);
    expect(inbox.json.unreadCount).toBeGreaterThanOrEqual(3);
    const count = await t.request('GET', '/api/notifications/unread-count', {
      token: c.s.member.token,
    });
    expect(count.json.count).toBe(inbox.json.unreadCount);
    const paged = await t.request('GET', '/api/notifications?limit=2&page=2', {
      token: c.s.member.token,
    });
    expect(paged.json.items).toHaveLength(Math.min(2, inbox.json.total - 2));
  });

  it('marks one or all as read, only for the recipient', async () => {
    const inbox = await t.request('GET', '/api/notifications?unread=true', {
      token: c.s.member.token,
    });
    const first = inbox.json.items[0].id as string;
    const before = inbox.json.unreadCount as number;
    expect(
      (
        await t.request('PATCH', `/api/notifications/${first}`, {
          token: c.plain.token,
          body: { read: true },
        })
      ).status,
    ).toBe(404);
    const marked = await t.request('PATCH', `/api/notifications/${first}`, {
      token: c.s.member.token,
      body: { read: true },
    });
    expect(marked.status).toBe(200);
    expect(marked.json.notification.readAt).toBeString();
    expect(
      (await t.request('GET', '/api/notifications/unread-count', { token: c.s.member.token })).json
        .count,
    ).toBe(before - 1);
    const unread = await t.request('PATCH', `/api/notifications/${first}`, {
      token: c.s.member.token,
      body: { read: false },
    });
    expect(unread.json.notification.readAt).toBeNull();
    const all = await t.request('PATCH', '/api/notifications', {
      token: c.s.member.token,
      body: { read: true, churchId: c.s.church.id },
    });
    expect(all.status).toBe(200);
    expect(all.json.count).toBe(0);
    // Someone else's inbox is untouched.
    expect(
      (await t.request('GET', '/api/notifications/unread-count', { token: c.plain.token })).json
        .count,
    ).toBeGreaterThan(0);
  });

  it('respects per-type preferences, including opt-in types', async () => {
    const prefs = await t.request('GET', '/api/notifications/preferences', {
      token: c.s.member.token,
    });
    expect(prefs.status).toBe(200);
    const byType = Object.fromEntries(
      prefs.json.items.map((item: { type: string; inApp: boolean }) => [item.type, item.inApp]),
    );
    expect(byType['announcement.published']).toBe(true);
    expect(byType['event.registrations']).toBe(false);
    expect(byType['bulletin.published']).toBe(true);

    const off = await t.request('PUT', '/api/notifications/preferences', {
      token: c.s.member.token,
      body: { items: [{ type: 'announcement.published', inApp: false, email: false }] },
    });
    expect(off.status).toBe(200);
    await post('Kabar Empat');
    const memberInbox = await t.request('GET', '/api/notifications', { token: c.s.member.token });
    expect(memberInbox.json.items.map((item: { title: string }) => item.title)).not.toContain(
      'Kabar Empat',
    );
    const plainInbox = await t.request('GET', '/api/notifications', { token: c.plain.token });
    expect(plainInbox.json.items.map((item: { title: string }) => item.title)).toContain(
      'Kabar Empat',
    );

    const unknown = await t.request('PUT', '/api/notifications/preferences', {
      token: c.s.member.token,
      body: { items: [{ type: 'gossip.spread', inApp: true, email: false }] },
    });
    expect(unknown.status).toBe(422);
  });

  it('hides notifications of churches the person can no longer use', async () => {
    const before = await t.request('GET', '/api/notifications', { token: c.plain.token });
    expect(before.json.total).toBeGreaterThan(0);
    await t.request('PATCH', `${c.church}/members/${c.membershipOf(c.plain.user.id)}/status`, {
      token: c.s.owner.token,
      body: { status: 'suspended' },
    });
    // Only the account-level notice about the suspension itself remains.
    const after = await t.request('GET', '/api/notifications', { token: c.plain.token });
    expect(
      after.json.items.filter(
        (item: { churchId: string | null }) => item.churchId === c.s.church.id,
      ),
    ).toHaveLength(0);
    const inChurch = await t.request('GET', `/api/notifications?churchId=${c.s.church.id}`, {
      token: c.plain.token,
    });
    expect(inChurch.json.total).toBe(0);
  });

  it('requires a session', async () => {
    expect((await t.request('GET', '/api/notifications')).status).toBe(401);
    expect((await t.request('GET', '/api/notifications/unread-count')).status).toBe(401);
  });
});
