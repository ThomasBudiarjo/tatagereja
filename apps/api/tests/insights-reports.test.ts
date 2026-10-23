import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  areas,
  attendanceRecords,
  attendanceSessions,
  personAreas,
  rosterAssignments,
  servingPositions,
  servingTeamMembers,
  servingTeams,
  visitorFollowUps,
  worshipServices,
} from '../src/db/schema';
import { nowIso } from '../src/lib/time';
import { newId } from '../src/lib/tokens';
import { memberWithRole, type Member } from './care-helpers';
import { setupFinance } from './finance-helpers';
import { createTestApp, seedChurch } from './helpers';

/*
 * Reports: every kind with its numbers, CSV export, per-source permissions, switched-off
 * modules, validation and church boundaries. The data sits in the first half of 2026 so the
 * people the shared seed creates today stay outside the range.
 */

type Seed = Awaited<ReturnType<typeof seedChurch>>;

const RANGE = 'from=2026-01-01&to=2026-06-30';

describe('insights reports', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;
  let base: string;
  let reporter: Member;
  let attendanceReporter: Member;
  let financeReporter: Member;
  let volunteerReporter: Member;
  let attendanceOnly: Member;
  let other: { owner: Member; church: { id: string } };

  const report = (kind: string, token: string, query = RANGE) =>
    t.request('GET', `${base}/${kind}?${query}`, { token });

  const person = (body: Record<string, unknown>) =>
    t.createPerson(s.owner.token, s.church.id, { lastName: 'Simatupang', ...body });

  const insertSession = (
    sessionAt: string,
    values: Partial<typeof attendanceSessions.$inferInsert> = {},
  ) => {
    const id = newId();
    t.db
      .insert(attendanceSessions)
      .values({
        id,
        churchId: s.church.id,
        title: 'Ibadah Umum',
        sessionAt,
        createdBy: s.owner.user.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        ...values,
      })
      .run();
    return id;
  };

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}/insights/reports`;
    reporter = await memberWithRole(t, s, 'Sekretaris Majelis', ['reports.view']);
    attendanceReporter = await memberWithRole(t, s, 'Penatua', ['reports.view', 'attendance.view']);
    financeReporter = await memberWithRole(t, s, 'Bendahara', ['reports.view', 'finance.reports']);
    volunteerReporter = await memberWithRole(t, s, 'Koordinator', [
      'reports.view',
      'services.view',
    ]);
    attendanceOnly = await memberWithRole(t, s, 'Pencatat', ['attendance.view']);
    const owner = await t.register('Other Owner');
    other = { owner, church: await t.createChurch(owner.token, 'GKI Lain') };

    // Membership: two members before the range, then three joiners and a visitor inside it.
    await person({ firstName: 'Lama', membershipStatus: 'member', joinedAt: '2024-05-01' });
    await person({
      firstName: 'Tua',
      membershipStatus: 'member',
      joinedAt: '2025-11-20',
      birthDate: '1950-03-01',
      gender: 'male',
    });
    await person({
      firstName: 'Februari',
      membershipStatus: 'member',
      joinedAt: '2026-02-10',
      birthDate: '2015-06-01',
      gender: 'female',
    });
    await person({
      firstName: 'Maret',
      membershipStatus: 'regular',
      joinedAt: '2026-03-03',
      birthDate: '2000-01-01',
      gender: 'female',
    });
    const area = newId();
    t.db
      .insert(areas)
      .values({
        id: area,
        churchId: s.church.id,
        name: '=Sektor 1',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      .run();
    const april = await person({
      firstName: 'April',
      membershipStatus: 'member',
      joinedAt: '2026-04-15',
    });
    t.db
      .insert(personAreas)
      .values({ personId: april.id, churchId: s.church.id, areaId: area, assignedAt: nowIso() })
      .run();
    const visitor = await person({
      firstName: 'Tamu',
      membershipStatus: 'visitor',
      joinedAt: '2026-05-05',
    });
    await person({ firstName: 'Pindah', membershipStatus: 'inactive', joinedAt: '2026-01-05' });

    // A follow-up for the visitor who has since joined (converted).
    t.db
      .insert(visitorFollowUps)
      .values({
        id: newId(),
        churchId: s.church.id,
        personId: visitor.id,
        stage: 'joined',
        source: 'Teman',
        firstVisitDate: '2026-05-05',
        stageChangedAt: nowIso(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      .run();

    // Attendance: a headcount service in January and a roster service in February.
    insertSession('2026-01-11T02:00:00.000Z', {
      mode: 'headcount',
      headcountMen: 40,
      headcountWomen: 50,
      headcountChildren: 20,
      headcountVisitors: 5,
    });
    const roster = insertSession('2026-02-08T02:00:00.000Z', { groupId: s.group.id });
    t.db
      .insert(attendanceRecords)
      .values(
        [s.alice.id, s.bob.id].map((personId) => ({
          id: newId(),
          sessionId: roster,
          personId,
          churchId: s.church.id,
          status: 'present' as const,
          recordedBy: s.owner.user.id,
          recordedAt: nowIso(),
        })),
      )
      .run();
    insertSession('2027-02-08T02:00:00.000Z', { mode: 'headcount', headcountMen: 999 });

    // Volunteers: one team, two services in March, one declined assignment.
    const team = newId();
    const position = newId();
    t.db
      .insert(servingTeams)
      .values({
        id: team,
        churchId: s.church.id,
        name: 'Pemusik',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      .run();
    t.db
      .insert(servingPositions)
      .values({
        id: position,
        churchId: s.church.id,
        teamId: team,
        name: 'Pianis',
        createdAt: nowIso(),
      })
      .run();
    for (const personId of [s.alice.id, s.bob.id]) {
      t.db
        .insert(servingTeamMembers)
        .values({ id: newId(), churchId: s.church.id, teamId: team, personId, joinedAt: nowIso() })
        .run();
    }
    for (const [startsAt, personId, status] of [
      ['2026-03-01T02:00:00.000Z', s.alice.id, 'accepted'],
      ['2026-03-08T02:00:00.000Z', s.alice.id, 'accepted'],
      ['2026-03-08T02:00:00.000Z', s.bob.id, 'declined'],
    ] as const) {
      const service = newId();
      t.db
        .insert(worshipServices)
        .values({
          id: service,
          churchId: s.church.id,
          title: 'Ibadah Umum',
          startsAt,
          status: 'published',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
        .run();
      t.db
        .insert(rosterAssignments)
        .values({
          id: newId(),
          churchId: s.church.id,
          serviceId: service,
          teamId: team,
          positionId: position,
          personId,
          status,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
        .run();
    }

    // Giving: two tithes posted to the ledger in April and May.
    const f = await setupFinance(t, s);
    for (const [receivedAt, amount] of [
      ['2026-04-06', 500_000],
      ['2026-05-03', 750_000],
    ] as const) {
      const created = await t.request('POST', `${f.base}/contributions`, {
        token: s.owner.token,
        body: {
          personId: s.memberPerson.id,
          kind: 'tithe',
          fundId: f.general,
          accountId: f.bank,
          method: 'transfer',
          amount,
          receivedAt,
        },
      });
      expect(created.status).toBe(201);
    }
  });

  it('reports membership growth with cumulative totals', async () => {
    const response = await report('membership_growth', reporter.token);
    expect(response.status).toBe(200);
    const body = response.json;
    expect(body.unit).toBe('count');
    const total = body.series.find((series: { key: string }) => series.key === 'total');
    const joined = body.series.find((series: { key: string }) => series.key === 'new');
    expect(total.points.map((point: { x: string }) => point.x)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ]);
    expect(joined.points.map((point: { y: number }) => point.y)).toEqual([1, 1, 1, 1, 1, 0]);
    expect(total.points.map((point: { y: number }) => point.y)).toEqual([3, 4, 5, 6, 7, 7]);
    expect(body.totals.startTotal).toBe(2);
    expect(body.totals.new).toBe(5);
    expect(body.totals.growthRate).toBe(2.5);

    const quarterly = await report(
      'membership_growth',
      reporter.token,
      `${RANGE}&interval=quarter`,
    );
    expect(quarterly.json.series[0].points.map((point: { x: string }) => point.x)).toEqual([
      '2026-01-01',
      '2026-04-01',
    ]);
  });

  it('breaks down status and demographics', async () => {
    const status = await report('status_breakdown', reporter.token);
    const items = status.json.breakdowns[0].items;
    const count = (key: string) => items.find((item: { key: string }) => item.key === key).value;
    expect(count('member')).toBe(4);
    expect(count('regular')).toBe(1);
    expect(count('visitor')).toBe(1);
    expect(count('inactive')).toBe(1);

    const demographics = await report('demographics', reporter.token);
    const breakdown = (key: string) =>
      demographics.json.breakdowns.find((item: { key: string }) => item.key === key).items;
    const age = breakdown('age');
    expect(age.find((item: { key: string }) => item.key === '61+').value).toBe(1);
    expect(age.find((item: { key: string }) => item.key === '0-12').value).toBe(1);
    expect(age.find((item: { key: string }) => item.key === '26-40').value).toBe(1);
    const gender = breakdown('gender');
    expect(gender.find((item: { key: string }) => item.key === 'female').value).toBe(2);
    const area = breakdown('area');
    expect(area.find((item: { label: string }) => item.label === '=Sektor 1').value).toBe(1);
    expect(demographics.json.totals.people).toBe(6);
  });

  it('reports attendance trends from rosters and headcounts', async () => {
    const response = await report('attendance_trend', attendanceReporter.token);
    expect(response.status).toBe(200);
    const total = response.json.series.find((series: { key: string }) => series.key === 'total');
    expect(total.points[0].y).toBe(115);
    expect(total.points[1].y).toBe(2);
    expect(response.json.totals).toMatchObject({ sessions: 2, attendance: 117, peak: 115 });
    const headcount = response.json.breakdowns.find(
      (item: { key: string }) => item.key === 'headcount',
    );
    expect(headcount.items.find((item: { key: string }) => item.key === 'visitors').value).toBe(5);
    const tracks = response.json.breakdowns.find((item: { key: string }) => item.key === 'tracks');
    expect(tracks.items.map((item: { label: string }) => item.label)).toContain('Youth Ministry');

    const forGroup = await report(
      'attendance_trend',
      attendanceReporter.token,
      `${RANGE}&groupId=${s.group.id}`,
    );
    expect(forGroup.json.totals.attendance).toBe(2);
    const weekly = await report(
      'attendance_trend',
      attendanceReporter.token,
      'from=2026-01-05&to=2026-01-18&interval=week',
    );
    expect(weekly.json.series[0].points).toEqual([
      { x: '2026-01-05', y: 115 },
      { x: '2026-01-12', y: 0 },
    ]);
  });

  it('reports new visitors and conversion', async () => {
    const response = await report('visitor_conversion', reporter.token);
    expect(response.status).toBe(200);
    expect(response.json.totals.visitors).toBe(2);
    expect(response.json.totals.converted).toBe(2);
    expect(response.json.totals.conversionRate).toBe(1);
    expect(response.json.totals.counted).toBe(5);
    const sources = response.json.breakdowns.find(
      (item: { key: string }) => item.key === 'sources',
    );
    expect(sources.items).toEqual([{ key: 'Teman', label: 'Teman', value: 1 }]);
  });

  it('reports volunteer engagement', async () => {
    const response = await report('volunteer_engagement', volunteerReporter.token);
    expect(response.status).toBe(200);
    expect(response.json.totals).toMatchObject({
      activeVolunteers: 1,
      assignments: 2,
      declined: 1,
      teamMembers: 2,
      engagementRate: 0.5,
    });
    expect(response.json.totals.acceptanceRate).toBeCloseTo(0.667, 3);
    expect(response.json.breakdowns[0].items[0]).toMatchObject({ label: 'Pemusik', value: 1 });
  });

  it('reports the giving trend in minor units', async () => {
    const response = await report('giving_trend', financeReporter.token);
    expect(response.status).toBe(200);
    expect(response.json.unit).toBe('money');
    expect(response.json.totals.total).toBe(1_250_000);
    expect(response.json.totals.contributions).toBe(1_250_000);
    expect(response.json.totals.offerings).toBe(0);
    const total = response.json.series.find((series: { key: string }) => series.key === 'total');
    expect(total.points.map((point: { y: number }) => point.y)).toEqual([
      0, 0, 0, 500_000, 750_000, 0,
    ]);
    expect(response.json.breakdowns[0].items[0]).toMatchObject({ label: 'Kas Umum' });
  });

  it('enforces reports.view plus the permission of each source', async () => {
    for (const token of [s.member.token, s.leader.token, attendanceOnly.token]) {
      expect((await report('membership_growth', token)).status).toBe(403);
    }
    expect((await report('attendance_trend', reporter.token)).status).toBe(403);
    expect((await report('giving_trend', reporter.token)).status).toBe(403);
    expect((await report('giving_trend', attendanceReporter.token)).status).toBe(403);
    // `services.view` is held by every member, so reports.view alone opens the volunteer report.
    expect((await report('volunteer_engagement', reporter.token)).status).toBe(200);
    for (const kind of [
      'membership_growth',
      'status_breakdown',
      'demographics',
      'attendance_trend',
      'visitor_conversion',
      'volunteer_engagement',
      'giving_trend',
    ]) {
      expect((await report(kind, s.admin.token)).status).toBe(200);
    }
  });

  it('refuses reports of switched-off modules', async () => {
    const off = await t.request('PATCH', `/api/churches/${s.church.id}/modules`, {
      token: s.owner.token,
      body: { modules: { finance: false, worship: false } },
    });
    expect(off.status).toBe(200);
    const giving = await report('giving_trend', s.owner.token);
    expect(giving.status).toBe(403);
    expect(giving.json.error.code).toBe('MODULE_DISABLED');
    expect((await report('volunteer_engagement', s.owner.token)).json.error.code).toBe(
      'MODULE_DISABLED',
    );
    expect((await report('membership_growth', s.owner.token)).status).toBe(200);
    await t.request('PATCH', `/api/churches/${s.church.id}/modules`, {
      token: s.owner.token,
      body: { modules: { finance: true, worship: true } },
    });
  });

  it('validates the query and keeps groups inside the church', async () => {
    for (const query of [
      'from=2026-06-01&to=2026-01-01',
      'from=2020-01-01&to=2026-01-01',
      `${RANGE}&interval=day`,
      'from=2026-13-01&to=2026-12-01',
      `${RANGE}&format=pdf`,
      `${RANGE}&groupId=nope`,
    ]) {
      expect((await report('membership_growth', s.owner.token, query)).status).toBe(422);
    }
    expect((await report('weather', s.owner.token)).status).toBe(422);
    const foreignGroup = await t.createGroup(other.owner.token, other.church.id, { name: 'Lain' });
    const cross = await report(
      'demographics',
      s.owner.token,
      `${RANGE}&groupId=${foreignGroup.id}`,
    );
    expect(cross.status).toBe(404);
    const outsider = await t.request(
      'GET',
      `/api/churches/${s.church.id}/insights/reports/demographics?${RANGE}`,
      { token: other.owner.token },
    );
    expect(outsider.status).toBe(403);
  });

  it('exports CSV in the chosen language, neutralises formulas and audits the export', async () => {
    const csv = await report('demographics', reporter.token, `${RANGE}&format=csv`);
    expect(csv.status).toBe(200);
    expect(typeof csv.json).toBe('string');
    const text = csv.json as string;
    expect(text).toContain('Demografi');
    expect(text).toContain('Kelompok usia');
    expect(text).toContain("'=Sektor 1");
    expect(text).not.toMatch(/(^|,)=Sektor/m);

    const english = await report(
      'giving_trend',
      financeReporter.token,
      `${RANGE}&format=csv&locale=en`,
    );
    expect(english.json).toContain('Giving trend');
    expect(english.json).toContain('Total (IDR)');
    expect(english.json).toContain('2026-04-01,500000');

    const audit = await t.request(
      'GET',
      `/api/churches/${s.church.id}/audit-logs?module=insights&action=report.export`,
      { token: s.owner.token },
    );
    expect(audit.json.items.map((item: { entityId: string }) => item.entityId)).toEqual(
      expect.arrayContaining(['demographics', 'giving_trend']),
    );
  });
});
