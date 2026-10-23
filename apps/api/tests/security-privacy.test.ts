import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { schemaTables } from '../src/modules/admin-security/introspection';
import { bornYearsAgo, insertHousehold } from './checkin-fixtures';
import { memberWithRole } from './finance-helpers';
import { createTestApp, seedChurch } from './helpers';
import { OPTIONAL_MODULES } from './route-world';

/*
 * Directory privacy on every surface that shows people (search, birthday lists, the calendar,
 * the Warta Jemaat, exports, rosters, check-in, care, the registry), what data exports and
 * backups leave out, and what remains of an account after it is deleted.
 */

const HIDDEN_PHONE = '0811-4000-9876';
const HIDDEN_EMAIL = 'ruth.private@example.com';

/** `YYYY-MM-DD` `days` from today (UTC), with the year of `year`. */
const birthdayIn = (days: number, year: number) => {
  const date = new Date(Date.now() + days * 86_400_000);
  return `${year}-${date.toISOString().slice(5, 10)}`;
};

describe('directory privacy and data rights', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let church: string;
  let ruthId: string;
  let openId: string;
  const hiddenBirthday = birthdayIn(2, 1960);

  const get = async (path: string, token: string) => {
    const response = await t.request('GET', `${church}${path}`, { token });
    expect(`${path} ${response.status}`).toBe(`${path} 200`);
    return response;
  };
  const text = (response: { json: unknown }) =>
    typeof response.json === 'string' ? response.json : JSON.stringify(response.json);
  const leaks = (body: string) =>
    [HIDDEN_PHONE, HIDDEN_EMAIL, hiddenBirthday].filter((value) => body.includes(value));

  beforeAll(async () => {
    s = await seedChurch(t);
    church = `/api/churches/${s.church.id}`;
    await t.request('PATCH', `${church}/modules`, {
      token: s.owner.token,
      body: { modules: OPTIONAL_MODULES },
    });
    // Ruth hides her phone, email and birthday; Oscar, born the same day, shows his.
    const ruth = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Ruth',
      lastName: 'Tersembunyi',
      phone: HIDDEN_PHONE,
      email: HIDDEN_EMAIL,
      birthDate: hiddenBirthday,
    });
    ruthId = ruth.id;
    const hide = await t.request('PUT', `${church}/people/${ruthId}/privacy`, {
      token: s.owner.token,
      body: { showPhone: false, showEmail: false, showAddress: false, showBirthday: false },
    });
    expect(hide.status).toBe(200);
    const open = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Oscar',
      lastName: 'Terbuka',
      birthDate: birthdayIn(2, 1961),
    });
    openId = open.id;
    await t.request('POST', `${church}/groups/${s.group.id}/members`, {
      token: s.owner.token,
      body: { personIds: [ruthId, openId] },
    });
  });

  it('keeps hidden contact fields out of search and the birthday lists', async () => {
    const byName = await get('/people?q=Ruth', s.member.token);
    expect(byName.json.items).toHaveLength(1);
    expect(byName.json.items[0].phone).toBeNull();
    // A hidden phone number or email finds nobody.
    expect((await get('/people?q=4000-9876', s.member.token)).json.items).toHaveLength(0);
    expect((await get('/people?q=ruth.private', s.member.token)).json.items).toHaveLength(0);

    const celebrating = await get('/people?celebration=birthday&withinDays=7', s.member.token);
    const names = celebrating.json.items.map((item: { firstName: string }) => item.firstName);
    expect(names).toContain('Oscar');
    expect(names).not.toContain('Ruth');

    const dashboard = await get('/dashboard', s.member.token);
    expect(text(dashboard)).toContain('Oscar');
    expect(text(dashboard)).not.toContain('Ruth');

    const from = new Date().toISOString();
    const to = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const calendar = await get(
      `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&sources=birthdays`,
      s.member.token,
    );
    expect(text(calendar)).toContain('Oscar');
    expect(text(calendar)).not.toContain('Ruth');

    const bulletin = await t.request('POST', `${church}/bulletins`, {
      token: s.owner.token,
      body: {
        title: 'Warta Jemaat',
        issueDate: new Date().toISOString().slice(0, 10),
        sections: [{ id: 'hut', kind: 'birthdays', title: 'Selamat Ulang Tahun' }],
      },
    });
    expect(bulletin.status).toBe(201);
    const issue = await get(`/bulletins/${bulletin.json.bulletin.id}`, s.owner.token);
    expect(text(issue)).not.toContain('Ruth');

    // People who may see private details see everything.
    const secretary = await memberWithRole(t, s, 'Sekretaris Data', ['people.private.view']);
    const full = await get('/people?q=4000-9876', secretary.token);
    expect(full.json.items[0]?.phone).toBe(HIDDEN_PHONE);
  });

  it('keeps hidden contact fields out of exports, rosters, care, the registry and check-in', async () => {
    const exporter = await memberWithRole(t, s, 'Petugas Ekspor', ['people.export']);
    const csv = await get('/people/export', exporter.token);
    expect(text(csv)).toContain('Ruth');
    expect(leaks(text(csv))).toEqual([]);

    const roster = await get(`/groups/${s.group.id}`, s.leader.token);
    expect(leaks(text(roster))).toEqual([]);
    const rosterCsv = await get(`/groups/${s.group.id}/roster`, s.leader.token);
    expect(text(rosterCsv)).toContain('Ruth');
    expect(leaks(text(rosterCsv))).toEqual([]);

    const registrar = await memberWithRole(t, s, 'Petugas Register', ['records.manage']);
    const picker = await get('/records/people?q=Ruth', registrar.token);
    expect(picker.json.items[0].birthDate).toBeNull();

    const carer = await memberWithRole(t, s, 'Diaken Penyambutan', ['care.view', 'care.manage']);
    const followUp = await t.request('POST', `${church}/care/follow-ups`, {
      token: carer.token,
      body: { personId: ruthId },
    });
    expect(followUp.status).toBe(201);
    expect(followUp.json.followUp.phone).toBeNull();
    expect(followUp.json.followUp.email).toBeNull();
    expect((await get('/care/follow-ups?q=4000', carer.token)).json.items).toHaveLength(0);

    // Ruth is the guardian of a Sekolah Minggu child: her hidden phone is not its last digits.
    const child = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Timotius',
      lastName: 'Tersembunyi',
      birthDate: bornYearsAgo(5),
    });
    insertHousehold(t, s.church.id, 'Keluarga Tersembunyi', [
      { personId: ruthId, relationship: 'head' },
      { personId: child.id, relationship: 'child' },
    ]);
    const teacher = await memberWithRole(t, s, 'Guru Kelas', ['checkin.operate']);
    const byName = await get('/checkin/households?q=Tersembunyi', teacher.token);
    expect(byName.json.items).toHaveLength(1);
    expect(byName.json.items[0].phoneLast4).toBeNull();
    expect((await get('/checkin/households?q=9876', teacher.token)).json.items).toEqual([]);
  });

  it('leaves credentials out of data exports and backups, and audits both', async () => {
    const credential =
      /"(token|tokenHash|refreshTokenHash|passwordHash|secretEncrypted|codeHash|securityCode)"\s*:/;
    const personal = await t.request('POST', '/api/auth/export', {
      token: s.member.token,
      body: { password: s.member.password },
    });
    expect(personal.status).toBe(200);
    expect(text(personal)).not.toMatch(credential);
    const backup = await t.request('POST', `${church}/security/backup`, {
      token: s.owner.token,
      body: { password: s.owner.password },
    });
    expect(backup.status).toBe(200);
    expect(text(backup)).not.toMatch(credential);
    const audit = await get('/audit-logs?action=church.backup_export', s.owner.token);
    expect(audit.json.items).toHaveLength(1);
  });

  it('removes every trace of a deleted account outside the church records', async () => {
    const leaving = await t.register('Lukas Pergi', `lukas-${Date.now()}@example.com`);
    await t.join(leaving.token, s.invitation.token);
    const person = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Lukas',
      lastName: 'Pergi',
    });
    await t.request('PUT', `${church}/people/${person.id}/user`, {
      token: s.owner.token,
      body: { userId: leaving.user.id },
    });
    // Some of their own data: a prayer request, a calendar feed, home screen choices.
    await t.request('POST', `${church}/care/prayer-requests`, {
      token: leaving.token,
      body: { title: 'Doa untuk pekerjaan', body: 'Mohon didoakan', visibility: 'church' },
    });
    await t.request('POST', `${church}/calendar/feeds`, { token: leaving.token, body: {} });
    await t.request('PUT', `${church}/dashboard/preferences`, {
      token: leaving.token,
      body: { widgets: [] },
    });
    const deleted = await t.request('DELETE', '/api/auth/account', {
      token: leaving.token,
      body: { password: leaving.password },
    });
    expect(deleted.status).toBe(200);

    // The church keeps its own records (the person, the audit log); nothing else names the
    // account: no row holds its id, email or name.
    const traces: string[] = [];
    for (const info of schemaTables()) {
      if (info.name === 'audit_logs' || info.name === 'people') continue;
      const rows = t.db.select().from(info.table).all();
      const found = JSON.stringify(rows);
      for (const value of [leaving.user.id, leaving.user.email]) {
        if (found.includes(value)) traces.push(`${info.name} holds ${value}`);
      }
    }
    expect(traces).toEqual([]);
    const accountEntries = t.db
      .select()
      .from(schemaTables().find((info) => info.name === 'audit_logs')!.table)
      .all() as { churchId: string | null; summary: string; before: unknown; after: unknown }[];
    const accountLevel = accountEntries.filter((entry) => entry.churchId === null);
    expect(JSON.stringify(accountLevel)).not.toContain(leaving.user.email);
    expect(JSON.stringify(accountLevel)).not.toContain('Lukas Pergi');
    const kept = await get(`/people/${person.id}`, s.owner.token);
    expect(kept.json.person.userId).toBeNull();
  });
});
