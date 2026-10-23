import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { careCases } from '../src/db/schema';
import {
  careAudit,
  dayOffset,
  grantRole,
  memberWithRole,
  notificationsOf,
  otherChurch,
  setCareEnabled,
  type Member,
} from './care-helpers';
import { createTestApp, seedChurch } from './helpers';

describe('care cases', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let base: string;
  let pastor: Member;
  let elder: Member;
  let viewer: Member;
  let deacon: Member;

  const create = (token: string, body: Record<string, unknown>) =>
    t.request('POST', `${base}/cases`, { token, body });

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}/care`;
    pastor = await memberWithRole(t, s, 'Pdt. Yohanes', [
      'care.view',
      'care.manage',
      'care.confidential',
    ]);
    elder = await memberWithRole(t, s, 'Pnt. Maria', ['care.view', 'care.manage']);
    viewer = await memberWithRole(t, s, 'Pnt. Daniel', ['care.view']);
    deacon = await memberWithRole(t, s, 'Dkn. Ruth', []);
  });

  it('reports the caller permissions on the status route', async () => {
    const status = await t.request('GET', `${base}/status`, { token: pastor.token });
    expect(status.status).toBe(200);
    expect(status.json.permissions).toContain('care.confidential');
    const member = await t.request('GET', `${base}/status`, { token: s.member.token });
    expect(member.json.permissions).toEqual(['prayer.submit']);
  });

  it('lets care managers open cases and keeps members out', async () => {
    const created = await create(s.admin.token, {
      personId: s.alice.id,
      category: 'hospital',
      priority: 'high',
      title: 'Opname di RS Immanuel',
      description: 'Operasi usus buntu, keluarga minta didoakan.',
      nextActionDate: dayOffset(3),
      caregiverUserIds: [elder.user.id],
    });
    expect(created.status).toBe(201);
    expect(created.json.case.person.firstName).toBe('Alice');
    expect(created.json.case.caregivers.map((c: { userId: string }) => c.userId)).toEqual([
      elder.user.id,
    ]);
    expect(created.json.case.canManage).toBe(true);
    expect(created.json.case.openedBy.userId).toBe(s.admin.user.id);

    for (const token of [s.member.token, s.leader.token, viewer.token, deacon.token]) {
      expect((await create(token, { category: 'other', title: 'Tidak boleh' })).status).toBe(403);
    }
  });

  it('validates the body', async () => {
    const invalid = await create(s.owner.token, { category: 'unknown', title: 'x' });
    expect(invalid.status).toBe(422);
    const paths = invalid.json.error.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toContain('category');
    expect(paths).toContain('title');
    const badDate = await create(s.owner.token, {
      category: 'other',
      title: 'Tanggal salah',
      nextActionDate: '2026-13-40',
    });
    expect(badDate.status).toBe(422);
    const unknownCaregiver = await create(s.owner.token, {
      category: 'other',
      title: 'Bukan anggota',
      caregiverUserIds: [crypto.randomUUID()],
    });
    expect(unknownCaregiver.status).toBe(404);
  });

  describe('confidentiality', () => {
    let confidentialId: string;
    let normalId: string;

    beforeAll(async () => {
      const confidential = await create(pastor.token, {
        personId: s.bob.id,
        category: 'counseling',
        confidentiality: 'confidential',
        title: 'Konseling pernikahan',
        description: 'Rahasia: pergumulan rumah tangga.',
        caregiverUserIds: [deacon.user.id],
      });
      expect(confidential.status).toBe(201);
      confidentialId = confidential.json.case.id;
      await t.request('POST', `${base}/cases/${confidentialId}/notes`, {
        token: pastor.token,
        body: { kind: 'meeting', body: 'Catatan konseling sesi pertama' },
      });
      const normal = await create(elder.token, {
        personId: s.bob.id,
        category: 'grief',
        title: 'Pendampingan duka',
      });
      normalId = normal.json.case.id;
    });

    it('hides confidential cases from administrators without care.confidential', async () => {
      const detail = await t.request('GET', `${base}/cases/${confidentialId}`, {
        token: s.admin.token,
      });
      expect(detail.status).toBe(404);
      const notes = await t.request('GET', `${base}/cases/${confidentialId}/notes`, {
        token: s.admin.token,
      });
      expect(notes.status).toBe(404);
      const list = await t.request('GET', `${base}/cases?limit=200`, { token: s.admin.token });
      const ids = list.json.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(normalId);
      expect(ids).not.toContain(confidentialId);
      // Search never finds it either.
      const search = await t.request('GET', `${base}/cases?q=Konseling`, { token: s.admin.token });
      expect(search.json.items).toHaveLength(0);
      const update = await t.request('PATCH', `${base}/cases/${confidentialId}`, {
        token: s.admin.token,
        body: { category: 'other', title: 'Diambil alih' },
      });
      expect(update.status).toBe(404);
    });

    it('lets the owner, pastors and assigned caregivers read it', async () => {
      for (const token of [s.owner.token, pastor.token, deacon.token]) {
        const detail = await t.request('GET', `${base}/cases/${confidentialId}`, { token });
        expect(detail.status).toBe(200);
        expect(detail.json.case.description).toBe('Rahasia: pergumulan rumah tangga.');
        const notes = await t.request('GET', `${base}/cases/${confidentialId}/notes`, { token });
        expect(notes.json.items[0].body).toBe('Catatan konseling sesi pertama');
      }
      const caregiverList = await t.request('GET', `${base}/cases`, { token: deacon.token });
      expect(caregiverList.json.items.map((item: { id: string }) => item.id)).toEqual([
        confidentialId,
      ]);
    });

    it('keeps plain members to the cases they are assigned to', async () => {
      const list = await t.request('GET', `${base}/cases`, { token: s.member.token });
      expect(list.status).toBe(200);
      expect(list.json.items).toHaveLength(0);
      const detail = await t.request('GET', `${base}/cases/${normalId}`, {
        token: s.member.token,
      });
      expect(detail.status).toBe(404);
    });

    it('lets the care team read normal cases but only managers change them', async () => {
      const read = await t.request('GET', `${base}/cases/${normalId}`, { token: viewer.token });
      expect(read.status).toBe(200);
      expect(read.json.case.canManage).toBe(false);
      const note = await t.request('POST', `${base}/cases/${normalId}/notes`, {
        token: viewer.token,
        body: { body: 'Saya ingin menambah catatan' },
      });
      expect(note.status).toBe(403);
    });

    it('never puts confidential text into the audit log or notifications', async () => {
      const entries = await careAudit(t, s, `&entityId=${confidentialId}`);
      const created = entries.find((entry) => entry.action === 'care_case.create');
      expect(created?.summary).toBe('Opened a care case for a confidential case');
      expect(created?.after.description).toBe('[redacted]');
      expect(created?.after.title).toBe('[redacted]');
      expect(JSON.stringify(entries)).not.toContain('pergumulan');
      expect(JSON.stringify(entries)).not.toContain('Konseling pernikahan');
      const notes = await careAudit(t, s, '&entityType=care_note');
      expect(JSON.stringify(notes)).not.toContain('Catatan konseling');

      const inbox = await notificationsOf(t, deacon.token);
      const assigned = inbox.find((item) => item.type === 'care.case_assigned');
      expect(assigned?.body).toBe('Pendampingan rahasia');
      expect(JSON.stringify(inbox)).not.toContain('Konseling pernikahan');
    });

    it('lets only care.confidential holders lower confidentiality', async () => {
      const body = {
        personId: s.bob.id,
        category: 'counseling',
        confidentiality: 'normal',
        title: 'Konseling pernikahan',
      };
      const caregiver = await t.request('PATCH', `${base}/cases/${confidentialId}`, {
        token: deacon.token,
        body,
      });
      expect(caregiver.status).toBe(403);
      const raise = await t.request('PATCH', `${base}/cases/${normalId}`, {
        token: elder.token,
        body: { category: 'grief', title: 'Pendampingan duka', confidentiality: 'confidential' },
      });
      expect(raise.status).toBe(200);
      // The elder raised it without care.confidential and is not a caregiver: it is gone for them.
      const gone = await t.request('GET', `${base}/cases/${normalId}`, { token: elder.token });
      expect(gone.status).toBe(404);
      const lower = await t.request('PATCH', `${base}/cases/${normalId}`, {
        token: pastor.token,
        body: { category: 'grief', title: 'Pendampingan duka', confidentiality: 'normal' },
      });
      expect(lower.status).toBe(200);
      expect(lower.json.case.confidentiality).toBe('normal');
    });

    it('keeps an author without care.confidential on the confidential case they open', async () => {
      const created = await create(s.admin.token, {
        category: 'counseling',
        confidentiality: 'confidential',
        title: 'Konseling remaja',
      });
      expect(created.status).toBe(201);
      expect(created.json.case.caregivers.map((c: { userId: string }) => c.userId)).toEqual([
        s.admin.user.id,
      ]);
      const read = await t.request('GET', `${base}/cases/${created.json.case.id}`, {
        token: s.admin.token,
      });
      expect(read.status).toBe(200);
    });

    it('grants administrators confidential care only through a role', async () => {
      await grantRole(t, s, s.admin.user.id, 'Admin pastoral', ['care.confidential']);
      const detail = await t.request('GET', `${base}/cases/${confidentialId}`, {
        token: s.admin.token,
      });
      expect(detail.status).toBe(200);
    });
  });

  describe('updates, caregivers and notes', () => {
    let caseId: string;

    beforeAll(async () => {
      const created = await create(elder.token, {
        personId: s.memberPerson.id,
        category: 'visitation',
        title: 'Perkunjungan lansia',
        nextActionDate: dayOffset(1),
        nextActionNote: 'Telepon keluarga',
      });
      caseId = created.json.case.id;
    });

    it('records status changes on the timeline and closes cases', async () => {
      const progress = await t.request('PATCH', `${base}/cases/${caseId}`, {
        token: elder.token,
        body: {
          personId: s.memberPerson.id,
          category: 'visitation',
          title: 'Perkunjungan lansia',
          status: 'in_progress',
        },
      });
      expect(progress.status).toBe(200);
      const closed = await t.request('PATCH', `${base}/cases/${caseId}`, {
        token: elder.token,
        body: {
          personId: s.memberPerson.id,
          category: 'visitation',
          title: 'Perkunjungan lansia',
          status: 'closed',
          closedReason: 'Sudah pulih',
        },
      });
      expect(closed.json.case.status).toBe('closed');
      expect(closed.json.case.closedAt).not.toBeNull();
      expect(closed.json.case.closedReason).toBe('Sudah pulih');
      const notes = await t.request('GET', `${base}/cases/${caseId}/notes`, {
        token: elder.token,
      });
      expect(
        notes.json.items
          .filter((note: { kind: string }) => note.kind === 'status_change')
          .map((note: { body: string }) => note.body),
      ).toEqual(['closed', 'in_progress']);
      const reopened = await t.request('PATCH', `${base}/cases/${caseId}`, {
        token: elder.token,
        body: {
          personId: s.memberPerson.id,
          category: 'visitation',
          title: 'Perkunjungan lansia',
          status: 'open',
        },
      });
      expect(reopened.json.case.closedAt).toBeNull();
      const active = await t.request('GET', `${base}/cases?status=active&limit=200`, {
        token: elder.token,
      });
      expect(active.json.items.map((item: { id: string }) => item.id)).toContain(caseId);
    });

    it('assigns caregivers, notifies them and lets them work the case', async () => {
      const assign = await t.request('PUT', `${base}/cases/${caseId}/caregivers`, {
        token: elder.token,
        body: { userIds: [s.member.user.id, viewer.user.id] },
      });
      expect(assign.status).toBe(200);
      expect(assign.json.case.caregivers).toHaveLength(2);
      const inbox = await notificationsOf(t, s.member.token);
      const notice = inbox.find((item) => item.type === 'care.case_assigned');
      expect(notice?.body).toBe('Perkunjungan lansia');
      expect(notice?.link).toBe(`/c/${s.church.id}/care/cases/${caseId}`);

      // An assigned member reads and works the case, but cannot assign others.
      const mine = await t.request('GET', `${base}/cases?mine=true`, { token: s.member.token });
      expect(mine.json.items.map((item: { id: string }) => item.id)).toEqual([caseId]);
      const note = await t.request('POST', `${base}/cases/${caseId}/notes`, {
        token: s.member.token,
        body: { kind: 'call', body: 'Sudah menelepon, kondisi membaik' },
      });
      expect(note.status).toBe(201);
      expect(note.json.note.canEdit).toBe(true);
      const reassign = await t.request('PUT', `${base}/cases/${caseId}/caregivers`, {
        token: s.member.token,
        body: { userIds: [s.member.user.id, s.leader.user.id] },
      });
      expect(reassign.status).toBe(403);

      const audit = await careAudit(t, s, `&entityId=${caseId}&action=care_case.assign`);
      expect(audit[0]?.after.caregiverUserIds).toEqual([s.member.user.id, viewer.user.id]);
    });

    it('lets only the author edit a note and redacts note text in the audit log', async () => {
      const created = await t.request('POST', `${base}/cases/${caseId}/notes`, {
        token: elder.token,
        body: { body: 'Catatan pribadi penatua' },
      });
      const noteId = created.json.note.id;
      const other = await t.request('PATCH', `${base}/cases/${caseId}/notes/${noteId}`, {
        token: s.member.token,
        body: { body: 'Diubah orang lain' },
      });
      expect(other.status).toBe(403);
      const own = await t.request('PATCH', `${base}/cases/${caseId}/notes/${noteId}`, {
        token: elder.token,
        body: { body: 'Catatan pribadi penatua (diperbarui)' },
      });
      expect(own.status).toBe(200);
      expect(own.json.note.body).toBe('Catatan pribadi penatua (diperbarui)');
      const empty = await t.request('POST', `${base}/cases/${caseId}/notes`, {
        token: elder.token,
        body: { body: '   ' },
      });
      expect(empty.status).toBe(422);
      const statusKind = await t.request('POST', `${base}/cases/${caseId}/notes`, {
        token: elder.token,
        body: { kind: 'status_change', body: 'closed' },
      });
      expect(statusKind.status).toBe(422);
      const audit = await careAudit(t, s, '&entityType=care_note');
      expect(JSON.stringify(audit)).not.toContain('Catatan pribadi');
      // A care manager may delete someone else's note; the note's author may delete their own.
      const removed = await t.request('DELETE', `${base}/cases/${caseId}/notes/${noteId}`, {
        token: s.owner.token,
      });
      expect(removed.status).toBe(200);
    });

    it('sorts and filters the list', async () => {
      await create(elder.token, {
        category: 'other',
        priority: 'urgent',
        title: 'Kebakaran rumah jemaat',
        nextActionDate: dayOffset(0),
      });
      const byPriority = await t.request('GET', `${base}/cases?sort=priority&status=active`, {
        token: s.owner.token,
      });
      expect(byPriority.json.items[0].priority).toBe('urgent');
      const urgent = await t.request('GET', `${base}/cases?priority=urgent`, {
        token: s.owner.token,
      });
      expect(urgent.json.items.every((item: { priority: string }) => item.priority === 'urgent'));
      const byPerson = await t.request('GET', `${base}/cases?q=alice`, { token: s.owner.token });
      expect(
        byPerson.json.items.map((item: { person: { firstName: string } }) => item.person.firstName),
      ).toContain('Alice');
      expect(byPerson.json.items[0]).not.toHaveProperty('description');
      const paged = await t.request('GET', `${base}/cases?limit=1&page=2`, {
        token: s.owner.token,
      });
      expect(paged.json.items).toHaveLength(1);
      expect(paged.json.total).toBeGreaterThan(2);
    });
  });

  describe('reminders', () => {
    it('reminds caregivers once when the next action is due', async () => {
      const created = await create(elder.token, {
        personId: s.alice.id,
        category: 'hospital',
        title: 'Kontrol pasca operasi',
        nextActionDate: dayOffset(-1),
        caregiverUserIds: [viewer.user.id],
      });
      const caseId = created.json.case.id;
      await t.request('GET', `${base}/overview`, { token: s.member.token });
      await t.request('GET', `${base}/overview`, { token: s.member.token });
      const reminders = (await notificationsOf(t, viewer.token)).filter(
        (item) => item.type === 'care.reminder' && item.entityId === caseId,
      );
      expect(reminders).toHaveLength(1);
      expect(reminders[0]?.title).toBe('Langkah pendampingan terlambat');

      // Moving the date re-arms the reminder.
      await t.request('PATCH', `${base}/cases/${caseId}`, {
        token: elder.token,
        body: {
          personId: s.alice.id,
          category: 'hospital',
          title: 'Kontrol pasca operasi',
          nextActionDate: dayOffset(0),
        },
      });
      const row = t.db.select().from(careCases).where(eq(careCases.id, caseId)).get();
      expect(row?.reminderSentAt).toBeNull();
      await t.request('GET', `${base}/cases`, { token: s.member.token });
      const again = (await notificationsOf(t, viewer.token)).filter(
        (item) => item.type === 'care.reminder' && item.entityId === caseId,
      );
      expect(again).toHaveLength(2);
      expect(again[0]?.title).toBe('Langkah pendampingan hari ini');
    });

    it('does not remind about closed cases', async () => {
      const created = await create(elder.token, {
        category: 'other',
        title: 'Sudah selesai',
        status: 'closed',
        nextActionDate: dayOffset(-2),
        caregiverUserIds: [viewer.user.id],
      });
      await t.request('GET', `${base}/overview`, { token: viewer.token });
      const reminders = (await notificationsOf(t, viewer.token)).filter(
        (item) => item.entityId === created.json.case.id,
      );
      expect(reminders.filter((item) => item.type === 'care.reminder')).toHaveLength(0);
    });
  });

  describe('deleting', () => {
    it('needs care.manage and confirms the delete in the audit log', async () => {
      const created = await create(elder.token, { category: 'other', title: 'Salah input' });
      const id = created.json.case.id;
      await t.request('PUT', `${base}/cases/${id}/caregivers`, {
        token: elder.token,
        body: { userIds: [s.member.user.id] },
      });
      const caregiver = await t.request('DELETE', `${base}/cases/${id}`, { token: s.member.token });
      expect(caregiver.status).toBe(403);
      const removed = await t.request('DELETE', `${base}/cases/${id}`, { token: elder.token });
      expect(removed.status).toBe(200);
      expect((await t.request('GET', `${base}/cases/${id}`, { token: elder.token })).status).toBe(
        404,
      );
      const audit = await careAudit(t, s, `&entityId=${id}`);
      expect(audit[0]?.action).toBe('care_case.delete');
    });
  });

  describe('isolation', () => {
    it('answers 404 for ids and people of another church', async () => {
      const other = await otherChurch(t);
      const foreign = await t.request('POST', `${other.base}/cases`, {
        token: other.owner.token,
        body: { personId: other.person.id, category: 'other', title: 'Gereja lain' },
      });
      expect(foreign.status).toBe(201);
      const foreignId = foreign.json.case.id;
      expect(
        (await t.request('GET', `${base}/cases/${foreignId}`, { token: s.owner.token })).status,
      ).toBe(404);
      expect(
        (
          await t.request('PATCH', `${base}/cases/${foreignId}`, {
            token: s.owner.token,
            body: { category: 'other', title: 'Ambil alih' },
          })
        ).status,
      ).toBe(404);
      expect(
        (await t.request('GET', `${base}/cases/${foreignId}/notes`, { token: s.owner.token }))
          .status,
      ).toBe(404);
      expect(
        (await t.request('DELETE', `${base}/cases/${foreignId}`, { token: s.owner.token })).status,
      ).toBe(404);
      // A person of another church cannot be named.
      const crossPerson = await create(s.owner.token, {
        personId: other.person.id,
        category: 'other',
        title: 'Orang gereja lain',
      });
      expect(crossPerson.status).toBe(404);
      // The other owner cannot assign our members as caregivers.
      const crossCaregiver = await t.request('PUT', `${other.base}/cases/${foreignId}/caregivers`, {
        token: other.owner.token,
        body: { userIds: [s.member.user.id] },
      });
      expect(crossCaregiver.status).toBe(404);
      // Not a member of the other church at all.
      expect((await t.request('GET', `${other.base}/cases`, { token: s.owner.token })).status).toBe(
        403,
      );
    });

    it('answers 403 MODULE_DISABLED when the church turns care off', async () => {
      await setCareEnabled(t, s, false);
      for (const path of ['/cases', '/overview', '/visits', '/prayer-requests', '/tasks']) {
        const response = await t.request('GET', `${base}${path}`, { token: s.owner.token });
        expect(response.status).toBe(403);
        expect(response.json.error.code).toBe('MODULE_DISABLED');
      }
      await setCareEnabled(t, s, true);
      expect((await t.request('GET', `${base}/cases`, { token: s.owner.token })).status).toBe(200);
    });
  });
});
