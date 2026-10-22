import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { attendanceRecords, attendanceSessions } from '../src/db/schema';
import { createTestApp } from './helpers';
import { seedPeople, type Account, type PeopleSeed } from './people-fixtures';

describe('people tools: CSV export and import, duplicates and merge', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: PeopleSeed;
  let exporter: Account;
  let importer: Account;
  let merger: Account;

  beforeAll(async () => {
    s = await seedPeople(t);
    exporter = await s.memberWithRole('Pengekspor', ['people.export']);
    importer = await s.memberWithRole('Pengimpor', ['people.create', 'people.fields.manage']);
    merger = await s.memberWithRole('Penggabung', ['people.merge']);
    const area = await t.request('POST', `${s.base}/areas`, {
      token: s.owner.token,
      body: { name: 'Wilayah 3', code: 'W3' },
    });
    expect(area.status).toBe(201);
    const field = await t.request('POST', `${s.base}/directory/fields`, {
      token: s.owner.token,
      body: { key: 'pekerjaan', label: 'Pekerjaan', type: 'select', options: ['Guru', 'Dokter'] },
    });
    expect(field.status).toBe(201);
  });

  it('exports the filtered directory as CSV for people.export and audits it', async () => {
    const denied = await t.request('GET', `${s.base}/people/export`, { token: s.member.token });
    expect(denied.status).toBe(403);
    await t.request('PATCH', `${s.base}/people/${s.bob.id}`, {
      token: s.owner.token,
      body: { firstName: 'Bob', lastName: 'Jones', phone: '=HYPERLINK("x")', address: 'Rahasia 1' },
    });
    const response = await t.app.handle(
      new Request(`http://localhost${s.base}/people/export?q=bob`, {
        headers: { authorization: `Bearer ${exporter.token}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    const text = await response.text();
    const [header, row] = text
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(header?.split(',')).toContain('field:pekerjaan');
    // Formula injection is neutralised and hidden fields stay hidden for the exporter.
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).not.toContain('Rahasia');
    const audit = await s.auditActions('&action=person.export');
    expect(audit[0]?.after.count).toBe(1);
  });

  it('validates an import in a dry run and reports duplicates', async () => {
    const denied = await t.request('POST', `${s.base}/people/import`, {
      token: exporter.token,
      body: { rows: [{ firstName: 'X' }] },
    });
    expect(denied.status).toBe(403);
    const empty = await t.request('POST', `${s.base}/people/import`, {
      token: importer.token,
      body: { rows: [] },
    });
    expect(empty.status).toBe(422);

    const rows = [
      {
        firstName: 'Yohanes',
        lastName: 'Nainggolan',
        gender: 'L',
        birthDate: '17/08/1985',
        membershipStatus: 'Anggota',
        areaName: 'w3',
        tags: 'Majelis; Paduan Suara',
        'field:pekerjaan': 'Guru',
        householdName: 'Keluarga Nainggolan',
        relationship: 'Kepala Keluarga',
      },
      { firstName: 'Alice', lastName: 'Smith' },
      { firstName: 'Tanpa', birthDate: '1985-13-40' },
      { firstName: 'Salah', areaName: 'Wilayah 99' },
      { firstName: 'Yohanes', lastName: 'Nainggolan' },
      { firstName: 'Lina', 'field:pekerjaan': 'Petani' },
    ];
    const dry = await t.request('POST', `${s.base}/people/import`, {
      token: importer.token,
      body: { rows },
    });
    expect(dry.status).toBe(200);
    expect(dry.json.dryRun).toBe(true);
    expect(dry.json.rows.map((row: { status: string }) => row.status)).toEqual([
      'ok',
      'duplicate',
      'invalid',
      'invalid',
      'duplicate',
      'invalid',
    ]);
    expect(dry.json.rows[1].duplicateOf).toEqual([s.alice.id]);
    expect(dry.json.rows[2].issues[0].path).toBe('birthDate');
    expect(dry.json.rows[0].issues.map((issue: { path: string }) => issue.path)).toContain(
      'householdName',
    );
    const count = await t.request('GET', `${s.base}/people`, { token: s.owner.token });
    expect(count.json.total).toBe(3);
  });

  it('imports accepted rows with tags, area and custom fields in one transaction', async () => {
    const result = await t.request('POST', `${s.base}/people/import`, {
      token: importer.token,
      body: {
        dryRun: false,
        allowDuplicateRows: [1],
        rows: [
          {
            firstName: 'Yohanes',
            lastName: 'Nainggolan',
            gender: 'L',
            birthDate: '17/08/1985',
            membershipStatus: 'Anggota',
            areaName: 'W3',
            tags: 'Majelis; Paduan Suara',
            'field:pekerjaan': 'Guru',
          },
          { firstName: 'Alice', lastName: 'Smith', email: 'alice2@example.com' },
          { firstName: '' },
        ],
      },
    });
    expect(result.status).toBe(200);
    expect(result.json.created).toBe(2);
    expect(result.json.rows.map((row: { status: string }) => row.status)).toEqual([
      'created',
      'created',
      'invalid',
    ]);
    const yohanes = await t.request('GET', `${s.base}/people?q=Yohanes`, { token: s.owner.token });
    const person = yohanes.json.items[0];
    expect(person).toMatchObject({
      gender: 'male',
      birthDate: '1985-08-17',
      membershipStatus: 'member',
    });
    expect(person.tagIds).toHaveLength(2);
    expect(person.areaId).not.toBeNull();
    const profile = await t.request('GET', `${s.base}/people/${person.id}`, {
      token: s.owner.token,
    });
    expect(profile.json.customFields[0].value).toBe('Guru');
    expect((await s.auditActions('&action=person.import'))[0]?.after.created).toBe(2);
  });

  it('finds duplicates and merges them, moving every reference', async () => {
    const admin = await t.request('GET', `${s.base}/people/duplicates`, { token: s.admin.token });
    expect(admin.status).toBe(200);
    const memberDenied = await t.request('GET', `${s.base}/people/duplicates`, {
      token: s.member.token,
    });
    expect(memberDenied.status).toBe(403);
    const list = await t.request('GET', `${s.base}/people/duplicates`, { token: merger.token });
    expect(list.status).toBe(200);
    const pair = list.json.items.find((item: { people: { firstName: string }[] }) =>
      item.people.every((person) => person.firstName === 'Alice'),
    );
    expect(pair.reasons).toEqual(['name']);
    const [original, copy] = pair.people as { id: string }[];
    if (!original || !copy) throw new Error('missing pair');

    // The copy has an attendance record and a group membership the original lacks.
    const group = await t.createGroup(s.owner.token, s.church.id, { name: 'Persekutuan Doa' });
    await t.request('POST', `${s.base}/groups/${group.id}/members`, {
      token: s.owner.token,
      body: { personIds: [copy.id, original.id] },
    });
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    t.db
      .insert(attendanceSessions)
      .values({
        id: sessionId,
        churchId: s.church.id,
        title: 'Ibadah Minggu',
        sessionAt: now,
        createdBy: s.owner.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    t.db
      .insert(attendanceRecords)
      .values({
        id: crypto.randomUUID(),
        sessionId,
        personId: copy.id,
        churchId: s.church.id,
        status: 'present',
        recordedBy: s.owner.user.id,
        recordedAt: now,
      })
      .run();

    const same = await t.request('POST', `${s.base}/people/merge`, {
      token: merger.token,
      body: { keepId: original.id, mergeId: original.id },
    });
    expect(same.status).toBe(422);
    const foreign = await t.request('POST', `${s.base}/people/merge`, {
      token: merger.token,
      body: { keepId: original.id, mergeId: s.other.person.id },
    });
    expect(foreign.status).toBe(404);
    // Merging an unlinked record into a linked one keeps the account.
    const first = await t.request('POST', `${s.base}/people/merge`, {
      token: merger.token,
      body: { keepId: s.memberPerson.id, mergeId: original.id },
    });
    expect(first.status).toBe(200);
    expect(first.json.moved.group_members).toBe(2);
    const merged = await t.request('POST', `${s.base}/people/merge`, {
      token: merger.token,
      body: { keepId: s.memberPerson.id, mergeId: copy.id, takeFields: ['email'] },
    });
    expect(merged.status).toBe(200);
    expect(merged.json.person.email).toBe('alice2@example.com');
    expect(merged.json.person.userId).toBe(s.member.user.id);
    expect(merged.json.moved.attendance_records).toBe(1);
    // The kept record is already in the group, so that row stays behind and is removed.
    expect(merged.json.moved.group_members).toBeUndefined();
    expect(
      (await t.request('GET', `${s.base}/people/${copy.id}`, { token: s.owner.token })).status,
    ).toBe(404);
    const groupPage = await t.request('GET', `${s.base}/groups/${group.id}`, {
      token: s.owner.token,
    });
    expect(groupPage.json.members.map((m: { id: string }) => m.id)).toEqual([s.memberPerson.id]);
    const history = await t.request('GET', `${s.base}/people/${s.memberPerson.id}/attendance`, {
      token: s.member.token,
    });
    expect(history.json.items).toHaveLength(1);
    const audit = await s.auditActions('&action=person.merge');
    expect(audit).toHaveLength(2);
    expect(audit[0]?.after.moved.attendance_records).toBe(1);
  });

  it('refuses to merge two records linked to accounts', async () => {
    const linked = await s.linkedPerson(exporter, { firstName: 'Ekspor' });
    const response = await t.request('POST', `${s.base}/people/merge`, {
      token: merger.token,
      body: { keepId: s.memberPerson.id, mergeId: linked.id },
    });
    expect(response.status).toBe(409);
  });
});
