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

export const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

export const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * The shared church from `seedChurch` plus the comms cast, each holding a custom role with
 * exactly one permission: an announcer (`announcements.manage`), an events coordinator
 * (`events.manage`), an editor (`bulletin.manage`), a treasurer (`finance.reports`) and a
 * plain member with an empty custom role. Every account is linked to a person, and a second
 * church exists for cross-church attempts.
 */
export async function seedComms(t: TestApp) {
  const s = await seedChurch(t);
  const church = `/api/churches/${s.church.id}`;

  const joinAs = async (name: string) => {
    const account = await t.register(name);
    await t.join(account.token, s.invitation.token);
    return account;
  };
  const announcer = await joinAs('Sekretaris Jemaat');
  const coordinator = await joinAs('Koordinator Kegiatan');
  const editor = await joinAs('Redaksi Warta');
  const treasurer = await joinAs('Bendahara');
  const plain = await joinAs('Anggota Biasa');

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
  const roles = {
    announcer: await role('Penulis Pengumuman', ['announcements.manage']),
    coordinator: await role('Pengatur Kegiatan', ['events.manage']),
    editor: await role('Redaksi Warta', ['bulletin.manage']),
    treasurer: await role('Pemeriksa Keuangan', ['finance.reports']),
    plain: await role('Paduan Suara', []),
  };
  await assign(announcer, roles.announcer);
  await assign(coordinator, roles.coordinator);
  await assign(editor, roles.editor);
  await assign(treasurer, roles.treasurer);
  await assign(plain, roles.plain);

  const linkPerson = async (account: Account, body: Record<string, unknown>) => {
    const person = await t.createPerson(s.owner.token, s.church.id, {
      membershipStatus: 'member',
      ...body,
    });
    const link = await t.request('PUT', `${church}/people/${person.id}/user`, {
      token: s.owner.token,
      body: { userId: account.user.id },
    });
    expect(link.status).toBe(200);
    return person;
  };
  const leaderPerson = await linkPerson(s.leader, { firstName: 'Lukas', lastName: 'Siregar' });
  const plainPerson = await linkPerson(plain, { firstName: 'Ruth', lastName: 'Simanjuntak' });
  const coordinatorPerson = await linkPerson(coordinator, {
    firstName: 'Daniel',
    lastName: 'Hutapea',
  });

  const other = await t.register('Other Owner');
  const otherChurch = await t.createChurch(other.token, 'Gereja Lain');

  return {
    s,
    church,
    announcer,
    coordinator,
    editor,
    treasurer,
    plain,
    roles,
    leaderPerson,
    plainPerson,
    coordinatorPerson,
    other,
    otherChurch,
    membershipOf,
  };
}

export type CommsSeed = Awaited<ReturnType<typeof seedComms>>;

/** The recipient's notifications of one type in this church. */
export async function notificationsOf(
  t: TestApp,
  token: string,
  churchId: string,
  type?: string,
): Promise<{ type: string; title: string; body: string | null; link: string | null }[]> {
  const response = await t.request('GET', `/api/notifications?churchId=${churchId}&limit=200`, {
    token,
  });
  expect(response.status).toBe(200);
  const items = response.json.items as {
    type: string;
    title: string;
    body: string | null;
    link: string | null;
  }[];
  return type ? items.filter((item) => item.type === type) : items;
}

/** Audit entries of the comms module, newest first. */
export async function commsAudit(t: TestApp, c: CommsSeed, action?: string) {
  const response = await t.request(
    'GET',
    `${c.church}/audit-logs?module=comms${action ? `&action=${action}` : ''}&limit=200`,
    { token: c.s.owner.token },
  );
  expect(response.status).toBe(200);
  return response.json.items as { action: string; entityId: string | null; summary: string }[];
}
