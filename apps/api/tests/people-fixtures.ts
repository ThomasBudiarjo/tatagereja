import { expect } from 'bun:test';
import { seedChurch, type createTestApp } from './helpers';

export type TestApp = ReturnType<typeof createTestApp>;
export type Account = { token: string; user: { id: string; email: string; name: string } };

/**
 * The seed church plus what the people tests need: a member with a custom role holding
 * exactly the given permissions, linked person records and a second church for IDOR checks.
 */
export async function seedPeople(t: TestApp) {
  const s = await seedChurch(t);
  const base = `/api/churches/${s.church.id}`;

  const membershipOf = async (userId: string): Promise<string> => {
    const list = await t.request('GET', `${base}/members`, { token: s.owner.token });
    expect(list.status).toBe(200);
    const membership = list.json.items.find((item: { userId: string }) => item.userId === userId);
    if (!membership) throw new Error(`No membership for ${userId}`);
    return membership.id;
  };

  /** Registers a member and gives them a custom role with exactly `permissions`. */
  const memberWithRole = async (name: string, permissions: string[]): Promise<Account> => {
    const account = await t.register(name);
    await t.join(account.token, s.invitation.token);
    const role = await t.request('POST', `${base}/roles`, {
      token: s.owner.token,
      body: { name: `${name} role`, description: null, permissions },
    });
    expect(role.status).toBe(201);
    const assign = await t.request(
      'POST',
      `${base}/members/${await membershipOf(account.user.id)}/roles`,
      { token: s.owner.token, body: { roleId: role.json.role.id } },
    );
    expect(assign.status).toBe(200);
    return account;
  };

  /** Creates a person and links them to an account. */
  const linkedPerson = async (account: Account, body: Record<string, unknown>) => {
    const person = await t.createPerson(s.owner.token, s.church.id, body);
    const link = await t.request('PUT', `${base}/people/${person.id}/user`, {
      token: s.owner.token,
      body: { userId: account.user.id },
    });
    expect(link.status).toBe(200);
    return person;
  };

  const other = await t.register('Other Owner');
  const otherChurch = await t.createChurch(other.token, 'Gereja Lain');
  const otherBase = `/api/churches/${otherChurch.id}`;
  const outsider = await t.createPerson(other.token, otherChurch.id, { firstName: 'Orang Luar' });
  const otherGroup = await t.createGroup(other.token, otherChurch.id, { name: 'Komisi Luar' });

  const notificationsOf = async (token: string) => {
    const response = await t.request('GET', '/api/notifications', { token });
    expect(response.status).toBe(200);
    return response.json.items as { type: string; title: string; link: string | null }[];
  };

  const auditActions = async (query = '') => {
    const response = await t.request('GET', `${base}/audit-logs?module=people${query}`, {
      token: s.owner.token,
    });
    expect(response.status).toBe(200);
    return response.json.items as { action: string; before: any; after: any; summary: string }[];
  };

  return {
    ...s,
    base,
    membershipOf,
    memberWithRole,
    linkedPerson,
    other: {
      owner: other,
      church: otherChurch,
      base: otherBase,
      person: outsider,
      group: otherGroup,
    },
    notificationsOf,
    auditActions,
  };
}

export type PeopleSeed = Awaited<ReturnType<typeof seedPeople>>;
