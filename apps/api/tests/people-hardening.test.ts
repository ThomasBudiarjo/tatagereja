import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createRateLimiter } from '../src/lib/rate-limit';
import { createTestApp, permissiveLimiters } from './helpers';
import { seedPeople, type Account, type PeopleSeed } from './people-fixtures';

describe('people: filters, imports, links and group tools do not leak or escalate', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: PeopleSeed;
  let privateField: { id: string };
  let requiredField: { id: string };

  beforeAll(async () => {
    s = await seedPeople(t);
    const health = await t.request('POST', `${s.base}/directory/fields`, {
      token: s.owner.token,
      body: { key: 'kesehatan', label: 'Kondisi kesehatan', type: 'text', isPrivate: true },
    });
    expect(health.status).toBe(201);
    privateField = health.json.field;
    const saved = await t.request('PUT', `${s.base}/people/${s.alice.id}/fields`, {
      token: s.owner.token,
      body: { values: { [privateField.id]: 'Diabetes' } },
    });
    expect(saved.status).toBe(200);
  });

  it('does not let a filter on a private custom field reveal who has it', async () => {
    const query = `fieldId=${privateField.id}&fieldValue=Diabetes`;
    const asMember = await t.request('GET', `${s.base}/people?${query}`, {
      token: s.member.token,
    });
    expect(asMember.status).toBe(404);
    const exporter = await s.memberWithRole('Ekspor', ['people.export']);
    const exported = await t.request('GET', `${s.base}/people/export?${query}`, {
      token: exporter.token,
    });
    expect(exported.status).toBe(404);
    const viewer = await s.memberWithRole('Pendeta', ['people.private.view']);
    const asViewer = await t.request('GET', `${s.base}/people?${query}`, { token: viewer.token });
    expect(asViewer.status).toBe(200);
    expect(asViewer.json.items.map((person: { id: string }) => person.id)).toEqual([s.alice.id]);
    const unknownField = await t.request(
      'GET',
      `${s.base}/people?fieldId=${s.other.person.id}&fieldValue=x`,
      { token: s.member.token },
    );
    expect(unknownField.status).toBe(404);
  });

  it('does not let an export filter on a private group reveal its members', async () => {
    const secret = await t.request('POST', `${s.base}/groups`, {
      token: s.owner.token,
      body: { name: 'Tim Konseling', visibility: 'private' },
    });
    await t.request('POST', `${s.base}/groups/${secret.json.group.id}/members`, {
      token: s.owner.token,
      body: { personIds: [s.bob.id] },
    });
    const exporter = await s.memberWithRole('Ekspor kelompok', ['people.export']);
    const exported = await t.request(
      'GET',
      `${s.base}/people/export?groupId=${secret.json.group.id}`,
      { token: exporter.token },
    );
    expect(exported.status).toBe(404);
  });

  it('imports private fields only with people.private.edit and checks required fields', async () => {
    const required = await t.request('POST', `${s.base}/directory/fields`, {
      token: s.owner.token,
      body: { key: 'nomor_induk', label: 'Nomor induk', type: 'text', isRequired: true },
    });
    expect(required.status).toBe(201);
    requiredField = required.json.field;
    const importer = await s.memberWithRole('Sekretariat', ['people.create']);
    const preview = await t.request('POST', `${s.base}/people/import`, {
      token: importer.token,
      body: {
        dryRun: true,
        rows: [
          { firstName: 'Tanpa', lastName: 'Nomor' },
          { firstName: 'Rina', 'field:nomor_induk': 'A-1', 'field:kesehatan': 'Asma' },
        ],
      },
    });
    expect(preview.status).toBe(200);
    const [missing, privateRow] = preview.json.rows;
    expect(missing.status).toBe('invalid');
    expect(missing.issues).toContainEqual(
      expect.objectContaining({ path: 'customFields.nomor_induk', code: 'missing' }),
    );
    expect(privateRow.status).toBe('ok');
    expect(privateRow.issues).toContainEqual(
      expect.objectContaining({ path: 'customFields.kesehatan', code: 'field_not_allowed' }),
    );
    const imported = await t.request('POST', `${s.base}/people/import`, {
      token: importer.token,
      body: {
        dryRun: false,
        rows: [{ firstName: 'Rina', 'field:nomor_induk': 'A-1', 'field:kesehatan': 'Asma' }],
      },
    });
    expect(imported.json.created).toBe(1);
    const list = await t.request('GET', `${s.base}/people?q=Rina`, { token: s.owner.token });
    const profile = await t.request('GET', `${s.base}/people/${list.json.items[0].id}`, {
      token: s.owner.token,
    });
    const values = Object.fromEntries(
      profile.json.customFields.map((item: { field: { key: string }; value: string | null }) => [
        item.field.key,
        item.value,
      ]),
    );
    expect(values).toMatchObject({ nomor_induk: 'A-1', kesehatan: null });
    // The required field does not get in the way of the rest of this suite.
    await t.request('DELETE', `${s.base}/directory/fields/${requiredField.id}`, {
      token: s.owner.token,
    });
  });

  it('keeps one primary contact when an import adds heads to a household', async () => {
    const imported = await t.request('POST', `${s.base}/people/import`, {
      token: s.owner.token,
      body: {
        dryRun: false,
        rows: [
          { firstName: 'Markus', householdName: 'Keluarga Sitompul', relationship: 'KK' },
          { firstName: 'Martha', householdName: 'Keluarga Sitompul', relationship: 'head' },
        ],
      },
    });
    expect(imported.json.created).toBe(2);
    const list = await t.request('GET', `${s.base}/households?q=Sitompul`, {
      token: s.owner.token,
    });
    const members = list.json.items[0].members as { isPrimaryContact: boolean }[];
    expect(members.filter((member) => member.isPrimaryContact)).toHaveLength(1);
  });

  it('audits changes to a custom field definition', async () => {
    const updated = await t.request('PATCH', `${s.base}/directory/fields/${privateField.id}`, {
      token: s.owner.token,
      body: { key: 'kesehatan', label: 'Kondisi kesehatan', type: 'text', isPrivate: false },
    });
    expect(updated.status).toBe(200);
    const audit = await s.auditActions('&action=custom_field.update');
    expect(audit[0]?.before).toMatchObject({ isPrivate: true });
    expect(audit[0]?.after).toMatchObject({ isPrivate: false });
  });

  it('does not let account linkers or mergers link their own account to someone else', async () => {
    const linker = await s.memberWithRole('Penaut', ['people.link']);
    const self = await t.request('PUT', `${s.base}/people/${s.bob.id}/user`, {
      token: linker.token,
      body: { userId: linker.user.id },
    });
    expect(self.status).toBe(403);

    const merger = await s.memberWithRole('Penggabung', ['people.merge']);
    const own = await s.linkedPerson(merger, { firstName: 'Penggabung' });
    const merged = await t.request('POST', `${s.base}/people/merge`, {
      token: merger.token,
      body: { keepId: s.alice.id, mergeId: own.id },
    });
    expect(merged.status).toBe(403);
  });

  it('audits group setting changes and hides a leader e-mail the leader keeps private', async () => {
    const patched = await t.request('PATCH', `${s.base}/groups/${s.group.id}`, {
      token: s.leader.token,
      body: { visibility: 'private' },
    });
    expect(patched.status).toBe(200);
    const audit = await s.auditActions('&action=group.update');
    expect(audit[0]?.before).toMatchObject({ visibility: 'public' });
    expect(audit[0]?.after).toMatchObject({ visibility: 'private' });
    await t.request('PATCH', `${s.base}/groups/${s.group.id}`, {
      token: s.leader.token,
      body: { visibility: 'public' },
    });

    const leaderPerson = await s.linkedPerson(s.leader as Account, { firstName: 'Ketua' });
    await t.request('PUT', `${s.base}/people/${leaderPerson.id}/privacy`, {
      token: s.leader.token,
      body: { showPhone: true, showEmail: false, showAddress: false, showBirthday: true },
    });
    const asMember = await t.request('GET', `${s.base}/groups/${s.group.id}`, {
      token: s.member.token,
    });
    expect(asMember.json.group.leaders[0].email).toBe('');
    const list = await t.request('GET', `${s.base}/groups`, { token: s.member.token });
    const listed = list.json.items.find((group: { id: string }) => group.id === s.group.id);
    expect(listed.leaders[0].email).toBe('');
    const asOwner = await t.request('GET', `${s.base}/groups/${s.group.id}`, {
      token: s.owner.token,
    });
    expect(asOwner.json.group.leaders[0].email).toBe(s.leader.user.email);
  });

  it('tells a member once when their join request is approved', async () => {
    const request = await t.request('POST', `${s.base}/groups/${s.otherGroup.id}/join-requests`, {
      token: s.member.token,
      body: {},
    });
    expect(request.status).toBe(201);
    const approve = await t.request(
      'POST',
      `${s.base}/groups/${s.otherGroup.id}/join-requests/${request.json.request.id}/decision`,
      { token: s.owner.token, body: { decision: 'approved' } },
    );
    expect(approve.status).toBe(200);
    const notes = (await s.notificationsOf(s.member.token)).filter(
      (note) => note.link === `/c/${s.church.id}/groups/${s.otherGroup.id}`,
    );
    expect(notes.map((note) => note.type)).toEqual(['group.join_decided']);
  });
});

describe('people: join requests are rate limited', () => {
  const t = createTestApp(
    {},
    {
      limiters: {
        ...permissiveLimiters(),
        'groups.join_request': createRateLimiter({ windowMs: 60_000, max: 2 }),
      },
    },
  );
  afterAll(() => t.close());

  it('stops a member from flooding leaders with requests', async () => {
    const s = await seedPeople(t);
    const path = `${s.base}/groups/${s.otherGroup.id}/join-requests`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await t.request('POST', path, { token: s.member.token, body: {} })).status).toBe(201);
      expect((await t.request('DELETE', `${path}/mine`, { token: s.member.token })).status).toBe(
        200,
      );
    }
    expect((await t.request('POST', path, { token: s.member.token, body: {} })).status).toBe(429);
  });
});
