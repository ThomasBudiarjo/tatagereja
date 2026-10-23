import { expect } from 'bun:test';
import { seedChurch, type createTestApp } from './helpers';

export type TestApp = ReturnType<typeof createTestApp>;
type Account = Awaited<ReturnType<TestApp['register']>>;

/** An ISO instant `days` from now at `hour`:00 UTC. */
export const inDays = (days: number, hour = 9, minute = 0) => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
};

export const dayOf = (iso: string) => iso.slice(0, 10);

export const addHours = (iso: string, hours: number) =>
  new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();

/**
 * The shared church from `seedChurch` plus the facilities cast, each holding a custom role with
 * exactly one module permission: a facilities manager (`facilities.manage`), an inventory
 * keeper (`inventory.manage`) and an inventory viewer (`inventory.view`). Plain members hold
 * `facilities.view` and `facilities.book` by default.
 */
export async function seedFacilities(t: TestApp) {
  const s = await seedChurch(t);
  const church = `/api/churches/${s.church.id}`;
  const base = `${church}/facilities`;
  const inventory = `${church}/inventory`;

  const joinAs = async (name: string) => {
    const account = await t.register(name);
    await t.join(account.token, s.invitation.token);
    return account;
  };
  const manager = await joinAs('Sekretaris Sarana');
  const keeper = await joinAs('Penjaga Inventaris');
  const viewer = await joinAs('Pemeriksa Inventaris');

  const members = await t.request('GET', `${church}/members`, { token: s.owner.token });
  expect(members.status).toBe(200);
  const membershipOf = (userId: string) =>
    (members.json.items as { id: string; userId: string }[]).find((item) => item.userId === userId)!
      .id;

  const role = async (name: string, permissions: string[]) => {
    const created = await t.request('POST', `${church}/roles`, {
      token: s.owner.token,
      body: { name, description: null, permissions },
    });
    expect(created.status).toBe(201);
    return created.json.role.id as string;
  };
  const assign = async (account: Account, roleId: string) => {
    const response = await t.request(
      'POST',
      `${church}/members/${membershipOf(account.user.id)}/roles`,
      { token: s.owner.token, body: { roleId } },
    );
    expect(response.status).toBe(200);
  };
  await assign(manager, await role('Pengelola Sarana', ['facilities.manage']));
  await assign(keeper, await role('Pengelola Inventaris', ['inventory.manage']));
  await assign(viewer, await role('Pemeriksa Inventaris', ['inventory.view']));

  return { s, church, base, inventory, manager, keeper, viewer, joinAs };
}

export type FacilitiesSeed = Awaited<ReturnType<typeof seedFacilities>>;

/** Creates a resource as the owner and returns it. */
export async function createResource(
  t: TestApp,
  f: FacilitiesSeed,
  body: Record<string, unknown> = {},
) {
  const response = await t.request('POST', `${f.base}/resources`, {
    token: f.s.owner.token,
    body: { name: `Ruang ${crypto.randomUUID().slice(0, 6)}`, kind: 'room', ...body },
  });
  expect(response.status).toBe(201);
  return response.json.resource as { id: string; name: string; capacity: number | null };
}

/** Creates an asset as the owner and returns it. */
export async function createAsset(
  t: TestApp,
  f: FacilitiesSeed,
  body: Record<string, unknown> = {},
) {
  const response = await t.request('POST', `${f.inventory}/assets`, {
    token: f.s.owner.token,
    body: { name: 'Proyektor Epson', category: 'Multimedia', ...body },
  });
  expect(response.status).toBe(201);
  return response.json.asset as { id: string; code: string; name: string; status: string };
}
