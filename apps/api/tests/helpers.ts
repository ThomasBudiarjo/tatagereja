import { expect } from 'bun:test';
import { createApp, createDeps } from '../src/app';
import { createRateLimiter } from '../src/lib/rate-limit';
import { testConfig, type AppConfig } from '../src/config';
import { openDatabase } from '../src/db/client';
import type { Deps } from '../src/deps';

export type TestResponse<T = any> = { status: number; json: T };

/** Parses a JSON body, falling back to the raw text for non-JSON responses. */
function parseBody(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createTestApp(
  configOverrides: Partial<AppConfig> = {},
  depsOverrides: Partial<Deps> = {},
) {
  const handle = openDatabase(':memory:');
  const config = testConfig(configOverrides);
  const deps = createDeps(handle.db, config, {
    // Tests register many accounts from one "IP"; suites that test limits pass their own limiters.
    limiters: {
      login: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
      register: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
      invitation: createRateLimiter({ windowMs: 60_000, max: 10_000 }),
    },
    ...depsOverrides,
  });
  const app = createApp(deps);

  const request = async <T = any>(
    method: string,
    path: string,
    options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
  ): Promise<TestResponse<T>> => {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const response = await app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
    );
    return { status: response.status, json: parseBody(await response.text()) };
  };

  let counter = 0;
  const register = async (name?: string, email?: string, password = 'password123') => {
    counter += 1;
    const response = await request('POST', '/api/auth/register', {
      body: {
        name: name ?? `User ${counter}`,
        email: email ?? `user${counter}-${Date.now()}@example.com`,
        password,
      },
    });
    expect(response.status).toBe(201);
    return {
      token: response.json.token as string,
      user: response.json.user as { id: string; email: string; name: string },
      password,
    };
  };

  const createChurch = async (token: string, name = 'Grace Church') => {
    const response = await request('POST', '/api/churches', { body: { name }, token });
    expect(response.status).toBe(201);
    return response.json.church as { id: string; name: string };
  };

  const invite = async (token: string, churchId: string, body: Record<string, unknown> = {}) => {
    const response = await request('POST', `/api/churches/${churchId}/invitations`, {
      body,
      token,
    });
    expect(response.status).toBe(201);
    return response.json.invitation as { id: string; token: string; url: string; status: string };
  };

  const join = async (token: string, invitationToken: string) => {
    const response = await request('POST', `/api/invitations/${invitationToken}/accept`, { token });
    expect(response.status).toBe(200);
    return response.json as { churchId: string; alreadyMember: boolean };
  };

  const createPerson = async (token: string, churchId: string, body: Record<string, unknown>) => {
    const response = await request('POST', `/api/churches/${churchId}/people`, { body, token });
    expect(response.status).toBe(201);
    return response.json.person as { id: string; firstName: string };
  };

  const createGroup = async (token: string, churchId: string, body: Record<string, unknown>) => {
    const response = await request('POST', `/api/churches/${churchId}/groups`, { body, token });
    expect(response.status).toBe(201);
    return response.json.group as { id: string; name: string };
  };

  return {
    app,
    deps,
    db: handle.db,
    request,
    register,
    createChurch,
    invite,
    join,
    createPerson,
    createGroup,
    close: handle.close,
  };
}

/** Sets up an owner, an administrator, a group leader, and a plain member in one church. */
export async function seedChurch(t: ReturnType<typeof createTestApp>) {
  const owner = await t.register('Owner');
  const church = await t.createChurch(owner.token, 'Seed Church');
  const invitation = await t.invite(owner.token, church.id, { expiresInDays: 7 });

  const admin = await t.register('Admin');
  await t.join(admin.token, invitation.token);
  const adminMembership = (
    await t.request('GET', `/api/churches/${church.id}/members`, { token: owner.token })
  ).json.items.find((item: { userId: string }) => item.userId === admin.user.id);
  const promote = await t.request(
    'PATCH',
    `/api/churches/${church.id}/members/${adminMembership.id}`,
    {
      token: owner.token,
      body: { role: 'administrator' },
    },
  );
  expect(promote.status).toBe(200);

  const leader = await t.register('Leader');
  await t.join(leader.token, invitation.token);
  const member = await t.register('Member');
  await t.join(member.token, invitation.token);

  const group = await t.createGroup(owner.token, church.id, { name: 'Youth Ministry' });
  const otherGroup = await t.createGroup(owner.token, church.id, { name: 'Choir' });
  const assign = await t.request('POST', `/api/churches/${church.id}/groups/${group.id}/leaders`, {
    token: owner.token,
    body: { userId: leader.user.id },
  });
  expect(assign.status).toBe(200);

  const alice = await t.createPerson(owner.token, church.id, {
    firstName: 'Alice',
    lastName: 'Smith',
  });
  const bob = await t.createPerson(owner.token, church.id, { firstName: 'Bob', lastName: 'Jones' });
  const memberPerson = await t.createPerson(owner.token, church.id, {
    firstName: 'Mem',
    lastName: 'Ber',
  });
  const link = await t.request('PUT', `/api/churches/${church.id}/people/${memberPerson.id}/user`, {
    token: owner.token,
    body: { userId: member.user.id },
  });
  expect(link.status).toBe(200);
  const addToGroup = await t.request(
    'POST',
    `/api/churches/${church.id}/groups/${group.id}/members`,
    {
      token: owner.token,
      body: { personIds: [alice.id] },
    },
  );
  expect(addToGroup.status).toBe(200);

  return {
    owner,
    admin,
    leader,
    member,
    church,
    group,
    otherGroup,
    alice,
    bob,
    memberPerson,
    invitation,
  };
}
