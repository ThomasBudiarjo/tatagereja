import { expect } from 'bun:test';
import { seedChurch, type createTestApp } from './helpers';

export type TestApp = ReturnType<typeof createTestApp>;
type Account = Awaited<ReturnType<TestApp['register']>>;

/**
 * The shared church from `seedChurch` plus the registry cast: a secretary (custom role with
 * `records.manage`), a viewer (custom role with `records.view`), a clerk holding an unrelated
 * permission, and a second church with its own person and record for IDOR checks.
 */
export async function seedRecords(t: TestApp) {
  const s = await seedChurch(t);
  const church = `/api/churches/${s.church.id}`;
  const base = `${church}/records`;

  const joinAs = async (name: string) => {
    const account = await t.register(name);
    await t.join(account.token, s.invitation.token);
    return account;
  };
  const secretary = await joinAs('Sekretaris');
  const viewer = await joinAs('Penatua');
  const clerk = await joinAs('Clerk');

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
  await assign(secretary, await role('Sekretariat Registri', ['records.manage']));
  await assign(viewer, await role('Pembaca Buku Induk', ['records.view']));
  await assign(clerk, await role('Petugas Direktori', ['people.view']));

  const person = (body: Record<string, unknown>) =>
    t.createPerson(s.owner.token, s.church.id, body);
  const budi = await person({
    firstName: 'Budi',
    lastName: 'Santoso',
    membershipStatus: 'visitor',
  });
  const sari = await person({
    firstName: 'Sari',
    lastName: 'Simanjuntak',
    membershipStatus: 'member',
  });
  const yohanes = await person({ firstName: 'Pdt. Yohanes', lastName: 'Nainggolan' });

  const other = await t.register('Other Owner');
  const otherChurch = await t.createChurch(other.token, 'GKI Lain');
  const outsider = await t.createPerson(other.token, otherChurch.id, {
    firstName: 'Orang',
    lastName: 'Luar',
  });
  const outsiderRecord = await t.request(
    'POST',
    `/api/churches/${otherChurch.id}/records/entries`,
    {
      token: other.token,
      body: {
        type: 'sidi',
        date: '2026-04-05',
        people: [{ personId: outsider.id, role: 'subject' }],
      },
    },
  );
  expect(outsiderRecord.status).toBe(201);

  return {
    s,
    church,
    base,
    entries: `${base}/entries`,
    secretary,
    viewer,
    clerk,
    budi,
    sari,
    yohanes,
    other,
    otherChurch,
    outsider,
    outsiderRecordId: outsiderRecord.json.record.id as string,
  };
}

export type RecordsSeed = Awaited<ReturnType<typeof seedRecords>>;

/** Enters a record as the owner and returns the response body. */
export async function createRecord(
  t: TestApp,
  r: RecordsSeed,
  body: Record<string, unknown>,
  token = r.s.owner.token,
) {
  const response = await t.request('POST', r.entries, { token, body });
  expect(response.status).toBe(201);
  return response.json as {
    record: {
      id: string;
      number: string;
      status: string;
      people: { personId: string | null; name: string; role: string }[];
    };
    effects: { personId: string; kind: string; from: string | null; to: string }[];
  };
}

export const baptism = (personId: string, extra: Record<string, unknown> = {}) => ({
  type: 'baptism',
  subtype: 'infant',
  date: '2026-03-08',
  place: 'GKI Pondok Indah',
  people: [{ personId, role: 'subject' }],
  ...extra,
});
