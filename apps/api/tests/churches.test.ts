import { afterAll, describe, expect, it } from 'bun:test';
import { createTestApp } from './helpers';

describe('churches, memberships and invitations', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('creates a church and makes the creator the owner', async () => {
    const owner = await t.register('Owner');
    const created = await t.request('POST', '/api/churches', {
      token: owner.token,
      body: {
        name: 'Hope Church',
        city: 'Jakarta',
        email: 'Hello@Hope.org',
        brandColor: '#123abc',
      },
    });
    expect(created.status).toBe(201);
    expect(created.json.church.email).toBe('hello@hope.org');

    const context = await t.request('GET', `/api/churches/${created.json.church.id}`, {
      token: owner.token,
    });
    expect(context.status).toBe(200);
    expect(context.json.access.role).toBe('owner');
    expect(context.json.memberCount).toBe(1);
    expect(context.json.church.ownerUserId).toBe(owner.user.id);

    const mine = await t.request('GET', '/api/churches', { token: owner.token });
    expect(mine.json.items).toHaveLength(1);
    expect(mine.json.items[0].role).toBe('owner');
  });

  it('validates church input', async () => {
    const owner = await t.register('Owner2');
    const response = await t.request('POST', '/api/churches', {
      token: owner.token,
      body: { name: 'A', website: 'not a url', brandColor: 'blue' },
    });
    expect(response.status).toBe(422);
    const paths = response.json.error.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'website', 'brandColor']));
  });

  it('denies access to non-members and unknown churches', async () => {
    const owner = await t.register('Owner3');
    const church = await t.createChurch(owner.token);
    const stranger = await t.register('Stranger');
    const denied = await t.request('GET', `/api/churches/${church.id}`, { token: stranger.token });
    expect(denied.status).toBe(403);
    const missing = await t.request('GET', `/api/churches/${crypto.randomUUID()}`, {
      token: stranger.token,
    });
    expect(missing.status).toBe(404);
    const invalid = await t.request('GET', `/api/churches/not-a-uuid`, { token: stranger.token });
    expect(invalid.status).toBe(422);
  });

  it('handles invitations end to end', async () => {
    const owner = await t.register('Owner4');
    const church = await t.createChurch(owner.token, 'Invite Church');
    const invitation = await t.invite(owner.token, church.id, {
      role: 'member',
      label: 'Sunday flyer',
      expiresInDays: 3,
      maxUses: 2,
    });
    expect(invitation.status).toBe('active');
    expect(invitation.url).toContain(`/join/${invitation.token}`);

    const info = await t.request('GET', `/api/invitations/${invitation.token}`);
    expect(info.status).toBe(200);
    expect(info.json.church.name).toBe('Invite Church');
    expect(info.json.status).toBe('active');

    const guest1 = await t.register('Guest 1');
    const joined = await t.join(guest1.token, invitation.token);
    expect(joined).toEqual({ churchId: church.id, alreadyMember: false });

    const again = await t.join(guest1.token, invitation.token);
    expect(again.alreadyMember).toBe(true);

    const guest2 = await t.register('Guest 2');
    await t.join(guest2.token, invitation.token);

    const guest3 = await t.register('Guest 3');
    const exhausted = await t.request('POST', `/api/invitations/${invitation.token}/accept`, {
      token: guest3.token,
    });
    expect(exhausted.status).toBe(410);
    expect(exhausted.json.error.code).toBe('INVITATION_INVALID');

    const list = await t.request('GET', `/api/churches/${church.id}/invitations`, {
      token: owner.token,
    });
    expect(list.status).toBe(200);
    expect(list.json.items[0].useCount).toBe(2);
    expect(list.json.items[0].status).toBe('exhausted');

    const memberList = await t.request('GET', `/api/churches/${church.id}/invitations`, {
      token: guest1.token,
    });
    expect(memberList.status).toBe(403);

    const second = await t.invite(owner.token, church.id, {});
    const revoke = await t.request(
      'DELETE',
      `/api/churches/${church.id}/invitations/${second.id}`,
      {
        token: owner.token,
      },
    );
    expect(revoke.status).toBe(200);
    const revoked = await t.request('POST', `/api/invitations/${second.token}/accept`, {
      token: guest3.token,
    });
    expect(revoked.status).toBe(410);

    const unknown = await t.request('GET', `/api/invitations/does-not-exist`);
    expect(unknown.status).toBe(404);
  });

  it('manages roles, ownership transfer, leaving and removal', async () => {
    const owner = await t.register('Owner5');
    const church = await t.createChurch(owner.token, 'Role Church');
    const invitation = await t.invite(owner.token, church.id, {});
    const admin = await t.register('Admin5');
    await t.join(admin.token, invitation.token);
    const member = await t.register('Member5');
    await t.join(member.token, invitation.token);

    const members = await t.request('GET', `/api/churches/${church.id}/members`, {
      token: owner.token,
    });
    expect(members.status).toBe(200);
    expect(members.json.items).toHaveLength(3);
    const adminMembership = members.json.items.find(
      (item: { userId: string }) => item.userId === admin.user.id,
    );
    const ownerMembership = members.json.items.find(
      (item: { userId: string }) => item.userId === owner.user.id,
    );
    const memberMembership = members.json.items.find(
      (item: { userId: string }) => item.userId === member.user.id,
    );

    // Plain members cannot see or manage members.
    expect(
      (await t.request('GET', `/api/churches/${church.id}/members`, { token: member.token }))
        .status,
    ).toBe(403);
    expect(
      (
        await t.request('PATCH', `/api/churches/${church.id}/members/${adminMembership.id}`, {
          token: member.token,
          body: { role: 'administrator' },
        })
      ).status,
    ).toBe(403);

    const promoted = await t.request(
      'PATCH',
      `/api/churches/${church.id}/members/${adminMembership.id}`,
      {
        token: owner.token,
        body: { role: 'administrator' },
      },
    );
    expect(promoted.status).toBe(200);
    expect(promoted.json.membership.role).toBe('administrator');

    // Nobody can change the owner's role through the role endpoint.
    expect(
      (
        await t.request('PATCH', `/api/churches/${church.id}/members/${ownerMembership.id}`, {
          token: admin.token,
          body: { role: 'member' },
        })
      ).status,
    ).toBe(403);

    // Admin can edit the church; member cannot.
    expect(
      (
        await t.request('PATCH', `/api/churches/${church.id}`, {
          token: admin.token,
          body: { name: 'Role Church Renamed' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await t.request('PATCH', `/api/churches/${church.id}`, {
          token: member.token,
          body: { name: 'Nope' },
        })
      ).status,
    ).toBe(403);

    // Owner cannot leave.
    const leave = await t.request('POST', `/api/churches/${church.id}/leave`, {
      token: owner.token,
    });
    expect(leave.status).toBe(409);

    // Ownership transfer requires the password and the owner role.
    expect(
      (
        await t.request('POST', `/api/churches/${church.id}/transfer-ownership`, {
          token: admin.token,
          body: { userId: member.user.id, password: 'password123' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await t.request('POST', `/api/churches/${church.id}/transfer-ownership`, {
          token: owner.token,
          body: { userId: admin.user.id, password: 'wrong' },
        })
      ).status,
    ).toBe(401);
    const transferred = await t.request('POST', `/api/churches/${church.id}/transfer-ownership`, {
      token: owner.token,
      body: { userId: admin.user.id, password: owner.password },
    });
    expect(transferred.status).toBe(200);
    expect(transferred.json.church.ownerUserId).toBe(admin.user.id);
    const oldOwner = await t.request('GET', `/api/churches/${church.id}`, { token: owner.token });
    expect(oldOwner.json.access.role).toBe('administrator');
    const newOwner = await t.request('GET', `/api/churches/${church.id}`, { token: admin.token });
    expect(newOwner.json.access.role).toBe('owner');

    // The previous owner can now leave; the member can be removed by the new owner.
    expect(
      (await t.request('POST', `/api/churches/${church.id}/leave`, { token: owner.token })).status,
    ).toBe(200);
    expect(
      (await t.request('GET', `/api/churches/${church.id}`, { token: owner.token })).status,
    ).toBe(403);
    const removed = await t.request(
      'DELETE',
      `/api/churches/${church.id}/members/${memberMembership.id}`,
      {
        token: admin.token,
      },
    );
    expect(removed.status).toBe(200);
    expect(
      (await t.request('GET', `/api/churches/${church.id}`, { token: member.token })).status,
    ).toBe(403);

    // Deleting the church requires the owner's password.
    expect(
      (
        await t.request('DELETE', `/api/churches/${church.id}`, {
          token: admin.token,
          body: { password: 'wrong' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await t.request('DELETE', `/api/churches/${church.id}`, {
          token: admin.token,
          body: { password: admin.password },
        })
      ).status,
    ).toBe(200);
    expect(
      (await t.request('GET', `/api/churches/${church.id}`, { token: admin.token })).status,
    ).toBe(404);
  });
});
