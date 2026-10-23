import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { visitorFollowUps } from '../src/db/schema';
import {
  careAudit,
  dayOffset,
  memberWithRole,
  notificationsOf,
  setCareEnabled,
  type Member,
} from './care-helpers';
import { createTestApp, seedChurch } from './helpers';

/*
 * Holes found in review: testimonies bypassing moderation, confidential subjects in the audit log,
 * losing access to a case one just made confidential, and edits of aid linked to such a case.
 */
describe('care review', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let base: string;
  let pastor: Member;
  let elder: Member;
  let moderator: Member;
  let treasurer: Member;
  let other: Member;

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}/care`;
    pastor = await memberWithRole(t, s, 'Pdt. Lukas', [
      'care.view',
      'care.manage',
      'care.confidential',
    ]);
    elder = await memberWithRole(t, s, 'Pnt. Maria', ['care.view', 'care.manage']);
    moderator = await memberWithRole(t, s, 'Tim Doa', ['prayer.moderate']);
    treasurer = await memberWithRole(t, s, 'Bendahara', ['diakonia.view', 'diakonia.manage']);
    other = await memberWithRole(t, s, 'Jemaat Lain', []);
  });

  describe('testimonies', () => {
    let requestId: string;

    beforeAll(async () => {
      const created = await t.request('POST', `${base}/prayer-requests`, {
        token: s.member.token,
        body: { title: 'Pekerjaan baru', body: 'Mohon doa untuk wawancara kerja.' },
      });
      requestId = created.json.request.id;
      await t.request('POST', `${base}/prayer-requests/${requestId}/moderate`, {
        token: moderator.token,
        body: { decision: 'approved' },
      });
      const prayed = await t.request('POST', `${base}/prayer-requests/${requestId}/pray`, {
        token: other.token,
      });
      expect(prayed.status).toBe(200);
    });

    const answeredIds = async (token: string) =>
      (await t.request('GET', `${base}/prayer-requests?scope=answered`, { token })).json.items.map(
        (item: { id: string }) => item.id,
      );

    it('reviews a testimony before the church sees it', async () => {
      const answered = await t.request('POST', `${base}/prayer-requests/${requestId}/answer`, {
        token: s.member.token,
        body: { testimony: 'Puji Tuhan, saya diterima bekerja. Kunjungi tokoku.com' },
      });
      expect(answered.status).toBe(200);
      expect(answered.json.request.moderationStatus).toBe('pending');
      expect(await answeredIds(other.token)).not.toContain(requestId);
      const hidden = await t.request('GET', `${base}/prayer-requests/${requestId}`, {
        token: other.token,
      });
      expect(hidden.status).toBe(404);

      // Those who prayed still hear that it was answered (the title was already shared).
      const inbox = await notificationsOf(t, other.token);
      const notice = inbox.find(
        (item) => item.type === 'prayer.answered' && item.entityId === requestId,
      );
      expect(notice?.body).toBe('Pekerjaan baru');
      expect(JSON.stringify(inbox)).not.toContain('tokoku');

      const queue = await t.request('GET', `${base}/prayer-requests?scope=moderation`, {
        token: moderator.token,
      });
      const queued = queue.json.items.find((item: { id: string }) => item.id === requestId);
      expect(queued.testimony).toContain('tokoku.com');

      await t.request('POST', `${base}/prayer-requests/${requestId}/moderate`, {
        token: moderator.token,
        body: { decision: 'approved' },
      });
      expect(await answeredIds(other.token)).toContain(requestId);
    });

    it('keeps answers without a testimony and answers by moderators public', async () => {
      const plain = await t.request('POST', `${base}/prayer-requests`, {
        token: s.member.token,
        body: { title: 'Perjalanan aman', body: 'Mudik ke Medan.' },
      });
      const plainId = plain.json.request.id;
      await t.request('POST', `${base}/prayer-requests/${plainId}/moderate`, {
        token: moderator.token,
        body: { decision: 'approved' },
      });
      const noTestimony = await t.request('POST', `${base}/prayer-requests/${plainId}/answer`, {
        token: s.member.token,
        body: { testimony: null },
      });
      expect(noTestimony.json.request.moderationStatus).toBe('approved');
      expect(await answeredIds(other.token)).toContain(plainId);

      const own = await t.request('POST', `${base}/prayer-requests`, {
        token: moderator.token,
        body: { title: 'Ujian anak', body: 'Ujian nasional.' },
      });
      const ownId = own.json.request.id;
      const byModerator = await t.request('POST', `${base}/prayer-requests/${ownId}/answer`, {
        token: moderator.token,
        body: { testimony: 'Lulus dengan baik.' },
      });
      expect(byModerator.json.request.moderationStatus).toBe('approved');
    });
  });

  describe('confidential subjects in the audit log', () => {
    it('redacts who a confidential case and visit are about', async () => {
      const created = await t.request('POST', `${base}/cases`, {
        token: pastor.token,
        body: {
          personId: s.alice.id,
          category: 'counseling',
          confidentiality: 'confidential',
          title: 'Konseling',
        },
      });
      const caseId = created.json.case.id;
      const visit = await t.request('POST', `${base}/visits`, {
        token: pastor.token,
        body: {
          caseId,
          visitDate: dayOffset(0),
          location: 'Klinik Jiwa Sejahtera',
          summary: 'Sesi kedua',
        },
      });
      expect(visit.status).toBe(201);
      expect(visit.json.visit.person.id).toBe(s.alice.id);
      await t.request('PATCH', `${base}/cases/${caseId}`, {
        token: pastor.token,
        body: {
          personId: s.bob.id,
          category: 'counseling',
          confidentiality: 'confidential',
          title: 'Konseling',
        },
      });
      const entries = [
        ...(await careAudit(t, s, `&entityId=${caseId}`)),
        ...(await careAudit(t, s, `&entityId=${visit.json.visit.id}`)),
      ];
      expect(entries.length).toBeGreaterThanOrEqual(3);
      const text = JSON.stringify(entries);
      expect(text).not.toContain(s.alice.id);
      expect(text).not.toContain(s.bob.id);
      expect(text).not.toContain('Klinik Jiwa');
      const update = entries.find((entry) => entry.action === 'care_case.update');
      expect(update?.after.personId).toBe('[redacted]');
    });

    it('still records the subject of normal cases', async () => {
      const created = await t.request('POST', `${base}/cases`, {
        token: elder.token,
        body: { personId: s.alice.id, category: 'hospital', title: 'Opname' },
      });
      const [entry] = await careAudit(t, s, `&entityId=${created.json.case.id}`);
      expect(entry?.after.personId).toBe(s.alice.id);
    });
  });

  describe('keeping access to a confidential case', () => {
    it('keeps a care manager who makes a case confidential as its caregiver', async () => {
      const created = await t.request('POST', `${base}/cases`, {
        token: elder.token,
        body: { personId: s.bob.id, category: 'counseling', title: 'Pergumulan' },
      });
      const caseId = created.json.case.id;
      const raised = await t.request('PATCH', `${base}/cases/${caseId}`, {
        token: elder.token,
        body: {
          personId: s.bob.id,
          category: 'counseling',
          confidentiality: 'confidential',
          title: 'Pergumulan',
        },
      });
      expect(raised.status).toBe(200);
      expect(raised.json.case.caregivers.map((c: { userId: string }) => c.userId)).toContain(
        elder.user.id,
      );
      const again = await t.request('GET', `${base}/cases/${caseId}`, { token: elder.token });
      expect(again.status).toBe(200);
    });

    it('refuses to remove the last access of a caregiver without care.confidential', async () => {
      const created = await t.request('POST', `${base}/cases`, {
        token: elder.token,
        body: { category: 'counseling', confidentiality: 'confidential', title: 'Rahasia' },
      });
      const caseId = created.json.case.id;
      const leave = await t.request('PUT', `${base}/cases/${caseId}/caregivers`, {
        token: elder.token,
        body: { userIds: [pastor.user.id] },
      });
      expect(leave.status).toBe(409);
      // Pastors may remove them.
      const removed = await t.request('PUT', `${base}/cases/${caseId}/caregivers`, {
        token: pastor.token,
        body: { userIds: [pastor.user.id] },
      });
      expect(removed.status).toBe(200);
      const gone = await t.request('GET', `${base}/cases/${caseId}`, { token: elder.token });
      expect(gone.status).toBe(404);
    });
  });

  describe('aid linked to a confidential case', () => {
    it('lets diakonia managers correct the record without reading the case', async () => {
      const confidential = await t.request('POST', `${base}/cases`, {
        token: pastor.token,
        body: { category: 'financial_aid', confidentiality: 'confidential', title: 'Utang' },
      });
      const caseId = confidential.json.case.id;
      const aid = await t.request('POST', `${base}/diakonia`, {
        token: s.owner.token,
        body: { recipientName: 'Keluarga Y', caseId, category: 'food', givenAt: dayOffset(0) },
      });
      expect(aid.status).toBe(201);
      const fix = await t.request('PATCH', `${base}/diakonia/${aid.json.aid.id}`, {
        token: treasurer.token,
        body: {
          recipientName: 'Keluarga Y',
          caseId,
          category: 'food',
          amount: 250000,
          givenAt: dayOffset(0),
        },
      });
      expect(fix.status).toBe(200);
      expect(fix.json.aid.amount).toBe(250000);
      const other = await t.request('POST', `${base}/cases`, {
        token: pastor.token,
        body: { category: 'other', confidentiality: 'confidential', title: 'Lain' },
      });
      const relink = await t.request('PATCH', `${base}/diakonia/${aid.json.aid.id}`, {
        token: treasurer.token,
        body: {
          recipientName: 'Keluarga Y',
          caseId: other.json.case.id,
          category: 'food',
          givenAt: dayOffset(0),
        },
      });
      expect(relink.status).toBe(404);
    });
  });

  describe('overview pipeline', () => {
    it('counts the same follow-ups as the board', async () => {
      const created = await t.request('POST', `${base}/follow-ups`, {
        token: elder.token,
        body: { newVisitor: { firstName: 'Tamu', lastName: 'Lama' } },
      });
      const id = created.json.followUp.id;
      await t.request('POST', `${base}/follow-ups/${id}/stage`, {
        token: elder.token,
        body: { stage: 'joined' },
      });
      t.db
        .update(visitorFollowUps)
        .set({ stageChangedAt: '2020-01-01T00:00:00.000Z' })
        .where(eq(visitorFollowUps.id, id))
        .run();
      const board = await t.request('GET', `${base}/follow-ups`, { token: elder.token });
      const overview = await t.request('GET', `${base}/overview`, { token: elder.token });
      expect(overview.json.followUps).toEqual(board.json.counts);
    });
  });

  describe('switched off', () => {
    it('answers 403 MODULE_DISABLED on every care route, reads and writes', async () => {
      await setCareEnabled(t, s, false);
      const id = '00000000-0000-4000-8000-000000000000';
      const routes: [string, string, Record<string, unknown>?][] = [
        ['GET', '/status'],
        ['GET', '/team'],
        ['GET', '/households'],
        ['GET', '/follow-ups'],
        ['GET', '/diakonia'],
        ['GET', `/cases/${id}/notes`],
        ['POST', '/cases', { category: 'other', title: 'Mati' }],
        ['POST', '/visits', { personId: s.alice.id, visitDate: dayOffset(0) }],
        ['POST', '/prayer-requests', { title: 'Doa', body: 'Doa' }],
        ['POST', `/prayer-requests/${id}/pray`],
        ['POST', '/follow-ups', { newVisitor: { firstName: 'Tamu' } }],
        ['POST', '/tasks', { title: 'Tugas' }],
        ['POST', '/diakonia', { recipientName: 'X', category: 'food', givenAt: dayOffset(0) }],
        ['PATCH', `/tasks/${id}/status`, { status: 'done' }],
      ];
      for (const [method, path, body] of routes) {
        const response = await t.request(method, `${base}${path}`, { token: s.owner.token, body });
        expect(`${method} ${path} ${response.status}`).toBe(`${method} ${path} 403`);
        expect(response.json.error.code).toBe('MODULE_DISABLED');
      }
      await setCareEnabled(t, s, true);
    });
  });
});
