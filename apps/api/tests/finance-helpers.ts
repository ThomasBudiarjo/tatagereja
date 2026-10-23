import { expect } from 'bun:test';
import type { FinanceSetup, Permission } from '@tatagereja/shared';
import type { createTestApp, seedChurch } from './helpers';

/*
 * Fixtures shared by the finance suites: a seeded church with the suggested funds and
 * categories, a cash box and a bank account, and members holding custom finance roles.
 */

export type TestApp = ReturnType<typeof createTestApp>;
export type Seed = Awaited<ReturnType<typeof seedChurch>>;
export type Member = Awaited<ReturnType<TestApp['register']>>;

export const today = () => new Date().toISOString().slice(0, 10);

/** A day this month (or last month when it would be in the future). */
export const thisMonthDay = (day: number) => {
  const now = new Date();
  const value = Math.min(day, now.getUTCDate());
  return `${now.toISOString().slice(0, 7)}-${String(value).padStart(2, '0')}`;
};

export async function setupFinance(t: TestApp, s: Seed) {
  const base = `/api/churches/${s.church.id}/finance`;
  const defaults = await t.request('POST', `${base}/setup/defaults`, {
    token: s.owner.token,
    body: { openingDate: '2026-01-01', cashOpeningBalance: 1_000_000 },
  });
  expect(defaults.status).toBe(200);
  const bank = await t.request('POST', `${base}/accounts`, {
    token: s.owner.token,
    body: {
      name: 'BCA Gereja',
      type: 'bank',
      bankName: 'BCA',
      accountNumber: '1234567890',
      openingBalance: 5_000_000,
      openingDate: '2026-01-01',
    },
  });
  expect(bank.status).toBe(201);
  const setup = (await t.request('GET', `${base}/setup`, { token: s.owner.token }))
    .json as FinanceSetup;
  const fund = (name: string) => setup.funds.find((item) => item.name === name)!.id;
  const category = (name: string) => setup.categories.find((item) => item.name === name)!.id;
  const account = (name: string) => setup.accounts.find((item) => item.name === name)!.id;
  return {
    base,
    setup,
    fund,
    category,
    account,
    cash: account('Kas Tunai'),
    bank: account('BCA Gereja'),
    general: fund('Kas Umum'),
    building: fund('Pembangunan'),
  };
}

/** Registers a member who holds a custom role with exactly these permissions. */
export async function memberWithRole(
  t: TestApp,
  s: Seed,
  name: string,
  permissions: readonly Permission[],
): Promise<Member> {
  const base = `/api/churches/${s.church.id}`;
  const user = await t.register(name);
  await t.join(user.token, s.invitation.token);
  if (permissions.length === 0) return user;
  const role = await t.request('POST', `${base}/roles`, {
    token: s.owner.token,
    body: { name: `${name} role`, description: null, permissions },
  });
  expect(role.status).toBe(201);
  const members = await t.request('GET', `${base}/members`, { token: s.owner.token });
  const membership = members.json.items.find(
    (item: { userId: string }) => item.userId === user.user.id,
  );
  const assign = await t.request('POST', `${base}/members/${membership.id}/roles`, {
    token: s.owner.token,
    body: { roleId: role.json.role.id },
  });
  expect(assign.status).toBe(200);
  return user;
}

/** Audit entries of the finance module, newest first. */
export async function financeAudit(t: TestApp, s: Seed, query = '') {
  const response = await t.request(
    'GET',
    `/api/churches/${s.church.id}/audit-logs?module=finance&limit=200${query}`,
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
  const response = await t.request('GET', '/api/notifications', { token });
  expect(response.status).toBe(200);
  return response.json.items as { type: string; title: string; link: string | null }[];
}

/** A second church with its own owner and finance setup, for cross-church checks. */
export async function otherChurch(t: TestApp) {
  const owner = await t.register('Other Owner');
  const church = await t.createChurch(owner.token, 'Other Church');
  const base = `/api/churches/${church.id}/finance`;
  await t.request('POST', `${base}/setup/defaults`, {
    token: owner.token,
    body: { openingDate: '2026-01-01', cashOpeningBalance: 0 },
  });
  const setup = (await t.request('GET', `${base}/setup`, { token: owner.token }))
    .json as FinanceSetup;
  return { owner, church, base, setup };
}
