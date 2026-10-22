import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from './helpers';
import { seedPeople, type Account, type PeopleSeed } from './people-fixtures';

describe('groups: schedule, visibility, join requests and leader tools', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: PeopleSeed;
  let joiner: Account;
  let joinerPerson: { id: string };
  let coordinator: Account;
  let choir: { id: string };

  beforeAll(async () => {
    s = await seedPeople(t);
    joiner = await t.register('Joiner');
    await t.join(joiner.token, s.invitation.token);
    joinerPerson = await s.linkedPerson(joiner, { firstName: 'Lukas', phone: '0812 7777' });
    coordinator = await s.memberWithRole('Koordinator pelayanan', [
      'groups.create',
      'groups.manage',
    ]);
  });

  it('creates groups with schedule, capacity, cover colour and visibility', async () => {
    const invalid = await t.request('POST', `${s.base}/groups`, {
      token: coordinator.token,
      body: { name: 'Paduan Suara', meetingTime: '25:00', meetingDay: 9 },
    });
    expect(invalid.status).toBe(422);
    expect(invalid.json.error.issues.map((issue: { path: string }) => issue.path).sort()).toEqual([
      'meetingDay',
      'meetingTime',
    ]);
    const created = await t.request('POST', `${s.base}/groups`, {
      token: coordinator.token,
      body: {
        name: 'Paduan Suara Efrata',
        type: 'choir',
        meetingDay: 6,
        meetingTime: '16:00',
        meetingFrequency: 'weekly',
        location: 'Ruang serbaguna',
        capacity: 2,
        coverColor: '#b45309',
      },
    });
    expect(created.status).toBe(201);
    choir = created.json.group;
    expect(created.json.group).toMatchObject({
      type: 'choir',
      meetingDay: 6,
      meetingTime: '16:00',
      visibility: 'public',
      joinPolicy: 'request',
      myState: 'none',
      memberCount: 0,
    });
    const memberDenied = await t.request('POST', `${s.base}/groups`, {
      token: s.member.token,
      body: { name: 'Nope' },
    });
    expect(memberDenied.status).toBe(403);

    // A partial update leaves the other fields alone.
    const patched = await t.request('PATCH', `${s.base}/groups/${choir.id}`, {
      token: coordinator.token,
      body: { location: 'Gedung gereja lt. 2' },
    });
    expect(patched.status).toBe(200);
    expect(patched.json.group).toMatchObject({
      location: 'Gedung gereja lt. 2',
      meetingTime: '16:00',
    });

    const byType = await t.request('GET', `${s.base}/groups?type=choir`, { token: s.member.token });
    expect(byType.json.items.map((group: { id: string }) => group.id)).toEqual([choir.id]);
  });

  it('hides private groups from people outside them', async () => {
    const secret = await t.request('POST', `${s.base}/groups`, {
      token: s.owner.token,
      body: { name: 'Tim Pastoral', visibility: 'private', type: 'committee' },
    });
    const id = secret.json.group.id;
    const memberList = await t.request('GET', `${s.base}/groups`, { token: s.member.token });
    expect(memberList.json.items.map((group: { id: string }) => group.id)).not.toContain(id);
    expect(
      (await t.request('GET', `${s.base}/groups/${id}`, { token: s.member.token })).status,
    ).toBe(404);
    expect(
      (
        await t.request('POST', `${s.base}/groups/${id}/join-requests`, {
          token: s.member.token,
          body: {},
        })
      ).status,
    ).toBe(404);
    await t.request('POST', `${s.base}/groups/${id}/members`, {
      token: s.owner.token,
      body: { personIds: [s.memberPerson.id] },
    });
    const asMember = await t.request('GET', `${s.base}/groups/${id}`, { token: s.member.token });
    expect(asMember.status).toBe(200);
    expect(asMember.json.group.myState).toBe('member');
    expect(asMember.json.canLeave).toBe(true);
    // Private groups do not show up on other people's profiles either.
    const profile = await t.request('GET', `${s.base}/people/${s.memberPerson.id}`, {
      token: s.leader.token,
    });
    expect(profile.json.groups.map((group: { id: string }) => group.id)).not.toContain(id);
    const mine = await t.request('GET', `${s.base}/groups?mine=true`, { token: s.member.token });
    expect(mine.json.items.map((group: { id: string }) => group.id)).toEqual([id]);
  });

  it('handles a join request from request to approval with notifications', async () => {
    const message = 'Saya ingin melayani di paduan suara';
    const request = await t.request('POST', `${s.base}/groups/${choir.id}/join-requests`, {
      token: joiner.token,
      body: { message },
    });
    expect(request.status).toBe(201);
    expect(request.json.request).toMatchObject({ status: 'pending', message });
    const twice = await t.request('POST', `${s.base}/groups/${choir.id}/join-requests`, {
      token: joiner.token,
      body: {},
    });
    expect(twice.status).toBe(403);

    // The choir has no leader yet, so people with groups.manage hear about it.
    const coordinatorNotes = await s.notificationsOf(coordinator.token);
    expect(coordinatorNotes.some((note) => note.type === 'group.join_requested')).toBe(true);

    const page = await t.request('GET', `${s.base}/groups/${choir.id}`, { token: joiner.token });
    expect(page.json.group.myState).toBe('pending');
    expect(page.json.myRequest.status).toBe('pending');
    expect(page.json.joinRequests).toEqual([]);
    expect(page.json.canRequestToJoin).toBe(false);

    const managerPage = await t.request('GET', `${s.base}/groups/${choir.id}`, {
      token: coordinator.token,
    });
    expect(managerPage.json.joinRequests).toHaveLength(1);
    expect(managerPage.json.group.pendingRequestCount).toBe(1);
    const inbox = await t.request('GET', `${s.base}/groups/join-requests`, {
      token: coordinator.token,
    });
    expect(inbox.json.items).toHaveLength(1);
    const me = await t.request('GET', `${s.base}/directory/me`, { token: coordinator.token });
    expect(me.json.pendingJoinRequests).toBe(1);

    const memberDecides = await t.request(
      'POST',
      `${s.base}/groups/${choir.id}/join-requests/${request.json.request.id}/decision`,
      { token: s.member.token, body: { decision: 'approved' } },
    );
    expect(memberDecides.status).toBe(403);
    const wrongGroup = await t.request(
      'POST',
      `${s.base}/groups/${s.group.id}/join-requests/${request.json.request.id}/decision`,
      { token: s.owner.token, body: { decision: 'approved' } },
    );
    expect(wrongGroup.status).toBe(404);
    const approve = await t.request(
      'POST',
      `${s.base}/groups/${choir.id}/join-requests/${request.json.request.id}/decision`,
      { token: coordinator.token, body: { decision: 'approved', note: 'Latihan Sabtu jam 4' } },
    );
    expect(approve.status).toBe(200);
    expect(approve.json.request.status).toBe('approved');
    const again = await t.request(
      'POST',
      `${s.base}/groups/${choir.id}/join-requests/${request.json.request.id}/decision`,
      { token: coordinator.token, body: { decision: 'declined' } },
    );
    expect(again.status).toBe(409);

    const joined = await t.request('GET', `${s.base}/groups/${choir.id}`, { token: joiner.token });
    expect(joined.json.group.myState).toBe('member');
    expect(joined.json.members.map((member: { id: string }) => member.id)).toEqual([
      joinerPerson.id,
    ]);
    const joinerNotes = await s.notificationsOf(joiner.token);
    expect(joinerNotes.find((note) => note.type === 'group.join_decided')?.title).toContain(
      'Welcome',
    );
  });

  it('declines, cancels and respects capacity and closed groups', async () => {
    const request = await t.request('POST', `${s.base}/groups/${choir.id}/join-requests`, {
      token: s.member.token,
      body: {},
    });
    expect(request.status).toBe(201);
    const cancel = await t.request('DELETE', `${s.base}/groups/${choir.id}/join-requests/mine`, {
      token: s.member.token,
    });
    expect(cancel.json.request.status).toBe('cancelled');
    const cancelAgain = await t.request(
      'DELETE',
      `${s.base}/groups/${choir.id}/join-requests/mine`,
      { token: s.member.token },
    );
    expect(cancelAgain.status).toBe(404);

    const second = await t.request('POST', `${s.base}/groups/${choir.id}/join-requests`, {
      token: s.member.token,
      body: {},
    });
    const decline = await t.request(
      'POST',
      `${s.base}/groups/${choir.id}/join-requests/${second.json.request.id}/decision`,
      { token: coordinator.token, body: { decision: 'declined', note: 'Kuota penuh' } },
    );
    expect(decline.json.request.status).toBe('declined');
    const notes = await s.notificationsOf(s.member.token);
    expect(notes.find((note) => note.type === 'group.join_decided')?.title).toContain('declined');

    // Fill the choir (capacity 2) and check both the request and the direct add.
    await t.request('POST', `${s.base}/groups/${choir.id}/members`, {
      token: coordinator.token,
      body: { personIds: [s.bob.id] },
    });
    const full = await t.request('POST', `${s.base}/groups/${choir.id}/join-requests`, {
      token: s.member.token,
      body: {},
    });
    expect(full.status).toBe(409);
    const overAdd = await t.request('POST', `${s.base}/groups/${choir.id}/members`, {
      token: coordinator.token,
      body: { personIds: [s.alice.id] },
    });
    expect(overAdd.status).toBe(409);
    const shrink = await t.request('PATCH', `${s.base}/groups/${choir.id}`, {
      token: coordinator.token,
      body: { capacity: 1 },
    });
    expect(shrink.status).toBe(409);

    const closed = await t.request('PATCH', `${s.base}/groups/${s.otherGroup.id}`, {
      token: s.owner.token,
      body: { joinPolicy: 'closed' },
    });
    expect(closed.json.group.joinPolicy).toBe('closed');
    const closedRequest = await t.request(
      'POST',
      `${s.base}/groups/${s.otherGroup.id}/join-requests`,
      {
        token: s.member.token,
        body: {},
      },
    );
    expect(closedRequest.status).toBe(403);
  });

  it('lets leaders decide, export the roster and members leave', async () => {
    // The seed leader leads Youth Ministry; requests now go to them, not to every manager.
    const request = await t.request('POST', `${s.base}/groups/${s.group.id}/join-requests`, {
      token: joiner.token,
      body: {},
    });
    expect(request.status).toBe(201);
    const leaderNotes = await s.notificationsOf(s.leader.token);
    expect(leaderNotes.some((note) => note.type === 'group.join_requested')).toBe(true);
    const list = await t.request('GET', `${s.base}/groups/${s.group.id}/join-requests`, {
      token: s.leader.token,
    });
    expect(list.json.items).toHaveLength(1);
    expect(
      (
        await t.request('GET', `${s.base}/groups/${s.group.id}/join-requests`, {
          token: s.member.token,
        })
      ).status,
    ).toBe(403);

    // Adding someone directly approves their pending request and tells them.
    const add = await t.request('POST', `${s.base}/groups/${s.group.id}/members`, {
      token: s.leader.token,
      body: { personIds: [joinerPerson.id] },
    });
    expect(add.status).toBe(200);
    const approved = await t.request(
      'GET',
      `${s.base}/groups/${s.group.id}/join-requests?status=approved`,
      { token: s.leader.token },
    );
    expect(approved.json.items).toHaveLength(1);
    const joinerNotes = await s.notificationsOf(joiner.token);
    expect(joinerNotes.some((note) => note.type === 'group.member_added')).toBe(true);

    const roster = await t.app.handle(
      new Request(`http://localhost${s.base}/groups/${s.group.id}/roster`, {
        headers: { authorization: `Bearer ${s.leader.token}` },
      }),
    );
    expect(roster.status).toBe(200);
    const csv = await roster.text();
    expect(csv).toContain('Lukas');
    expect(csv).toContain('0812 7777');
    expect(
      (await t.request('GET', `${s.base}/groups/${s.group.id}/roster`, { token: s.member.token }))
        .status,
    ).toBe(403);
    const audit = await s.auditActions('&action=group.roster_export');
    expect(audit).toHaveLength(1);

    const leave = await t.request('POST', `${s.base}/groups/${s.group.id}/leave`, {
      token: joiner.token,
    });
    expect(leave.status).toBe(200);
    const leaveAgain = await t.request('POST', `${s.base}/groups/${s.group.id}/leave`, {
      token: joiner.token,
    });
    expect(leaveAgain.status).toBe(404);

    const page = await t.request('GET', `${s.base}/groups/${s.group.id}`, {
      token: s.leader.token,
    });
    expect(page.json.canManage).toBe(true);
    expect(page.json.canExport).toBe(true);
    expect(page.json.stats.attendance).toEqual({ sessions: 0, rate: null, lastSessionAt: null });
    expect(page.json.stats.upcomingEvents).toEqual([]);
    const memberPage = await t.request('GET', `${s.base}/groups/${s.group.id}`, {
      token: s.member.token,
    });
    expect(memberPage.json.stats.attendance).toBeNull();
    expect(memberPage.json.canExport).toBe(false);
  });

  it('notifies new leaders and refuses another church', async () => {
    const assign = await t.request('POST', `${s.base}/groups/${choir.id}/leaders`, {
      token: s.owner.token,
      body: { userId: s.member.user.id },
    });
    expect(assign.status).toBe(200);
    const notes = await s.notificationsOf(s.member.token);
    expect(notes.some((note) => note.type === 'group.leader_assigned')).toBe(true);

    for (const [method, path, body] of [
      ['GET', `/groups/${s.other.group.id}`, undefined],
      ['PATCH', `/groups/${s.other.group.id}`, { name: 'Komisi X' }],
      ['POST', `/groups/${s.other.group.id}/join-requests`, {}],
      ['POST', `/groups/${s.other.group.id}/members`, { personIds: [s.alice.id] }],
      ['GET', `/groups/${s.other.group.id}/roster`, undefined],
    ] as const) {
      const response = await t.request(method, `${s.base}${path}`, { token: s.owner.token, body });
      expect(response.status).toBe(404);
    }
    const foreignPerson = await t.request('POST', `${s.base}/groups/${choir.id}/members`, {
      token: s.owner.token,
      body: { personIds: [s.other.person.id] },
    });
    expect(foreignPerson.status).toBe(404);
  });
});
