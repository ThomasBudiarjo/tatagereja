import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp, seedChurch } from './helpers';

describe('people and groups', () => {
  const t = createTestApp();
  let s: Awaited<ReturnType<typeof seedChurch>>;
  beforeAll(async () => {
    s = await seedChurch(t);
  });
  afterAll(() => t.close());

  it('lists, searches and paginates the directory for every member', async () => {
    const list = await t.request('GET', `/api/churches/${s.church.id}/people`, {
      token: s.member.token,
    });
    expect(list.status).toBe(200);
    expect(list.json.total).toBe(3);
    expect(list.json.items.map((p: { firstName: string }) => p.firstName)).toEqual([
      'Alice',
      'Bob',
      'Mem',
    ]);

    const search = await t.request('GET', `/api/churches/${s.church.id}/people?q=ali`, {
      token: s.member.token,
    });
    expect(search.json.total).toBe(1);

    const page = await t.request('GET', `/api/churches/${s.church.id}/people?page=2&limit=2`, {
      token: s.member.token,
    });
    expect(page.json.items).toHaveLength(1);

    const byGroup = await t.request(
      'GET',
      `/api/churches/${s.church.id}/people?groupId=${s.group.id}`,
      { token: s.member.token },
    );
    expect(byGroup.json.items.map((p: { id: string }) => p.id)).toEqual([s.alice.id]);

    const badQuery = await t.request('GET', `/api/churches/${s.church.id}/people?limit=0`, {
      token: s.member.token,
    });
    expect(badQuery.status).toBe(422);
  });

  it('only administrators can create and delete people', async () => {
    const denied = await t.request('POST', `/api/churches/${s.church.id}/people`, {
      token: s.member.token,
      body: { firstName: 'Nope' },
    });
    expect(denied.status).toBe(403);
    const leaderDenied = await t.request('POST', `/api/churches/${s.church.id}/people`, {
      token: s.leader.token,
      body: { firstName: 'Nope' },
    });
    expect(leaderDenied.status).toBe(403);

    const created = await t.request('POST', `/api/churches/${s.church.id}/people`, {
      token: s.admin.token,
      body: {
        firstName: 'Carol',
        email: 'Carol@Example.com',
        birthDate: '1990-05-04',
        membershipStatus: 'member',
      },
    });
    expect(created.status).toBe(201);
    expect(created.json.person.email).toBe('carol@example.com');

    const invalid = await t.request('POST', `/api/churches/${s.church.id}/people`, {
      token: s.admin.token,
      body: { firstName: 'Bad', birthDate: '04/05/1990', gender: 'x' },
    });
    expect(invalid.status).toBe(422);

    const deleteDenied = await t.request(
      'DELETE',
      `/api/churches/${s.church.id}/people/${created.json.person.id}`,
      { token: s.leader.token },
    );
    expect(deleteDenied.status).toBe(403);
    const deleted = await t.request(
      'DELETE',
      `/api/churches/${s.church.id}/people/${created.json.person.id}`,
      { token: s.admin.token },
    );
    expect(deleted.status).toBe(200);
  });

  it('applies the edit matrix: admin, self, and assigned group leader', async () => {
    // Leader can edit Alice (in their group) but not Bob.
    const leaderEditsAlice = await t.request(
      'PATCH',
      `/api/churches/${s.church.id}/people/${s.alice.id}`,
      {
        token: s.leader.token,
        body: { firstName: 'Alice', lastName: 'Smyth', membershipStatus: 'member' },
      },
    );
    expect(leaderEditsAlice.status).toBe(200);
    expect(leaderEditsAlice.json.person.lastName).toBe('Smyth');
    // Non-admin editors cannot change administrative fields.
    expect(leaderEditsAlice.json.person.membershipStatus).toBe('visitor');

    const leaderEditsBob = await t.request(
      'PATCH',
      `/api/churches/${s.church.id}/people/${s.bob.id}`,
      {
        token: s.leader.token,
        body: { firstName: 'Bob' },
      },
    );
    expect(leaderEditsBob.status).toBe(403);

    // Member can edit their own linked profile but nobody else.
    const selfEdit = await t.request(
      'PATCH',
      `/api/churches/${s.church.id}/people/${s.memberPerson.id}`,
      { token: s.member.token, body: { firstName: 'Mem', phone: '+62 812 0000' } },
    );
    expect(selfEdit.status).toBe(200);
    expect(selfEdit.json.person.phone).toBe('+62 812 0000');
    const otherEdit = await t.request('PATCH', `/api/churches/${s.church.id}/people/${s.bob.id}`, {
      token: s.member.token,
      body: { firstName: 'Bob' },
    });
    expect(otherEdit.status).toBe(403);

    const adminEdit = await t.request('PATCH', `/api/churches/${s.church.id}/people/${s.bob.id}`, {
      token: s.admin.token,
      body: { firstName: 'Bob', membershipStatus: 'member', joinedAt: '2020-01-01' },
    });
    expect(adminEdit.status).toBe(200);
    expect(adminEdit.json.person.membershipStatus).toBe('member');
  });

  it('protects private details', async () => {
    const saved = await t.request(
      'PUT',
      `/api/churches/${s.church.id}/people/${s.bob.id}/private`,
      {
        token: s.admin.token,
        body: {
          maritalStatus: 'married',
          emergencyContactName: 'Jane',
          medicalNotes: 'Allergic to nuts',
        },
      },
    );
    expect(saved.status).toBe(200);
    expect(saved.json.privateDetails.maritalStatus).toBe('married');

    const adminView = await t.request('GET', `/api/churches/${s.church.id}/people/${s.bob.id}`, {
      token: s.admin.token,
    });
    expect(adminView.json.canViewPrivate).toBe(true);
    expect(adminView.json.privateDetails.medicalNotes).toBe('Allergic to nuts');

    const memberView = await t.request('GET', `/api/churches/${s.church.id}/people/${s.bob.id}`, {
      token: s.member.token,
    });
    expect(memberView.status).toBe(200);
    expect(memberView.json.canViewPrivate).toBe(false);
    expect(memberView.json.privateDetails).toBeNull();
    expect(memberView.json.canEdit).toBe(false);

    // Group leaders do not see private details either.
    const leaderView = await t.request('GET', `/api/churches/${s.church.id}/people/${s.alice.id}`, {
      token: s.leader.token,
    });
    expect(leaderView.json.canEdit).toBe(true);
    expect(leaderView.json.canViewPrivate).toBe(false);

    const memberWrite = await t.request(
      'PUT',
      `/api/churches/${s.church.id}/people/${s.bob.id}/private`,
      { token: s.member.token, body: { maritalStatus: 'single' } },
    );
    expect(memberWrite.status).toBe(403);

    // A member can manage their own private details.
    const selfWrite = await t.request(
      'PUT',
      `/api/churches/${s.church.id}/people/${s.memberPerson.id}/private`,
      { token: s.member.token, body: { maritalStatus: 'single', baptismDate: '2010-04-04' } },
    );
    expect(selfWrite.status).toBe(200);
    const selfView = await t.request(
      'GET',
      `/api/churches/${s.church.id}/people/${s.memberPerson.id}`,
      { token: s.member.token },
    );
    expect(selfView.json.privateDetails.baptismDate).toBe('2010-04-04');
    expect(selfView.json.linkedUser.id).toBe(s.member.user.id);
  });

  it('links accounts to people with conflict protection', async () => {
    const conflict = await t.request(
      'PUT',
      `/api/churches/${s.church.id}/people/${s.bob.id}/user`,
      {
        token: s.admin.token,
        body: { userId: s.member.user.id },
      },
    );
    expect(conflict.status).toBe(409);
    const notMember = await t.request(
      'PUT',
      `/api/churches/${s.church.id}/people/${s.bob.id}/user`,
      {
        token: s.admin.token,
        body: { userId: crypto.randomUUID() },
      },
    );
    expect(notMember.status).toBe(404);
    const denied = await t.request('PUT', `/api/churches/${s.church.id}/people/${s.bob.id}/user`, {
      token: s.leader.token,
      body: { userId: s.leader.user.id },
    });
    expect(denied.status).toBe(403);
    const linked = await t.request('PUT', `/api/churches/${s.church.id}/people/${s.bob.id}/user`, {
      token: s.admin.token,
      body: { userId: s.leader.user.id },
    });
    expect(linked.status).toBe(200);
    expect(linked.json.person.userId).toBe(s.leader.user.id);
    const unlinked = await t.request(
      'PUT',
      `/api/churches/${s.church.id}/people/${s.bob.id}/user`,
      {
        token: s.admin.token,
        body: { userId: null },
      },
    );
    expect(unlinked.json.person.userId).toBeNull();
  });

  it('manages groups, members and leaders according to the matrix', async () => {
    const list = await t.request('GET', `/api/churches/${s.church.id}/groups`, {
      token: s.member.token,
    });
    expect(list.status).toBe(200);
    expect(list.json.items).toHaveLength(2);
    const youth = list.json.items.find((g: { id: string }) => g.id === s.group.id);
    expect(youth.memberCount).toBe(1);
    expect(youth.leaders.map((l: { userId: string }) => l.userId)).toEqual([s.leader.user.id]);

    expect(
      (
        await t.request('POST', `/api/churches/${s.church.id}/groups`, {
          token: s.leader.token,
          body: { name: 'New group' },
        })
      ).status,
    ).toBe(403);

    // Leader can edit and add members to their own group only.
    const edit = await t.request('PATCH', `/api/churches/${s.church.id}/groups/${s.group.id}`, {
      token: s.leader.token,
      body: { name: 'Youth Ministry', description: 'Ages 13-18', type: 'ministry' },
    });
    expect(edit.status).toBe(200);
    expect(edit.json.group.description).toBe('Ages 13-18');
    expect(
      (
        await t.request('PATCH', `/api/churches/${s.church.id}/groups/${s.otherGroup.id}`, {
          token: s.leader.token,
          body: { name: 'Choir 2' },
        })
      ).status,
    ).toBe(403);

    const addMembers = await t.request(
      'POST',
      `/api/churches/${s.church.id}/groups/${s.group.id}/members`,
      {
        token: s.leader.token,
        body: { personIds: [s.bob.id, s.alice.id] },
      },
    );
    expect(addMembers.status).toBe(200);
    expect(addMembers.json.group.memberCount).toBe(2);

    const unknownPerson = await t.request(
      'POST',
      `/api/churches/${s.church.id}/groups/${s.group.id}/members`,
      { token: s.leader.token, body: { personIds: [crypto.randomUUID()] } },
    );
    expect(unknownPerson.status).toBe(404);

    const detail = await t.request('GET', `/api/churches/${s.church.id}/groups/${s.group.id}`, {
      token: s.member.token,
    });
    expect(detail.status).toBe(200);
    expect(detail.json.members).toHaveLength(2);
    expect(detail.json.canManage).toBe(false);
    const leaderDetail = await t.request(
      'GET',
      `/api/churches/${s.church.id}/groups/${s.group.id}`,
      {
        token: s.leader.token,
      },
    );
    expect(leaderDetail.json.canManage).toBe(true);
    expect(leaderDetail.json.canDelete).toBe(false);
    expect(leaderDetail.json.canAssignLeaders).toBe(false);

    const remove = await t.request(
      'DELETE',
      `/api/churches/${s.church.id}/groups/${s.group.id}/members/${s.bob.id}`,
      { token: s.leader.token },
    );
    expect(remove.status).toBe(200);
    const removeAgain = await t.request(
      'DELETE',
      `/api/churches/${s.church.id}/groups/${s.group.id}/members/${s.bob.id}`,
      { token: s.leader.token },
    );
    expect(removeAgain.status).toBe(404);

    // Leader assignment is admin-only and requires a church member.
    expect(
      (
        await t.request('POST', `/api/churches/${s.church.id}/groups/${s.group.id}/leaders`, {
          token: s.leader.token,
          body: { userId: s.member.user.id },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await t.request('POST', `/api/churches/${s.church.id}/groups/${s.group.id}/leaders`, {
          token: s.admin.token,
          body: { userId: crypto.randomUUID() },
        })
      ).status,
    ).toBe(404);
    const assigned = await t.request(
      'POST',
      `/api/churches/${s.church.id}/groups/${s.group.id}/leaders`,
      {
        token: s.admin.token,
        body: { userId: s.member.user.id },
      },
    );
    expect(assigned.json.group.leaders).toHaveLength(2);
    const memberContext = await t.request('GET', `/api/churches/${s.church.id}`, {
      token: s.member.token,
    });
    expect(memberContext.json.access.leaderGroupIds).toEqual([s.group.id]);
    const unassigned = await t.request(
      'DELETE',
      `/api/churches/${s.church.id}/groups/${s.group.id}/leaders/${s.member.user.id}`,
      { token: s.admin.token },
    );
    expect(unassigned.json.group.leaders).toHaveLength(1);

    // Inactive groups are hidden by default.
    const deactivate = await t.request(
      'PATCH',
      `/api/churches/${s.church.id}/groups/${s.otherGroup.id}`,
      {
        token: s.admin.token,
        body: { name: 'Choir', isActive: false },
      },
    );
    expect(deactivate.status).toBe(200);
    const active = await t.request('GET', `/api/churches/${s.church.id}/groups`, {
      token: s.member.token,
    });
    expect(active.json.items).toHaveLength(1);
    const all = await t.request('GET', `/api/churches/${s.church.id}/groups?includeInactive=true`, {
      token: s.member.token,
    });
    expect(all.json.items).toHaveLength(2);

    expect(
      (
        await t.request('DELETE', `/api/churches/${s.church.id}/groups/${s.otherGroup.id}`, {
          token: s.leader.token,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await t.request('DELETE', `/api/churches/${s.church.id}/groups/${s.otherGroup.id}`, {
          token: s.admin.token,
        })
      ).status,
    ).toBe(200);
  });
});
