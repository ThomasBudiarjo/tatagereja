import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  careAudit,
  dayOffset,
  memberWithRole,
  notificationsOf,
  otherChurch,
  type Member,
} from './care-helpers';
import { createTestApp, seedChurch } from './helpers';

describe('visitor follow-up and tasks', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let base: string;
  let coordinator: Member;
  let viewer: Member;
  let usher: Member;

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}/care`;
    coordinator = await memberWithRole(t, s, 'Koordinator Penyambutan', [
      'care.view',
      'care.manage',
      'people.create',
    ]);
    viewer = await memberWithRole(t, s, 'Pnt. Hana', ['care.view']);
    usher = await memberWithRole(t, s, 'Penerima Tamu', []);
  });

  describe('pipeline', () => {
    let followUpId: string;
    let visitorId: string;

    it('adds a first-time guest as a visitor and assigns them', async () => {
      const created = await t.request('POST', `${base}/follow-ups`, {
        token: coordinator.token,
        body: {
          newVisitor: { firstName: 'Kevin', lastName: 'Sihombing', phone: '0812-3456-7890' },
          source: 'Diajak teman',
          firstVisitDate: dayOffset(-3),
          assignedUserId: usher.user.id,
        },
      });
      expect(created.status).toBe(201);
      const followUp = created.json.followUp;
      followUpId = followUp.id;
      visitorId = followUp.person.id;
      expect(followUp.stage).toBe('new');
      expect(followUp.person.membershipStatus).toBe('visitor');
      expect(followUp.phone).toBe('0812-3456-7890');
      expect(followUp.assignee.userId).toBe(usher.user.id);
      const inbox = await notificationsOf(t, usher.token);
      const notice = inbox.find((item) => item.type === 'care.follow_up_assigned');
      expect(notice?.body).toBe('Kevin Sihombing');
    });

    it('validates and refuses a second active follow-up for the same person', async () => {
      const neither = await t.request('POST', `${base}/follow-ups`, {
        token: coordinator.token,
        body: { source: 'x' },
      });
      expect(neither.status).toBe(422);
      const both = await t.request('POST', `${base}/follow-ups`, {
        token: coordinator.token,
        body: { personId: s.bob.id, newVisitor: { firstName: 'Dua' } },
      });
      expect(both.status).toBe(422);
      const duplicate = await t.request('POST', `${base}/follow-ups`, {
        token: coordinator.token,
        body: { personId: visitorId },
      });
      expect(duplicate.status).toBe(409);
      for (const token of [viewer.token, usher.token, s.member.token]) {
        const denied = await t.request('POST', `${base}/follow-ups`, {
          token,
          body: { personId: s.bob.id },
        });
        expect(denied.status).toBe(403);
      }
    });

    it('shows the board to the care team and only assigned follow-ups to others', async () => {
      await t.request('POST', `${base}/follow-ups`, {
        token: coordinator.token,
        body: { personId: s.bob.id, stage: 'contacted' },
      });
      const board = await t.request('GET', `${base}/follow-ups`, { token: viewer.token });
      expect(board.status).toBe(200);
      expect(board.json.items).toHaveLength(2);
      expect(board.json.counts).toEqual({ new: 1, contacted: 1, visited: 0, joined: 0, closed: 0 });
      const assigned = await t.request('GET', `${base}/follow-ups`, { token: usher.token });
      expect(assigned.json.items.map((item: { id: string }) => item.id)).toEqual([followUpId]);
      const nothing = await t.request('GET', `${base}/follow-ups`, { token: s.member.token });
      expect(nothing.json.items).toHaveLength(0);
      const search = await t.request('GET', `${base}/follow-ups?q=sihombing`, {
        token: viewer.token,
      });
      expect(search.json.items).toHaveLength(1);
      const stage = await t.request('GET', `${base}/follow-ups?stage=contacted`, {
        token: viewer.token,
      });
      expect(stage.json.items).toHaveLength(1);
      expect(stage.json.counts.new).toBe(1);
    });

    it('lets the assignee move the visitor but not reassign', async () => {
      const contacted = await t.request('POST', `${base}/follow-ups/${followUpId}/stage`, {
        token: usher.token,
        body: { stage: 'contacted' },
      });
      expect(contacted.status).toBe(200);
      expect(contacted.json.followUp.stage).toBe('contacted');
      const reassign = await t.request('PATCH', `${base}/follow-ups/${followUpId}`, {
        token: usher.token,
        body: { assignedUserId: s.member.user.id },
      });
      expect(reassign.status).toBe(403);
      const notes = await t.request('PATCH', `${base}/follow-ups/${followUpId}`, {
        token: usher.token,
        body: {
          assignedUserId: usher.user.id,
          source: 'Diajak teman',
          notes: 'Tertarik ikut persekutuan pemuda',
        },
      });
      expect(notes.status).toBe(200);
      expect(notes.json.followUp.notes).toBe('Tertarik ikut persekutuan pemuda');
      const viewerMove = await t.request('POST', `${base}/follow-ups/${followUpId}/stage`, {
        token: viewer.token,
        body: { stage: 'visited' },
      });
      expect(viewerMove.status).toBe(403);
    });

    it('needs a reason to close and turns joined visitors into regular attendees', async () => {
      const noReason = await t.request('POST', `${base}/follow-ups/${followUpId}/stage`, {
        token: coordinator.token,
        body: { stage: 'closed' },
      });
      expect(noReason.status).toBe(422);
      expect(noReason.json.error.issues[0].path).toBe('closedReason');
      const joined = await t.request('POST', `${base}/follow-ups/${followUpId}/stage`, {
        token: coordinator.token,
        body: { stage: 'joined' },
      });
      expect(joined.status).toBe(200);
      // The coordinator may not edit people: the status change waits for someone who may.
      expect(joined.json.followUp.person.membershipStatus).toBe('visitor');
      expect(joined.json.followUp.statusSuggestion).toBe('regular');
      expect(joined.json.followUp.canChangeStatus).toBe(false);
      const suggested = (await notificationsOf(t, s.admin.token)).find(
        (item) => item.type === 'care.status_suggested',
      );
      expect(suggested?.title).toContain('Kevin Sihombing');
      const refused = await t.request('POST', `${base}/follow-ups/${followUpId}/apply-status`, {
        token: coordinator.token,
      });
      expect(refused.status).toBe(403);
      const applied = await t.request('POST', `${base}/follow-ups/${followUpId}/apply-status`, {
        token: s.admin.token,
      });
      expect(applied.status).toBe(200);
      expect(applied.json.followUp.person.membershipStatus).toBe('regular');
      expect(applied.json.followUp.statusSuggestion).toBeNull();
      const twice = await t.request('POST', `${base}/follow-ups/${followUpId}/apply-status`, {
        token: s.admin.token,
      });
      expect(twice.status).toBe(409);
      const statusAudit = await t.request(
        'GET',
        `/api/churches/${s.church.id}/audit-logs?action=person.status_change&entityId=${visitorId}`,
        { token: s.owner.token },
      );
      expect(statusAudit.json.items).toHaveLength(1);
      expect(statusAudit.json.items[0].params).toMatchObject({
        person: 'Kevin Sihombing',
        status: 'regular',
      });
      // With this one ended, a new follow-up for the same person is allowed.
      const again = await t.request('POST', `${base}/follow-ups`, {
        token: coordinator.token,
        body: { personId: visitorId },
      });
      expect(again.status).toBe(201);
      const reopen = await t.request('POST', `${base}/follow-ups/${followUpId}/stage`, {
        token: coordinator.token,
        body: { stage: 'new' },
      });
      expect(reopen.status).toBe(409);
      const audit = await careAudit(t, s, `&entityId=${followUpId}`);
      expect(audit.map((entry) => entry.action)).toEqual(
        expect.arrayContaining(['visitor_follow_up.create', 'visitor_follow_up.stage']),
      );
      expect(JSON.stringify(audit)).not.toContain('persekutuan pemuda');
    });
  });

  describe('directory permissions', () => {
    it('adds new people and changes statuses only with the directory permissions', async () => {
      const carer = await memberWithRole(t, s, 'Diaken Penyambutan', ['care.view', 'care.manage']);
      const newGuest = await t.request('POST', `${base}/follow-ups`, {
        token: carer.token,
        body: { newVisitor: { firstName: 'Tamu', lastName: 'Baru' } },
      });
      expect(newGuest.status).toBe(403);
      expect(newGuest.json.error.message).toContain('already in');
      const people = await t.request('GET', `/api/churches/${s.church.id}/people?q=Tamu`, {
        token: s.owner.token,
      });
      expect(people.json.items).toHaveLength(0);

      // Someone already in the directory is fine, and an editor's move applies the status.
      const guest = await t.createPerson(s.owner.token, s.church.id, {
        firstName: 'Yohana',
        lastName: 'Tamu',
        membershipStatus: 'visitor',
      });
      const existing = await t.request('POST', `${base}/follow-ups`, {
        token: carer.token,
        body: { personId: guest.id },
      });
      expect(existing.status).toBe(201);
      const editor = await memberWithRole(t, s, 'Sekretaris Penyambutan', [
        'care.manage',
        'people.edit',
      ]);
      const joined = await t.request(
        'POST',
        `${base}/follow-ups/${existing.json.followUp.id}/stage`,
        { token: editor.token, body: { stage: 'joined' } },
      );
      expect(joined.status).toBe(200);
      expect(joined.json.followUp.person.membershipStatus).toBe('regular');
      expect(joined.json.followUp.statusSuggestion).toBeNull();
    });
  });

  describe('tasks', () => {
    let followUpId: string;
    let taskId: string;

    beforeAll(async () => {
      const followUp = await t.request('POST', `${base}/follow-ups`, {
        token: coordinator.token,
        body: { newVisitor: { firstName: 'Lidya' }, assignedUserId: usher.user.id },
      });
      followUpId = followUp.json.followUp.id;
    });

    it('creates follow-up tasks, notifies the assignee and lists them as my tasks', async () => {
      const created = await t.request('POST', `${base}/tasks`, {
        token: coordinator.token,
        body: {
          title: 'Telepon Lidya',
          dueDate: dayOffset(-1),
          assignedUserId: usher.user.id,
          followUpId,
        },
      });
      expect(created.status).toBe(201);
      taskId = created.json.task.id;
      expect(created.json.task.isOverdue).toBe(true);
      expect(created.json.task.person.firstName).toBe('Lidya');
      const inbox = await notificationsOf(t, usher.token);
      expect(inbox.some((item) => item.type === 'care.task_assigned')).toBe(true);

      const mine = await t.request('GET', `${base}/tasks`, { token: usher.token });
      expect(mine.status).toBe(200);
      expect(mine.json.items.map((item: { id: string }) => item.id)).toEqual([taskId]);
      expect(mine.json.items[0].canComplete).toBe(true);
      expect(mine.json.items[0].canEdit).toBe(false);
      const overdue = await t.request('GET', `${base}/tasks?overdue=true`, { token: usher.token });
      expect(overdue.json.items).toHaveLength(1);
      // The reminder for the overdue task went out once.
      const reminders = (await notificationsOf(t, usher.token)).filter(
        (item) => item.type === 'care.reminder' && item.entityId === taskId,
      );
      expect(reminders).toHaveLength(1);

      const board = await t.request('GET', `${base}/follow-ups/${followUpId}`, {
        token: coordinator.token,
      });
      expect(board.json.followUp.openTaskCount).toBe(1);
      expect(board.json.followUp.hasOverdueTask).toBe(true);
    });

    it('lets the assignee complete and reopen but not edit', async () => {
      const done = await t.request('PATCH', `${base}/tasks/${taskId}/status`, {
        token: usher.token,
        body: { status: 'done' },
      });
      expect(done.status).toBe(200);
      expect(done.json.task.status).toBe('done');
      expect(done.json.task.completedAt).not.toBeNull();
      expect(done.json.task.isOverdue).toBe(false);
      const edit = await t.request('PATCH', `${base}/tasks/${taskId}`, {
        token: usher.token,
        body: { title: 'Diubah' },
      });
      expect(edit.status).toBe(403);
      const reopen = await t.request('PATCH', `${base}/tasks/${taskId}/status`, {
        token: usher.token,
        body: { status: 'open' },
      });
      expect(reopen.json.task.completedAt).toBeNull();
      const stranger = await t.request('PATCH', `${base}/tasks/${taskId}/status`, {
        token: s.member.token,
        body: { status: 'done' },
      });
      expect(stranger.status).toBe(404);
    });

    it('lets creators and care managers edit, reassign and delete', async () => {
      const edited = await t.request('PATCH', `${base}/tasks/${taskId}`, {
        token: coordinator.token,
        body: { title: 'Kunjungi Lidya', dueDate: dayOffset(5), assignedUserId: viewer.user.id },
      });
      expect(edited.status).toBe(200);
      expect(edited.json.task.assignee.userId).toBe(viewer.user.id);
      expect(edited.json.task.isOverdue).toBe(false);
      const usherList = await t.request('GET', `${base}/tasks`, { token: usher.token });
      expect(usherList.json.items).toHaveLength(0);
      const all = await t.request('GET', `${base}/tasks?scope=all`, { token: viewer.token });
      expect(all.json.items.map((item: { id: string }) => item.id)).toContain(taskId);
      const memberAll = await t.request('GET', `${base}/tasks?scope=all`, {
        token: s.member.token,
      });
      expect(memberAll.status).toBe(403);
      const removed = await t.request('DELETE', `${base}/tasks/${taskId}`, {
        token: s.admin.token,
      });
      expect(removed.status).toBe(200);
    });

    it('needs care.manage for loose tasks and validates them', async () => {
      const member = await t.request('POST', `${base}/tasks`, {
        token: s.member.token,
        body: { title: 'Tugas saya' },
      });
      expect(member.status).toBe(403);
      const invalid = await t.request('POST', `${base}/tasks`, {
        token: coordinator.token,
        body: { title: 'x', dueDate: 'besok' },
      });
      expect(invalid.status).toBe(422);
      const own = await t.request('POST', `${base}/tasks`, {
        token: coordinator.token,
        body: { title: 'Siapkan bingkisan tamu' },
      });
      // Without an assignee the creator takes the task.
      expect(own.json.task.assignee.userId).toBe(coordinator.user.id);
    });

    it('keeps tasks of confidential cases away from the care team', async () => {
      const pastor = await memberWithRole(t, s, 'Pdt. Simon', [
        'care.view',
        'care.manage',
        'care.confidential',
      ]);
      const confidential = await t.request('POST', `${base}/cases`, {
        token: pastor.token,
        body: { category: 'counseling', confidentiality: 'confidential', title: 'Konseling' },
      });
      const caseId = confidential.json.case.id;
      const task = await t.request('POST', `${base}/tasks`, {
        token: pastor.token,
        body: { title: 'Sesi kedua konseling', caseId, assignedUserId: usher.user.id },
      });
      expect(task.status).toBe(201);
      const all = await t.request('GET', `${base}/tasks?scope=all`, { token: viewer.token });
      expect(all.json.items.map((item: { id: string }) => item.id)).not.toContain(
        task.json.task.id,
      );
      // The assignee sees their task, without the case title.
      const mine = await t.request('GET', `${base}/tasks`, { token: usher.token });
      const own = mine.json.items.find((item: { id: string }) => item.id === task.json.task.id);
      expect(own.caseTitle).toBeNull();
      const notice = (await notificationsOf(t, usher.token)).find(
        (item) => item.entityId === task.json.task.id,
      );
      expect(notice?.body).toBe('Pendampingan rahasia');
      // The case caregivers' view: every task of a case they can read; others get 404.
      const caseTasks = await t.request('GET', `${base}/tasks?caseId=${caseId}`, {
        token: pastor.token,
      });
      expect(caseTasks.json.items.map((item: { id: string }) => item.id)).toEqual([
        task.json.task.id,
      ]);
      const hidden = await t.request('GET', `${base}/tasks?caseId=${caseId}`, {
        token: viewer.token,
      });
      expect(hidden.status).toBe(404);
      const viewerCreate = await t.request('POST', `${base}/tasks`, {
        token: coordinator.token,
        body: { title: 'Ikut campur', caseId },
      });
      expect(viewerCreate.status).toBe(404);
    });

    it('answers 404 for another church', async () => {
      const other = await otherChurch(t);
      const followUp = await t.request('POST', `${other.base}/follow-ups`, {
        token: other.owner.token,
        body: { personId: other.person.id },
      });
      expect(followUp.status).toBe(201);
      const foreignId = followUp.json.followUp.id;
      const task = await t.request('POST', `${other.base}/tasks`, {
        token: other.owner.token,
        body: { title: 'Tugas gereja lain', followUpId: foreignId },
      });
      const foreignTask = task.json.task.id;
      expect(
        (await t.request('GET', `${base}/follow-ups/${foreignId}`, { token: s.owner.token }))
          .status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', `${base}/follow-ups/${foreignId}/stage`, {
            token: s.owner.token,
            body: { stage: 'visited' },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', `${base}/tasks`, {
            token: s.owner.token,
            body: { title: 'Menyusup', followUpId: foreignId },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('PATCH', `${base}/tasks/${foreignTask}/status`, {
            token: s.owner.token,
            body: { status: 'done' },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', `${base}/follow-ups`, {
            token: s.owner.token,
            body: { personId: other.person.id },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', `${base}/follow-ups`, {
            token: s.owner.token,
            body: { personId: s.alice.id, assignedUserId: other.owner.user.id },
          })
        ).status,
      ).toBe(404);
    });
  });
});
