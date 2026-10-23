import { expect } from 'bun:test';
import { householdMembers, households } from '../src/db/schema';
import { nowIso } from '../src/lib/time';
import { newId } from '../src/lib/tokens';
import { seedChurch, type createTestApp } from './helpers';

export type TestApp = ReturnType<typeof createTestApp>;
type Account = Awaited<ReturnType<TestApp['register']>>;

const year = new Date().getUTCFullYear();
/** A birth date `age` years ago (1 January, so the age holds all year). */
export const bornYearsAgo = (age: number) => `${year - age}-01-01`;

/**
 * Households belong to the people module; the tests insert them directly so the checkin suite
 * does not depend on that module's routes.
 */
export function insertHousehold(
  t: TestApp,
  churchId: string,
  name: string,
  members: {
    personId: string;
    relationship: 'head' | 'spouse' | 'child' | 'parent' | 'relative';
  }[],
  phone: string | null = null,
) {
  const id = newId();
  const now = nowIso();
  t.db
    .insert(households)
    .values({ id, churchId, name, phone, createdAt: now, updatedAt: now })
    .run();
  t.db
    .insert(householdMembers)
    .values(
      members.map((member, index) => ({
        id: newId(),
        churchId,
        householdId: id,
        personId: member.personId,
        relationship: member.relationship,
        isPrimaryContact: index === 0,
        addedAt: now,
      })),
    )
    .run();
  return id;
}

/**
 * The shared church from `seedChurch` plus the Sekolah Minggu cast: a teacher (custom role with
 * `checkin.operate`), a coordinator (`checkin.manage`), a clerk holding an unrelated permission,
 * a guardian (Ibu Sari, linked to her person, mother in the Simanjuntak household with two young
 * children and an adult one), the default classes, an open session, and a second church with its
 * own class, session, child and check-in for IDOR checks.
 */
export async function seedCheckin(t: TestApp) {
  const s = await seedChurch(t);
  const church = `/api/churches/${s.church.id}`;
  const base = `${church}/checkin`;

  const joinAs = async (name: string) => {
    const account = await t.register(name);
    await t.join(account.token, s.invitation.token);
    return account;
  };
  const teacher = await joinAs('Guru Sekolah Minggu');
  const coordinator = await joinAs('Koordinator Anak');
  const clerk = await joinAs('Petugas Direktori');
  const guardian = await joinAs('Sari Simanjuntak');

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
  await assign(teacher, await role('Pelayan Check-in', ['checkin.operate']));
  await assign(coordinator, await role('Koordinator Sekolah Minggu', ['checkin.manage']));
  await assign(clerk, await role('Petugas Direktori', ['people.view']));

  const person = (body: Record<string, unknown>) =>
    t.createPerson(s.owner.token, s.church.id, body);
  const sari = await person({
    firstName: 'Sari',
    lastName: 'Simanjuntak',
    phone: '0812-3456-7788',
  });
  const budi = await person({ firstName: 'Budi', lastName: 'Simanjuntak' });
  const yosua = await person({
    firstName: 'Yosua',
    lastName: 'Simanjuntak',
    birthDate: bornYearsAgo(6),
  });
  const maria = await person({
    firstName: 'Maria',
    lastName: 'Simanjuntak',
    birthDate: bornYearsAgo(2),
  });
  const adultChild = await person({
    firstName: 'Daniel',
    lastName: 'Simanjuntak',
    birthDate: bornYearsAgo(24),
  });
  const opung = await person({ firstName: 'Opung', lastName: 'Siregar' });
  const neighbour = await person({ firstName: 'Tetangga', lastName: 'Sebelah' });
  const link = await t.request('PUT', `${church}/people/${sari.id}/user`, {
    token: s.owner.token,
    body: { userId: guardian.user.id },
  });
  expect(link.status).toBe(200);
  const householdId = insertHousehold(t, s.church.id, 'Keluarga Simanjuntak', [
    { personId: budi.id, relationship: 'head' },
    { personId: sari.id, relationship: 'spouse' },
    { personId: yosua.id, relationship: 'child' },
    { personId: maria.id, relationship: 'child' },
    { personId: adultChild.id, relationship: 'child' },
  ]);

  // Another family with a child, so guardians cannot reach other households.
  const lukas = await person({
    firstName: 'Lukas',
    lastName: 'Hutapea',
    birthDate: bornYearsAgo(8),
  });
  const hutapea = await person({
    firstName: 'Rina',
    lastName: 'Hutapea',
    phone: '+62 811 2222 9901',
  });
  insertHousehold(t, s.church.id, 'Keluarga Hutapea', [
    { personId: hutapea.id, relationship: 'head' },
    { personId: lukas.id, relationship: 'child' },
  ]);

  const defaults = await t.request('POST', `${base}/classes/defaults`, {
    token: coordinator.token,
  });
  expect(defaults.status).toBe(201);
  const classes = defaults.json.items as { id: string; name: string }[];
  const classId = (name: string) => classes.find((item) => item.name === name)!.id;

  const opened = await t.request('POST', `${base}/sessions`, {
    token: coordinator.token,
    body: { name: 'Ibadah Minggu Pagi', date: new Date().toISOString().slice(0, 10) },
  });
  expect(opened.status).toBe(201);

  const other = await t.register('Other Owner');
  const otherChurch = await t.createChurch(other.token, 'GKI Lain');
  const otherBase = `/api/churches/${otherChurch.id}/checkin`;
  const outsider = await t.createPerson(other.token, otherChurch.id, {
    firstName: 'Anak',
    lastName: 'Luar',
    birthDate: bornYearsAgo(5),
  });
  const otherClass = await t.request('POST', `${otherBase}/classes`, {
    token: other.token,
    body: { name: 'Kelas Lain', minAge: 0, maxAge: 12 },
  });
  expect(otherClass.status).toBe(201);
  const otherSession = await t.request('POST', `${otherBase}/sessions`, {
    token: other.token,
    body: { name: 'Ibadah Lain', date: '2026-10-25' },
  });
  expect(otherSession.status).toBe(201);
  const otherCheckin = await t.request(
    'POST',
    `${otherBase}/sessions/${otherSession.json.session.id}/checkins`,
    { token: other.token, body: { children: [{ personId: outsider.id }] } },
  );
  expect(otherCheckin.status).toBe(201);

  return {
    s,
    church,
    base,
    teacher,
    coordinator,
    clerk,
    guardian,
    sari,
    budi,
    yosua,
    maria,
    adultChild,
    opung,
    neighbour,
    lukas,
    hutapea,
    householdId,
    classes,
    classId,
    session: opened.json.session as { id: string; name: string },
    sessionPath: `${base}/sessions/${opened.json.session.id}`,
    other,
    otherChurch,
    otherBase,
    outsider,
    otherClassId: otherClass.json.class.id as string,
    otherSessionId: otherSession.json.session.id as string,
    otherCheckinId: otherCheckin.json.items[0].id as string,
  };
}

export type CheckinSeed = Awaited<ReturnType<typeof seedCheckin>>;

/** Checks children in as the teacher (or `token`) and returns the created check-ins. */
export async function checkIn(
  t: TestApp,
  c: CheckinSeed,
  body: Record<string, unknown>,
  token = c.teacher.token,
  sessionPath = c.sessionPath,
) {
  const response = await t.request('POST', `${sessionPath}/checkins`, { token, body });
  expect(response.status).toBe(201);
  return response.json.items as {
    id: string;
    classId: string;
    className: string;
    securityCode: string;
    status: string;
    child: { id: string };
  }[];
}
