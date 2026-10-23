import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { memberWithRole, notificationsOf, setCareEnabled } from './care-helpers';
import { createTestApp, seedChurch } from './helpers';

/*
 * Attendance upgrade: headcount sessions, bulk marking, absence streaks with care follow-ups and
 * personal history, across the permission matrix and church boundaries.
 */

type Seed = Awaited<ReturnType<typeof seedChurch>>;

/** A session time `weeks` weeks ago, Sunday morning UTC. */
const weeksAgo = (weeks: number, hour = 2) => {
  const date = new Date(Date.now() - weeks * 7 * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

async function insightsAudit(t: ReturnType<typeof createTestApp>, s: Seed) {
  const response = await t.request(
    'GET',
    `/api/churches/${s.church.id}/audit-logs?module=insights&limit=200`,
    { token: s.owner.token },
  );
  expect(response.status).toBe(200);
  return response.json.items as { action: string; entityId: string | null; after: any }[];
}

describe('insights attendance', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Seed;
  let base: string;
  let recorder: Awaited<ReturnType<typeof memberWithRole>>;
  let viewer: Awaited<ReturnType<typeof memberWithRole>>;
  let carer: Awaited<ReturnType<typeof memberWithRole>>;
  let other: { owner: { token: string; user: { id: string } }; church: { id: string } };

  const createSession = async (token: string, body: Record<string, unknown>) =>
    t.request('POST', `${base}/sessions`, {
      token,
      body: { title: 'Ibadah Umum', sessionAt: weeksAgo(1), ...body },
    });

  const mark = async (
    token: string,
    sessionId: string,
    records: { personId: string; status: string | null }[],
  ) =>
    t.request('PUT', `${base}/sessions/${sessionId}/records`, {
      token,
      body: { records: records.map((record) => ({ ...record, note: null })) },
    });

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}/attendance`;
    recorder = await memberWithRole(t, s, 'Sekretaris', ['attendance.record']);
    viewer = await memberWithRole(t, s, 'Penatua', ['attendance.view']);
    carer = await memberWithRole(t, s, 'Diaken', ['attendance.view', 'care.manage']);
    const owner = await t.register('Other Owner');
    const church = await t.createChurch(owner.token, 'GKI Lain');
    other = { owner, church };
  });

  describe('headcount sessions', () => {
    let headcountId = '';
    let rosterId = '';

    it('creates headcount sessions with counts and keeps roster sessions name by name', async () => {
      const created = await createSession(s.admin.token, {
        title: 'Ibadah Natal',
        mode: 'headcount',
        headcount: { men: 120, women: 150, children: 60, visitors: 14 },
      });
      expect(created.status).toBe(201);
      headcountId = created.json.session.id;
      expect(created.json.session.mode).toBe('headcount');
      expect(created.json.session.attendeeCount).toBe(344);
      expect(created.json.session.headcount).toEqual({
        men: 120,
        women: 150,
        children: 60,
        visitors: 14,
      });
      expect(created.json.records).toEqual([]);

      const empty = await createSession(recorder.token, { mode: 'headcount' });
      expect(empty.status).toBe(201);
      expect(empty.json.session.headcount).toEqual({ men: 0, women: 0, children: 0, visitors: 0 });

      const roster = await createSession(recorder.token, { title: 'Ibadah Pagi' });
      expect(roster.status).toBe(201);
      rosterId = roster.json.session.id;
      expect(roster.json.session.mode).toBe('roster');
      expect(roster.json.session.headcount).toBeNull();
    });

    it('validates counts and refuses counts on roster sessions', async () => {
      const countsOnRoster = await createSession(s.admin.token, {
        headcount: { men: 1, women: 0, children: 0, visitors: 0 },
      });
      expect(countsOnRoster.status).toBe(422);
      const negative = await createSession(s.admin.token, {
        mode: 'headcount',
        headcount: { men: -1, women: 0, children: 0, visitors: 0 },
      });
      expect(negative.status).toBe(422);
      const huge = await t.request('PUT', `${base}/sessions/${headcountId}/headcount`, {
        token: s.admin.token,
        body: { men: 1_000_001 },
      });
      expect(huge.status).toBe(422);
      const fraction = await t.request('PUT', `${base}/sessions/${headcountId}/headcount`, {
        token: s.admin.token,
        body: { men: 1.5 },
      });
      expect(fraction.status).toBe(422);
    });

    it('updates the counts of headcount sessions only', async () => {
      const updated = await t.request('PUT', `${base}/sessions/${headcountId}/headcount`, {
        token: recorder.token,
        body: { men: 100, women: 140, children: 50, visitors: 10 },
      });
      expect(updated.status).toBe(200);
      expect(updated.json.session.attendeeCount).toBe(300);

      const onRoster = await t.request('PUT', `${base}/sessions/${rosterId}/headcount`, {
        token: s.admin.token,
        body: { men: 1 },
      });
      expect(onRoster.status).toBe(409);
      const marksOnHeadcount = await mark(s.admin.token, headcountId, [
        { personId: s.alice.id, status: 'present' },
      ]);
      expect(marksOnHeadcount.status).toBe(409);
      const bulkOnHeadcount = await t.request('POST', `${base}/sessions/${headcountId}/bulk`, {
        token: s.admin.token,
        body: { status: 'present' },
      });
      expect(bulkOnHeadcount.status).toBe(409);
    });

    it('lets only recorders and leaders of the group change counts', async () => {
      for (const token of [s.member.token, viewer.token, s.leader.token]) {
        const denied = await t.request('PUT', `${base}/sessions/${headcountId}/headcount`, {
          token,
          body: { men: 1 },
        });
        expect(denied.status).toBe(403);
      }
      const groupSession = await createSession(s.leader.token, {
        groupId: s.group.id,
        mode: 'headcount',
        headcount: { men: 3, women: 4, children: 0, visitors: 1 },
      });
      expect(groupSession.status).toBe(201);
      const byLeader = await t.request(
        'PUT',
        `${base}/sessions/${groupSession.json.session.id}/headcount`,
        { token: s.leader.token, body: { men: 5, women: 4, children: 0, visitors: 1 } },
      );
      expect(byLeader.status).toBe(200);
      const otherGroup = await createSession(s.leader.token, {
        groupId: s.otherGroup.id,
        mode: 'headcount',
      });
      expect(otherGroup.status).toBe(403);
    });

    it('filters and sorts the session list', async () => {
      const headcounts = await t.request('GET', `${base}/sessions?mode=headcount`, {
        token: viewer.token,
      });
      expect(headcounts.status).toBe(200);
      expect(headcounts.json.items.length).toBeGreaterThanOrEqual(2);
      expect(
        headcounts.json.items.every((item: { mode: string }) => item.mode === 'headcount'),
      ).toBe(true);
      const byTitle = await t.request('GET', `${base}/sessions?sort=title`, {
        token: viewer.token,
      });
      const titles = byTitle.json.items.map((item: { title: string }) => item.title);
      expect(titles).toEqual([...titles].sort((a: string, b: string) => a.localeCompare(b)));
      const badSort = await t.request('GET', `${base}/sessions?sort=random`, {
        token: viewer.token,
      });
      expect(badSort.status).toBe(422);
      const leaderList = await t.request('GET', `${base}/sessions`, { token: s.leader.token });
      expect(
        leaderList.json.items.every((item: { groupId: string }) => item.groupId === s.group.id),
      ).toBe(true);
      expect((await t.request('GET', `${base}/sessions`, { token: s.member.token })).status).toBe(
        403,
      );
    });

    it('audits deleted sessions', async () => {
      const doomed = await createSession(s.admin.token, {
        title: 'Sesi Salah Input',
        mode: 'headcount',
        headcount: { men: 1, women: 1, children: 0, visitors: 0 },
      });
      const id = doomed.json.session.id;
      expect(
        (await t.request('DELETE', `${base}/sessions/${id}`, { token: viewer.token })).status,
      ).toBe(403);
      const removed = await t.request('DELETE', `${base}/sessions/${id}`, {
        token: recorder.token,
      });
      expect(removed.status).toBe(200);
      const entry = (await insightsAudit(t, s)).find(
        (item) => item.action === 'attendance_session.delete' && item.entityId === id,
      );
      expect(entry).toBeDefined();
      expect(
        (await t.request('GET', `${base}/sessions/${id}`, { token: s.owner.token })).status,
      ).toBe(404);
    });
  });

  describe('bulk marking', () => {
    it('marks everyone at once, optionally only the unmarked', async () => {
      const created = await createSession(s.admin.token, {
        title: 'Persekutuan Doa',
        sessionAt: weeksAgo(30),
      });
      const id = created.json.session.id;
      const rosterSize = created.json.records.length;
      expect(rosterSize).toBeGreaterThanOrEqual(3);
      await mark(s.admin.token, id, [{ personId: s.bob.id, status: 'excused' }]);

      const unmarked = await t.request('POST', `${base}/sessions/${id}/bulk`, {
        token: recorder.token,
        body: { status: 'present', onlyUnmarked: true },
      });
      expect(unmarked.status).toBe(200);
      expect(unmarked.json.changed).toBe(rosterSize - 1);
      const bob = unmarked.json.records.find((record: { id: string }) => record.id === s.bob.id);
      expect(bob.status).toBe('excused');

      const everyone = await t.request('POST', `${base}/sessions/${id}/bulk`, {
        token: recorder.token,
        body: { status: 'absent' },
      });
      expect(everyone.json.changed).toBe(rosterSize);
      expect(
        everyone.json.records.every((record: { status: string }) => record.status === 'absent'),
      ).toBe(true);
      expect(everyone.json.session.absentCount).toBe(rosterSize);

      const some = await t.request('POST', `${base}/sessions/${id}/bulk`, {
        token: recorder.token,
        body: { status: 'present', personIds: [s.alice.id] },
      });
      expect(some.json.changed).toBe(1);
      expect(some.json.session.presentCount).toBe(1);
    });

    it('validates the body, the people and the caller', async () => {
      const created = await createSession(s.admin.token, {
        title: 'Ibadah Sore',
        sessionAt: weeksAgo(31),
      });
      const id = created.json.session.id;
      const badStatus = await t.request('POST', `${base}/sessions/${id}/bulk`, {
        token: s.admin.token,
        body: { status: 'late' },
      });
      expect(badStatus.status).toBe(422);
      const emptyList = await t.request('POST', `${base}/sessions/${id}/bulk`, {
        token: s.admin.token,
        body: { status: 'present', personIds: [] },
      });
      expect(emptyList.status).toBe(422);
      const outsider = await t.createPerson(other.owner.token, other.church.id, {
        firstName: 'Orang',
        lastName: 'Luar',
      });
      const foreign = await t.request('POST', `${base}/sessions/${id}/bulk`, {
        token: s.admin.token,
        body: { status: 'present', personIds: [outsider.id] },
      });
      expect(foreign.status).toBe(404);
      for (const token of [s.member.token, viewer.token, s.leader.token]) {
        const denied = await t.request('POST', `${base}/sessions/${id}/bulk`, {
          token,
          body: { status: 'present' },
        });
        expect(denied.status).toBe(403);
      }
      const crossChurch = await t.request(
        'POST',
        `/api/churches/${other.church.id}/attendance/sessions/${id}/bulk`,
        { token: other.owner.token, body: { status: 'present' } },
      );
      expect(crossChurch.status).toBe(404);
    });
  });

  describe('absence streaks', () => {
    let groupSessions: string[] = [];

    beforeAll(async () => {
      // Alice (in the leader's group) misses the last three group meetings after attending once.
      groupSessions = [];
      for (const weeks of [10, 9, 8, 7]) {
        const created = await createSession(s.leader.token, {
          title: `Persekutuan Pemuda ${weeks}`,
          groupId: s.group.id,
          sessionAt: weeksAgo(weeks),
        });
        expect(created.status).toBe(201);
        groupSessions.push(created.json.session.id);
      }
      const [first, ...rest] = groupSessions;
      await mark(s.leader.token, first!, [{ personId: s.alice.id, status: 'present' }]);
      for (const id of rest) {
        await mark(s.leader.token, id, [{ personId: s.alice.id, status: 'absent' }]);
      }
      // Bob misses four church-wide services, one of them excused.
      for (const [weeks, status] of [
        [14, 'absent'],
        [13, 'excused'],
        [12, 'absent'],
        [11, 'absent'],
      ] as const) {
        const created = await createSession(s.admin.token, {
          title: `Ibadah Minggu ${weeks}`,
          sessionAt: weeksAgo(weeks),
        });
        await mark(s.admin.token, created.json.session.id, [{ personId: s.bob.id, status }]);
      }
    });

    it('lists people over the threshold, longest streak first', async () => {
      const list = await t.request('GET', `${base}/absences?threshold=3`, {
        token: viewer.token,
      });
      expect(list.status).toBe(200);
      expect(list.json.threshold).toBe(3);
      expect(list.json.canFollowUp).toBe(false);
      const alice = list.json.items.find(
        (item: { person: { id: string } }) => item.person.id === s.alice.id,
      );
      const bob = list.json.items.find(
        (item: { person: { id: string } }) => item.person.id === s.bob.id,
      );
      expect(alice.streak).toBe(3);
      expect(alice.status).toBe('open');
      expect(alice.lastPresentAt).not.toBeNull();
      expect(bob.streak).toBeGreaterThanOrEqual(3);
      const streaks = list.json.items.map((item: { streak: number }) => item.streak);
      expect(streaks).toEqual([...streaks].sort((a: number, b: number) => b - a));

      const higher = await t.request('GET', `${base}/absences?threshold=10`, {
        token: viewer.token,
      });
      expect(higher.json.items).toEqual([]);
      const search = await t.request('GET', `${base}/absences?threshold=3&q=ali`, {
        token: viewer.token,
      });
      expect(search.json.items.map((item: { person: { id: string } }) => item.person.id)).toEqual([
        s.alice.id,
      ]);
      const carerList = await t.request('GET', `${base}/absences`, { token: carer.token });
      expect(carerList.json.canFollowUp).toBe(true);
    });

    it('scopes leaders to their groups and refuses everyone else', async () => {
      const leader = await t.request('GET', `${base}/absences?threshold=3`, {
        token: s.leader.token,
      });
      expect(leader.status).toBe(200);
      expect(leader.json.items.map((item: { person: { id: string } }) => item.person.id)).toEqual([
        s.alice.id,
      ]);
      const notTheirs = await t.request('GET', `${base}/absences?groupId=${s.otherGroup.id}`, {
        token: s.leader.token,
      });
      expect(notTheirs.status).toBe(403);
      const theirs = await t.request('GET', `${base}/absences?groupId=${s.group.id}`, {
        token: s.leader.token,
      });
      expect(theirs.status).toBe(200);
      for (const token of [s.member.token, recorder.token]) {
        expect((await t.request('GET', `${base}/absences`, { token })).status).toBe(403);
      }
      const tooLow = await t.request('GET', `${base}/absences?threshold=1`, {
        token: viewer.token,
      });
      expect(tooLow.status).toBe(422);
      const foreignGroup = await t.createGroup(other.owner.token, other.church.id, {
        name: 'Komisi Lain',
      });
      const crossGroup = await t.request('GET', `${base}/absences?groupId=${foreignGroup.id}`, {
        token: viewer.token,
      });
      expect(crossGroup.status).toBe(404);
    });

    it('dismisses an alert until the person attends again', async () => {
      const denied = await t.request('POST', `${base}/absences/${s.bob.id}`, {
        token: s.leader.token,
        body: { action: 'dismiss' },
      });
      expect(denied.status).toBe(403);
      const extra = await t.request('POST', `${base}/absences/${s.bob.id}`, {
        token: viewer.token,
        body: { action: 'dismiss', dueDate: '2026-12-01' },
      });
      expect(extra.status).toBe(422);
      const dismissed = await t.request('POST', `${base}/absences/${s.bob.id}`, {
        token: viewer.token,
        body: { action: 'dismiss' },
      });
      expect(dismissed.status).toBe(200);
      expect(dismissed.json.alert.status).toBe('dismissed');

      const open = await t.request('GET', `${base}/absences?threshold=3`, { token: viewer.token });
      expect(
        open.json.items.some((item: { person: { id: string } }) => item.person.id === s.bob.id),
      ).toBe(false);
      const all = await t.request('GET', `${base}/absences?threshold=3&includeResolved=true`, {
        token: viewer.token,
      });
      const bob = all.json.items.find(
        (item: { person: { id: string } }) => item.person.id === s.bob.id,
      );
      expect(bob.status).toBe('dismissed');

      const reopened = await t.request('POST', `${base}/absences/${s.bob.id}`, {
        token: viewer.token,
        body: { action: 'reopen' },
      });
      expect(reopened.status).toBe(200);
      expect(reopened.json.alert.status).toBe('open');
      const again = await t.request('POST', `${base}/absences/${s.bob.id}`, {
        token: viewer.token,
        body: { action: 'reopen' },
      });
      expect(again.status).toBe(404);

      const actions = (await insightsAudit(t, s)).map((entry) => entry.action);
      expect(actions).toContain('absence_alert.dismiss');
      expect(actions).toContain('absence_alert.reopen');

      // Bob comes back: the streak ends, so there is nothing left to dismiss.
      const back = await createSession(s.admin.token, {
        title: 'Ibadah Kembali',
        sessionAt: weeksAgo(0, 1),
      });
      await mark(s.admin.token, back.json.session.id, [{ personId: s.bob.id, status: 'present' }]);
      const none = await t.request('POST', `${base}/absences/${s.bob.id}`, {
        token: viewer.token,
        body: { action: 'dismiss' },
      });
      expect(none.status).toBe(409);
    });

    it('creates a care follow-up task, notifies the assignee and audits it', async () => {
      const noCare = await t.request('POST', `${base}/absences/${s.alice.id}`, {
        token: viewer.token,
        body: { action: 'follow_up' },
      });
      expect(noCare.status).toBe(403);
      const foreignAssignee = await t.request('POST', `${base}/absences/${s.alice.id}`, {
        token: carer.token,
        body: { action: 'follow_up', assignedUserId: other.owner.user.id },
      });
      expect(foreignAssignee.status).toBe(404);

      await setCareEnabled(t, s, false);
      const off = await t.request('POST', `${base}/absences/${s.alice.id}`, {
        token: carer.token,
        body: { action: 'follow_up' },
      });
      expect(off.status).toBe(403);
      expect(off.json.error.code).toBe('MODULE_DISABLED');
      const offList = await t.request('GET', `${base}/absences`, { token: carer.token });
      expect(offList.json.canFollowUp).toBe(false);
      await setCareEnabled(t, s, true);

      const created = await t.request('POST', `${base}/absences/${s.alice.id}`, {
        token: carer.token,
        body: {
          action: 'follow_up',
          assignedUserId: s.leader.user.id,
          dueDate: '2026-12-01',
          note: 'Kunjungi bersama penatua wilayah',
        },
      });
      expect(created.status).toBe(200);
      expect(created.json.alert.status).toBe('followed_up');
      const taskId = created.json.alert.careTaskId as string;
      expect(taskId).toBeTruthy();

      const tasks = await t.request('GET', `/api/churches/${s.church.id}/care/tasks?scope=mine`, {
        token: s.leader.token,
      });
      const task = tasks.json.items.find((item: { id: string }) => item.id === taskId);
      expect(task.person.id).toBe(s.alice.id);
      expect(task.dueDate).toBe('2026-12-01');
      expect(task.title).toContain('Alice');

      const notices = await notificationsOf(t, s.leader.token);
      const notice = notices.find((item) => item.type === 'attendance.absence_follow_up');
      expect(notice?.entityId).toBe(taskId);
      expect(notice?.link).toBe(`/c/${s.church.id}/care/tasks`);
      const own = await notificationsOf(t, carer.token);
      expect(own.some((item) => item.type === 'attendance.absence_follow_up')).toBe(false);

      const entry = (await insightsAudit(t, s)).find(
        (item) => item.action === 'absence_alert.follow_up',
      );
      expect(entry?.after.careTaskId).toBe(taskId);
      const careLog = await t.request(
        'GET',
        `/api/churches/${s.church.id}/audit-logs?module=care&action=care_task.create`,
        { token: s.owner.token },
      );
      expect(careLog.json.items.map((item: { entityId: string }) => item.entityId)).toContain(
        taskId,
      );

      const duplicate = await t.request('POST', `${base}/absences/${s.alice.id}`, {
        token: carer.token,
        body: { action: 'follow_up' },
      });
      expect(duplicate.status).toBe(409);
      const leaderView = await t.request(
        'GET',
        `${base}/absences?threshold=3&includeResolved=true`,
        { token: s.leader.token },
      );
      // The leader sees that the alert was followed up, not the pastoral care task itself.
      expect(leaderView.json.items[0].status).toBe('followed_up');
      expect(leaderView.json.items[0].careTaskId).toBeNull();
      const carerView = await t.request(
        'GET',
        `${base}/absences?threshold=3&includeResolved=true`,
        { token: carer.token },
      );
      expect(
        carerView.json.items.find(
          (item: { person: { id: string } }) => item.person.id === s.alice.id,
        )?.careTaskId,
      ).toBe(taskId);
    });

    it('keeps alerts inside the church', async () => {
      const foreign = await t.request(
        'POST',
        `/api/churches/${other.church.id}/attendance/absences/${s.alice.id}`,
        { token: other.owner.token, body: { action: 'dismiss' } },
      );
      expect(foreign.status).toBe(404);
      const outsider = await t.request(
        'POST',
        `/api/churches/${s.church.id}/attendance/absences/${s.alice.id}`,
        { token: other.owner.token, body: { action: 'dismiss' } },
      );
      expect(outsider.status).toBe(403);
    });
  });

  describe('personal history', () => {
    it('shows streaks and monthly rates to the person, leaders of their groups and viewers', async () => {
      const session = await createSession(s.admin.token, {
        title: 'Ibadah Syukur',
        sessionAt: weeksAgo(0, 0),
      });
      await mark(s.admin.token, session.json.session.id, [
        { personId: s.memberPerson.id, status: 'present' },
      ]);
      const mine = await t.request('GET', `${base}/me`, { token: s.member.token });
      expect(mine.status).toBe(200);
      expect(mine.json.history.person.id).toBe(s.memberPerson.id);
      expect(mine.json.history.streak.currentPresentStreak).toBeGreaterThanOrEqual(1);
      expect(mine.json.history.months).toHaveLength(12);
      expect(mine.json.history.items[0].status).toBe('present');

      const unlinked = await t.request('GET', `${base}/me`, { token: s.leader.token });
      expect(unlinked.json.history).toBeNull();

      // A leader reads only the sessions of the group they lead: Alice's church-wide service
      // is not theirs to see.
      const alice = await t.request('GET', `${base}/people/${s.alice.id}`, {
        token: s.leader.token,
      });
      expect(alice.status).toBe(200);
      expect(alice.json.history.streak.currentAbsentStreak).toBe(3);
      expect(alice.json.history.streak.longestPresentStreak).toBe(1);
      expect(alice.json.history.counts).toEqual({ present: 1, absent: 3, excused: 0 });
      expect(alice.json.history.streak.presentRate).toBe(0.25);
      const everything = await t.request('GET', `${base}/people/${s.alice.id}`, {
        token: viewer.token,
      });
      expect(everything.json.history.counts).toEqual({ present: 2, absent: 3, excused: 0 });

      const bob = await t.request('GET', `${base}/people/${s.bob.id}`, { token: viewer.token });
      expect(bob.status).toBe(200);
      expect(bob.json.history.counts.excused).toBe(1);
      for (const token of [s.member.token, s.leader.token, recorder.token]) {
        const denied = await t.request('GET', `${base}/people/${s.bob.id}`, { token });
        expect(denied.status).toBe(403);
      }
      const cross = await t.request(
        'GET',
        `/api/churches/${other.church.id}/attendance/people/${s.alice.id}`,
        { token: other.owner.token },
      );
      expect(cross.status).toBe(404);
      const badId = await t.request('GET', `${base}/people/not-an-id`, { token: viewer.token });
      expect(badId.status).toBe(422);
    });

    it('shows a session and its recorder note only to the person and those who may open it', async () => {
      const churchWide = await createSession(s.admin.token, {
        title: 'Ibadah Pengucapan Syukur',
        sessionAt: weeksAgo(0, 3),
      });
      const sessionId = churchWide.json.session.id as string;
      const noted = await t.request('PUT', `${base}/sessions/${sessionId}/records`, {
        token: s.admin.token,
        body: {
          records: [
            { personId: s.alice.id, status: 'excused', note: 'Dirawat di rumah sakit' },
            { personId: s.memberPerson.id, status: 'excused', note: 'Dinas ke luar kota' },
          ],
        },
      });
      expect(noted.status).toBe(200);
      const noteOf = (response: { json: any }) =>
        response.json.history.items.find(
          (item: { sessionId: string }) => item.sessionId === sessionId,
        )?.note;

      // The leader sees Alice's history through their group, but not the church-wide session.
      const leader = await t.request('GET', `${base}/people/${s.alice.id}`, {
        token: s.leader.token,
      });
      expect(leader.status).toBe(200);
      expect(
        leader.json.history.items.some(
          (item: { sessionId: string }) => item.sessionId === sessionId,
        ),
      ).toBe(false);
      const viewed = await t.request('GET', `${base}/people/${s.alice.id}`, {
        token: viewer.token,
      });
      expect(noteOf(viewed)).toBe('Dirawat di rumah sakit');
      const own = await t.request('GET', `${base}/me`, { token: s.member.token });
      expect(noteOf(own)).toBe('Dinas ke luar kota');
    });
  });
});
