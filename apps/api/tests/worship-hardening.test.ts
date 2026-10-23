import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from './helpers';
import {
  addMember,
  createService,
  createTeam,
  dayOf,
  inDays,
  seedWorship,
  type WorshipSeed,
} from './worship-fixtures';

/** Privacy of roster details, side effects of deletes and changes, and time zone boundaries. */
describe('worship hardening', () => {
  const t = createTestApp();
  let w: WorshipSeed;
  let team: { id: string; positionIds: string[] };
  let guitar = '';
  let drum = '';
  beforeAll(async () => {
    w = await seedWorship(t);
    team = await createTeam(t, w, 'Pemusik', [{ name: 'Gitar' }, { name: 'Drum' }]);
    [guitar = '', drum = ''] = team.positionIds;
    await addMember(t, w, team.id, w.leadPerson.id, { role: 'leader' });
    await addMember(t, w, team.id, w.s.memberPerson.id);
    await addMember(t, w, team.id, w.s.alice.id);
  });
  afterAll(() => t.close());

  const notificationsOf = async (token: string, type: string) => {
    const response = await t.request('GET', `/api/notifications?limit=100`, { token });
    expect(response.status).toBe(200);
    return (response.json.items as { type: string; title: string; body: string | null }[]).filter(
      (item) => item.type === type,
    );
  };

  const assign = (
    serviceId: string,
    assignments: { positionId: string; personId: string }[],
    ignoreConflicts = true,
  ) =>
    t.request('POST', `${w.base}/services/${serviceId}/roster`, {
      token: w.scheduler.token,
      body: { assignments, ignoreConflicts },
    });

  type Row = {
    id: string;
    person: { id: string };
    declineReason: string | null;
    conflicts: { kind: string; detail: string | null }[];
  };
  const rowOf = (rows: Row[], personId: string) => rows.find((row) => row.person.id === personId)!;

  it('shows decline and blockout reasons only to the volunteer and their schedulers', async () => {
    const startsAt = inDays(15, 2);
    const blockout = await t.request('POST', `${w.base}/blockouts`, {
      token: w.s.member.token,
      body: { startDate: dayOf(startsAt), endDate: dayOf(startsAt), reason: 'Operasi lutut' },
    });
    expect(blockout.status).toBe(201);
    const service = await createService(t, w, { title: 'Ibadah Privasi', startsAt });
    const made = await assign(service, [
      { positionId: guitar, personId: w.s.memberPerson.id },
      { positionId: drum, personId: w.s.alice.id },
    ]);
    expect(made.status).toBe(201);
    const aliceRow = made.json.items[1].id;
    const declined = await t.request('POST', `${w.base}/roster/${aliceRow}/respond`, {
      token: w.scheduler.token,
      body: { status: 'declined', reason: 'Dirawat di rumah sakit' },
    });
    expect(declined.status).toBe(200);

    // A plain member sees who serves, but not why someone cannot.
    for (const path of [`/services/${service}`, `/services/${service}/roster`]) {
      const viewed = await t.request('GET', `${w.base}${path}`, { token: w.s.leader.token });
      expect(viewed.status).toBe(200);
      const rows = (viewed.json.roster ?? viewed.json.items) as Row[];
      expect(rowOf(rows, w.s.alice.id).declineReason).toBeNull();
      expect(rowOf(rows, w.s.memberPerson.id).conflicts).toEqual([]);
      expect(JSON.stringify(viewed.json)).not.toContain('Operasi lutut');
      expect(JSON.stringify(viewed.json)).not.toContain('rumah sakit');
    }

    // The volunteer sees their own details; the team leader and the scheduler see everyone's.
    const own = await t.request('GET', `${w.base}/services/${service}`, {
      token: w.s.member.token,
    });
    expect(
      rowOf(own.json.roster, w.s.memberPerson.id).conflicts.map((item: { kind: string }) => [
        item.kind,
      ]),
    ).toContainEqual(['blockout']);
    expect(rowOf(own.json.roster, w.s.alice.id).declineReason).toBeNull();
    for (const token of [w.teamLead.token, w.scheduler.token]) {
      const full = await t.request('GET', `${w.base}/services/${service}`, { token });
      expect(rowOf(full.json.roster, w.s.alice.id).declineReason).toBe('Dirawat di rumah sakit');
      expect(
        rowOf(full.json.roster, w.s.memberPerson.id).conflicts.find(
          (item: { kind: string }) => item.kind === 'blockout',
        )?.detail,
      ).toBe('Operasi lutut');
    }

    // Recording an answer for someone else is audited.
    const audit = await t.request(
      'GET',
      `/api/churches/${w.s.church.id}/audit-logs?module=worship&action=roster.respond`,
      { token: w.s.owner.token },
    );
    expect(audit.status).toBe(200);
    expect(audit.json.items).toHaveLength(1);
    expect(JSON.stringify(audit.json.items[0])).not.toContain('rumah sakit');
  });

  it('keeps the roster of a draft service hidden like the service itself', async () => {
    const draft = await createService(t, w, { title: 'Ibadah Draf', status: 'draft' });
    expect((await assign(draft, [{ positionId: guitar, personId: w.s.alice.id }])).status).toBe(
      201,
    );
    const hidden = await t.request('GET', `${w.base}/services/${draft}/roster`, {
      token: w.s.leader.token,
    });
    expect(hidden.status).toBe(404);
    const shown = await t.request('GET', `${w.base}/services/${draft}/roster`, {
      token: w.teamLead.token,
    });
    expect(shown.status).toBe(200);
  });

  it('leaves draft services out of a song’s history for plain members', async () => {
    const song = await t.request('POST', `${w.base}/songs`, {
      token: w.planner.token,
      body: { title: 'Bapa Engkau Sungguh Baik' },
    });
    expect(song.status).toBe(201);
    const songId = song.json.song.id;
    const draft = await createService(t, w, { title: 'Rahasia Natal', status: 'draft' });
    const liturgy = await t.request('PUT', `${w.base}/services/${draft}/liturgy`, {
      token: w.planner.token,
      body: { items: [{ type: 'song', title: 'Bapa Engkau Sungguh Baik', songId }] },
    });
    expect(liturgy.status).toBe(200);
    const member = await t.request('GET', `${w.base}/songs/${songId}`, {
      token: w.s.leader.token,
    });
    expect(member.json.usage).toEqual([]);
    const planner = await t.request('GET', `${w.base}/songs/${songId}`, {
      token: w.planner.token,
    });
    expect(planner.json.usage).toHaveLength(1);
  });

  it('filters services by days of the church time zone', async () => {
    // 18:30 UTC is 01:30 the next day in Jakarta.
    const day = dayOf(inDays(40));
    const next = dayOf(inDays(41));
    const service = await createService(t, w, {
      title: 'Doa Subuh',
      startsAt: `${day}T18:30:00.000Z`,
    });
    const list = async (from: string, to: string) =>
      (
        await t.request('GET', `${w.base}/services?scope=all&from=${from}&to=${to}`, {
          token: w.s.owner.token,
        })
      ).json.items.map((item: { id: string }) => item.id);
    expect(await list(next, next)).toContain(service);
    expect(await list(day, day)).not.toContain(service);
  });

  it('tells volunteers when their position or team is deleted', async () => {
    const service = await createService(t, w, { title: 'Ibadah Minggu', startsAt: inDays(20) });
    const extra = await createTeam(t, w, 'Multimedia', [
      { name: 'Operator LCD' },
      { name: 'Sound' },
    ]);
    await addMember(t, w, extra.id, w.s.memberPerson.id);
    expect(
      (
        await assign(service, [
          { positionId: extra.positionIds[0]!, personId: w.s.memberPerson.id },
          { positionId: extra.positionIds[1]!, personId: w.s.memberPerson.id },
        ])
      ).status,
    ).toBe(201);

    const before = (await notificationsOf(w.s.member.token, 'roster.changed')).length;
    const position = await t.request(
      'DELETE',
      `${w.base}/teams/${extra.id}/positions/${extra.positionIds[0]}`,
      { token: w.s.owner.token },
    );
    expect(position.status).toBe(200);
    const afterPosition = await notificationsOf(w.s.member.token, 'roster.changed');
    expect(afterPosition.length).toBe(before + 1);
    expect(afterPosition[0]!.body).toContain('Operator LCD');

    const deleted = await t.request('DELETE', `${w.base}/teams/${extra.id}`, {
      token: w.s.owner.token,
    });
    expect(deleted.status).toBe(200);
    const afterTeam = await notificationsOf(w.s.member.token, 'roster.changed');
    expect(afterTeam.length).toBe(before + 2);
    expect(afterTeam[0]!.body).toContain('Sound');
  });

  it('tells the roster when the time of a service changes', async () => {
    const startsAt = inDays(25, 2);
    const service = await createService(t, w, { title: 'Ibadah Pemuda', startsAt });
    expect(
      (await assign(service, [{ positionId: guitar, personId: w.s.memberPerson.id }])).status,
    ).toBe(201);
    const before = (await notificationsOf(w.s.member.token, 'roster.changed')).length;
    const renamed = await t.request('PATCH', `${w.base}/services/${service}`, {
      token: w.planner.token,
      body: { title: 'Ibadah Pemuda Remaja', startsAt, status: 'published' },
    });
    expect(renamed.status).toBe(200);
    expect((await notificationsOf(w.s.member.token, 'roster.changed')).length).toBe(before);
    const moved = await t.request('PATCH', `${w.base}/services/${service}`, {
      token: w.planner.token,
      body: { title: 'Ibadah Pemuda Remaja', startsAt: inDays(25, 4), status: 'published' },
    });
    expect(moved.status).toBe(200);
    const changed = await notificationsOf(w.s.member.token, 'roster.changed');
    expect(changed.length).toBe(before + 1);
    expect(changed[0]!.title).toBe('Ibadah Pemuda Remaja has a new time');
  });

  it('does not copy declined assignments to the next roster', async () => {
    const type = await t.request('POST', `${w.base}/service-types`, {
      token: w.s.owner.token,
      body: { name: 'Ibadah Sore' },
    });
    const serviceTypeId = type.json.serviceType.id;
    const first = await createService(t, w, {
      title: 'Ibadah Sore',
      serviceTypeId,
      startsAt: inDays(30, 10),
    });
    const made = await assign(first, [
      { positionId: guitar, personId: w.s.memberPerson.id },
      { positionId: drum, personId: w.s.alice.id },
    ]);
    const declined = await t.request('POST', `${w.base}/roster/${made.json.items[1].id}/respond`, {
      token: w.scheduler.token,
      body: { status: 'declined', reason: 'Ke luar kota' },
    });
    expect(declined.status).toBe(200);
    const second = await createService(t, w, {
      title: 'Ibadah Sore',
      serviceTypeId,
      startsAt: inDays(37, 10),
    });
    const copied = await t.request('POST', `${w.base}/services/${second}/roster/copy`, {
      token: w.scheduler.token,
      body: {},
    });
    expect(copied.status).toBe(200);
    expect(copied.json.items.map((item: Row) => item.person.id)).toEqual([w.s.memberPerson.id]);
  });

  it('describes conflicts of planned assignments for the people who schedule', async () => {
    const startsAt = inDays(45, 2);
    await t.request('POST', `${w.base}/blockouts`, {
      token: w.s.member.token,
      body: { startDate: dayOf(startsAt), endDate: dayOf(startsAt), reason: 'Retret' },
    });
    const service = await createService(t, w, { title: 'Ibadah Cek', startsAt });
    const body = {
      assignments: [
        { positionId: guitar, personId: w.s.memberPerson.id },
        { positionId: drum, personId: w.s.bob.id },
      ],
    };
    const forbidden = await t.request('POST', `${w.base}/services/${service}/roster/check`, {
      token: w.s.member.token,
      body,
    });
    expect(forbidden.status).toBe(403);
    const checked = await t.request('POST', `${w.base}/services/${service}/roster/check`, {
      token: w.teamLead.token,
      body,
    });
    expect(checked.status).toBe(200);
    expect(checked.json.items).toHaveLength(2);
    expect(checked.json.items[0]).toMatchObject({
      positionId: guitar,
      person: { id: w.s.memberPerson.id },
      conflicts: [{ kind: 'blockout', detail: 'Retret' }],
    });
    expect(checked.json.items[1].conflicts.map((item: { kind: string }) => item.kind)).toEqual([
      'not_in_team',
    ]);
  });
});
