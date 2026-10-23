import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { addDaysToDate } from '@tatagereja/shared';
import { financeAccounts, financeCategories, financeEntries, financeFunds } from '../src/db/schema';
import {
  commsAudit,
  dayOf,
  inDays,
  notificationsOf,
  seedComms,
  type CommsSeed,
} from './comms-fixtures';
import { createTestApp } from './helpers';

type Section = {
  kind: string;
  title: string;
  items: { title: string; subtitle: string | null; body: string | null; years: number | null }[];
  finance: {
    income: number;
    expense: number;
    byCategory: { name: string; amount: number }[];
  } | null;
};

describe('comms Warta Jemaat', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CommsSeed;
  let url: string;
  const issueDate = dayOf(inDays(1));
  let bulletinId = '';

  const sections = [
    { id: 's1', kind: 'text', title: 'Renungan', body: 'Kasih itu **sabar**.' },
    { id: 's2', kind: 'services', title: 'Jadwal Ibadah' },
    { id: 's3', kind: 'rosters', title: 'Petugas Pelayanan' },
    { id: 's4', kind: 'announcements', title: 'Pengumuman' },
    { id: 's5', kind: 'events', title: 'Kegiatan' },
    { id: 's6', kind: 'birthdays', title: 'Selamat Ulang Tahun' },
    { id: 's7', kind: 'anniversaries', title: 'HUT Pernikahan' },
    { id: 's8', kind: 'finance', title: 'Persembahan Minggu Lalu' },
  ];

  beforeAll(async () => {
    c = await seedComms(t);
    url = `${c.church}/bulletins`;
    const at = (days: number, hour: number) => inDays(days, hour);

    expect(
      (
        await t.request('POST', `${c.church}/announcements`, {
          token: c.announcer.token,
          body: {
            title: 'Pendaftaran Katekisasi',
            body: 'Dibuka sampai akhir bulan',
            status: 'published',
          },
        })
      ).status,
    ).toBe(201);
    await t.request('POST', `${c.church}/announcements`, {
      token: c.announcer.token,
      body: {
        title: 'Rapat Tertutup Majelis',
        body: 'Hanya untuk peran',
        status: 'published',
        audience: 'roles',
        roleIds: [c.roles.plain],
      },
    });

    const service = await t.request('POST', `${c.church}/worship/services`, {
      token: c.s.owner.token,
      body: {
        title: 'Ibadah Minggu',
        startsAt: at(1, 2),
        status: 'published',
        preacherName: 'Pdt. Samuel',
      },
    });
    expect(service.status).toBe(201);
    const team = await t.request('POST', `${c.church}/worship/teams`, {
      token: c.s.owner.token,
      body: { name: 'Musik' },
    });
    const position = await t.request(
      'POST',
      `${c.church}/worship/teams/${team.json.team.id}/positions`,
      {
        token: c.s.owner.token,
        body: { name: 'Organis' },
      },
    );
    await t.request('POST', `${c.church}/worship/teams/${team.json.team.id}/members`, {
      token: c.s.owner.token,
      body: { personId: c.leaderPerson.id },
    });
    const roster = await t.request(
      'POST',
      `${c.church}/worship/services/${service.json.service.id}/roster`,
      {
        token: c.s.owner.token,
        body: {
          assignments: [{ positionId: position.json.position.id, personId: c.leaderPerson.id }],
          ignoreConflicts: true,
        },
      },
    );
    expect(roster.status).toBe(201);

    await t.request('POST', `${c.church}/events`, {
      token: c.s.admin.token,
      body: { title: 'Rapat Komisi Wanita', startsAt: at(3, 10) },
    });

    const birthday = addDaysToDate(issueDate, 2);
    await t.createPerson(c.s.owner.token, c.s.church.id, {
      firstName: 'Martha',
      lastName: 'Lubis',
      birthDate: `1956-${birthday.slice(5)}`,
    });
    const shy = await t.createPerson(c.s.owner.token, c.s.church.id, {
      firstName: 'Tabita',
      birthDate: `1990-${birthday.slice(5)}`,
    });
    await t.request('PUT', `${c.church}/people/${shy.id}/privacy`, {
      token: c.s.owner.token,
      body: { showPhone: true, showEmail: true, showAddress: false, showBirthday: false },
    });
    const wedding = `2001-${addDaysToDate(issueDate, 4).slice(5)}`;
    const husband = await t.createPerson(c.s.owner.token, c.s.church.id, {
      firstName: 'Petrus',
      lastName: 'Situmorang',
      weddingDate: wedding,
    });
    const wife = await t.createPerson(c.s.owner.token, c.s.church.id, {
      firstName: 'Maria',
      lastName: 'Situmorang',
      weddingDate: wedding,
    });
    await t.request('POST', `${c.church}/households`, {
      token: c.s.owner.token,
      body: {
        name: 'Keluarga Situmorang',
        members: [
          { personId: husband.id, relationship: 'head' },
          { personId: wife.id, relationship: 'spouse' },
        ],
      },
    });

    const now = new Date().toISOString();
    const fund = {
      id: crypto.randomUUID(),
      churchId: c.s.church.id,
      name: 'Kas Umum',
      createdAt: now,
      updatedAt: now,
    };
    const account = {
      id: crypto.randomUUID(),
      churchId: c.s.church.id,
      name: 'Kas Tunai',
      type: 'cash' as const,
      openingDate: '2026-01-01',
      createdAt: now,
      updatedAt: now,
    };
    const category = {
      id: crypto.randomUUID(),
      churchId: c.s.church.id,
      kind: 'income' as const,
      name: 'Persembahan Minggu',
      createdAt: now,
      updatedAt: now,
    };
    t.db.insert(financeFunds).values(fund).run();
    t.db.insert(financeAccounts).values(account).run();
    t.db.insert(financeCategories).values(category).run();
    const entry = (
      amount: number,
      sourceType: 'offering' | 'expense' | 'transfer',
      categoryId: string | null,
    ) => ({
      id: crypto.randomUUID(),
      churchId: c.s.church.id,
      entryDate: addDaysToDate(issueDate, -3),
      accountId: account.id,
      fundId: fund.id,
      categoryId,
      amount,
      description: 'Tes',
      sourceType,
      createdAt: now,
    });
    t.db
      .insert(financeEntries)
      .values([
        entry(1_500_000, 'offering', category.id),
        entry(-200_000, 'expense', null),
        entry(999_999, 'transfer', null),
      ])
      .run();
  });

  it('lets only bulletin editors compose', async () => {
    const body = { title: 'Warta Jemaat Minggu Ini', issueDate, sections };
    for (const token of [c.s.member.token, c.plain.token, c.announcer.token, c.treasurer.token]) {
      expect((await t.request('POST', url, { token, body })).status).toBe(403);
    }
    const created = await t.request('POST', url, {
      token: c.editor.token,
      body: { ...body, theme: 'Kasih yang sabar' },
    });
    expect(created.status).toBe(201);
    expect(created.json.bulletin.status).toBe('draft');
    expect(created.json.bulletin.includeFinanceSummary).toBe(true);
    bulletinId = created.json.bulletin.id;

    const invalid = await t.request('POST', url, {
      token: c.editor.token,
      body: { title: 'W', issueDate, sections: [{ id: 'x', kind: 'gossip', title: 'Gosip' }] },
    });
    expect(invalid.status).toBe(422);
    expect(
      (await commsAudit(t, c, 'bulletin.create')).some((entry) => entry.entityId === bulletinId),
    ).toBe(true);
  });

  it('hides drafts from readers', async () => {
    expect(
      (await t.request('GET', `${url}/${bulletinId}`, { token: c.s.member.token })).status,
    ).toBe(404);
    expect((await t.request('GET', url, { token: c.s.member.token })).json.total).toBe(0);
    expect((await t.request('GET', url, { token: c.editor.token })).json.total).toBe(1);
  });

  it('offers the week’s material to pick from', async () => {
    const sources = await t.request('GET', `${url}/sources?issueDate=${issueDate}`, {
      token: c.editor.token,
    });
    expect(sources.status).toBe(200);
    expect(sources.json.week).toEqual({ from: issueDate, to: addDaysToDate(issueDate, 6) });
    const titles = sources.json.announcements.map((item: { title: string }) => item.title);
    expect(titles).toContain('Pendaftaran Katekisasi');
    expect(titles).not.toContain('Rapat Tertutup Majelis');
    expect(sources.json.services.map((item: { title: string }) => item.title)).toEqual([
      'Ibadah Minggu',
    ]);
    expect(sources.json.financeAvailable).toBe(false);
    const owner = await t.request('GET', `${url}/sources?issueDate=${issueDate}`, {
      token: c.s.owner.token,
    });
    expect(owner.json.financeAvailable).toBe(true);
    expect(
      (await t.request('GET', `${url}/sources?issueDate=${issueDate}`, { token: c.s.member.token }))
        .status,
    ).toBe(403);
  });

  const rendered = async (token: string) => {
    const response = await t.request('GET', `${url}/${bulletinId}`, { token });
    expect(response.status).toBe(200);
    return response.json.rendered as Section[];
  };
  const section = (all: Section[], kind: string) => all.find((entry) => entry.kind === kind);

  it('composes every section from live data', async () => {
    const all = await rendered(c.editor.token);
    expect(section(all, 'text')?.title).toBe('Renungan');
    expect(section(all, 'services')?.items.map((item) => item.subtitle)).toEqual(['Pdt. Samuel']);
    expect(section(all, 'rosters')?.items[0]?.body).toBe('- **Organis**: Lukas Siregar');
    expect(section(all, 'announcements')?.items.map((item) => item.title)).toEqual([
      'Pendaftaran Katekisasi',
    ]);
    expect(section(all, 'events')?.items.map((item) => item.title)).toEqual([
      'Rapat Komisi Wanita',
    ]);
    const birthdays = section(all, 'birthdays')?.items ?? [];
    expect(birthdays.map((item) => item.title)).toEqual(['Martha Lubis']);
    expect(birthdays[0]?.years).toBe(Number(addDaysToDate(issueDate, 2).slice(0, 4)) - 1956);
    const anniversaries = section(all, 'anniversaries')?.items ?? [];
    expect(anniversaries).toHaveLength(1);
    expect(anniversaries[0]?.title).toBe('Petrus Situmorang & Maria Situmorang');
    // The editor lacks finance.reports, so the offering summary is left out entirely.
    expect(section(all, 'finance')).toBeUndefined();
  });

  it('shows the offering summary only to finance.reports holders', async () => {
    const owner = await rendered(c.s.owner.token);
    const finance = section(owner, 'finance')?.finance;
    expect(finance?.income).toBe(1_500_000);
    expect(finance?.expense).toBe(200_000);
    expect(finance?.byCategory).toEqual([{ name: 'Persembahan Minggu', amount: 1_500_000 }]);
  });

  it('publishes once to every reader', async () => {
    expect(
      (await t.request('POST', `${url}/${bulletinId}/publish`, { token: c.s.member.token })).status,
    ).toBe(403);
    const published = await t.request('POST', `${url}/${bulletinId}/publish`, {
      token: c.editor.token,
    });
    expect(published.status).toBe(200);
    expect(published.json.bulletin.publishedAt).toBeString();
    expect(
      (await t.request('POST', `${url}/${bulletinId}/publish`, { token: c.editor.token })).status,
    ).toBe(409);
    const notes = await notificationsOf(t, c.s.member.token, c.s.church.id, 'bulletin.published');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.link).toBe(`/c/${c.s.church.id}/bulletins/${bulletinId}`);

    const member = await rendered(c.s.member.token);
    expect(section(member, 'finance')).toBeUndefined();
    const treasurer = await rendered(c.treasurer.token);
    expect(section(treasurer, 'finance')?.finance?.income).toBe(1_500_000);

    await t.request('POST', `${url}/${bulletinId}/unpublish`, { token: c.editor.token });
    expect(
      (await t.request('GET', `${url}/${bulletinId}`, { token: c.s.member.token })).status,
    ).toBe(404);
    await t.request('POST', `${url}/${bulletinId}/publish`, { token: c.editor.token });
    expect(
      await notificationsOf(t, c.s.member.token, c.s.church.id, 'bulletin.published'),
    ).toHaveLength(1);
    expect((await commsAudit(t, c, 'bulletin.publish')).length).toBe(2);
    expect(
      (await t.request('GET', url, { token: c.s.member.token })).json.items[0].sectionCount,
    ).toBe(8);
  });

  it('edits, copies to next week and deletes', async () => {
    const edit = await t.request('PATCH', `${url}/${bulletinId}`, {
      token: c.editor.token,
      body: { title: 'Warta Jemaat', issueDate, sections: sections.slice(0, 2) },
    });
    expect(edit.status).toBe(200);
    expect(edit.json.bulletin.includeFinanceSummary).toBe(false);
    expect(
      (
        await t.request('PATCH', `${url}/${bulletinId}`, {
          token: c.s.member.token,
          body: { title: 'Warta Jemaat', issueDate, sections: [] },
        })
      ).status,
    ).toBe(403);
    const copy = await t.request('POST', `${url}/${bulletinId}/duplicate`, {
      token: c.editor.token,
    });
    expect(copy.status).toBe(201);
    expect(copy.json.bulletin.issueDate).toBe(addDaysToDate(issueDate, 7));
    expect(copy.json.bulletin.status).toBe('draft');
    expect(copy.json.bulletin.sections).toHaveLength(2);
    const deleted = await t.request('DELETE', `${url}/${copy.json.bulletin.id}`, {
      token: c.editor.token,
    });
    expect(deleted.status).toBe(200);
    expect(
      (await commsAudit(t, c, 'bulletin.delete')).some(
        (entry) => entry.entityId === copy.json.bulletin.id,
      ),
    ).toBe(true);
  });

  it('refuses ids from another church', async () => {
    const foreign = await t.request('POST', `/api/churches/${c.otherChurch.id}/bulletins`, {
      token: c.other.token,
      body: { title: 'Warta Lain', issueDate },
    });
    expect(foreign.status).toBe(201);
    const id = foreign.json.bulletin.id as string;
    for (const [method, path] of [
      ['GET', `${url}/${id}`],
      ['PATCH', `${url}/${id}`],
      ['DELETE', `${url}/${id}`],
      ['POST', `${url}/${id}/publish`],
      ['POST', `${url}/${id}/duplicate`],
    ] as const) {
      const response = await t.request(method, path, {
        token: c.s.owner.token,
        body: method === 'PATCH' ? { title: 'Ubah', issueDate } : undefined,
      });
      expect(`${method} ${path} ${response.status}`).toBe(`${method} ${path} 404`);
    }
    expect((await t.request('GET', url, { token: c.other.token })).status).toBe(403);
  });
});
