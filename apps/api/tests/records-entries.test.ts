import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from './helpers';
import { baptism, createRecord, seedRecords, type RecordsSeed } from './records-fixtures';

describe('church registry entries', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let r: RecordsSeed;

  const person = (firstName: string, membershipStatus = 'visitor') =>
    t.createPerson(r.s.owner.token, r.s.church.id, {
      firstName,
      lastName: 'Test',
      membershipStatus,
    });
  const profile = async (personId: string) => {
    const response = await t.request('GET', `${r.church}/people/${personId}`, {
      token: r.s.owner.token,
    });
    expect(response.status).toBe(200);
    return response.json as {
      person: { membershipStatus: string; weddingDate?: string | null };
      privateDetails: { baptismDate: string | null; maritalStatus: string } | null;
    };
  };
  const auditFor = async (entityId: string) => {
    const response = await t.request(
      'GET',
      `${r.church}/audit-logs?module=records&entityId=${entityId}`,
      { token: r.s.owner.token },
    );
    expect(response.status).toBe(200);
    return response.json.items as { action: string; before: any; after: any; summary: string }[];
  };

  beforeAll(async () => {
    r = await seedRecords(t);
  });

  describe('numbering', () => {
    it('numbers records per type and year from the default patterns', async () => {
      const first = await createRecord(t, r, baptism((await person('Anak1')).id));
      const second = await createRecord(t, r, baptism((await person('Anak2')).id));
      const older = await createRecord(
        t,
        r,
        baptism((await person('Anak3')).id, { date: '2025-12-25' }),
      );
      const sidi = await createRecord(t, r, {
        type: 'sidi',
        date: '2026-04-05',
        people: [{ personId: (await person('Remaja')).id, role: 'subject' }],
      });
      expect(first.record.number).toBe('B/2026/001');
      expect(second.record.number).toBe('B/2026/002');
      expect(older.record.number).toBe('B/2025/001');
      expect(sidi.record.number).toBe('S/2026/001');
    });

    it('uses the church pattern and keeps numbers of voided records', async () => {
      const settings = await t.request('PUT', `${r.base}/settings`, {
        token: r.secretary.token,
        body: {
          numberPatterns: { death: 'KD-{YY}.{NNNN}' },
          signatoryName: 'Pdt. Yohanes Nainggolan',
          signatoryTitle: 'Ketua Majelis Jemaat',
          certificateFooter: 'Diberikan dengan sukacita',
        },
      });
      expect(settings.status).toBe(200);
      expect(settings.json.nextNumbers.death).toMatch(/^KD-\d\d\.0001$/);
      const first = await createRecord(t, r, {
        type: 'death',
        date: '2026-06-01',
        people: [{ personId: (await person('Almarhum1', 'member')).id, role: 'subject' }],
      });
      expect(first.record.number).toBe('KD-26.0001');
      const voided = await t.request('POST', `${r.entries}/${first.record.id}/void`, {
        token: r.s.owner.token,
        body: { reason: 'Dicatat dobel' },
      });
      expect(voided.status).toBe(200);
      const next = await createRecord(t, r, {
        type: 'death',
        date: '2026-06-02',
        people: [{ name: 'Bukan Jemaat', role: 'subject', personId: null }],
      });
      expect(next.record.number).toBe('KD-26.0002');

      const get = await t.request('GET', `${r.base}/settings`, { token: r.viewer.token });
      expect(get.json.settings.signatoryName).toBe('Pdt. Yohanes Nainggolan');
      const audit = await t.request(
        'GET',
        `${r.church}/audit-logs?action=records_settings.update`,
        { token: r.s.owner.token },
      );
      expect(audit.json.items).toHaveLength(1);
    });

    it('refuses patterns without a sequence or year and patterns shared by two types', async () => {
      const put = (numberPatterns: Record<string, string>) =>
        t.request('PUT', `${r.base}/settings`, {
          token: r.s.owner.token,
          body: { numberPatterns },
        });
      expect((await put({ baptism: 'B/{YYYY}' })).status).toBe(422);
      expect((await put({ baptism: 'B/{NNN}' })).status).toBe(422);
      const shared = await put({ sidi: 'B/{YYYY}/{NNN}' });
      expect(shared.status).toBe(422);
      expect(shared.json.error.issues[0].path).toBe('numberPatterns.sidi');
      expect(
        (
          await t.request('PUT', `${r.base}/settings`, {
            token: r.viewer.token,
            body: { numberPatterns: {} },
          })
        ).status,
      ).toBe(403);
    });
  });

  describe('validation', () => {
    const post = (body: Record<string, unknown>) =>
      t.request('POST', r.entries, { token: r.s.owner.token, body });

    it('checks the people, subtype and dates of each kind of record', async () => {
      const marriageOne = await post({
        type: 'marriage',
        date: '2026-05-02',
        people: [{ personId: r.budi.id, role: 'spouse' }],
      });
      expect(marriageOne.status).toBe(422);
      expect(marriageOne.json.error.code).toBe('VALIDATION');
      expect((await post({ ...baptism(r.budi.id), subtype: null })).status).toBe(422);
      expect(
        (
          await post({
            type: 'baptism',
            subtype: 'adult',
            date: '2026-05-02',
            people: [
              { personId: r.budi.id, role: 'subject' },
              { personId: r.sari.id, role: 'spouse' },
            ],
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await post({
            type: 'marriage',
            date: '2026-05-02',
            people: [
              { personId: r.budi.id, role: 'spouse' },
              { personId: r.budi.id, role: 'spouse' },
            ],
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await post({
            type: 'custom',
            date: '2026-05-02',
            people: [{ name: 'A', role: 'subject' }],
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await post({
            type: 'death',
            date: '2026-05-02',
            details: { funeralDate: '2026-05-01' },
            people: [{ name: 'A', role: 'subject' }],
          })
        ).status,
      ).toBe(422);
      expect(
        (await post({ ...baptism(r.budi.id), documentUrl: 'javascript:alert(1)' })).status,
      ).toBe(422);
      expect((await post({ ...baptism(r.budi.id), date: '2026-13-40' })).status).toBe(422);
      expect(
        (await post({ type: 'sidi', date: '2026-05-02', people: [{ role: 'subject' }] })).status,
      ).toBe(422);
    });

    it('answers 404 for a person or officiant that does not exist', async () => {
      const missing = crypto.randomUUID();
      expect((await post(baptism(missing))).status).toBe(404);
      expect((await post({ ...baptism(r.budi.id), officiantPersonId: missing })).status).toBe(404);
    });
  });

  describe('side effects', () => {
    it('previews and applies a death only when confirmed', async () => {
      const opa = await person('Opa', 'member');
      const body = {
        type: 'death',
        date: '2026-07-10',
        place: 'RS Cikini',
        details: {
          funeralDate: '2026-07-12',
          burialPlace: 'TPU Tanah Kusir',
          causeOfDeath: 'Sakit',
        },
        people: [{ personId: opa.id, role: 'subject' }],
      };
      const preview = await t.request('POST', `${r.entries}/preview`, {
        token: r.secretary.token,
        body: { record: body },
      });
      expect(preview.status).toBe(200);
      expect(preview.json.number).toMatch(/^KD-26\./);
      expect(preview.json.effects).toEqual([
        {
          personId: opa.id,
          name: 'Opa Test',
          kind: 'membership_status',
          from: 'member',
          to: 'inactive',
        },
      ]);
      expect(preview.json.duplicate).toBeNull();

      const created = await createRecord(t, r, { ...body, applyStatusEffect: false });
      expect(created.effects).toEqual([]);
      expect((await profile(opa.id)).person.membershipStatus).toBe('member');

      // Void and record again, this time applying the confirmed side effect.
      await t.request('POST', `${r.entries}/${created.record.id}/void`, {
        token: r.s.owner.token,
        body: { reason: 'Diulang' },
      });
      const applied = await createRecord(t, r, { ...body, applyStatusEffect: true });
      expect(applied.effects).toHaveLength(1);
      expect((await profile(opa.id)).person.membershipStatus).toBe('inactive');

      const audit = await auditFor(applied.record.id);
      expect(audit[0]!.action).toBe('registry_record.create');
      expect(audit[0]!.after.effects[0].to).toBe('inactive');
      // Notes and the cause of death never reach the audit log.
      expect(audit[0]!.after.details.causeOfDeath).toBe('[redacted]');
    });

    it('makes a transfer out inactive and upgrades a transfer in', async () => {
      const leaving = await person('Pindah', 'member');
      await createRecord(t, r, {
        type: 'transfer_out',
        date: '2026-02-01',
        details: { otherChurchName: 'HKBP Menteng', letterNumber: '012/AK/2026' },
        people: [{ personId: leaving.id, role: 'subject' }],
        applyStatusEffect: true,
      });
      expect((await profile(leaving.id)).person.membershipStatus).toBe('inactive');

      const arriving = await person('Datang', 'visitor');
      const created = await createRecord(t, r, {
        type: 'transfer_in',
        date: '2026-02-08',
        details: { otherChurchName: 'GPIB Immanuel', otherChurchAddress: 'Jakarta Pusat' },
        people: [{ personId: arriving.id, role: 'subject' }],
        applyStatusEffect: true,
      });
      expect(created.record.number).toBe('AM/2026/001');
      expect((await profile(arriving.id)).person.membershipStatus).toBe('member');
    });

    it('sets the baptism date and status of an infant, and wedding details of a couple', async () => {
      const child = await person('Bayi', 'visitor');
      const created = await createRecord(t, r, {
        ...baptism(child.id, { date: '2026-08-16' }),
        people: [
          { personId: child.id, role: 'subject' },
          { personId: r.budi.id, role: 'father' },
          { name: 'Maria', role: 'mother' },
          { name: 'Om Paulus', role: 'godparent' },
        ],
        officiantPersonId: r.yohanes.id,
        applyStatusEffect: true,
      });
      expect(created.effects.map((effect) => effect.kind).sort()).toEqual([
        'baptism_date',
        'membership_status',
      ]);
      const after = await profile(child.id);
      expect(after.person.membershipStatus).toBe('regular');
      expect(after.privateDetails?.baptismDate).toBe('2026-08-16');
      const detail = await t.request('GET', `${r.entries}/${created.record.id}`, {
        token: r.viewer.token,
      });
      expect(detail.json.record.officiantName).toBe('Pdt. Yohanes Nainggolan');
      expect(detail.json.record.people.map((p: { name: string }) => p.name)).toEqual([
        'Bayi Test',
        'Budi Santoso',
        'Maria',
        'Om Paulus',
      ]);

      const groom = await person('Andreas', 'member');
      const bride = await person('Ruth', 'member');
      const marriage = await createRecord(t, r, {
        type: 'marriage',
        date: '2026-09-19',
        place: 'GKI Kebayoran Baru',
        details: { civilRegistrationNumber: '3174-KW-19092026-0001' },
        people: [
          { personId: groom.id, role: 'spouse' },
          { personId: bride.id, role: 'spouse' },
          { name: 'Saksi Satu', role: 'witness' },
          { name: 'Saksi Dua', role: 'witness' },
        ],
        applyStatusEffect: true,
      });
      expect(marriage.record.number).toBe('N/2026/001');
      expect(marriage.effects).toHaveLength(4);
      const groomProfile = await profile(groom.id);
      expect(groomProfile.privateDetails?.maritalStatus).toBe('married');
    });
  });

  describe('duplicates, corrections and voiding', () => {
    it('refuses a second baptism of the same person until the first is voided', async () => {
      const child = await person('Dobel');
      const first = await createRecord(t, r, baptism(child.id));
      const again = await t.request('POST', r.entries, {
        token: r.s.owner.token,
        body: baptism(child.id),
      });
      expect(again.status).toBe(409);
      expect(again.json.error.message).toContain(first.record.number);
      const preview = await t.request('POST', `${r.entries}/preview`, {
        token: r.s.owner.token,
        body: { record: baptism(child.id) },
      });
      expect(preview.json.duplicate.number).toBe(first.record.number);
      await t.request('POST', `${r.entries}/${first.record.id}/void`, {
        token: r.s.owner.token,
        body: { reason: 'Salah data' },
      });
      await createRecord(t, r, baptism(child.id));
    });

    it('corrects a record, keeps its number and history, and audits the change', async () => {
      const child = await person('Koreksi');
      const created = await createRecord(t, r, baptism(child.id, { notes: 'Catatan rahasia' }));
      const url = `${r.entries}/${created.record.id}`;
      const record = baptism(child.id, {
        date: '2027-01-10',
        place: 'GKI Gunung Sahari',
        notes: 'Catatan baru',
        details: { birthPlace: 'Bandung' },
      });
      expect(
        (await t.request('PUT', url, { token: r.s.owner.token, body: { record } })).status,
      ).toBe(422);
      expect(
        (
          await t.request('PUT', url, {
            token: r.s.owner.token,
            body: { record: { ...record, type: 'sidi', subtype: null }, correctionNote: 'Ganti' },
          })
        ).status,
      ).toBe(422);
      const corrected = await t.request('PUT', url, {
        token: r.secretary.token,
        body: { record, correctionNote: 'Tanggal salah ketik' },
      });
      expect(corrected.status).toBe(200);
      expect(corrected.json.record.number).toBe(created.record.number);
      expect(corrected.json.record.date).toBe('2027-01-10');
      expect(corrected.json.record.year).toBe(2026);

      const detail = await t.request('GET', url, { token: r.viewer.token });
      expect(detail.json.history.map((entry: { action: string }) => entry.action)).toEqual([
        'create',
        'correct',
      ]);
      const correction = detail.json.history[1];
      expect(correction.note).toBe('Tanggal salah ketik');
      expect(correction.actorName).toBe('Sekretaris');
      expect(correction.fields).toEqual(
        expect.arrayContaining(['date', 'place', 'notes', 'details.birthPlace']),
      );

      const audit = await auditFor(created.record.id);
      const entry = audit.find((item) => item.action === 'registry_record.correct')!;
      expect(entry.before.date).toBe('2026-03-08');
      expect(entry.after.date).toBe('2027-01-10');
      expect(entry.before.notes).toBe('[redacted]');
      expect(entry.after.notes).toBe('[redacted]');
    });

    it('voids with a reason, once, and freezes the record', async () => {
      const created = await createRecord(t, r, baptism((await person('Batal')).id));
      const url = `${r.entries}/${created.record.id}`;
      expect(
        (await t.request('POST', `${url}/void`, { token: r.s.owner.token, body: { reason: '' } }))
          .status,
      ).toBe(422);
      expect(
        (
          await t.request('POST', `${url}/void`, {
            token: r.viewer.token,
            body: { reason: 'Tidak boleh' },
          })
        ).status,
      ).toBe(403);
      const voided = await t.request('POST', `${url}/void`, {
        token: r.secretary.token,
        body: { reason: 'Data ganda' },
      });
      expect(voided.status).toBe(200);
      expect(voided.json.record.status).toBe('voided');
      expect(voided.json.record.voidReason).toBe('Data ganda');
      expect(
        (
          await t.request('POST', `${url}/void`, {
            token: r.secretary.token,
            body: { reason: 'Lagi' },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await t.request('PUT', url, {
            token: r.s.owner.token,
            body: { record: baptism(created.record.people[0]!.personId!), correctionNote: 'x y z' },
          })
        ).status,
      ).toBe(409);
      const history = (await t.request('GET', url, { token: r.s.owner.token })).json.history;
      expect(history.at(-1).action).toBe('void');
      expect(history.at(-1).note).toBe('Data ganda');
      // There is no delete.
      expect((await t.request('DELETE', url, { token: r.s.owner.token })).status).toBe(404);
    });
  });

  describe('register book and overview', () => {
    it('filters by type, year, status, person and text, sorts and paginates', async () => {
      const list = async (query: string) => {
        const response = await t.request('GET', `${r.entries}?${query}`, { token: r.viewer.token });
        expect(response.status).toBe(200);
        return response.json as { items: { number: string; type: string }[]; total: number };
      };
      const baptisms2026 = await list('type=baptism&year=2026&status=active&sort=number');
      expect(baptisms2026.items.every((item) => item.type === 'baptism')).toBe(true);
      expect(baptisms2026.items.every((item) => item.number.startsWith('B/2026/'))).toBe(true);
      const numbers = baptisms2026.items.map((item) => item.number);
      expect(numbers).toEqual([...numbers].sort().reverse());

      expect((await list('type=baptism&year=2025')).items.map((item) => item.number)).toEqual([
        'B/2025/001',
      ]);
      expect((await list('q=Simanjuntak')).total).toBe(0);
      expect((await list('q=Bayi')).items.map((item) => item.type)).toEqual(['baptism']);
      expect((await list('q=AM/2026')).items).toHaveLength(1);
      const budi = await list(`personId=${r.budi.id}`);
      expect(budi.items.map((item) => item.type)).toEqual(['baptism']);
      expect((await list('status=voided')).total).toBeGreaterThanOrEqual(3);

      const page1 = await list('limit=2&page=1&sort=date_asc');
      const page2 = await list('limit=2&page=2&sort=date_asc');
      expect(page1.items).toHaveLength(2);
      expect(page1.items[0]!.number).toBe('B/2025/001');
      expect(page2.items[0]!.number).not.toBe(page1.items[0]!.number);
      expect(page1.total).toBe(page2.total);
      expect(
        (await t.request('GET', `${r.entries}?type=nope`, { token: r.viewer.token })).status,
      ).toBe(422);
    });

    it('summarises the register per type', async () => {
      const response = await t.request('GET', `${r.base}/overview`, { token: r.viewer.token });
      expect(response.status).toBe(200);
      const overview = response.json;
      expect(overview.years).toEqual(expect.arrayContaining([2025, overview.year]));
      const baptisms = overview.types.find((item: { type: string }) => item.type === 'baptism');
      expect(baptisms.total).toBeGreaterThanOrEqual(5);
      expect(overview.voided).toBeGreaterThanOrEqual(3);
      expect(overview.recent.length).toBeGreaterThan(0);
      expect(overview.types).toHaveLength(8);
    });
  });

  describe('notifications', () => {
    it('tells the people a record is about, but not the actor or the deceased', async () => {
      const created = await createRecord(
        t,
        r,
        {
          type: 'sidi',
          date: '2026-04-05',
          people: [{ personId: r.s.memberPerson.id, role: 'subject' }],
        },
        r.secretary.token,
      );
      const inbox = await t.request('GET', '/api/notifications', { token: r.s.member.token });
      expect(inbox.status).toBe(200);
      const item = inbox.json.items.find(
        (notification: { entityId: string }) => notification.entityId === created.record.id,
      );
      expect(item.type).toBe('record.added');
      expect(item.link).toBe(`/c/${r.s.church.id}/records/${created.record.id}`);
      const actorInbox = await t.request('GET', '/api/notifications', {
        token: r.secretary.token,
      });
      expect(
        actorInbox.json.items.some(
          (notification: { entityId: string }) => notification.entityId === created.record.id,
        ),
      ).toBe(false);

      // A correction tells them again.
      const corrected = await t.request('PUT', `${r.entries}/${created.record.id}`, {
        token: r.s.owner.token,
        body: {
          record: {
            type: 'sidi',
            date: '2026-04-12',
            people: [{ personId: r.s.memberPerson.id, role: 'subject' }],
          },
          correctionNote: 'Tanggal sidi diperbaiki',
        },
      });
      expect(corrected.status).toBe(200);
      const again = await t.request('GET', '/api/notifications', { token: r.s.member.token });
      expect(
        again.json.items.filter(
          (notification: { entityId: string }) => notification.entityId === created.record.id,
        ),
      ).toHaveLength(2);
    });
  });
});
