import { expect } from 'bun:test';
import type { Permission } from '@tatagereja/shared';
import type { createTestApp, seedChurch } from './helpers';

/*
 * Fixtures shared by the care suites: members holding custom care roles, the audit log of the
 * module, notifications, and a second church for cross-church checks.
 */

export type TestApp = ReturnType<typeof createTestApp>;
export type Seed = Awaited<ReturnType<typeof seedChurch>>;
export type Member = Awaited<ReturnType<TestApp['register']>>;

/** A `YYYY-MM-DD` date relative to today (UTC; the test church uses Asia/Jakarta). */
export const dayOffset = (days: number) => {
  const value = new Date(Date.now() + 7 * 60 * 60 * 1000);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/** Registers a member who holds a custom role with exactly these permissions. */
export async function memberWithRole(
  t: TestApp,
  s: Seed,
  name: string,
  permissions: readonly Permission[],
): Promise<Member> {
  const user = await t.register(name);
  await t.join(user.token, s.invitation.token);
  if (permissions.length === 0) return user;
  await grantRole(t, s, user.user.id, name, permissions);
  return user;
}

/** Gives an existing member (for example the administrator) an extra custom role. */
export async function grantRole(
  t: TestApp,
  s: Seed,
  userId: string,
  name: string,
  permissions: readonly Permission[],
) {
  const base = `/api/churches/${s.church.id}`;
  const role = await t.request('POST', `${base}/roles`, {
    token: s.owner.token,
    body: { name: `${name} role`, description: null, permissions },
  });
  expect(role.status).toBe(201);
  const members = await t.request('GET', `${base}/members`, { token: s.owner.token });
  const membership = members.json.items.find((item: { userId: string }) => item.userId === userId);
  const assign = await t.request('POST', `${base}/members/${membership.id}/roles`, {
    token: s.owner.token,
    body: { roleId: role.json.role.id },
  });
  expect(assign.status).toBe(200);
}

/** Audit entries of the care module, newest first. */
export async function careAudit(t: TestApp, s: Seed, query = '') {
  const response = await t.request(
    'GET',
    `/api/churches/${s.church.id}/audit-logs?module=care&limit=200${query}`,
    { token: s.owner.token },
  );
  expect(response.status).toBe(200);
  return response.json.items as {
    action: string;
    entityId: string | null;
    before: any;
    after: any;
    summary: string;
  }[];
}

export async function notificationsOf(t: TestApp, token: string) {
  const response = await t.request('GET', '/api/notifications?limit=100', { token });
  expect(response.status).toBe(200);
  return response.json.items as {
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    entityId: string | null;
  }[];
}

/** A second church with its own owner and one person, for cross-church checks. */
export async function otherChurch(t: TestApp) {
  const owner = await t.register('Other Owner');
  const church = await t.createChurch(owner.token, 'Other Church');
  const person = await t.createPerson(owner.token, church.id, {
    firstName: 'Orang',
    lastName: 'Lain',
  });
  return { owner, church, person, base: `/api/churches/${church.id}/care` };
}

/** Turns the care module off (or on) for the seeded church. */
export async function setCareEnabled(t: TestApp, s: Seed, enabled: boolean) {
  const response = await t.request('PATCH', `/api/churches/${s.church.id}/modules`, {
    token: s.owner.token,
    body: { modules: { care: enabled } },
  });
  expect(response.status).toBe(200);
}
