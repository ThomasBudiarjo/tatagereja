import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp, seedChurch } from './helpers';

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('events, attendance, announcements and dashboard', () => {
  const t = createTestApp();
  let s: Awaited<ReturnType<typeof seedChurch>>;
  beforeAll(async () => {
    s = await seedChurch(t);
  });
  afterAll(() => t.close());

  let churchEventId = '';
  let groupEventId = '';

  it('creates events according to the matrix', async () => {
    const churchEvent = await t.request('POST', `/api/churches/${s.church.id}/events`, {
      token: s.admin.token,
      body: {
        title: 'Sunday Service',
        startsAt: inDays(2),
        endsAt: inDays(2),
        location: 'Main hall',
      },
    });
    expect(churchEvent.status).toBe(201);
    expect(churchEvent.json.event.groupId).toBeNull();
    churchEventId = churchEvent.json.event.id;

    const leaderChurchWide = await t.request('POST', `/api/churches/${s.church.id}/events`, {
      token: s.leader.token,
      body: { title: 'Nope', startsAt: inDays(1) },
    });
    expect(leaderChurchWide.status).toBe(403);

    const leaderOtherGroup = await t.request('POST', `/api/churches/${s.church.id}/events`, {
      token: s.leader.token,
      body: { title: 'Nope', startsAt: inDays(1), groupId: s.otherGroup.id },
    });
    expect(leaderOtherGroup.status).toBe(403);

    const groupEvent = await t.request('POST', `/api/churches/${s.church.id}/events`, {
      token: s.leader.token,
      body: { title: 'Youth Night', startsAt: inDays(3), groupId: s.group.id },
    });
    expect(groupEvent.status).toBe(201);
    expect(groupEvent.json.event.groupName).toBe('Youth Ministry');
    groupEventId = groupEvent.json.event.id;

    const memberDenied = await t.request('POST', `/api/churches/${s.church.id}/events`, {
      token: s.member.token,
      body: { title: 'Nope', startsAt: inDays(1) },
    });
    expect(memberDenied.status).toBe(403);

    const invalidRange = await t.request('POST', `/api/churches/${s.church.id}/events`, {
      token: s.admin.token,
      body: { title: 'Bad', startsAt: inDays(3), endsAt: inDays(2) },
    });
    expect(invalidRange.status).toBe(422);
    expect(invalidRange.json.error.issues[0].path).toBe('endsAt');

    const past = await t.request('POST', `/api/churches/${s.church.id}/events`, {
      token: s.admin.token,
      body: { title: 'Old Event', startsAt: inDays(-10) },
    });
    expect(past.status).toBe(201);

    const upcoming = await t.request('GET', `/api/churches/${s.church.id}/events`, {
      token: s.member.token,
    });
    expect(upcoming.json.total).toBe(2);
    expect(upcoming.json.items[0].title).toBe('Sunday Service');
    const pastList = await t.request('GET', `/api/churches/${s.church.id}/events?scope=past`, {
      token: s.member.token,
    });
    expect(pastList.json.items.map((e: { title: string }) => e.title)).toEqual(['Old Event']);
    const byGroup = await t.request(
      'GET',
      `/api/churches/${s.church.id}/events?scope=all&groupId=${s.group.id}`,
      { token: s.member.token },
    );
    expect(byGroup.json.total).toBe(1);
  });

  it('manages participants and lets members RSVP for themselves', async () => {
    const add = await t.request(
      'POST',
      `/api/churches/${s.church.id}/events/${churchEventId}/participants`,
      {
        token: s.admin.token,
        body: { personIds: [s.alice.id, s.bob.id], status: 'invited' },
      },
    );
    expect(add.status).toBe(200);
    expect(add.json.event.participantCount).toBe(2);

    const memberAdd = await t.request(
      'POST',
      `/api/churches/${s.church.id}/events/${churchEventId}/participants`,
      { token: s.member.token, body: { personIds: [s.memberPerson.id] } },
    );
    expect(memberAdd.status).toBe(403);

    const rsvp = await t.request(
      'PATCH',
      `/api/churches/${s.church.id}/events/${churchEventId}/participants/${s.memberPerson.id}`,
      { token: s.member.token, body: { status: 'going' } },
    );
    expect(rsvp.status).toBe(200);
    expect(rsvp.json.event.participantCount).toBe(3);

    const rsvpOther = await t.request(
      'PATCH',
      `/api/churches/${s.church.id}/events/${churchEventId}/participants/${s.bob.id}`,
      { token: s.member.token, body: { status: 'going' } },
    );
    expect(rsvpOther.status).toBe(403);

    const detail = await t.request('GET', `/api/churches/${s.church.id}/events/${churchEventId}`, {
      token: s.member.token,
    });
    expect(detail.status).toBe(200);
    expect(detail.json.participants).toHaveLength(3);
    expect(detail.json.canManage).toBe(false);
    expect(detail.json.canRecordAttendance).toBe(false);

    const removed = await t.request(
      'DELETE',
      `/api/churches/${s.church.id}/events/${churchEventId}/participants/${s.bob.id}`,
      { token: s.admin.token },
    );
    expect(removed.json.event.participantCount).toBe(2);

    // Leader can edit their group event but cannot move it church-wide.
    const move = await t.request('PATCH', `/api/churches/${s.church.id}/events/${groupEventId}`, {
      token: s.leader.token,
      body: { title: 'Youth Night', startsAt: inDays(3), groupId: null },
    });
    expect(move.status).toBe(403);
    const edit = await t.request('PATCH', `/api/churches/${s.church.id}/events/${groupEventId}`, {
      token: s.leader.token,
      body: { title: 'Youth Night!', startsAt: inDays(3), groupId: s.group.id },
    });
    expect(edit.status).toBe(200);
    expect(edit.json.event.title).toBe('Youth Night!');
  });

  it('records attendance with scoped visibility', async () => {
    // Session from the church-wide event: admin only.
    const leaderChurchSession = await t.request(
      'POST',
      `/api/churches/${s.church.id}/attendance/sessions`,
      {
        token: s.leader.token,
        body: { title: 'Service', eventId: churchEventId, sessionAt: inDays(2) },
      },
    );
    expect(leaderChurchSession.status).toBe(403);

    const churchSession = await t.request(
      'POST',
      `/api/churches/${s.church.id}/attendance/sessions`,
      {
        token: s.admin.token,
        body: { title: 'Sunday Service', eventId: churchEventId, sessionAt: inDays(2) },
      },
    );
    expect(churchSession.status).toBe(201);
    // Roster is seeded from the event participants.
    expect(churchSession.json.records.map((r: { id: string }) => r.id).sort()).toEqual(
      [s.alice.id, s.memberPerson.id].sort(),
    );

    // Session from the group event: leader allowed, group derived from the event.
    const groupSession = await t.request(
      'POST',
      `/api/churches/${s.church.id}/attendance/sessions`,
      {
        token: s.leader.token,
        body: { title: 'Youth Night', eventId: groupEventId, sessionAt: inDays(3) },
      },
    );
    expect(groupSession.status).toBe(201);
    expect(groupSession.json.session.groupId).toBe(s.group.id);
    expect(groupSession.json.records.map((r: { id: string }) => r.id)).toEqual([s.alice.id]);

    const save = await t.request(
      'PUT',
      `/api/churches/${s.church.id}/attendance/sessions/${groupSession.json.session.id}/records`,
      {
        token: s.leader.token,
        body: {
          records: [
            { personId: s.alice.id, status: 'present' },
            { personId: s.bob.id, status: 'excused', note: 'Sick' },
          ],
        },
      },
    );
    expect(save.status).toBe(200);
    expect(save.json.session.presentCount).toBe(1);
    expect(save.json.session.excusedCount).toBe(1);
    expect(save.json.session.totalCount).toBe(2);
    expect(save.json.records.find((r: { id: string }) => r.id === s.bob.id).note).toBe('Sick');

    // Clearing a record removes it.
    const clear = await t.request(
      'PUT',
      `/api/churches/${s.church.id}/attendance/sessions/${groupSession.json.session.id}/records`,
      { token: s.leader.token, body: { records: [{ personId: s.bob.id, status: null }] } },
    );
    expect(clear.json.session.totalCount).toBe(1);

    // Members cannot view sessions; leaders only their groups'.
    expect(
      (
        await t.request(
          'GET',
          `/api/churches/${s.church.id}/attendance/sessions/${groupSession.json.session.id}`,
          { token: s.member.token },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await t.request(
          'GET',
          `/api/churches/${s.church.id}/attendance/sessions/${churchSession.json.session.id}`,
          { token: s.leader.token },
        )
      ).status,
    ).toBe(403);
    const leaderList = await t.request('GET', `/api/churches/${s.church.id}/attendance/sessions`, {
      token: s.leader.token,
    });
    expect(leaderList.json.total).toBe(1);
    const adminList = await t.request('GET', `/api/churches/${s.church.id}/attendance/sessions`, {
      token: s.admin.token,
    });
    expect(adminList.json.total).toBe(2);
    expect(
      (
        await t.request('GET', `/api/churches/${s.church.id}/attendance/sessions`, {
          token: s.member.token,
        })
      ).status,
    ).toBe(403);

    // Members see their own attendance.
    const mark = await t.request(
      'PUT',
      `/api/churches/${s.church.id}/attendance/sessions/${churchSession.json.session.id}/records`,
      {
        token: s.admin.token,
        body: { records: [{ personId: s.memberPerson.id, status: 'present' }] },
      },
    );
    expect(mark.status).toBe(200);
    const mine = await t.request('GET', `/api/churches/${s.church.id}/attendance/me`, {
      token: s.member.token,
    });
    expect(mine.json.items).toHaveLength(1);
    expect(mine.json.items[0].status).toBe('present');
    const personHistory = await t.request(
      'GET',
      `/api/churches/${s.church.id}/people/${s.memberPerson.id}/attendance`,
      { token: s.member.token },
    );
    expect(personHistory.json.items).toHaveLength(1);
    const otherHistory = await t.request(
      'GET',
      `/api/churches/${s.church.id}/people/${s.alice.id}/attendance`,
      { token: s.member.token },
    );
    expect(otherHistory.status).toBe(403);
    const leaderHistory = await t.request(
      'GET',
      `/api/churches/${s.church.id}/people/${s.alice.id}/attendance`,
      { token: s.leader.token },
    );
    expect(leaderHistory.status).toBe(200);

    const eventDetail = await t.request(
      'GET',
      `/api/churches/${s.church.id}/events/${groupEventId}`,
      {
        token: s.leader.token,
      },
    );
    expect(eventDetail.json.sessions).toHaveLength(1);
    expect(eventDetail.json.canRecordAttendance).toBe(true);

    const deleted = await t.request(
      'DELETE',
      `/api/churches/${s.church.id}/attendance/sessions/${groupSession.json.session.id}`,
      { token: s.leader.token },
    );
    expect(deleted.status).toBe(200);
  });

  it('publishes announcements with draft visibility rules', async () => {
    const memberPost = await t.request('POST', `/api/churches/${s.church.id}/announcements`, {
      token: s.member.token,
      body: { title: 'Hello', body: 'World', status: 'published' },
    });
    expect(memberPost.status).toBe(403);

    const leaderChurchWide = await t.request('POST', `/api/churches/${s.church.id}/announcements`, {
      token: s.leader.token,
      body: { title: 'Hello', body: 'World', status: 'published' },
    });
    expect(leaderChurchWide.status).toBe(403);

    const draft = await t.request('POST', `/api/churches/${s.church.id}/announcements`, {
      token: s.admin.token,
      body: { title: 'Draft news', body: 'Not yet', status: 'draft' },
    });
    expect(draft.status).toBe(201);
    expect(draft.json.announcement.publishedAt).toBeNull();

    const published = await t.request('POST', `/api/churches/${s.church.id}/announcements`, {
      token: s.admin.token,
      body: { title: 'Big news', body: 'Published', status: 'published' },
    });
    expect(published.status).toBe(201);
    expect(published.json.announcement.publishedAt).toBeString();

    const leaderDraft = await t.request('POST', `/api/churches/${s.church.id}/announcements`, {
      token: s.leader.token,
      body: { title: 'Youth draft', body: 'Soon', status: 'draft', groupId: s.group.id },
    });
    expect(leaderDraft.status).toBe(201);

    const memberList = await t.request('GET', `/api/churches/${s.church.id}/announcements`, {
      token: s.member.token,
    });
    expect(memberList.json.items.map((a: { title: string }) => a.title)).toEqual(['Big news']);
    const leaderList = await t.request('GET', `/api/churches/${s.church.id}/announcements`, {
      token: s.leader.token,
    });
    expect(leaderList.json.items.map((a: { title: string }) => a.title).sort()).toEqual(
      ['Big news', 'Youth draft'].sort(),
    );
    const adminList = await t.request('GET', `/api/churches/${s.church.id}/announcements`, {
      token: s.admin.token,
    });
    expect(adminList.json.total).toBe(3);

    expect(
      (
        await t.request(
          'GET',
          `/api/churches/${s.church.id}/announcements/${draft.json.announcement.id}`,
          {
            token: s.member.token,
          },
        )
      ).status,
    ).toBe(404);

    const publish = await t.request(
      'PATCH',
      `/api/churches/${s.church.id}/announcements/${draft.json.announcement.id}`,
      {
        token: s.admin.token,
        body: { title: 'Draft news', body: 'Now live', status: 'published' },
      },
    );
    expect(publish.status).toBe(200);
    expect(publish.json.announcement.publishedAt).toBeString();
    const visible = await t.request(
      'GET',
      `/api/churches/${s.church.id}/announcements/${draft.json.announcement.id}`,
      { token: s.member.token },
    );
    expect(visible.status).toBe(200);
    expect(visible.json.canManage).toBe(false);

    expect(
      (
        await t.request(
          'DELETE',
          `/api/churches/${s.church.id}/announcements/${published.json.announcement.id}`,
          { token: s.leader.token },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await t.request(
          'DELETE',
          `/api/churches/${s.church.id}/announcements/${leaderDraft.json.announcement.id}`,
          { token: s.leader.token },
        )
      ).status,
    ).toBe(200);
  });

  it('serves the dashboard', async () => {
    const dashboard = await t.request('GET', `/api/churches/${s.church.id}/dashboard`, {
      token: s.member.token,
    });
    expect(dashboard.status).toBe(200);
    expect(dashboard.json.stats.people).toBe(3);
    expect(dashboard.json.stats.members).toBe(4);
    expect(dashboard.json.stats.upcomingEvents).toBe(2);
    expect(dashboard.json.upcomingEvents).toHaveLength(2);
    expect(
      dashboard.json.recentAnnouncements.every((a: { status: string }) => a.status === 'published'),
    ).toBe(true);
    const leaderDashboard = await t.request('GET', `/api/churches/${s.church.id}/dashboard`, {
      token: s.leader.token,
    });
    expect(leaderDashboard.json.myGroups).toEqual([
      { id: s.group.id, name: 'Youth Ministry', type: 'ministry', isLeader: true },
    ]);
  });
});
