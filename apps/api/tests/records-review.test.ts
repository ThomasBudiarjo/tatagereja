import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from './helpers';
import { baptism, createRecord, seedRecords, type RecordsSeed } from './records-fixtures';

describe('church registry settings, own records and voiding side effects', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let r: RecordsSeed;

  const person = (firstName: string, membershipStatus = 'visitor') =>
    t.createPerson(r.s.owner.token, r.s.church.id, {
      firstName,
      lastName: 'Uji',
      membershipStatus,
    });
  const profile = async (personId: string) => {
    const response = await t.request('GET', `${r.church}/people/${personId}`, {
      token: r.s.owner.token,
    });
    expect(response.status).toBe(200);
    return response.json as {
      person: { membershipStatus: string };
      privateDetails: { baptismDate: string | null } | null;
    };
  };
  const putSettings = (numberPatterns: Record<string, string>, token = r.s.owner.token) =>
    t.request('PUT', `${r.base}/settings`, { token, body: { numberPatterns } });

  beforeAll(async () => {
    r = await seedRecords(t);
  });

  describe('settings', () => {
    it('lets a church administrator without registry permissions read and save the settings', async () => {
      const office = await t.register('Kantor Gereja');
      await t.join(office.token, r.s.invitation.token);
      const members = await t.request('GET', `${r.church}/members`, { token: r.s.owner.token });
      const membershipId = (members.json.items as { id: string; userId: string }[]).find(
        (item) => item.userId === office.user.id,
      )!.id;
      const role = await t.request('POST', `${r.church}/roles`, {
        token: r.s.owner.token,
        body: { name: 'Pengaturan', description: null, permissions: ['settings.manage'] },
      });
      expect(role.status).toBe(201);
      const assigned = await t.request('POST', `${r.church}/members/${membershipId}/roles`, {
        token: r.s.owner.token,
        body: { roleId: role.json.role.id },
      });
      expect(assigned.status).toBe(200);

      const read = await t.request('GET', `${r.base}/settings`, { token: office.token });
      expect(read.status).toBe(200);
      expect((await putSettings({}, office.token)).status).toBe(200);
      // Settings access does not open the register itself.
      expect((await t.request('GET', r.entries, { token: office.token })).status).toBe(403);
    });

    it('accepts one {TYPE} pattern for every kind and refuses patterns that collide', async () => {
      const shared = '{TYPE}/{YYYY}/{NNN}';
      const all = await putSettings({
        baptism: shared,
        sidi: shared,
        marriage: shared,
        child_dedication: shared,
        transfer_in: shared,
        transfer_out: shared,
        death: shared,
        custom: shared,
      });
      expect(all.status).toBe(200);
      expect(all.json.nextNumbers.baptism).toBe('B/2026/001');
      expect(all.json.nextNumbers.transfer_out).toBe('AK/2026/001');

      // "B/2026/100" would be handed out by both books.
      const padded = await putSettings({ sidi: 'B/{YYYY}/{N}' });
      expect(padded.status).toBe(422);
      expect(padded.json.error.issues[0].path).toBe('numberPatterns.sidi');
      // Spelling out the type code of another book collides too.
      const spelled = await putSettings({ baptism: '{TYPE}/{YYYY}/{NNN}', sidi: 'B/{YYYY}/{NNN}' });
      expect(spelled.status).toBe(422);
      expect((await putSettings({})).status).toBe(200);
    });
  });

  describe('own records', () => {
    it('hides secretariat notes and private details from the person and voided records too', async () => {
      const created = await createRecord(t, r, {
        type: 'baptism',
        subtype: 'adult',
        date: '2026-02-01',
        notes: 'Catatan internal sekretariat',
        people: [{ personId: r.s.memberPerson.id, role: 'subject' }],
      });
      const url = `${r.entries}/${created.record.id}`;
      const own = await t.request('GET', url, { token: r.s.member.token });
      expect(own.status).toBe(200);
      expect(own.json.record.notes).toBeNull();
      const asViewer = await t.request('GET', url, { token: r.viewer.token });
      expect(asViewer.json.record.notes).toBe('Catatan internal sekretariat');

      const voided = await t.request('POST', `${url}/void`, {
        token: r.s.owner.token,
        body: { reason: 'Salah orang' },
      });
      expect(voided.status).toBe(200);
      expect((await t.request('GET', url, { token: r.s.member.token })).status).toBe(404);
      expect((await t.request('GET', url, { token: r.viewer.token })).status).toBe(200);
    });

    it('never shows the cause of death to someone opening the record as their own', async () => {
      const created = await createRecord(t, r, {
        type: 'death',
        date: '2026-05-01',
        details: { causeOfDeath: 'Sakit jantung', burialPlace: 'TPU Jeruk Purut' },
        people: [{ personId: r.s.memberPerson.id, role: 'subject' }],
      });
      const own = await t.request('GET', `${r.entries}/${created.record.id}`, {
        token: r.s.member.token,
      });
      expect(own.status).toBe(200);
      expect(own.json.record.details.causeOfDeath).toBeNull();
      expect(own.json.record.details.burialPlace).toBe('TPU Jeruk Purut');
      const asViewer = await t.request('GET', `${r.entries}/${created.record.id}`, {
        token: r.viewer.token,
      });
      expect(asViewer.json.record.details.causeOfDeath).toBe('Sakit jantung');
      await t.request('POST', `${r.entries}/${created.record.id}/void`, {
        token: r.s.owner.token,
        body: { reason: 'Contoh saja' },
      });
    });
  });

  describe('voiding', () => {
    it('offers to undo the profile changes a record made and undoes them when asked', async () => {
      const deceased = await person('Almarhum', 'member');
      const created = await createRecord(t, r, {
        type: 'death',
        date: '2026-07-01',
        people: [{ personId: deceased.id, role: 'subject' }],
        applyStatusEffect: true,
      });
      expect((await profile(deceased.id)).person.membershipStatus).toBe('inactive');
      const url = `${r.entries}/${created.record.id}`;

      const detail = await t.request('GET', url, { token: r.secretary.token });
      expect(detail.json.revertibleEffects).toEqual([
        {
          personId: deceased.id,
          name: 'Almarhum Uji',
          kind: 'membership_status',
          from: 'inactive',
          to: 'member',
        },
      ]);
      // Viewers do not manage, so they get nothing to undo.
      const forViewer = await t.request('GET', url, { token: r.viewer.token });
      expect(forViewer.json.revertibleEffects).toEqual([]);

      const voided = await t.request('POST', `${url}/void`, {
        token: r.secretary.token,
        body: { reason: 'Salah orang', revertEffects: true },
      });
      expect(voided.status).toBe(200);
      expect(voided.json.effects).toHaveLength(1);
      expect((await profile(deceased.id)).person.membershipStatus).toBe('member');
      const history = (await t.request('GET', url, { token: r.s.owner.token })).json.history;
      expect(history.at(-1).action).toBe('void');
      expect(history.at(-1).effects[0].to).toBe('member');
      expect(
        (await t.request('GET', url, { token: r.s.owner.token })).json.revertibleEffects,
      ).toEqual([]);
    });

    it('keeps the profile when not asked, and skips values someone changed since', async () => {
      const child = await person('Bayi');
      const created = await createRecord(
        t,
        r,
        baptism(child.id, { date: '2026-08-02', applyStatusEffect: true }),
      );
      const after = await profile(child.id);
      expect(after.person.membershipStatus).toBe('regular');
      expect(after.privateDetails?.baptismDate).toBe('2026-08-02');
      // The office promotes the child by hand afterwards.
      const patched = await t.request('PATCH', `${r.church}/people/${child.id}`, {
        token: r.s.owner.token,
        body: { firstName: 'Bayi', lastName: 'Uji', membershipStatus: 'member' },
      });
      expect(patched.status).toBe(200);
      const url = `${r.entries}/${created.record.id}`;
      const detail = await t.request('GET', url, { token: r.s.owner.token });
      expect(
        detail.json.revertibleEffects.map((effect: { kind: string; to: string | null }) => [
          effect.kind,
          effect.to,
        ]),
      ).toEqual([['baptism_date', null]]);

      const kept = await t.request('POST', `${url}/void`, {
        token: r.s.owner.token,
        body: { reason: 'Data ganda' },
      });
      expect(kept.status).toBe(200);
      expect(kept.json.effects).toEqual([]);
      const unchanged = await profile(child.id);
      expect(unchanged.person.membershipStatus).toBe('member');
      expect(unchanged.privateDetails?.baptismDate).toBe('2026-08-02');
    });
  });
});
