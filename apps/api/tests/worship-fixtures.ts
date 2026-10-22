import { expect } from 'bun:test';
import { seedChurch, type createTestApp } from './helpers';

export type TestApp = ReturnType<typeof createTestApp>;
type Account = Awaited<ReturnType<TestApp['register']>>;

export const inDays = (days: number, hour = 9) => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

export const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * The shared church from `seedChurch` plus the worship cast: a planner (custom role with
 * `services.manage`), a scheduler (custom role with `volunteers.schedule`) and a volunteer
 * account that will lead a team. Every account is linked to a person record.
 */
export async function seedWorship(t: TestApp) {
  const s = await seedChurch(t);
  const church = `/api/churches/${s.church.id}`;
  const base = `${church}/worship`;

  const joinAs = async (name: string) => {
    const account = await t.register(name);
    await t.join(account.token, s.invitation.token);
    return account;
  };
  const planner = await joinAs('Planner');
  const scheduler = await joinAs('Scheduler');
  const teamLead = await joinAs('Team Lead');

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
  await assign(planner, await role('Perencana Ibadah', ['services.manage']));
  await assign(scheduler, await role('Koordinator Jadwal', ['volunteers.schedule']));

  const linkPerson = async (account: Account, firstName: string, lastName: string) => {
    const person = await t.createPerson(s.owner.token, s.church.id, {
      firstName,
      lastName,
      membershipStatus: 'member',
    });
    const link = await t.request('PUT', `${church}/people/${person.id}/user`, {
      token: s.owner.token,
      body: { userId: account.user.id },
    });
    expect(link.status).toBe(200);
    return person;
  };
  const leadPerson = await linkPerson(teamLead, 'Yohanes', 'Tambunan');
  const plannerPerson = await linkPerson(planner, 'Pdt. Samuel', 'Nainggolan');

  return { s, church, base, planner, scheduler, teamLead, leadPerson, plannerPerson };
}

export type WorshipSeed = Awaited<ReturnType<typeof seedWorship>>;

/** Creates a service as the owner and returns its id. */
export async function createService(
  t: TestApp,
  w: WorshipSeed,
  body: Record<string, unknown> = {},
): Promise<string> {
  const response = await t.request('POST', `${w.base}/services`, {
    token: w.s.owner.token,
    body: { title: 'Ibadah Umum 1', startsAt: inDays(3), status: 'published', ...body },
  });
  expect(response.status).toBe(201);
  return response.json.service.id as string;
}

/** Creates a team with positions as the owner. */
export async function createTeam(
  t: TestApp,
  w: WorshipSeed,
  name: string,
  positions: { name: string; needed?: number }[],
) {
  const team = await t.request('POST', `${w.base}/teams`, {
    token: w.s.owner.token,
    body: { name },
  });
  expect(team.status).toBe(201);
  const ids: string[] = [];
  for (const position of positions) {
    const created = await t.request('POST', `${w.base}/teams/${team.json.team.id}/positions`, {
      token: w.s.owner.token,
      body: position,
    });
    expect(created.status).toBe(201);
    ids.push(created.json.position.id);
  }
  return { id: team.json.team.id as string, positionIds: ids };
}

export async function addMember(
  t: TestApp,
  w: WorshipSeed,
  teamId: string,
  personId: string,
  body: Record<string, unknown> = {},
) {
  const response = await t.request('POST', `${w.base}/teams/${teamId}/members`, {
    token: w.s.owner.token,
    body: { personId, ...body },
  });
  expect(response.status).toBe(201);
  return response.json.member as { teamMemberId: string };
}
