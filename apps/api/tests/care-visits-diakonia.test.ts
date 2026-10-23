import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { careAudit, dayOffset, memberWithRole, otherChurch, type Member } from './care-helpers';
import { createTestApp, seedChurch } from './helpers';

describe('visits, diakonia and the overview', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let base: string;
  let pastor: Member;
  let elder: Member;
  let viewer: Member;
  let treasurer: Member;
  let deaconPerson: { id: string };

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}/care`;
    pastor = await memberWithRole(t, s, 'Pdt. Agus', [
      'care.view',
      'care.manage',
      'care.confidential',
      'diakonia.view',
      'diakonia.manage',
    ]);
    elder = await memberWithRole(t, s, 'Pnt. Rina', ['care.view', 'care.manage']);
    viewer = await memberWithRole(t, s, 'Pnt. Tono', ['care.view']);
    treasurer = await memberWithRole(t, s, 'Bendahara', ['diakonia.view']);
    deaconPerson = await t.createPerson(s.owner.token, s.church.id, {
      firstName: 'Diaken',
      lastName: 'Paulus',
      membershipStatus: 'member',
    });
  });

  describe('visits', () => {
    let visitId: string;

    it('logs a visit with visitors and keeps the summary out of lists', async () => {
      const created = await t.request('POST', `${base}/visits`, {
        token: elder.token,
        body: {
          personId: s.alice.id,
          visitDate: dayOffset(-1),
          location: 'RS Siloam',
          summary: 'Kondisi stabil, keluarga tabah. Berdoa bersama.',
          followUpNeeded: true,
          followUpNote: 'Kunjungi lagi minggu depan',
          visitorPersonIds: [deaconPerson.id],
          otherVisitors: 'Pdt. tamu dari GKI Kwitang',
        },
      });
      expect(created.status).toBe(201);
      visitId = created.json.visit.id;
      expect(created.json.visit.summary).toBe('Kondisi stabil, keluarga tabah. Berdoa bersama.');
      expect(created.json.visit.visitors.map((v: { firstName: string }) => v.firstName)).toEqual([
        'Diaken',
      ]);
      const list = await t.request('GET', `${base}/visits`, { token: viewer.token });
      expect(list.status).toBe(200);
      expect(list.json.items[0].id).toBe(visitId);
      expect(list.json.items[0].summary).toBeNull();
      const detail = await t.request('GET', `${base}/visits/${visitId}`, { token: viewer.token });
      expect(detail.json.visit.summary).toContain('Kondisi stabil');
      expect(detail.json.visit.canManage).toBe(false);
      const followUps = await t.request('GET', `${base}/visits?followUpNeeded=true`, {
        token: viewer.token,
      });
      expect(followUps.json.items).toHaveLength(1);
      const search = await t.request('GET', `${base}/visits?q=siloam`, { token: viewer.token });
      expect(search.json.items).toHaveLength(1);
      const summarySearch = await t.request('GET', `${base}/visits?q=tabah`, {
        token: viewer.token,
      });
      expect(summarySearch.json.items).toHaveLength(0);
    });

    it('enforces permissions and validation', async () => {
      for (const token of [viewer.token, s.member.token, treasurer.token]) {
        const denied = await t.request('POST', `${base}/visits`, {
          token,
          body: { personId: s.alice.id, visitDate: dayOffset(0) },
        });
        expect(denied.status).toBe(403);
      }
      const nobody = await t.request('POST', `${base}/visits`, {
        token: elder.token,
        body: { visitDate: dayOffset(0) },
      });
      expect(nobody.status).toBe(422);
      expect(nobody.json.error.issues[0].path).toBe('personId');
      const memberList = await t.request('GET', `${base}/visits`, { token: s.member.token });
      expect(memberList.json.items).toHaveLength(0);
      const memberDetail = await t.request('GET', `${base}/visits/${visitId}`, {
        token: s.member.token,
      });
      expect(memberDetail.status).toBe(404);
      const viewerEdit = await t.request('DELETE', `${base}/visits/${visitId}`, {
        token: viewer.token,
      });
      expect(viewerEdit.status).toBe(403);
    });

    it('lets caregivers record visits for their case, inheriting confidentiality', async () => {
      const created = await t.request('POST', `${base}/cases`, {
        token: pastor.token,
        body: {
          personId: s.bob.id,
          category: 'counseling',
          confidentiality: 'confidential',
          title: 'Pendampingan rahasia Bob',
          caregiverUserIds: [s.member.user.id],
        },
      });
      const caseId = created.json.case.id;
      const visit = await t.request('POST', `${base}/visits`, {
        token: s.member.token,
        body: { caseId, visitDate: dayOffset(0), summary: 'Sangat pribadi' },
      });
      expect(visit.status).toBe(201);
      expect(visit.json.visit.confidentiality).toBe('confidential');
      expect(visit.json.visit.person.firstName).toBe('Bob');
      const confidentialId = visit.json.visit.id;
      const elderList = await t.request('GET', `${base}/visits?limit=200`, { token: elder.token });
      expect(elderList.json.items.map((item: { id: string }) => item.id)).not.toContain(
        confidentialId,
      );
      const elderDetail = await t.request('GET', `${base}/visits/${confidentialId}`, {
        token: elder.token,
      });
      expect(elderDetail.status).toBe(404);
      const adminDetail = await t.request('GET', `${base}/visits/${confidentialId}`, {
        token: s.admin.token,
      });
      expect(adminDetail.status).toBe(404);
      const pastorDetail = await t.request('GET', `${base}/visits/${confidentialId}`, {
        token: pastor.token,
      });
      expect(pastorDetail.json.visit.summary).toBe('Sangat pribadi');
      const byCase = await t.request('GET', `${base}/visits?caseId=${caseId}`, {
        token: s.member.token,
      });
      expect(byCase.json.items).toHaveLength(1);
      // A visit cannot be moved off its confidential level by the caregiver.
      const lowered = await t.request('PATCH', `${base}/visits/${confidentialId}`, {
        token: s.member.token,
        body: { caseId: null, personId: s.bob.id, visitDate: dayOffset(0) },
      });
      expect(lowered.status).toBe(403);
      const audit = await careAudit(t, s, `&entityId=${confidentialId}`);
      expect(audit[0]?.summary).toBe('Recorded a confidential visit');
      expect(JSON.stringify(audit)).not.toContain('Sangat pribadi');
      // Elders cannot attach visits to a confidential case they cannot read.
      const elderAttach = await t.request('POST', `${base}/visits`, {
        token: elder.token,
        body: { caseId, visitDate: dayOffset(0) },
      });
      expect(elderAttach.status).toBe(404);
    });

    it('lets the visitor see visits they made', async () => {
      const visitorUser = await memberWithRole(t, s, 'Diaken Paulus', []);
      await t.request('PUT', `/api/churches/${s.church.id}/people/${deaconPerson.id}/user`, {
        token: s.owner.token,
        body: { userId: visitorUser.user.id },
      });
      const mine = await t.request('GET', `${base}/visits?mine=true`, { token: visitorUser.token });
      expect(mine.json.items.map((item: { id: string }) => item.id)).toEqual([visitId]);
    });

    it('updates and deletes, auditing without the summary', async () => {
      const updated = await t.request('PATCH', `${base}/visits/${visitId}`, {
        token: elder.token,
        body: {
          personId: s.alice.id,
          visitDate: dayOffset(-1),
          location: 'Rumah',
          summary: 'Sudah pulang ke rumah',
          followUpNeeded: false,
          visitorPersonIds: [],
        },
      });
      expect(updated.status).toBe(200);
      expect(updated.json.visit.followUpNote).toBeNull();
      expect(updated.json.visit.visitors).toHaveLength(0);
      const audit = await careAudit(t, s, `&entityId=${visitId}&action=care_visit.update`);
      expect(audit[0]?.after.summary).toBe('[redacted]');
      expect(audit[0]?.after.location).toBe('Rumah');
      const removed = await t.request('DELETE', `${base}/visits/${visitId}`, {
        token: elder.token,
      });
      expect(removed.status).toBe(200);
    });
  });

  describe('diakonia', () => {
    let aidId: string;

    it('records aid only with diakonia.manage', async () => {
      const created = await t.request('POST', `${base}/diakonia`, {
        token: pastor.token,
        body: {
          personId: s.alice.id,
          category: 'health',
          form: 'cash',
          amount: 1_500_000,
          givenAt: dayOffset(0),
          description: 'Biaya obat setelah operasi',
          financeReference: 'KK-2026-0142',
        },
      });
      expect(created.status).toBe(201);
      aidId = created.json.aid.id;
      expect(created.json.aid.amount).toBe(1_500_000);
      for (const token of [treasurer.token, elder.token, s.admin.token]) {
        // The administrator holds diakonia.manage through the base role.
        const response = await t.request('POST', `${base}/diakonia`, {
          token,
          body: {
            recipientName: 'Ibu Siti',
            category: 'food',
            form: 'goods',
            givenAt: dayOffset(0),
          },
        });
        expect(response.status).toBe(token === s.admin.token ? 201 : 403);
      }
    });

    it('lets viewers list with totals and keeps others out', async () => {
      const list = await t.request('GET', `${base}/diakonia`, { token: treasurer.token });
      expect(list.status).toBe(200);
      expect(list.json.items).toHaveLength(2);
      expect(list.json.summary).toEqual({ count: 2, amount: 1_500_000, recipients: 2 });
      for (const token of [elder.token, viewer.token, s.member.token]) {
        expect((await t.request('GET', `${base}/diakonia`, { token })).status).toBe(403);
        expect((await t.request('GET', `${base}/diakonia/${aidId}`, { token })).status).toBe(403);
      }
      const filtered = await t.request('GET', `${base}/diakonia?category=health&q=alice`, {
        token: treasurer.token,
      });
      expect(filtered.json.items).toHaveLength(1);
    });

    it('validates amounts and recipients', async () => {
      for (const body of [
        { category: 'food', givenAt: dayOffset(0) },
        { recipientName: 'A', category: 'food', givenAt: dayOffset(0), amount: -5 },
        { recipientName: 'A', category: 'food', givenAt: dayOffset(0), amount: 10.5 },
        { recipientName: 'A', category: 'food', givenAt: 'kemarin' },
      ]) {
        const response = await t.request('POST', `${base}/diakonia`, { token: pastor.token, body });
        expect(response.status).toBe(422);
      }
    });

    it('voids instead of deleting, once, and audits it', async () => {
      const short = await t.request('POST', `${base}/diakonia/${aidId}/void`, {
        token: pastor.token,
        body: { reason: 'x' },
      });
      expect(short.status).toBe(422);
      const voided = await t.request('POST', `${base}/diakonia/${aidId}/void`, {
        token: pastor.token,
        body: { reason: 'Tercatat dua kali' },
      });
      expect(voided.status).toBe(200);
      expect(voided.json.aid.voidedAt).not.toBeNull();
      const again = await t.request('POST', `${base}/diakonia/${aidId}/void`, {
        token: pastor.token,
        body: { reason: 'Tercatat dua kali' },
      });
      expect(again.status).toBe(409);
      const edit = await t.request('PATCH', `${base}/diakonia/${aidId}`, {
        token: pastor.token,
        body: { personId: s.alice.id, category: 'health', givenAt: dayOffset(0) },
      });
      expect(edit.status).toBe(409);
      const list = await t.request('GET', `${base}/diakonia`, { token: treasurer.token });
      expect(list.json.summary.amount).toBe(0);
      const withVoided = await t.request('GET', `${base}/diakonia?includeVoided=true`, {
        token: treasurer.token,
      });
      expect(withVoided.json.items).toHaveLength(2);
      const audit = await careAudit(t, s, `&entityId=${aidId}`);
      expect(audit.map((entry) => entry.action)).toEqual([
        'diakonia_aid.void',
        'diakonia_aid.create',
      ]);
      expect(audit[1]?.after.description).toBe('[redacted]');
    });

    it('answers 404 for another church and for unreadable cases', async () => {
      const other = await otherChurch(t);
      const foreign = await t.request('POST', `${other.base}/diakonia`, {
        token: other.owner.token,
        body: { personId: other.person.id, category: 'food', givenAt: dayOffset(0) },
      });
      const foreignId = foreign.json.aid.id;
      expect(
        (await t.request('GET', `${base}/diakonia/${foreignId}`, { token: s.owner.token })).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', `${base}/diakonia/${foreignId}/void`, {
            token: s.owner.token,
            body: { reason: 'Bukan milik kita' },
          })
        ).status,
      ).toBe(404);
      const crossPerson = await t.request('POST', `${base}/diakonia`, {
        token: s.owner.token,
        body: { personId: other.person.id, category: 'food', givenAt: dayOffset(0) },
      });
      expect(crossPerson.status).toBe(404);
      const confidential = await t.request('POST', `${base}/cases`, {
        token: pastor.token,
        body: { category: 'financial_aid', confidentiality: 'confidential', title: 'Utang' },
      });
      const adminLink = await t.request('POST', `${base}/diakonia`, {
        token: s.admin.token,
        body: {
          recipientName: 'Keluarga X',
          caseId: confidential.json.case.id,
          category: 'other',
          givenAt: dayOffset(0),
        },
      });
      expect(adminLink.status).toBe(404);
    });
  });

  describe('overview and team', () => {
    it('summarises only what the caller may see', async () => {
      await t.request('POST', `${base}/cases`, {
        token: elder.token,
        body: {
          category: 'hospital',
          priority: 'urgent',
          title: 'Kecelakaan',
          nextActionDate: dayOffset(2),
        },
      });
      const owner = await t.request('GET', `${base}/overview`, { token: s.owner.token });
      expect(owner.status).toBe(200);
      expect(owner.json.cases.urgent).toBeGreaterThanOrEqual(1);
      expect(
        owner.json.upcoming.some((item: { title: string }) => item.title === 'Kecelakaan'),
      ).toBe(true);
      expect(owner.json.visits).not.toBeNull();
      expect(owner.json.followUps).not.toBeNull();
      expect(owner.json.diakonia.thisMonthCount).toBeGreaterThanOrEqual(1);
      expect(owner.json.prayer.pending).toBe(0);

      const member = await t.request('GET', `${base}/overview`, { token: s.member.token });
      expect(member.json.visits).toBeNull();
      expect(member.json.followUps).toBeNull();
      expect(member.json.diakonia).toBeNull();
      expect(member.json.prayer.pending).toBeNull();
      // The member is a caregiver of the confidential case only.
      expect(member.json.cases.active).toBe(1);
      const elderView = await t.request('GET', `${base}/overview`, { token: elder.token });
      expect(
        elderView.json.upcoming.every(
          (item: { confidentiality: string }) => item.confidentiality === 'normal',
        ),
      ).toBe(true);
    });

    it('lists the care team, and every member for care managers', async () => {
      const team = await t.request('GET', `${base}/team`, { token: s.member.token });
      expect(team.status).toBe(200);
      const names = team.json.items.map((item: { name: string }) => item.name);
      expect(names).toEqual(expect.arrayContaining(['Pdt. Agus', 'Pnt. Rina', 'Pnt. Tono']));
      expect(names).not.toContain('Member');
      const all = await t.request('GET', `${base}/team?scope=all`, { token: s.member.token });
      expect(all.status).toBe(403);
      const everyone = await t.request('GET', `${base}/team?scope=all`, { token: elder.token });
      expect(everyone.json.items.map((item: { name: string }) => item.name)).toContain('Member');
      const memberRow = everyone.json.items.find(
        (item: { name: string }) => item.name === 'Member',
      );
      expect(memberRow.personId).toBe(s.memberPerson.id);
      expect(memberRow.isCareTeam).toBe(false);
    });

    it('looks up households for the care team only', async () => {
      expect((await t.request('GET', `${base}/households`, { token: viewer.token })).status).toBe(
        200,
      );
      expect((await t.request('GET', `${base}/households`, { token: s.member.token })).status).toBe(
        403,
      );
    });
  });
});
