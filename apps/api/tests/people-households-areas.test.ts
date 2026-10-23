import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from './helpers';
import { seedPeople, type Account, type PeopleSeed } from './people-fixtures';

describe('households and areas', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: PeopleSeed;
  let keeper: Account;
  let areaManager: Account;
  let household: { id: string; name: string };
  let areaId: string;

  beforeAll(async () => {
    s = await seedPeople(t);
    keeper = await s.memberWithRole('Pencatat keluarga', ['households.manage', 'people.create']);
    areaManager = await s.memberWithRole('Pengurus wilayah', ['areas.manage']);
  });

  it('creates a household with members and enforces households.manage', async () => {
    const denied = await t.request('POST', `${s.base}/households`, {
      token: s.member.token,
      body: { name: 'Keluarga Smith' },
    });
    expect(denied.status).toBe(403);
    const deniedAdmin = await t.request('POST', `${s.base}/households`, {
      token: areaManager.token,
      body: { name: 'Keluarga Smith' },
    });
    expect(deniedAdmin.status).toBe(403);
    const invalid = await t.request('POST', `${s.base}/households`, {
      token: keeper.token,
      body: { name: '', members: [{ personId: s.alice.id, relationship: 'boss' }] },
    });
    expect(invalid.status).toBe(422);
    const foreign = await t.request('POST', `${s.base}/households`, {
      token: keeper.token,
      body: {
        name: 'Keluarga Campur',
        members: [{ personId: s.other.person.id, relationship: 'head' }],
      },
    });
    expect(foreign.status).toBe(404);

    const created = await t.request('POST', `${s.base}/households`, {
      token: keeper.token,
      body: {
        name: 'Keluarga Smith',
        address: 'Jl. Kenanga 5',
        phone: '021-555',
        members: [
          { personId: s.alice.id, relationship: 'head', isPrimaryContact: true },
          { personId: s.memberPerson.id, relationship: 'child' },
        ],
      },
    });
    expect(created.status).toBe(201);
    household = created.json.household;
    expect(created.json.household.members.map((m: { firstName: string }) => m.firstName)).toEqual([
      'Alice',
      'Mem',
    ]);
    // Only the family and people who manage households see the shared address by default.
    const outsider = await t.request('GET', `${s.base}/households/${household.id}`, {
      token: s.leader.token,
    });
    expect(outsider.json.household.address).toBeNull();
    expect(outsider.json.household.phone).toBe('021-555');
    expect(outsider.json.canManage).toBe(false);
    const family = await t.request('GET', `${s.base}/households/${household.id}`, {
      token: s.member.token,
    });
    expect(family.json.household.address).toBe('Jl. Kenanga 5');
    const manager = await t.request('GET', `${s.base}/households/${household.id}`, {
      token: keeper.token,
    });
    expect(manager.json.canManage).toBe(true);
    expect(manager.json.canAddPeople).toBe(true);

    const profile = await t.request('GET', `${s.base}/people/${s.memberPerson.id}`, {
      token: s.member.token,
    });
    expect(profile.json.household.id).toBe(household.id);
    expect(profile.json.person.relationship).toBe('child');
    expect(profile.json.person.householdName).toBe('Keluarga Smith');
  });

  it('adds, updates, moves and removes members', async () => {
    const second = await t.request('POST', `${s.base}/households`, {
      token: keeper.token,
      body: { name: 'Keluarga Jones', members: [{ personId: s.bob.id, relationship: 'head' }] },
    });
    expect(second.status).toBe(201);
    const moved = await t.request(
      'POST',
      `${s.base}/households/${second.json.household.id}/members`,
      {
        token: keeper.token,
        body: { personId: s.memberPerson.id, relationship: 'relative' },
      },
    );
    expect(moved.status).toBe(200);
    expect(moved.json.movedFrom).toEqual({ id: household.id, name: 'Keluarga Smith' });
    const smith = await t.request('GET', `${s.base}/households/${household.id}`, {
      token: keeper.token,
    });
    expect(smith.json.household.members).toHaveLength(1);

    const primary = await t.request(
      'PATCH',
      `${s.base}/households/${second.json.household.id}/members/${s.memberPerson.id}`,
      { token: keeper.token, body: { relationship: 'spouse', isPrimaryContact: true } },
    );
    expect(primary.status).toBe(200);
    const contacts = primary.json.household.members.filter(
      (m: { isPrimaryContact: boolean }) => m.isPrimaryContact,
    );
    expect(contacts.map((m: { id: string }) => m.id)).toEqual([s.memberPerson.id]);

    const notMember = await t.request(
      'PATCH',
      `${s.base}/households/${second.json.household.id}/members/${s.alice.id}`,
      { token: keeper.token, body: { relationship: 'spouse', isPrimaryContact: false } },
    );
    expect(notMember.status).toBe(404);

    const removed = await t.request(
      'DELETE',
      `${s.base}/households/${second.json.household.id}/members/${s.memberPerson.id}`,
      { token: keeper.token },
    );
    expect(removed.status).toBe(200);
    expect(removed.json.household.members).toHaveLength(1);
    const removedAgain = await t.request(
      'DELETE',
      `${s.base}/households/${second.json.household.id}/members/${s.memberPerson.id}`,
      { token: keeper.token },
    );
    expect(removedAgain.status).toBe(404);

    // The household.added notification is opt-in, so nothing arrives by default.
    const notes = await s.notificationsOf(s.member.token);
    expect(notes.some((note) => note.type === 'household.added')).toBe(false);
  });

  it('adds a family member from a person page, creating the household when needed', async () => {
    const lone = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Petrus',
      lastName: 'Siregar',
      phone: '0811 222',
      address: 'Jl. Sisingamangaraja 1',
    });
    const denied = await t.request('POST', `${s.base}/people/${lone.id}/family`, {
      token: areaManager.token,
      body: { person: { firstName: 'Rut' }, relationship: 'spouse' },
    });
    expect(denied.status).toBe(403);
    const added = await t.request('POST', `${s.base}/people/${lone.id}/family`, {
      token: keeper.token,
      body: { person: { firstName: 'Rut', lastName: 'Siregar' }, relationship: 'spouse' },
    });
    expect(added.status).toBe(201);
    expect(added.json.household.name).toBe('Keluarga Siregar');
    expect(
      added.json.household.members.map((m: { relationship: string }) => m.relationship),
    ).toEqual(['head', 'spouse']);
    expect(added.json.person.phone).toBe('0811 222');
    expect(added.json.person.householdId).toBe(added.json.household.id);

    const child = await t.request(
      'POST',
      `${s.base}/households/${added.json.household.id}/family-members`,
      {
        token: keeper.token,
        body: {
          person: { firstName: 'Debora', birthDate: '2015-02-01' },
          relationship: 'child',
          copyContact: false,
        },
      },
    );
    expect(child.status).toBe(201);
    expect(child.json.person.phone).toBeNull();
    expect(child.json.household.members).toHaveLength(3);
    const byHousehold = await t.request(
      'GET',
      `${s.base}/people?householdId=${added.json.household.id}`,
      { token: s.member.token },
    );
    expect(byHousehold.json.total).toBe(3);
  });

  it('defines areas, assigns households and reports stats', async () => {
    const denied = await t.request('POST', `${s.base}/areas`, {
      token: keeper.token,
      body: { name: 'Sektor Utara' },
    });
    expect(denied.status).toBe(403);
    const created = await t.request('POST', `${s.base}/areas`, {
      token: areaManager.token,
      body: { name: 'Sektor Utara', code: 'SU', color: '#0ea5e9' },
    });
    expect(created.status).toBe(201);
    areaId = created.json.area.id;
    const duplicate = await t.request('POST', `${s.base}/areas`, {
      token: areaManager.token,
      body: { name: 'Sektor Utara' },
    });
    expect(duplicate.status).toBe(409);

    const foreign = await t.request('POST', `${s.base}/areas/${areaId}/assign`, {
      token: areaManager.token,
      body: { personIds: [s.other.person.id] },
    });
    expect(foreign.status).toBe(404);
    const empty = await t.request('POST', `${s.base}/areas/${areaId}/assign`, {
      token: areaManager.token,
      body: {},
    });
    expect(empty.status).toBe(422);
    const assign = await t.request('POST', `${s.base}/areas/${areaId}/assign`, {
      token: areaManager.token,
      body: { householdIds: [household.id] },
    });
    expect(assign.status).toBe(200);
    expect(assign.json.area.householdCount).toBe(1);
    expect(assign.json.area.personCount).toBe(1);

    const detail = await t.request('GET', `${s.base}/areas/${areaId}`, { token: s.member.token });
    expect(detail.status).toBe(200);
    expect(detail.json.stats.people).toBe(1);
    expect(detail.json.stats.households).toBe(1);
    expect(detail.json.canManage).toBe(false);
    const profile = await t.request('GET', `${s.base}/people/${s.alice.id}`, {
      token: s.member.token,
    });
    expect(profile.json.areaSource).toBe('household');
    expect(profile.json.person.areaId).toBe(areaId);

    // A person's own area overrides the household's.
    const other = await t.request('POST', `${s.base}/areas`, {
      token: areaManager.token,
      body: { name: 'Sektor Selatan', sortOrder: 2 },
    });
    const override = await t.request('PUT', `${s.base}/people/${s.alice.id}/area`, {
      token: areaManager.token,
      body: { areaId: other.json.area.id },
    });
    expect(override.status).toBe(200);
    expect(override.json.person.areaId).toBe(other.json.area.id);
    const clear = await t.request('PUT', `${s.base}/people/${s.alice.id}/area`, {
      token: areaManager.token,
      body: { areaId: null },
    });
    expect(clear.json.person.areaId).toBe(areaId);
    const memberDenied = await t.request('PUT', `${s.base}/people/${s.alice.id}/area`, {
      token: s.member.token,
      body: { areaId: null },
    });
    expect(memberDenied.status).toBe(403);
    const foreignArea = await t.request('PUT', `${s.base}/people/${s.alice.id}/area`, {
      token: areaManager.token,
      body: { areaId: crypto.randomUUID() },
    });
    expect(foreignArea.status).toBe(404);

    const list = await t.request('GET', `${s.base}/areas`, { token: s.member.token });
    expect(list.json.items.map((area: { name: string }) => area.name)).toEqual([
      'Sektor Utara',
      'Sektor Selatan',
    ]);
    const deactivate = await t.request('PATCH', `${s.base}/areas/${other.json.area.id}`, {
      token: areaManager.token,
      body: { name: 'Sektor Selatan', isActive: false },
    });
    expect(deactivate.status).toBe(200);
    const active = await t.request('GET', `${s.base}/areas`, { token: s.member.token });
    expect(active.json.items).toHaveLength(1);
    const all = await t.request('GET', `${s.base}/areas?includeInactive=true`, {
      token: s.member.token,
    });
    expect(all.json.items).toHaveLength(2);

    const households = await t.request('GET', `${s.base}/households?areaId=${areaId}`, {
      token: s.member.token,
    });
    expect(households.json.items.map((h: { id: string }) => h.id)).toEqual([household.id]);
  });

  it('manages coordinators and audits area changes', async () => {
    const unknown = await t.request('POST', `${s.base}/areas/${areaId}/coordinators`, {
      token: areaManager.token,
      body: { userId: s.other.owner.user.id },
    });
    expect(unknown.status).toBe(404);
    const add = await t.request('POST', `${s.base}/areas/${areaId}/coordinators`, {
      token: areaManager.token,
      body: { userId: s.leader.user.id },
    });
    expect(add.json.area.coordinators).toHaveLength(1);
    const again = await t.request('POST', `${s.base}/areas/${areaId}/coordinators`, {
      token: areaManager.token,
      body: { userId: s.leader.user.id },
    });
    expect(again.json.area.coordinators).toHaveLength(1);
    const remove = await t.request(
      'DELETE',
      `${s.base}/areas/${areaId}/coordinators/${s.leader.user.id}`,
      { token: areaManager.token },
    );
    expect(remove.json.area.coordinators).toHaveLength(0);
    const removeAgain = await t.request(
      'DELETE',
      `${s.base}/areas/${areaId}/coordinators/${s.leader.user.id}`,
      { token: areaManager.token },
    );
    expect(removeAgain.status).toBe(404);
    const actions = (await s.auditActions()).map((entry) => entry.action);
    expect(actions).toContain('area.create');
    expect(actions).toContain('area.coordinator_assign');
    expect(actions).toContain('area.coordinator_remove');
  });

  it('deletes areas and households without deleting people, and blocks other churches', async () => {
    for (const [method, path] of [
      ['GET', `/households/${household.id}`],
      ['PATCH', `/households/${household.id}`],
      ['DELETE', `/households/${household.id}`],
      ['GET', `/areas/${areaId}`],
      ['DELETE', `/areas/${areaId}`],
    ] as const) {
      const response = await t.request(method, `${s.other.base}${path}`, {
        token: s.other.owner.token,
        body: method === 'PATCH' ? { name: 'X' } : undefined,
      });
      expect(response.status).toBe(404);
    }
    const deleteArea = await t.request('DELETE', `${s.base}/areas/${areaId}`, {
      token: areaManager.token,
    });
    expect(deleteArea.status).toBe(200);
    const afterArea = await t.request('GET', `${s.base}/households/${household.id}`, {
      token: keeper.token,
    });
    expect(afterArea.json.household.areaId).toBeNull();

    const deleteHousehold = await t.request('DELETE', `${s.base}/households/${household.id}`, {
      token: keeper.token,
    });
    expect(deleteHousehold.status).toBe(200);
    const alice = await t.request('GET', `${s.base}/people/${s.alice.id}`, {
      token: s.admin.token,
    });
    expect(alice.status).toBe(200);
    expect(alice.json.household).toBeNull();
    const actions = (await s.auditActions()).map((entry) => entry.action);
    expect(actions).toContain('household.delete');
    expect(actions).toContain('area.delete');
  });
});
