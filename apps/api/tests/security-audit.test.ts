import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { loggedPath } from '../src/app';
import { createRateLimiter } from '../src/lib/rate-limit';
import { clientIp } from '../src/lib/request';
import { createTestApp, seedChurch, permissiveLimiters } from './helpers';

/*
 * Regression tests for the cross-module security review: forwarded addresses, sessions checked
 * before validation, access that must end with a membership, the personal data export and
 * response caching. The generated route checks live in security-routes.test.ts.
 */

const strictLimiters = (max: number) => ({
  ...permissiveLimiters(),
  login: createRateLimiter({ windowMs: 60_000, max }),
  register: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
  invitation: createRateLimiter({ windowMs: 60_000, max }),
});

describe('client address', () => {
  const request = (forwardedFor?: string) =>
    new Request('http://localhost/api/meta', {
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    });
  const socket = { requestIP: () => ({ address: '203.0.113.7' }) };

  it('ignores X-Forwarded-For unless a proxy is trusted', () => {
    expect(clientIp(request('198.51.100.1'), socket, 0)).toBe('203.0.113.7');
    expect(clientIp(request('198.51.100.1'), undefined, 0)).toBe('unknown');
  });

  it('reads the address the trusted proxy wrote, not one the client sent', () => {
    // The client sent "1.2.3.4"; the proxy appended the address it saw.
    expect(clientIp(request('1.2.3.4, 198.51.100.1'), socket, 1)).toBe('198.51.100.1');
    expect(clientIp(request('1.2.3.4, 198.51.100.1, 10.0.0.2'), socket, 2)).toBe('198.51.100.1');
    expect(clientIp(request('198.51.100.1'), socket, 3)).toBe('198.51.100.1');
    expect(clientIp(request(), socket, 1)).toBe('203.0.113.7');
  });

  it('keeps the login limit when the client rotates its own forwarded header', async () => {
    const t = createTestApp({}, { limiters: strictLimiters(3) });
    try {
      await t.register('Target', 'target@example.com');
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await t.request('POST', '/api/auth/login', {
          body: { email: 'target@example.com', password: `wrong-${attempt}` },
          headers: { 'x-forwarded-for': `10.9.${attempt}.1, 198.51.100.1` },
        });
        statuses.push(response.status);
      }
      expect(statuses.slice(3)).toEqual([429, 429]);
    } finally {
      t.close();
    }
  });

  it('ignores the header entirely without a trusted proxy', async () => {
    const t = createTestApp({ trustProxy: 0 }, { limiters: strictLimiters(2) });
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await t.request('POST', '/api/auth/login', {
          body: { email: 'nobody@example.com', password: 'kidung-pujian-91' },
          headers: { 'x-forwarded-for': `10.8.${attempt}.1` },
        });
        statuses.push(response.status);
      }
      expect(statuses).toEqual([401, 401, 429]);
    } finally {
      t.close();
    }
  });
});

describe('sessions and validation', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('answers 401 before it validates the body or the query', async () => {
    const write = await t.request('POST', '/api/churches/not-a-uuid/people', { body: { x: 1 } });
    expect(write.status).toBe(401);
    const read = await t.request('GET', '/api/churches/not-a-uuid/finance/my-giving');
    expect(read.status).toBe(401);
    const bad = await t.request('GET', '/api/churches/not-a-uuid/people', {
      token: 'not-a-session',
    });
    expect(bad.status).toBe(401);
  });

  it('keeps feed and invitation tokens out of the request log', () => {
    expect(loggedPath('/api/calendar/feeds/abcDEF123_-x.ics')).toBe('/api/calendar/feeds/[token]');
    expect(loggedPath('/api/invitations/secret-token/accept')).toBe(
      '/api/invitations/[token]/accept',
    );
    expect(loggedPath('/api/auth/password-reset/secret-token')).toBe(
      '/api/auth/password-reset/[token]',
    );
    // The app pages the links open carry the same tokens.
    expect(loggedPath('/join/secret-token')).toBe('/join/[token]');
    expect(loggedPath('/reset-password/secret-token')).toBe('/reset-password/[token]');
    expect(loggedPath('/api/churches/1/people')).toBe('/api/churches/1/people');
    expect(loggedPath('/c/1/people')).toBe('/c/1/people');
  });

  it('marks API answers as not storable', async () => {
    const meta = await t.app.handle(new Request('http://localhost/api/meta'));
    expect(meta.headers.get('cache-control')).toBe('no-store');
  });
});

describe('invitation tokens', () => {
  it('limits how often one account may try to accept invitations', async () => {
    const t = createTestApp({}, { limiters: strictLimiters(3) });
    try {
      const account = await t.register('Guesser');
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await t.request(
          'POST',
          `/api/invitations/guess-${attempt}xxxxxxxxxx/accept`,
          {
            token: account.token,
          },
        );
        statuses.push(response.status);
      }
      expect(statuses).toEqual([404, 404, 404, 429]);
    } finally {
      t.close();
    }
  });
});

describe('administrator invitations', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('stop working once their creator can no longer make administrators', async () => {
    const s = await seedChurch(t);
    const base = `/api/churches/${s.church.id}`;
    const adminInvite = await t.invite(s.admin.token, s.church.id, { role: 'administrator' });
    const memberInvite = await t.invite(s.admin.token, s.church.id, { role: 'member' });

    const members = await t.request('GET', `${base}/members`, { token: s.owner.token });
    const adminMembership = members.json.items.find(
      (item: { userId: string }) => item.userId === s.admin.user.id,
    );
    const demote = await t.request('PATCH', `${base}/members/${adminMembership.id}`, {
      token: s.owner.token,
      body: { role: 'member' },
    });
    expect(demote.status).toBe(200);

    const preview = await t.request('GET', `/api/invitations/${adminInvite.token}`);
    expect(preview.json.status).toBe('revoked');
    const sock = await t.register('Akun Cadangan');
    const accept = await t.request('POST', `/api/invitations/${adminInvite.token}/accept`, {
      token: sock.token,
    });
    expect(accept.status).toBe(410);
    const register = await t.request('POST', '/api/auth/register', {
      body: {
        name: 'Akun Lain',
        email: 'akun-lain@example.com',
        password: 'kidung-pujian-91',
        invitationToken: adminInvite.token,
      },
    });
    expect(register.status).toBe(410);

    // A member link from the same person keeps working.
    const joined = await t.request('POST', `/api/invitations/${memberInvite.token}/accept`, {
      token: sock.token,
    });
    expect(joined.status).toBe(200);
  });
});

describe('group leader scope', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it("cannot be widened to the owner's profile by adding them to the group", async () => {
    const s = await seedChurch(t);
    const base = `/api/churches/${s.church.id}`;
    const ownerPerson = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Pak',
      lastName: 'Pendeta',
    });
    const link = await t.request('PUT', `${base}/people/${ownerPerson.id}/user`, {
      token: s.owner.token,
      body: { userId: s.owner.user.id },
    });
    expect(link.status).toBe(200);
    const add = await t.request('POST', `${base}/groups/${s.group.id}/members`, {
      token: s.leader.token,
      body: { personIds: [ownerPerson.id, s.memberPerson.id] },
    });
    expect(add.status).toBe(200);

    const hijack = await t.request('PATCH', `${base}/people/${ownerPerson.id}`, {
      token: s.leader.token,
      body: { firstName: 'Pak', lastName: 'Pendeta', email: 'attacker@example.com' },
    });
    expect(hijack.status).toBe(403);
    const fields = await t.request('PUT', `${base}/people/${ownerPerson.id}/fields`, {
      token: s.leader.token,
      body: { values: {} },
    });
    expect(fields.status).toBe(403);
    const profile = await t.request('GET', `${base}/people/${ownerPerson.id}`, {
      token: s.leader.token,
    });
    expect(profile.json.canEdit).toBe(false);

    // Group members without an account, and fellow members, stay editable for their leader.
    const alice = await t.request('PATCH', `${base}/people/${s.alice.id}`, {
      token: s.leader.token,
      body: { firstName: 'Alice', lastName: 'Smith', phone: '0812000111' },
    });
    expect(alice.status).toBe(200);
    const peer = await t.request('PATCH', `${base}/people/${s.memberPerson.id}`, {
      token: s.leader.token,
      body: { firstName: 'Mem', lastName: 'Ber' },
    });
    expect(peer.status).toBe(200);
  });
});

describe('leaving a church', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let base: string;

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}`;
    const modules = await t.request('PATCH', `${base}/modules`, {
      token: s.owner.token,
      body: { modules: { care: true } },
    });
    expect(modules.status).toBe(200);
  });

  const membershipOf = async (userId: string) => {
    const members = await t.request('GET', `${base}/members`, { token: s.owner.token });
    return members.json.items.find((item: { userId: string }) => item.userId === userId) as
      { id: string } | undefined;
  };

  it('does not give back care cases or areas to someone who is removed and rejoins', async () => {
    const pastor = await t.register('Pendeta Lama');
    await t.join(pastor.token, s.invitation.token);

    const area = await t.request('POST', `${base}/areas`, {
      token: s.owner.token,
      body: { name: 'Sektor Timur' },
    });
    expect(area.status).toBe(201);
    const areaId = area.json.area.id as string;
    const coordinator = await t.request('POST', `${base}/areas/${areaId}/coordinators`, {
      token: s.owner.token,
      body: { userId: pastor.user.id },
    });
    expect(coordinator.json.area.coordinators).toHaveLength(1);

    const created = await t.request('POST', `${base}/care/cases`, {
      token: s.owner.token,
      body: {
        personId: s.alice.id,
        category: 'counseling',
        confidentiality: 'confidential',
        title: 'Konseling keluarga',
        description: 'Rahasia pastoral.',
        caregiverUserIds: [pastor.user.id],
      },
    });
    expect(created.status).toBe(201);
    const caseId = created.json.case.id as string;
    const before = await t.request('GET', `${base}/care/cases/${caseId}`, { token: pastor.token });
    expect(before.status).toBe(200);

    const followUp = await t.request('POST', `${base}/care/follow-ups`, {
      token: s.owner.token,
      body: { personId: s.bob.id, assignedUserId: pastor.user.id },
    });
    expect(followUp.status).toBe(201);

    const membership = await membershipOf(pastor.user.id);
    const removed = await t.request('DELETE', `${base}/members/${membership?.id}`, {
      token: s.owner.token,
    });
    expect(removed.status).toBe(200);

    // Invited back later as a plain member.
    await t.join(pastor.token, s.invitation.token);
    const after = await t.request('GET', `${base}/care/cases/${caseId}`, { token: pastor.token });
    expect(after.status).toBe(404);
    const detail = await t.request('GET', `${base}/care/cases/${caseId}`, { token: s.owner.token });
    expect(detail.json.case.caregivers).toEqual([]);
    const areaAfter = await t.request('GET', `${base}/areas/${areaId}`, { token: s.owner.token });
    expect(areaAfter.json.area.coordinators).toEqual([]);
    const followUpAfter = await t.request(
      'GET',
      `${base}/care/follow-ups/${followUp.json.followUp.id}`,
      {
        token: s.owner.token,
      },
    );
    expect(followUpAfter.json.followUp.assignedUserId ?? null).toBeNull();
  });
});

describe('download my data', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it("leaves out prayer requests someone else submitted from the person's record", async () => {
    const s = await seedChurch(t);
    const base = `/api/churches/${s.church.id}`;
    await t.request('PATCH', `${base}/modules`, {
      token: s.owner.token,
      body: { modules: { care: true } },
    });
    // The member (wrongly linked to this person record) asks the pastors to pray.
    const request = await t.request('POST', `${base}/care/prayer-requests`, {
      token: s.member.token,
      body: {
        title: 'Pergumulan rumah tangga',
        body: 'Hanya untuk pendeta.',
        visibility: 'pastors',
      },
    });
    expect(request.status).toBe(201);

    // The link is corrected: the person record belongs to someone else.
    const owner = await t.register('Pemilik Data');
    await t.join(owner.token, s.invitation.token);
    const unlink = await t.request('PUT', `${base}/people/${s.memberPerson.id}/user`, {
      token: s.owner.token,
      body: { userId: owner.user.id },
    });
    expect(unlink.status).toBe(200);

    const exported = await t.request('POST', '/api/auth/export', {
      token: owner.token,
      body: { password: owner.password },
    });
    expect(exported.status).toBe(200);
    const records = exported.json.churches[0].records as Record<string, unknown[]>;
    expect(records.people).toHaveLength(1);
    expect(records.prayer_requests).toBeUndefined();
    expect(JSON.stringify(exported.json)).not.toContain('Hanya untuk pendeta');

    // The member who wrote it still gets it.
    const mine = await t.request('POST', '/api/auth/export', {
      token: s.member.token,
      body: { password: s.member.password },
    });
    expect(mine.json.churches[0].records.prayer_requests).toHaveLength(1);
  });
});
