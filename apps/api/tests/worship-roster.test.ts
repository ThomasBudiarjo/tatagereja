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

describe('worship teams, rosters and availability', () => {
  const t = createTestApp();
  let w: WorshipSeed;
  let music: { id: string; positionIds: string[] };
  let ushers: { id: string; positionIds: string[] };
  let guitar = '';
  let keys = '';
  let usher = '';
  let ester = { id: '' };
  let typeId = '';
  beforeAll(async () => {
    w = await seedWorship(t);
    music = await createTeam(t, w, 'Pemusik', [{ name: 'Gitar' }, { name: 'Keyboard' }]);
    ushers = await createTeam(t, w, 'Penerima Tamu', [{ name: 'Usher', needed: 2 }]);
    [guitar = '', keys = ''] = music.positionIds;
    [usher = ''] = ushers.positionIds;
    ester = await t.createPerson(w.s.owner.token, w.s.church.id, {
      firstName: 'Ester',
      lastName: 'Lumbantobing',
    });
    await addMember(t, w, music.id, w.leadPerson.id, { role: 'leader' });
    await addMember(t, w, music.id, w.s.memberPerson.id, { positionIds: [guitar] });
    await addMember(t, w, music.id, w.s.alice.id, { positionIds: [keys] });
    await addMember(t, w, music.id, w.s.bob.id);
    await addMember(t, w, ushers.id, w.s.bob.id);
    await addMember(t, w, ushers.id, ester.id);
    typeId = (
      await t.request('POST', `${w.base}/service-types`, {
        token: w.s.owner.token,
        body: { name: 'Ibadah Umum', defaultDurationMinutes: 120 },
      })
    ).json.serviceType.id;
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
    token: string,
    serviceId: string,
    assignments: { positionId: string; personId: string }[],
    ignoreConflicts = false,
  ) =>
    t.request('POST', `${w.base}/services/${serviceId}/roster`, {
      token,
      body: { assignments, ignoreConflicts },
    });

  describe('teams', () => {
    it('lets planners shape teams and leaders manage their own team only', async () => {
      for (const token of [w.s.member.token, w.scheduler.token, w.teamLead.token]) {
        const denied = await t.request('POST', `${w.base}/teams`, {
          token,
          body: { name: 'Multimedia' },
        });
        expect(denied.status).toBe(403);
      }
      const created = await t.request('POST', `${w.base}/teams`, {
        token: w.planner.token,
        body: { name: 'Multimedia', color: '#2563eb', groupId: w.s.group.id },
      });
      expect(created.status).toBe(201);
      const duplicate = await t.request('POST', `${w.base}/teams`, {
        token: w.planner.token,
        body: { name: 'Multimedia' },
      });
      expect(duplicate.status).toBe(409);

      const leaderPosition = await t.request('POST', `${w.base}/teams/${music.id}/positions`, {
        token: w.teamLead.token,
        body: { name: 'Bass' },
      });
      expect(leaderPosition.status).toBe(201);
      const otherTeam = await t.request('POST', `${w.base}/teams/${ushers.id}/positions`, {
        token: w.teamLead.token,
        body: { name: 'Kolektan' },
      });
      expect(otherTeam.status).toBe(403);
      const sameName = await t.request('POST', `${w.base}/teams/${music.id}/positions`, {
        token: w.teamLead.token,
        body: { name: 'bass' },
      });
      expect(sameName.status).toBe(409);
      const removePosition = await t.request(
        'DELETE',
        `${w.base}/teams/${music.id}/positions/${leaderPosition.json.position.id}`,
        { token: w.teamLead.token },
      );
      expect(removePosition.status).toBe(200);

      const appoint = await t.request('POST', `${w.base}/teams/${music.id}/members`, {
        token: w.teamLead.token,
        body: { personId: ester.id, role: 'leader' },
      });
      expect(appoint.status).toBe(403);
      const added = await t.request('POST', `${w.base}/teams/${music.id}/members`, {
        token: w.teamLead.token,
        body: { personId: ester.id, positionIds: [keys] },
      });
      expect(added.status).toBe(201);
      expect(added.json.member).toMatchObject({ firstName: 'Ester', positionIds: [keys] });
      const again = await t.request('POST', `${w.base}/teams/${music.id}/members`, {
        token: w.teamLead.token,
        body: { personId: ester.id },
      });
      expect(again.status).toBe(409);
      const wrongPosition = await t.request(
        'PATCH',
        `${w.base}/teams/${music.id}/members/${added.json.member.teamMemberId}`,
        { token: w.teamLead.token, body: { role: 'member', positionIds: [usher] } },
      );
      expect(wrongPosition.status).toBe(404);
      const promote = await t.request(
        'PATCH',
        `${w.base}/teams/${music.id}/members/${added.json.member.teamMemberId}`,
        { token: w.teamLead.token, body: { role: 'leader', positionIds: [keys] } },
      );
      expect(promote.status).toBe(403);
      const removed = await t.request(
        'DELETE',
        `${w.base}/teams/${music.id}/members/${added.json.member.teamMemberId}`,
        { token: w.teamLead.token },
      );
      expect(removed.status).toBe(200);

      const detail = await t.request('GET', `${w.base}/teams/${music.id}`, {
        token: w.teamLead.token,
      });
      expect(detail.status).toBe(200);
      expect(detail.json).toMatchObject({ canManage: true, canSchedule: true });
      expect(detail.json.members[0]).toMatchObject({ firstName: 'Yohanes', role: 'leader' });
      const leadMember = detail.json.members[0].teamMemberId;
      const removeLeader = await t.request(
        'DELETE',
        `${w.base}/teams/${music.id}/members/${leadMember}`,
        { token: w.teamLead.token },
      );
      expect(removeLeader.status).toBe(403);
      const asMember = await t.request('GET', `${w.base}/teams/${music.id}`, {
        token: w.s.member.token,
      });
      expect(asMember.json).toMatchObject({ canManage: false, canSchedule: false });

      const me = await t.request('GET', `${w.base}/me`, { token: w.teamLead.token });
      expect(me.json.ledTeamIds).toEqual([music.id]);
      expect(me.json.memberTeamIds).toEqual([music.id]);

      const audit = await t.request('GET', `${w.church}/audit-logs?module=worship&limit=200`, {
        token: w.s.owner.token,
      });
      const actions = audit.json.items.map((item: { action: string }) => item.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'serving_team.create',
          'serving_team.member_add',
          'serving_team.member_remove',
          'serving_position.delete',
        ]),
      );
    });

    it('searches people only for planners, schedulers and leaders', async () => {
      expect(
        (await t.request('GET', `${w.base}/people?q=ali`, { token: w.s.member.token })).status,
      ).toBe(403);
      const lead = await t.request('GET', `${w.base}/people?q=ali`, { token: w.teamLead.token });
      expect(lead.status).toBe(200);
      expect(lead.json.items.map((p: { firstName: string }) => p.firstName)).toEqual(['Alice']);
      const full = await t.request('GET', `${w.base}/people?q=alice%20smith`, {
        token: w.scheduler.token,
      });
      expect(full.json.items).toHaveLength(1);
    });
  });

  describe('rosters', () => {
    let serviceA = '';
    let memberAssignment = '';

    it('schedules volunteers within the right scope and notifies them', async () => {
      serviceA = await createService(t, w, {
        title: 'Ibadah Umum 1',
        serviceTypeId: typeId,
        startsAt: inDays(10, 1),
        endsAt: inDays(10, 3),
      });
      expect(
        (await assign(w.s.member.token, serviceA, [{ positionId: guitar, personId: w.s.alice.id }]))
          .status,
      ).toBe(403);
      expect(
        (await assign(w.planner.token, serviceA, [{ positionId: guitar, personId: w.s.alice.id }]))
          .status,
      ).toBe(403);
      expect(
        (await assign(w.teamLead.token, serviceA, [{ positionId: usher, personId: ester.id }]))
          .status,
      ).toBe(403);

      const scheduled = await assign(w.scheduler.token, serviceA, [
        { positionId: guitar, personId: w.s.memberPerson.id },
        { positionId: usher, personId: ester.id },
      ]);
      expect(scheduled.status).toBe(201);
      expect(scheduled.json.skipped).toBe(0);
      expect(scheduled.json.items.map((item: { status: string }) => item.status)).toEqual([
        'pending',
        'pending',
      ]);
      memberAssignment = scheduled.json.items[0].id;

      const lead = await assign(w.teamLead.token, serviceA, [
        { positionId: keys, personId: w.s.alice.id },
        { positionId: keys, personId: w.s.alice.id },
      ]);
      expect(lead.status).toBe(201);
      expect(lead.json).toMatchObject({ skipped: 1 });
      const duplicate = await assign(w.scheduler.token, serviceA, [
        { positionId: guitar, personId: w.s.memberPerson.id },
      ]);
      expect(duplicate.json).toMatchObject({ items: [], skipped: 1 });

      const assigned = await notificationsOf(w.s.member.token, 'roster.assigned');
      expect(assigned).toHaveLength(1);
      expect(assigned[0]!.title).toContain('Ibadah Umum 1');
      expect(assigned[0]!.body).toContain('Pemusik · Gitar');

      const roster = await t.request('GET', `${w.base}/services/${serviceA}/roster`, {
        token: w.s.member.token,
      });
      expect(roster.status).toBe(200);
      expect(roster.json.items.map((item: { teamName: string }) => item.teamName)).toEqual([
        'Pemusik',
        'Pemusik',
        'Penerima Tamu',
      ]);
      const detail = await t.request('GET', `${w.base}/services/${serviceA}`, {
        token: w.teamLead.token,
      });
      expect(detail.json.schedulableTeamIds).toEqual([music.id]);
      expect(detail.json.service).toMatchObject({ rosterTotal: 3, rosterAccepted: 0 });
    });

    it('warns about blockouts, double bookings and people outside the team', async () => {
      const serviceB = await createService(t, w, {
        title: 'Ibadah Umum 2',
        startsAt: inDays(17, 1),
      });
      const blockout = await t.request('POST', `${w.base}/blockouts`, {
        token: w.s.member.token,
        body: { startDate: dayOf(inDays(16)), endDate: dayOf(inDays(18)), reason: 'Ke Medan' },
      });
      expect(blockout.status).toBe(201);
      expect(blockout.json.blockout.personId).toBe(w.s.memberPerson.id);

      const away = await assign(w.scheduler.token, serviceB, [
        { positionId: guitar, personId: w.s.memberPerson.id },
      ]);
      expect(away.status).toBe(409);
      expect(away.json.error.code).toBe('SCHEDULING_CONFLICT');
      expect(away.json.error.issues[0].path).toBe('assignments.0');
      expect(away.json.error.issues[0].message).toContain('Ke Medan');
      const anyway = await assign(
        w.scheduler.token,
        serviceB,
        [{ positionId: guitar, personId: w.s.memberPerson.id }],
        true,
      );
      expect(anyway.status).toBe(201);
      expect(anyway.json.items[0].conflicts.map((c: { kind: string }) => c.kind)).toEqual([
        'blockout',
      ]);

      const overlapping = await createService(t, w, {
        title: 'Ibadah Pemuda',
        startsAt: inDays(10, 2),
      });
      const double = await assign(w.scheduler.token, overlapping, [
        { positionId: keys, personId: w.s.alice.id },
      ]);
      expect(double.status).toBe(409);
      expect(double.json.error.issues[0].message).toContain('Ibadah Umum 1');
      const outsider = await assign(w.scheduler.token, overlapping, [
        { positionId: guitar, personId: ester.id },
      ]);
      expect(outsider.status).toBe(409);
      expect(outsider.json.error.issues[0].message).toContain('Not a member of the team');
      const twice = await assign(w.scheduler.token, overlapping, [
        { positionId: guitar, personId: w.s.bob.id },
        { positionId: keys, personId: w.s.bob.id },
      ]);
      expect(twice.status).toBe(409);
      expect(twice.json.error.issues[0].path).toBe('assignments.1');
    });

    it('lets the volunteer accept or decline with a reason, and tells the schedulers', async () => {
      const aliceAssignment = (
        await t.request('GET', `${w.base}/services/${serviceA}/roster`, { token: w.s.owner.token })
      ).json.items.find((item: { person: { id: string } }) => item.person.id === w.s.alice.id).id;
      const notMine = await t.request('POST', `${w.base}/roster/${aliceAssignment}/respond`, {
        token: w.s.member.token,
        body: { status: 'accepted' },
      });
      expect(notMine.status).toBe(403);
      const noReason = await t.request('POST', `${w.base}/roster/${memberAssignment}/respond`, {
        token: w.s.member.token,
        body: { status: 'declined' },
      });
      expect(noReason.status).toBe(422);
      expect(noReason.json.error.issues[0].path).toBe('reason');

      const declined = await t.request('POST', `${w.base}/roster/${memberAssignment}/respond`, {
        token: w.s.member.token,
        body: { status: 'declined', reason: 'Ada tugas kantor' },
      });
      expect(declined.status).toBe(200);
      expect(declined.json.assignment).toMatchObject({
        status: 'declined',
        declineReason: 'Ada tugas kantor',
      });
      expect(declined.json.assignment.conflicts.map((c: { kind: string }) => c.kind)).toContain(
        'declined',
      );
      const toScheduler = await notificationsOf(w.scheduler.token, 'roster.response');
      expect(toScheduler).toHaveLength(1);
      expect(toScheduler[0]!.title).toBe('Mem Ber cannot serve as Gitar');
      expect(toScheduler[0]!.body).toContain('Ada tugas kantor');
      expect(await notificationsOf(w.teamLead.token, 'roster.response')).toHaveLength(1);
      expect(await notificationsOf(w.s.member.token, 'roster.response')).toHaveLength(0);

      // A team leader can record the answer for a volunteer without an account.
      const forAlice = await t.request('POST', `${w.base}/roster/${aliceAssignment}/respond`, {
        token: w.teamLead.token,
        body: { status: 'accepted' },
      });
      expect(forAlice.status).toBe(200);
      const accepted = await t.request('POST', `${w.base}/roster/${memberAssignment}/respond`, {
        token: w.s.member.token,
        body: { status: 'accepted', reason: 'ignored' },
      });
      expect(accepted.json.assignment).toMatchObject({ status: 'accepted', declineReason: null });

      const detail = await t.request('GET', `${w.base}/services/${serviceA}`, {
        token: w.s.member.token,
      });
      expect(detail.json.service).toMatchObject({ rosterTotal: 3, rosterAccepted: 2 });
    });

    it('suggests candidates by rotation fairness and fills open positions', async () => {
      const serviceD = await createService(t, w, {
        title: 'Ibadah Umum 3',
        serviceTypeId: typeId,
        startsAt: inDays(24, 1),
      });
      const suggestions = await t.request(
        'GET',
        `${w.base}/services/${serviceD}/roster/suggestions?positionId=${keys}`,
        { token: w.teamLead.token },
      );
      expect(suggestions.status).toBe(200);
      const names = suggestions.json.items[0].candidates.map(
        (c: { firstName: string }) => c.firstName,
      );
      // Alice already served recently; Bob and the leader (no positions: any) have not.
      expect(names).toEqual(['Bob', 'Yohanes', 'Alice']);
      expect(suggestions.json.items[0].candidates[2].timesServed).toBe(1);
      expect(
        (
          await t.request(
            'GET',
            `${w.base}/services/${serviceD}/roster/suggestions?positionId=${usher}`,
            { token: w.teamLead.token },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await t.request('GET', `${w.base}/services/${serviceD}/roster/suggestions`, {
            token: w.s.member.token,
          })
        ).status,
      ).toBe(403);

      const filled = await t.request('POST', `${w.base}/services/${serviceD}/roster/auto-fill`, {
        token: w.scheduler.token,
        body: { teamId: music.id },
      });
      expect(filled.status).toBe(200);
      expect(filled.json.skipped).toBe(0);
      const picked = filled.json.items.map(
        (item: { positionName: string; person: { firstName: string } }) =>
          `${item.positionName}:${item.person.firstName}`,
      );
      // The least-served people first, never the same person twice in one service.
      expect(picked).toEqual(['Gitar:Bob', 'Keyboard:Yohanes']);
      const again = await t.request('POST', `${w.base}/services/${serviceD}/roster/auto-fill`, {
        token: w.scheduler.token,
        body: {},
      });
      expect(again.json.items).toHaveLength(0);

      // Copying to the next service of the same type takes this roster.
      const serviceE = await createService(t, w, {
        title: 'Ibadah Umum 4',
        serviceTypeId: typeId,
        startsAt: inDays(31, 1),
      });
      const copied = await t.request('POST', `${w.base}/services/${serviceE}/roster/copy`, {
        token: w.scheduler.token,
        body: {},
      });
      expect(copied.status).toBe(200);
      expect(
        copied.json.items.map((item: { positionName: string }) => item.positionName).sort(),
      ).toEqual(
        filled.json.items.map((item: { positionName: string }) => item.positionName).sort(),
      );
      const twice = await t.request('POST', `${w.base}/services/${serviceE}/roster/copy`, {
        token: w.scheduler.token,
        body: { fromServiceId: serviceD },
      });
      expect(twice.json).toMatchObject({ items: [], skipped: 2 });
      const self = await t.request('POST', `${w.base}/services/${serviceE}/roster/copy`, {
        token: w.scheduler.token,
        body: { fromServiceId: serviceE },
      });
      expect(self.status).toBe(409);
      const newType = await t.request('POST', `${w.base}/service-types`, {
        token: w.s.owner.token,
        body: { name: 'Ibadah Keluarga' },
      });
      const lonely = await createService(t, w, {
        title: 'Tanpa riwayat',
        startsAt: inDays(40),
        serviceTypeId: newType.json.serviceType.id,
      });
      const nothing = await t.request('POST', `${w.base}/services/${lonely}/roster/copy`, {
        token: w.scheduler.token,
        body: {},
      });
      expect(nothing.status).toBe(404);
      const audit = await t.request('GET', `${w.church}/audit-logs?module=worship&limit=200`, {
        token: w.s.owner.token,
      });
      expect(audit.json.items.map((item: { action: string }) => item.action)).toEqual(
        expect.arrayContaining(['roster.assign', 'roster.auto_fill', 'roster.copy']),
      );
    });

    it('removes assignments and tells people when a service is cancelled', async () => {
      const service = await createService(t, w, {
        title: 'Ibadah Syukur',
        startsAt: inDays(12, 1),
      });
      const made = await assign(w.scheduler.token, service, [
        { positionId: guitar, personId: w.s.memberPerson.id },
        { positionId: usher, personId: w.s.bob.id },
      ]);
      expect(made.status).toBe(201);
      const memberRow = made.json.items[0].id;
      const bobRow = made.json.items[1].id;
      expect(
        (await t.request('DELETE', `${w.base}/roster/${bobRow}`, { token: w.teamLead.token }))
          .status,
      ).toBe(403);
      const removed = await t.request('DELETE', `${w.base}/roster/${bobRow}`, {
        token: w.scheduler.token,
      });
      expect(removed.status).toBe(200);

      const before = (await notificationsOf(w.s.member.token, 'roster.changed')).length;
      const cancelled = await t.request('PATCH', `${w.base}/services/${service}`, {
        token: w.planner.token,
        body: { title: 'Ibadah Syukur', startsAt: inDays(12, 1), status: 'cancelled' },
      });
      expect(cancelled.status).toBe(200);
      const changed = await notificationsOf(w.s.member.token, 'roster.changed');
      expect(changed.length).toBe(before + 1);
      expect(changed[0]!.title).toBe('Ibadah Syukur was cancelled');

      const respond = await t.request('POST', `${w.base}/roster/${memberRow}/respond`, {
        token: w.s.member.token,
        body: { status: 'accepted' },
      });
      expect(respond.status).toBe(409);
      expect(
        (await assign(w.scheduler.token, service, [{ positionId: keys, personId: w.s.alice.id }]))
          .status,
      ).toBe(409);
    });
  });

  describe('my schedule and availability', () => {
    it('lists the caller’s own upcoming assignments', async () => {
      const mine = await t.request('GET', `${w.base}/me/schedule`, { token: w.s.member.token });
      expect(mine.status).toBe(200);
      expect(mine.json.items.length).toBeGreaterThanOrEqual(2);
      expect(
        mine.json.items.every(
          (item: { person: { id: string } }) => item.person.id === w.s.memberPerson.id,
        ),
      ).toBe(true);
      expect(
        mine.json.items.map((item: { serviceTitle: string }) => item.serviceTitle),
      ).not.toContain('Ibadah Syukur');
      const starts = mine.json.items.map(
        (item: { serviceStartsAt: string }) => item.serviceStartsAt,
      );
      expect([...starts].sort()).toEqual(starts);
      const past = await t.request('GET', `${w.base}/me/schedule?scope=past`, {
        token: w.s.member.token,
      });
      expect(past.json.items).toEqual([]);
      const unlinked = await t.request('GET', `${w.base}/me/schedule`, { token: w.s.admin.token });
      expect(unlinked.json.items).toEqual([]);
      const me = await t.request('GET', `${w.base}/me`, { token: w.s.member.token });
      expect(me.json.pendingCount).toBeGreaterThanOrEqual(1);
    });

    it('keeps blockouts private to the person and their schedulers', async () => {
      const own = await t.request('GET', `${w.base}/blockouts`, { token: w.s.member.token });
      expect(own.status).toBe(200);
      expect(own.json.items).toHaveLength(1);
      expect(
        (
          await t.request('GET', `${w.base}/blockouts?personId=${w.s.alice.id}`, {
            token: w.s.member.token,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await t.request('POST', `${w.base}/blockouts`, {
            token: w.s.member.token,
            body: {
              personId: w.s.alice.id,
              startDate: dayOf(inDays(1)),
              endDate: dayOf(inDays(2)),
            },
          })
        ).status,
      ).toBe(403);
      const backwards = await t.request('POST', `${w.base}/blockouts`, {
        token: w.s.member.token,
        body: { startDate: dayOf(inDays(5)), endDate: dayOf(inDays(2)) },
      });
      expect(backwards.status).toBe(422);
      expect(backwards.json.error.issues[0].path).toBe('endDate');
      const unlinked = await t.request('POST', `${w.base}/blockouts`, {
        token: w.s.admin.token,
        body: { startDate: dayOf(inDays(1)), endDate: dayOf(inDays(2)) },
      });
      expect(unlinked.status).toBe(400);

      const forAlice = await t.request('POST', `${w.base}/blockouts`, {
        token: w.scheduler.token,
        body: { personId: w.s.alice.id, startDate: dayOf(inDays(1)), endDate: dayOf(inDays(2)) },
      });
      expect(forAlice.status).toBe(201);
      const forEster = await t.request('POST', `${w.base}/blockouts`, {
        token: w.scheduler.token,
        body: { personId: ester.id, startDate: dayOf(inDays(3)), endDate: dayOf(inDays(3)) },
      });
      expect(forEster.status).toBe(201);

      expect(
        (await t.request('GET', `${w.base}/blockouts?scope=team`, { token: w.s.member.token }))
          .status,
      ).toBe(403);
      const leaderView = await t.request('GET', `${w.base}/blockouts?scope=team`, {
        token: w.teamLead.token,
      });
      expect(leaderView.status).toBe(200);
      const leaderNames = leaderView.json.items.map(
        (item: { person: { firstName: string } }) => item.person.firstName,
      );
      expect(leaderNames).toContain('Alice');
      expect(leaderNames).not.toContain('Ester');
      const schedulerView = await t.request('GET', `${w.base}/blockouts?scope=team`, {
        token: w.scheduler.token,
      });
      expect(schedulerView.json.items).toHaveLength(3);

      expect(
        (
          await t.request('DELETE', `${w.base}/blockouts/${forAlice.json.blockout.id}`, {
            token: w.s.member.token,
          })
        ).status,
      ).toBe(403);
      const removeOwn = await t.request('DELETE', `${w.base}/blockouts/${own.json.items[0].id}`, {
        token: w.s.member.token,
      });
      expect(removeOwn.status).toBe(200);
      const audit = await t.request(
        'GET',
        `${w.church}/audit-logs?module=worship&action=blockout.create`,
        {
          token: w.s.owner.token,
        },
      );
      expect(audit.json.items).toHaveLength(2);
    });

    it('summarises the coming weeks on the overview', async () => {
      const scheduler = await t.request('GET', `${w.base}/overview`, { token: w.scheduler.token });
      expect(scheduler.status).toBe(200);
      expect(scheduler.json.stats.upcomingServices).toBeGreaterThan(0);
      expect(scheduler.json.stats.teams).toBe(3);
      expect(scheduler.json.upcoming.length).toBeLessThanOrEqual(5);
      expect(scheduler.json.stats.openPositions).toBeGreaterThan(0);
      const member = await t.request('GET', `${w.base}/overview`, { token: w.s.member.token });
      expect(member.json.mySchedule.length).toBeGreaterThan(0);
      expect(member.json.attention).toEqual([]);
    });
  });

  describe('isolation', () => {
    it('refuses ids from another church', async () => {
      const otherOwner = await t.register('Lain');
      const other = await t.createChurch(otherOwner.token, 'HKBP Lain');
      const otherBase = `/api/churches/${other.id}/worship`;
      const team = (
        await t.request('POST', `${otherBase}/teams`, {
          token: otherOwner.token,
          body: { name: 'Tim Lain' },
        })
      ).json.team.id;
      const position = (
        await t.request('POST', `${otherBase}/teams/${team}/positions`, {
          token: otherOwner.token,
          body: { name: 'Posisi Lain' },
        })
      ).json.position.id;
      const person = await t.createPerson(otherOwner.token, other.id, { firstName: 'Orang' });
      await t.request('POST', `${otherBase}/teams/${team}/members`, {
        token: otherOwner.token,
        body: { personId: person.id },
      });
      const service = (
        await t.request('POST', `${otherBase}/services`, {
          token: otherOwner.token,
          body: { title: 'Ibadah Lain', startsAt: inDays(5) },
        })
      ).json.service.id;
      const foreignAssignment = (
        await t.request('POST', `${otherBase}/services/${service}/roster`, {
          token: otherOwner.token,
          body: { assignments: [{ positionId: position, personId: person.id }] },
        })
      ).json.items[0].id;
      const foreignBlockout = (
        await t.request('POST', `${otherBase}/blockouts`, {
          token: otherOwner.token,
          body: { personId: person.id, startDate: dayOf(inDays(1)), endDate: dayOf(inDays(1)) },
        })
      ).json.blockout.id;

      const token = w.s.owner.token;
      const own = await createService(t, w, { title: 'Ibadah Sendiri', startsAt: inDays(50) });
      expect(
        (await assign(token, own, [{ positionId: position, personId: w.s.bob.id }])).status,
      ).toBe(404);
      expect((await assign(token, own, [{ positionId: guitar, personId: person.id }])).status).toBe(
        404,
      );
      expect(
        (await assign(token, service, [{ positionId: guitar, personId: w.s.bob.id }])).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', `${w.base}/roster/${foreignAssignment}/respond`, {
            token,
            body: { status: 'accepted' },
          })
        ).status,
      ).toBe(404);
      expect(
        (await t.request('DELETE', `${w.base}/roster/${foreignAssignment}`, { token })).status,
      ).toBe(404);
      expect((await t.request('GET', `${w.base}/teams/${team}`, { token })).status).toBe(404);
      expect(
        (
          await t.request('POST', `${w.base}/teams/${music.id}/members`, {
            token,
            body: { personId: person.id },
          })
        ).status,
      ).toBe(404);
      expect(
        (await t.request('DELETE', `${w.base}/teams/${music.id}/positions/${position}`, { token }))
          .status,
      ).toBe(404);
      expect(
        (await t.request('DELETE', `${w.base}/blockouts/${foreignBlockout}`, { token })).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', `${w.base}/services/${own}/roster/copy`, {
            token,
            body: { fromServiceId: service },
          })
        ).status,
      ).toBe(404);
      expect(
        (await t.request('GET', `${w.base}/blockouts?personId=${person.id}`, { token })).json.items,
      ).toEqual([]);
    });
  });
});
