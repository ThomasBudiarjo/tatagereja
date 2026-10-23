import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { announcements, careTasks, people, personPrivacySettings } from '../src/db/schema';
import { nowIso } from '../src/lib/time';
import { newId } from '../src/lib/tokens';
import { checkIn, seedCheckin, type CheckinSeed } from './checkin-fixtures';
import { createTestApp } from './helpers';

/*
 * The personalised home: widgets per module and permission, the caller's own schedule, tasks,
 * children and notifications, announcement audiences, celebrations and layout preferences.
 */

const inDays = (days: number, hour = 9) => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

describe('insights dashboard', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CheckinSeed;
  let church: string;
  let dashboard: string;

  const home = async (token: string) => {
    const response = await t.request('GET', dashboard, { token });
    expect(response.status).toBe(200);
    return response.json;
  };

  const setModules = async (modules: Record<string, boolean>) => {
    const response = await t.request('PATCH', `${church}/modules`, {
      token: c.s.owner.token,
      body: { modules },
    });
    expect(response.status).toBe(200);
  };

  const insertAnnouncement = (values: Partial<typeof announcements.$inferInsert>) => {
    const now = nowIso();
    const id = newId();
    t.db
      .insert(announcements)
      .values({
        id,
        churchId: c.s.church.id,
        title: 'Pengumuman',
        body: 'Isi',
        status: 'published',
        publishedAt: now,
        createdBy: c.s.owner.user.id,
        createdAt: now,
        updatedAt: now,
        ...values,
      })
      .run();
    return id;
  };

  beforeAll(async () => {
    c = await seedCheckin(t);
    church = `/api/churches/${c.s.church.id}`;
    dashboard = `${church}/dashboard`;
  });

  it('answers members only', async () => {
    expect((await t.request('GET', dashboard, { token: c.other.token })).status).toBe(403);
    expect((await t.request('GET', dashboard)).status).toBe(401);
  });

  it('lists the widgets the caller may use and hides switched-off modules', async () => {
    const member = await home(c.s.member.token);
    expect(member.widgets).toContain('quick_actions');
    expect(member.widgets).toContain('my_schedule');
    expect(member.widgets).toContain('my_tasks');
    expect(member.mySchedule).toEqual([]);
    expect(member.myTasks).toEqual({ items: [], openCount: 0, overdueCount: 0 });
    expect(member.attendance.recent).toBeNull();
    expect(member.attendance.openAbsences).toBeNull();

    await setModules({ worship: false, care: false, checkin: false });
    const reduced = await home(c.s.member.token);
    expect(reduced.widgets).not.toContain('my_schedule');
    expect(reduced.widgets).not.toContain('my_tasks');
    expect(reduced.widgets).not.toContain('my_kids');
    expect(reduced.mySchedule).toBeNull();
    expect(reduced.myTasks).toBeNull();
    expect(reduced.myKids).toBeNull();
    await setModules({ worship: true, care: true, checkin: true });

    const admin = await home(c.s.admin.token);
    expect(admin.attendance.recent).toEqual([]);
    expect(admin.attendance.openAbsences).toBe(0);
  });

  it('shows my serving schedule from the worship roster', async () => {
    const worship = `${church}/worship`;
    const team = await t.request('POST', `${worship}/teams`, {
      token: c.s.owner.token,
      body: { name: 'Pemusik' },
    });
    const position = await t.request('POST', `${worship}/teams/${team.json.team.id}/positions`, {
      token: c.s.owner.token,
      body: { name: 'Pianis' },
    });
    const member = await t.request('POST', `${worship}/teams/${team.json.team.id}/members`, {
      token: c.s.owner.token,
      body: { personId: c.s.memberPerson.id },
    });
    expect(member.status).toBe(201);
    const service = await t.request('POST', `${worship}/services`, {
      token: c.s.owner.token,
      body: { title: 'Ibadah Umum 1', startsAt: inDays(3), status: 'published' },
    });
    const past = await t.request('POST', `${worship}/services`, {
      token: c.s.owner.token,
      body: { title: 'Ibadah Lalu', startsAt: inDays(-10), status: 'published' },
    });
    for (const serviceId of [service.json.service.id, past.json.service.id]) {
      const assigned = await t.request('POST', `${worship}/services/${serviceId}/roster`, {
        token: c.s.owner.token,
        body: {
          assignments: [{ positionId: position.json.position.id, personId: c.s.memberPerson.id }],
          ignoreConflicts: true,
        },
      });
      expect(assigned.status).toBe(201);
    }
    const data = await home(c.s.member.token);
    expect(data.mySchedule).toHaveLength(1);
    expect(data.mySchedule[0].serviceTitle).toBe('Ibadah Umum 1');
    expect(data.mySchedule[0].positionName).toBe('Pianis');
    expect((await home(c.s.leader.token)).mySchedule).toEqual([]);
  });

  it('shows my open care tasks and the notification that came with them', async () => {
    const created = await t.request('POST', `${church}/care/tasks`, {
      token: c.s.owner.token,
      body: {
        title: 'Telepon keluarga Simanjuntak',
        dueDate: '2020-01-01',
        assignedUserId: c.s.member.user.id,
      },
    });
    expect(created.status).toBe(201);
    // Someone else's task stays off my home screen.
    t.db
      .insert(careTasks)
      .values({
        id: newId(),
        churchId: c.s.church.id,
        title: 'Tugas orang lain',
        status: 'open',
        assignedUserId: c.s.admin.user.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      .run();
    const data = await home(c.s.member.token);
    expect(data.myTasks.openCount).toBe(1);
    expect(data.myTasks.overdueCount).toBe(1);
    expect(data.myTasks.items[0].title).toBe('Telepon keluarga Simanjuntak');
    expect(data.myTasks.items[0].isOverdue).toBe(true);
    expect(data.notifications.unreadCount).toBeGreaterThanOrEqual(1);
    expect(
      data.notifications.items.some((item: { type: string }) => item.type === 'care.task_assigned'),
    ).toBe(true);
    const owner = await home(c.s.owner.token);
    expect(owner.myTasks.openCount).toBe(0);
  });

  it("shows a guardian's children who are in class right now, with the security code", async () => {
    const [checkin] = await checkIn(t, c, {
      children: [{ personId: c.yosua.id }],
      guardianPersonId: c.sari.id,
    });
    const data = await home(c.guardian.token);
    expect(data.myKids).toHaveLength(1);
    expect(data.myKids[0].child.id).toBe(c.yosua.id);
    expect(data.myKids[0].securityCode).toBe(checkin!.securityCode);
    expect((await home(c.s.member.token)).myKids).toEqual([]);
  });

  it('shows live announcements meant for the caller, pinned first', async () => {
    const pinned = insertAnnouncement({ title: 'Jadwal Natal', pinnedAt: nowIso() });
    const latest = insertAnnouncement({ title: 'Rapat Majelis' });
    const draft = insertAnnouncement({ title: 'Draf', status: 'draft', publishedAt: null });
    const scheduled = insertAnnouncement({ title: 'Nanti', publishAt: inDays(5) });
    const expired = insertAnnouncement({ title: 'Lewat', expiresAt: inDays(-1) });
    const forGroup = insertAnnouncement({
      title: 'Untuk Pemuda',
      audience: 'group',
      groupId: c.s.group.id,
    });

    const member = await home(c.s.member.token);
    expect(member.announcements.pinned.map((item: { id: string }) => item.id)).toEqual([pinned]);
    const latestIds = member.announcements.latest.map((item: { id: string }) => item.id);
    expect(latestIds).toContain(latest);
    for (const hidden of [pinned, draft, scheduled, expired, forGroup]) {
      expect(latestIds).not.toContain(hidden);
    }
    const leader = await home(c.s.leader.token);
    expect(leader.announcements.latest.map((item: { id: string }) => item.id)).toContain(forGroup);
    // Managers see drafts in the announcements module, not on their home screen.
    const owner = await home(c.s.owner.token);
    expect(owner.announcements.latest.map((item: { id: string }) => item.id)).not.toContain(draft);
  });

  it('lists birthdays and anniversaries of the coming week, respecting hidden birthdays', async () => {
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const birthday = await t.createPerson(c.s.owner.token, c.s.church.id, {
      firstName: 'Ulang',
      lastName: 'Tahun',
      birthDate: `1990${today.slice(4)}`,
    });
    t.db
      .update(people)
      .set({ weddingDate: `2000${today.slice(4)}` })
      .where(eq(people.id, birthday.id))
      .run();
    const data = await home(c.s.member.token);
    const kinds = data.celebrations
      .filter((item: { person: { id: string } }) => item.person.id === birthday.id)
      .map((item: { kind: string }) => item.kind)
      .sort();
    expect(kinds).toEqual(['anniversary', 'birthday']);

    const shy = await t.createPerson(c.s.owner.token, c.s.church.id, {
      firstName: 'Pemalu',
      birthDate: `1985${today.slice(4)}`,
    });
    t.db
      .insert(personPrivacySettings)
      .values({
        personId: shy.id,
        churchId: c.s.church.id,
        showBirthday: false,
        updatedAt: nowIso(),
      })
      .run();
    const ids = (data: { celebrations: { person: { id: string } }[] }) =>
      data.celebrations.map((item) => item.person.id);
    expect(ids(await home(c.s.member.token))).not.toContain(shy.id);
    expect(ids(await home(c.s.owner.token))).toContain(shy.id);
  });

  it('keeps per-person layout preferences and validates them', async () => {
    const saved = await t.request('PUT', `${dashboard}/preferences`, {
      token: c.s.member.token,
      body: { hiddenWidgets: ['birthdays'], widgetOrder: ['announcements', 'my_tasks'] },
    });
    expect(saved.status).toBe(200);
    expect(saved.json.preferences.hiddenWidgets).toEqual(['birthdays']);
    const data = await home(c.s.member.token);
    expect(data.widgets[0]).toBe('announcements');
    expect(data.widgets[1]).toBe('my_tasks');
    expect(data.widgets).not.toContain('birthdays');
    expect(data.availableWidgets).toContain('birthdays');
    expect((await home(c.s.admin.token)).widgets).toContain('birthdays');

    const read = await t.request('GET', `${dashboard}/preferences`, { token: c.s.member.token });
    expect(read.json.preferences.widgetOrder).toEqual(['announcements', 'my_tasks']);

    const duplicate = await t.request('PUT', `${dashboard}/preferences`, {
      token: c.s.member.token,
      body: { hiddenWidgets: ['birthdays', 'birthdays'] },
    });
    expect(duplicate.status).toBe(422);
    const unknown = await t.request('PUT', `${dashboard}/preferences`, {
      token: c.s.member.token,
      body: { widgetOrder: ['weather'] },
    });
    expect(unknown.status).toBe(422);
    const foreign = await t.request(
      'PUT',
      `/api/churches/${c.otherChurch.id}/dashboard/preferences`,
      {
        token: c.s.member.token,
        body: {},
      },
    );
    expect(foreign.status).toBe(403);

    // A widget whose module is switched off disappears even when it was ordered first.
    await t.request('PUT', `${dashboard}/preferences`, {
      token: c.s.member.token,
      body: { widgetOrder: ['my_kids'] },
    });
    await setModules({ checkin: false });
    expect((await home(c.s.member.token)).widgets).not.toContain('my_kids');
    await setModules({ checkin: true });
  });
});
