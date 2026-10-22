import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from './helpers';
import { seedPeople, type Account, type PeopleSeed } from './people-fixtures';

/** Dates relative to today in the church time zone (Asia/Jakarta by default). */
const todayParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
  .format(new Date())
  .split('-')
  .map(Number);
const yearsAgo = (years: number, days = 0) =>
  new Date(
    Date.UTC(
      (todayParts[0] ?? 2000) - years,
      (todayParts[1] ?? 1) - 1,
      (todayParts[2] ?? 1) + days,
    ),
  )
    .toISOString()
    .slice(0, 10);

describe('people directory: filters, privacy, tags and custom fields', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: PeopleSeed;
  let secretary: Account;
  let editor: Account;
  let viewer: Account;
  let coordinator: Account;
  let budi: { id: string };
  let sari: { id: string };
  let anak: { id: string };

  beforeAll(async () => {
    s = await seedPeople(t);
    secretary = await s.memberWithRole('Sekretaris', [
      'people.create',
      'people.fields.manage',
      'areas.manage',
      'households.manage',
    ]);
    editor = await s.memberWithRole('Editor', ['people.edit']);
    viewer = await s.memberWithRole('Penatua', ['people.private.view']);
    coordinator = await t.register('Koordinator');
    await t.join(coordinator.token, s.invitation.token);
    budi = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Budi',
      lastName: 'Santoso',
      gender: 'male',
      birthDate: yearsAgo(40, 3),
      phone: '0812-3456-7890',
      email: 'budi@example.com',
      address: 'Jl. Merdeka 10',
      membershipStatus: 'member',
      weddingDate: yearsAgo(15, 2),
    });
    sari = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Sari',
      lastName: 'Santoso',
      gender: 'female',
      birthDate: yearsAgo(38, 40),
      phone: '0813 1111 2222',
      membershipStatus: 'member',
    });
    anak = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Yosua',
      lastName: 'Santoso',
      gender: 'male',
      birthDate: yearsAgo(10),
      membershipStatus: 'regular',
    });
  });

  const list = async (token: string, query = '') => {
    const response = await t.request('GET', `${s.base}/people${query}`, { token });
    expect(response.status).toBe(200);
    return response.json as {
      items: { id: string; firstName: string; phone: string | null; [key: string]: unknown }[];
      total: number;
    };
  };
  const names = (result: { items: { firstName: string }[] }) =>
    result.items.map((item) => item.firstName);

  it('filters by status, gender, age, account and sorts by upcoming birthday', async () => {
    expect(names(await list(s.member.token, '?gender=female'))).toEqual(['Sari']);
    expect(names(await list(s.member.token, '?status=regular'))).toEqual(['Yosua']);
    expect(names(await list(s.member.token, '?maxAge=12'))).toEqual(['Yosua']);
    expect(names(await list(s.member.token, '?minAge=30&maxAge=45&sort=name'))).toEqual([
      'Budi',
      'Sari',
    ]);
    expect(names(await list(s.member.token, '?hasAccount=true'))).toEqual(['Mem']);
    const birthdays = await list(s.member.token, '?sort=birthday');
    expect(names(birthdays).slice(0, 3)).toEqual(['Yosua', 'Budi', 'Sari']);
    const celebrating = await list(s.member.token, '?celebration=any&withinDays=7');
    expect(names(celebrating).sort()).toEqual(['Budi', 'Yosua']);
    const anniversary = await list(s.member.token, '?celebration=anniversary');
    expect(names(anniversary)).toEqual(['Budi']);
    const desc = await list(s.member.token, '?sort=name&order=desc&limit=2');
    expect(names(desc)).toEqual(['Yosua', 'Sari']);
    expect(
      (await t.request('GET', `${s.base}/people?minAge=-1`, { token: s.member.token })).status,
    ).toBe(422);
    expect(
      (await t.request('GET', `${s.base}/people?sort=age`, { token: s.member.token })).status,
    ).toBe(422);
    const items = (await list(s.member.token, '?q=budi')).items;
    expect(items[0]).toMatchObject({
      householdId: null,
      areaId: null,
      tagIds: [],
      hasAccount: false,
    });
  });

  it('strips hidden contact fields unless the caller may see them', async () => {
    // Defaults: phone, e-mail and birthday shown; address hidden.
    const memberView = (await list(s.member.token, '?q=Budi')).items[0];
    expect(memberView?.phone).toBe('0812-3456-7890');
    expect(memberView?.address).toBeNull();
    const adminView = (await list(s.admin.token, '?q=Budi')).items[0];
    expect(adminView?.address).toBe('Jl. Merdeka 10');

    // Budi hides his phone and birthday (an administrator with private.edit sets it).
    const hide = await t.request('PUT', `${s.base}/people/${budi.id}/privacy`, {
      token: s.admin.token,
      body: { showPhone: false, showEmail: true, showAddress: false, showBirthday: false },
    });
    expect(hide.status).toBe(200);

    const hidden = (await list(s.member.token, '?q=Budi')).items[0];
    expect(hidden?.phone).toBeNull();
    expect(hidden?.birthDate).toBeNull();
    expect(hidden?.email).toBe('budi@example.com');
    expect((await list(viewer.token, '?q=Budi')).items[0]?.phone).toBe('0812-3456-7890');

    // Searching or filtering on a hidden field does not reveal it.
    expect((await list(s.member.token, '?q=3456')).total).toBe(0);
    expect((await list(viewer.token, '?q=3456')).total).toBe(1);
    expect(names(await list(s.member.token, '?minAge=39&maxAge=41'))).toEqual([]);
    expect(names(await list(viewer.token, '?minAge=39&maxAge=41'))).toEqual(['Budi']);
    expect(names(await list(s.member.token, '?celebration=birthday'))).toEqual(['Yosua']);

    const profile = await t.request('GET', `${s.base}/people/${budi.id}`, {
      token: s.member.token,
    });
    expect(profile.status).toBe(200);
    expect(profile.json.person.phone).toBeNull();
    expect(profile.json.hiddenFields.sort()).toEqual(['address', 'birthday', 'phone']);
    expect(profile.json.privacy).toBeNull();
    expect(profile.json.canEditPrivacy).toBe(false);
  });

  it('lets people manage their own privacy and audits changes', async () => {
    const own = await t.request('PUT', `${s.base}/people/${s.memberPerson.id}/privacy`, {
      token: s.member.token,
      body: { showPhone: false, showEmail: false, showAddress: true, showBirthday: true },
    });
    expect(own.status).toBe(200);
    const self = await t.request('GET', `${s.base}/people/${s.memberPerson.id}`, {
      token: s.member.token,
    });
    expect(self.json.privacy).toEqual({
      showPhone: false,
      showEmail: false,
      showAddress: true,
      showBirthday: true,
    });
    expect(self.json.hiddenFields).toEqual([]);
    expect(self.json.linkedUser.id).toBe(s.member.user.id);

    const otherMember = await t.request('PUT', `${s.base}/people/${budi.id}/privacy`, {
      token: s.member.token,
      body: { showPhone: true, showEmail: true, showAddress: true, showBirthday: true },
    });
    expect(otherMember.status).toBe(403);
    const leader = await t.request('PUT', `${s.base}/people/${budi.id}/privacy`, {
      token: s.leader.token,
      body: { showPhone: true, showEmail: true, showAddress: true, showBirthday: true },
    });
    expect(leader.status).toBe(403);
    const invalid = await t.request('PUT', `${s.base}/people/${budi.id}/privacy`, {
      token: s.admin.token,
      body: { showPhone: 'no' },
    });
    expect(invalid.status).toBe(422);

    // The account e-mail of someone else is not shown to plain members.
    const linkedByOthers = await t.request('GET', `${s.base}/people/${s.memberPerson.id}`, {
      token: s.leader.token,
    });
    expect(linkedByOthers.json.linkedUser).toBeNull();
    expect(linkedByOthers.json.person.hasAccount).toBe(true);

    const actions = (await s.auditActions('&action=person.privacy_update')).map((e) => e.action);
    expect(actions.length).toBeGreaterThanOrEqual(2);
  });

  it('manages tags with people.fields.manage and assigns them with people.edit', async () => {
    const denied = await t.request('POST', `${s.base}/directory/tags`, {
      token: s.member.token,
      body: { name: 'Majelis' },
    });
    expect(denied.status).toBe(403);
    const majelis = await t.request('POST', `${s.base}/directory/tags`, {
      token: secretary.token,
      body: { name: 'Majelis', color: '#7c3aed' },
    });
    expect(majelis.status).toBe(201);
    const duplicate = await t.request('POST', `${s.base}/directory/tags`, {
      token: secretary.token,
      body: { name: 'Majelis' },
    });
    expect(duplicate.status).toBe(409);
    const badColor = await t.request('POST', `${s.base}/directory/tags`, {
      token: secretary.token,
      body: { name: 'Pemuda', color: 'purple' },
    });
    expect(badColor.status).toBe(422);
    const pemuda = await t.request('POST', `${s.base}/directory/tags`, {
      token: secretary.token,
      body: { name: 'Pemuda' },
    });
    const tagId = majelis.json.tag.id as string;

    expect(
      (
        await t.request('PUT', `${s.base}/people/${budi.id}/tags`, {
          token: secretary.token,
          body: { tagIds: [tagId] },
        })
      ).status,
    ).toBe(403);
    const assigned = await t.request('PUT', `${s.base}/people/${budi.id}/tags`, {
      token: editor.token,
      body: { tagIds: [tagId, pemuda.json.tag.id] },
    });
    expect(assigned.status).toBe(200);
    expect(assigned.json.person.tagIds).toHaveLength(2);

    // A tag from another church is unknown here.
    const otherTag = await t.request('POST', `${s.other.base}/directory/tags`, {
      token: s.other.owner.token,
      body: { name: 'Luar' },
    });
    const idor = await t.request('PUT', `${s.base}/people/${budi.id}/tags`, {
      token: editor.token,
      body: { tagIds: [otherTag.json.tag.id] },
    });
    expect(idor.status).toBe(404);

    expect(names(await list(s.member.token, `?tagId=${tagId}`))).toEqual(['Budi']);
    const tags = await t.request('GET', `${s.base}/directory/tags`, { token: s.member.token });
    expect(tags.json.items.find((tag: { id: string }) => tag.id === tagId).personCount).toBe(1);

    const renamed = await t.request('PATCH', `${s.base}/directory/tags/${tagId}`, {
      token: secretary.token,
      body: { name: 'Majelis Jemaat', color: '#7c3aed' },
    });
    expect(renamed.json.tag.name).toBe('Majelis Jemaat');
    const removed = await t.request('DELETE', `${s.base}/directory/tags/${pemuda.json.tag.id}`, {
      token: secretary.token,
    });
    expect(removed.status).toBe(200);
    const profile = await t.request('GET', `${s.base}/people/${budi.id}`, {
      token: s.member.token,
    });
    expect(profile.json.tags.map((tag: { name: string }) => tag.name)).toEqual(['Majelis Jemaat']);
    expect((await s.auditActions('&action=tag.delete')).length).toBe(1);
  });

  it('defines custom fields and validates values by type, privacy and requirement', async () => {
    const field = async (body: Record<string, unknown>) =>
      t.request('POST', `${s.base}/directory/fields`, { token: secretary.token, body });
    expect((await field({ key: 'Bad Key', label: 'x', type: 'text' })).status).toBe(422);
    expect((await field({ key: 'pekerjaan', label: 'Pekerjaan', type: 'select' })).status).toBe(
      422,
    );
    const job = await field({
      key: 'pekerjaan',
      label: 'Pekerjaan',
      type: 'select',
      options: ['Guru', 'Wiraswasta', 'PNS'],
    });
    expect(job.status).toBe(201);
    expect((await field({ key: 'pekerjaan', label: 'Lagi', type: 'text' })).status).toBe(409);
    const nij = await field({
      key: 'nomor_induk',
      label: 'Nomor induk jemaat',
      type: 'text',
      isPrivate: true,
    });
    const sidi = await field({ key: 'sudah_sidi', label: 'Sudah sidi', type: 'checkbox' });
    const memberDenied = await t.request('POST', `${s.base}/directory/fields`, {
      token: s.member.token,
      body: { key: 'x', label: 'x', type: 'text' },
    });
    expect(memberDenied.status).toBe(403);

    const set = (token: string, personId: string, values: Record<string, string | null>) =>
      t.request('PUT', `${s.base}/people/${personId}/fields`, { token, body: { values } });
    const invalidChoice = await set(s.admin.token, budi.id, { [job.json.field.id]: 'Petani' });
    expect(invalidChoice.status).toBe(422);
    expect(invalidChoice.json.error.issues[0].path).toBe(`values.${job.json.field.id}`);
    expect((await set(s.admin.token, budi.id, { [sidi.json.field.id]: 'ya' })).status).toBe(422);
    const ok = await set(s.admin.token, budi.id, {
      [job.json.field.id]: 'Guru',
      [sidi.json.field.id]: 'true',
      [nij.json.field.id]: 'GKI-0042',
    });
    expect(ok.status).toBe(200);

    // A plain member does not see private fields of others, and cannot edit them.
    const memberProfile = await t.request('GET', `${s.base}/people/${budi.id}`, {
      token: s.member.token,
    });
    const keys = memberProfile.json.customFields.map(
      (item: { field: { key: string } }) => item.field.key,
    );
    expect(keys).toContain('pekerjaan');
    expect(keys).not.toContain('nomor_induk');
    const viewerProfile = await t.request('GET', `${s.base}/people/${budi.id}`, {
      token: viewer.token,
    });
    expect(
      viewerProfile.json.customFields.find(
        (item: { field: { key: string } }) => item.field.key === 'nomor_induk',
      ).value,
    ).toBe('GKI-0042');
    expect((await set(s.member.token, budi.id, { [job.json.field.id]: 'PNS' })).status).toBe(403);
    // People edit their own non-private fields.
    expect(
      (await set(s.member.token, s.memberPerson.id, { [job.json.field.id]: 'PNS' })).status,
    ).toBe(200);

    expect(
      names(await list(s.member.token, `?fieldId=${job.json.field.id}&fieldValue=Guru`)),
    ).toEqual(['Budi']);

    // Changing the type of a field with values is refused.
    const retype = await t.request('PATCH', `${s.base}/directory/fields/${job.json.field.id}`, {
      token: secretary.token,
      body: { key: 'pekerjaan', label: 'Pekerjaan', type: 'text' },
    });
    expect(retype.status).toBe(409);

    // Required fields must be filled from the person form.
    const required = await field({
      key: 'wilayah_lama',
      label: 'Wilayah lama',
      type: 'text',
      isRequired: true,
    });
    const missing = await t.request('POST', `${s.base}/people`, {
      token: s.admin.token,
      body: { firstName: 'Tanpa', customFields: {} },
    });
    expect(missing.status).toBe(422);
    expect(missing.json.error.issues[0].path).toBe(`customFields.${required.json.field.id}`);
    const withValue = await t.request('POST', `${s.base}/people`, {
      token: s.admin.token,
      body: { firstName: 'Lengkap', customFields: { [required.json.field.id]: 'Sektor 2' } },
    });
    expect(withValue.status).toBe(201);
    // Other callers (other modules) that send no custom fields are not blocked.
    expect(
      (
        await t.request('POST', `${s.base}/people`, {
          token: s.admin.token,
          body: { firstName: 'Biasa' },
        })
      ).status,
    ).toBe(201);
    const deleted = await t.request(
      'DELETE',
      `${s.base}/directory/fields/${required.json.field.id}`,
      {
        token: secretary.token,
      },
    );
    expect(deleted.status).toBe(200);

    const fieldsForMember = await t.request('GET', `${s.base}/directory/fields`, {
      token: s.member.token,
    });
    expect(fieldsForMember.json.items.map((item: { key: string }) => item.key)).not.toContain(
      'nomor_induk',
    );
  });

  it('saves tags and fields with the person form and keeps admin fields administrative', async () => {
    const tags = await t.request('GET', `${s.base}/directory/tags`, { token: s.admin.token });
    const tagId = tags.json.items[0].id;
    const created = await t.request('POST', `${s.base}/people`, {
      token: s.admin.token,
      body: { firstName: 'Maria', tagIds: [tagId], weddingDate: '2010-06-12' },
    });
    expect(created.status).toBe(201);
    expect(created.json.person.tagIds).toEqual([tagId]);
    expect(created.json.person.weddingDate).toBe('2010-06-12');

    const selfTags = await t.request('PATCH', `${s.base}/people/${s.memberPerson.id}`, {
      token: s.member.token,
      body: { firstName: 'Mem', tagIds: [tagId] },
    });
    expect(selfTags.status).toBe(403);
    const selfEdit = await t.request('PATCH', `${s.base}/people/${s.memberPerson.id}`, {
      token: s.member.token,
      body: { firstName: 'Mem', lastName: 'Ber', membershipStatus: 'member' },
    });
    expect(selfEdit.status).toBe(200);
    expect(selfEdit.json.person.membershipStatus).toBe('visitor');

    const statusChange = await t.request('PATCH', `${s.base}/people/${created.json.person.id}`, {
      token: editor.token,
      body: { firstName: 'Maria', membershipStatus: 'member', joinedAt: '2020-01-05' },
    });
    expect(statusChange.json.person.membershipStatus).toBe('member');
    const audit = await s.auditActions('&action=person.status_change');
    expect(audit[0]?.after).toEqual({ membershipStatus: 'member', joinedAt: '2020-01-05' });
  });

  it('lets area coordinators edit the people of their area only', async () => {
    const area = await t.request('POST', `${s.base}/areas`, {
      token: secretary.token,
      body: { name: 'Wilayah 1', code: 'W-01' },
    });
    expect(area.status).toBe(201);
    const assign = await t.request('POST', `${s.base}/areas/${area.json.area.id}/assign`, {
      token: secretary.token,
      body: { personIds: [sari.id] },
    });
    expect(assign.status).toBe(200);
    const before = await t.request('PATCH', `${s.base}/people/${sari.id}`, {
      token: coordinator.token,
      body: { firstName: 'Sari', phone: '0813 9999' },
    });
    expect(before.status).toBe(403);

    const made = await t.request('POST', `${s.base}/areas/${area.json.area.id}/coordinators`, {
      token: secretary.token,
      body: { userId: coordinator.user.id },
    });
    expect(made.status).toBe(200);
    expect(made.json.area.coordinators.map((c: { userId: string }) => c.userId)).toEqual([
      coordinator.user.id,
    ]);
    const notes = await s.notificationsOf(coordinator.token);
    expect(notes.some((note) => note.type === 'area.coordinator_assigned')).toBe(true);

    const after = await t.request('PATCH', `${s.base}/people/${sari.id}`, {
      token: coordinator.token,
      body: {
        firstName: 'Sari',
        lastName: 'Santoso',
        phone: '0813 9999',
        membershipStatus: 'inactive',
      },
    });
    expect(after.status).toBe(200);
    expect(after.json.person.membershipStatus).toBe('member');
    const outside = await t.request('PATCH', `${s.base}/people/${anak.id}`, {
      token: coordinator.token,
      body: { firstName: 'Yosua' },
    });
    expect(outside.status).toBe(403);
    const profile = await t.request('GET', `${s.base}/people/${sari.id}`, {
      token: coordinator.token,
    });
    expect(profile.json.canEdit).toBe(true);
    expect(profile.json.area.name).toBe('Wilayah 1');
    expect(profile.json.areaSource).toBe('person');

    // Fields the person hid stay stored when an editor who cannot see them saves the form.
    await t.request('PUT', `${s.base}/people/${sari.id}/privacy`, {
      token: s.admin.token,
      body: { showPhone: false, showEmail: true, showAddress: false, showBirthday: true },
    });
    const blind = await t.request('PATCH', `${s.base}/people/${sari.id}`, {
      token: coordinator.token,
      body: { firstName: 'Sari', lastName: 'Santoso', phone: null, notes: 'Pindah sektor' },
    });
    expect(blind.status).toBe(200);
    expect(blind.json.person.phone).toBeNull();
    const stored = await t.request('GET', `${s.base}/people/${sari.id}`, { token: s.admin.token });
    expect(stored.json.person.phone).toBe('0813 9999');
    expect(stored.json.person.notes).toBe('Pindah sektor');

    const me = await t.request('GET', `${s.base}/directory/me`, { token: coordinator.token });
    expect(me.json.coordinatedAreaIds).toEqual([area.json.area.id]);
    expect(names(await list(s.member.token, `?areaId=${area.json.area.id}`))).toEqual(['Sari']);
  });

  it('builds a timeline and the directory summary', async () => {
    const timeline = await t.request('GET', `${s.base}/people/${s.alice.id}/timeline`, {
      token: s.admin.token,
    });
    expect(timeline.status).toBe(200);
    expect(timeline.json.items.map((item: { kind: string }) => item.kind)).toContain(
      'group_joined',
    );
    expect(timeline.json.attendance).toEqual({ present: 0, total: 0, lastPresentAt: null });

    const summary = await t.request('GET', `${s.base}/directory/summary`, {
      token: s.member.token,
    });
    expect(summary.status).toBe(200);
    expect(summary.json.people).toBeGreaterThanOrEqual(6);
    const kinds = summary.json.celebrations.map(
      (item: { person: { firstName: string }; kind: string }) =>
        `${item.person.firstName}:${item.kind}`,
    );
    expect(kinds).toContain('Budi:anniversary');
    // Budi hid his birthday, so members do not see it among the celebrations.
    expect(kinds).not.toContain('Budi:birthday');
    expect(kinds).toContain('Yosua:birthday');
    const viewerSummary = await t.request('GET', `${s.base}/directory/summary`, {
      token: viewer.token,
    });
    expect(
      viewerSummary.json.celebrations.some(
        (item: { person: { firstName: string }; kind: string }) =>
          item.person.firstName === 'Budi' && item.kind === 'birthday',
      ),
    ).toBe(true);
  });

  it('lists member accounts only for people who link or appoint them', async () => {
    expect(
      (await t.request('GET', `${s.base}/directory/accounts`, { token: s.member.token })).status,
    ).toBe(403);
    const accounts = await t.request('GET', `${s.base}/directory/accounts`, {
      token: s.admin.token,
    });
    expect(accounts.status).toBe(200);
    const member = accounts.json.items.find(
      (item: { userId: string }) => item.userId === s.member.user.id,
    );
    expect(member.personId).toBe(s.memberPerson.id);
    expect(
      accounts.json.items.some((item: { userId: string }) => item.userId === s.other.owner.user.id),
    ).toBe(false);
  });

  it('refuses ids from another church and private groups as filters', async () => {
    for (const [method, path] of [
      ['GET', `/people/${s.other.person.id}`],
      ['PATCH', `/people/${s.other.person.id}`],
      ['GET', `/people/${s.other.person.id}/timeline`],
      ['PUT', `/people/${s.other.person.id}/privacy`],
      ['DELETE', `/people/${s.other.person.id}`],
    ] as const) {
      const body =
        method === 'PATCH'
          ? { firstName: 'X' }
          : method === 'PUT'
            ? { showPhone: true, showEmail: true, showAddress: true, showBirthday: true }
            : undefined;
      const response = await t.request(method, `${s.base}${path}`, { token: s.owner.token, body });
      expect(response.status).toBe(404);
    }
    const foreignGroup = await t.request('GET', `${s.base}/people?groupId=${s.other.group.id}`, {
      token: s.owner.token,
    });
    expect(foreignGroup.status).toBe(404);

    const secret = await t.request('POST', `${s.base}/groups`, {
      token: s.owner.token,
      body: { name: 'Tim Konseling', visibility: 'private' },
    });
    expect(secret.status).toBe(201);
    expect(
      (
        await t.request('GET', `${s.base}/people?groupId=${secret.json.group.id}`, {
          token: s.member.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await t.request('GET', `${s.base}/people?groupId=${secret.json.group.id}`, {
          token: s.admin.token,
        })
      ).status,
    ).toBe(200);
    // Outsiders cannot read the directory of a church they do not belong to.
    expect(
      (await t.request('GET', `${s.base}/people`, { token: s.other.owner.token })).status,
    ).toBe(403);
  });
});
