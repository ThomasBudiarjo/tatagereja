import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { checkIn, seedCheckin, type CheckinSeed } from './checkin-fixtures';
import { createTestApp } from './helpers';

describe('kids check-in for guardians, the kiosk and children', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CheckinSeed;

  beforeAll(async () => {
    c = await seedCheckin(t);
  });

  const auditEntries = async (action: string) =>
    (
      await t.request('GET', `${c.church}/audit-logs?module=checkin&action=${action}&limit=200`, {
        token: c.s.owner.token,
      })
    ).json.items as { action: string; summary: string; before: any; after: any }[];

  describe('guardian phone', () => {
    it("shows the guardian's own young children and the open session", async () => {
      const me = await t.request('GET', `${c.base}/me`, { token: c.guardian.token });
      expect(me.status).toBe(200);
      expect(me.json.isGuardian).toBe(true);
      expect(me.json.allowSelfCheckIn).toBe(true);
      expect(me.json.household.name).toBe('Keluarga Simanjuntak');
      expect(me.json.household.phoneLast4).toBe('7788');
      // Daniel is an adult: not offered for check-in.
      expect(me.json.household.children.map((child: any) => child.firstName).sort()).toEqual([
        'Maria',
        'Yosua',
      ]);
      expect(me.json.household.guardians.map((g: any) => g.firstName).sort()).toEqual([
        'Budi',
        'Sari',
      ]);
      expect(me.json.openSessions.map((session: any) => session.id)).toContain(c.session.id);
      expect(me.json.current).toEqual([]);

      // A member without a household sees no family, and nothing else of the church.
      const member = await t.request('GET', `${c.base}/me`, { token: c.s.member.token });
      expect(member.status).toBe(200);
      expect(member.json.household).toBeNull();
      expect(member.json.isGuardian).toBe(false);
      expect(member.json.current).toEqual([]);
    });

    it('checks their own children in and shows them as in class with the code', async () => {
      const [maria] = await checkIn(
        t,
        c,
        { children: [{ personId: c.maria.id }], method: 'self' },
        c.guardian.token,
      );
      expect(maria!.className).toBe('Balita');
      expect(maria!.securityCode).toMatch(/^[A-Z2-9]{4}$/);

      const me = await t.request('GET', `${c.base}/me`, { token: c.guardian.token });
      expect(me.json.current).toHaveLength(1);
      expect(me.json.current[0].child.id).toBe(c.maria.id);
      expect(me.json.current[0].method).toBe('self');
      expect(me.json.current[0].guardian.id).toBe(c.sari.id);
      expect(me.json.current[0].securityCode).toBe(maria!.securityCode);
      const child = me.json.household.children.find((item: any) => item.id === c.maria.id);
      expect(child.currentCheckinId).toBe(maria!.id);

      // Their own labels and check-in detail are theirs to see.
      const labels = await t.request('POST', `${c.base}/checkins/labels`, {
        token: c.guardian.token,
        body: { ids: [maria!.id] },
      });
      expect(labels.status).toBe(200);
      expect(labels.json.items[0].securityCode).toBe(maria!.securityCode);
      expect(labels.json.items[0].sessionName).toBe(c.session.name);
      const detail = await t.request('GET', `${c.base}/checkins/${maria!.id}`, {
        token: c.guardian.token,
      });
      expect(detail.status).toBe(200);
      expect(detail.json.checkin.securityCode).toBe(maria!.securityCode);
      expect(detail.json.canOverride).toBe(false);
      // Guardians cannot check their own child out: a teacher matches the tag.
      const out = await t.request('POST', `${c.base}/checkins/${maria!.id}/checkout`, {
        token: c.guardian.token,
        body: { securityCode: maria!.securityCode },
      });
      expect(out.status).toBe(403);

      // The volunteer at the door picks Maria up; the guardian's card empties.
      const done = await t.request('POST', `${c.base}/checkins/${maria!.id}/checkout`, {
        token: c.teacher.token,
        body: { securityCode: maria!.securityCode },
      });
      expect(done.status).toBe(200);
      expect(done.json.checkin.pickupName).toBe('Sari Simanjuntak');
      const after = await t.request('GET', `${c.base}/me`, { token: c.guardian.token });
      expect(after.json.current).toEqual([]);
    });

    it('refuses adult children and other families on self check-in', async () => {
      const adult = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.guardian.token,
        body: {
          children: [{ personId: c.adultChild.id, classId: c.classId('Balita') }],
          method: 'self',
        },
      });
      expect(adult.status).toBe(422);
      expect(adult.json.error.issues[0].path).toBe('children.0.personId');
      const unlinked = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.s.member.token,
        body: { children: [{ personId: c.yosua.id }], method: 'self' },
      });
      expect(unlinked.status).toBe(403);
    });

    it('turns self check-in off and on through the settings, audited', async () => {
      const read = await t.request('GET', `${c.base}/settings`, { token: c.guardian.token });
      expect(read.status).toBe(200);
      expect(read.json.settings).toEqual({ allowSelfCheckIn: true, childMaxAge: 15 });
      const invalid = await t.request('PUT', `${c.base}/settings`, {
        token: c.coordinator.token,
        body: { allowSelfCheckIn: false, childMaxAge: 0 },
      });
      expect(invalid.status).toBe(422);
      const off = await t.request('PUT', `${c.base}/settings`, {
        token: c.coordinator.token,
        body: { allowSelfCheckIn: false, childMaxAge: 12 },
      });
      expect(off.status).toBe(200);
      const me = await t.request('GET', `${c.base}/me`, { token: c.guardian.token });
      expect(me.json.allowSelfCheckIn).toBe(false);
      const refused = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.guardian.token,
        body: { children: [{ personId: c.yosua.id }], method: 'self' },
      });
      expect(refused.status).toBe(403);
      // Volunteers keep checking in.
      const staff = await checkIn(t, c, { children: [{ personId: c.yosua.id }] });
      expect(staff).toHaveLength(1);
      await t.request('DELETE', `${c.base}/checkins/${staff[0]!.id}`, {
        token: c.coordinator.token,
      });

      const on = await t.request('PUT', `${c.base}/settings`, {
        token: c.s.admin.token,
        body: { allowSelfCheckIn: true, childMaxAge: 15 },
      });
      expect(on.status).toBe(200);
      const entries = await auditEntries('checkin_settings.update');
      expect(entries).toHaveLength(2);
      expect(entries.some((entry) => entry.after?.allowSelfCheckIn === false)).toBe(true);
    });
  });

  describe('kiosk', () => {
    it('finds families by name or the last four digits of a phone', async () => {
      const byPhone = await t.request('GET', `${c.base}/households?q=7788`, {
        token: c.teacher.token,
      });
      expect(byPhone.status).toBe(200);
      expect(byPhone.json.items.map((item: any) => item.name)).toEqual(['Keluarga Simanjuntak']);
      // A member's phone (with spaces and a +62 prefix) matches too.
      const member = await t.request('GET', `${c.base}/households?q=9901`, {
        token: c.teacher.token,
      });
      expect(member.json.items.map((item: any) => item.name)).toEqual(['Keluarga Hutapea']);
      expect(member.json.items[0].phoneLast4).toBe('9901');
      const byName = await t.request('GET', `${c.base}/households?q=hutap`, {
        token: c.teacher.token,
      });
      expect(byName.json.items).toHaveLength(1);
      expect(byName.json.items[0].children.map((child: any) => child.firstName)).toEqual(['Lukas']);
      expect(byName.json.items[0].children[0].suggestedClassId).toBe(c.classId('Kelas Tengah'));
      const none = await t.request('GET', `${c.base}/households?q=0000`, {
        token: c.teacher.token,
      });
      expect(none.json.items).toEqual([]);
      const short = await t.request('GET', `${c.base}/households?q=a`, {
        token: c.teacher.token,
      });
      expect(short.status).toBe(422);
    });

    it('marks children already checked in to the session', async () => {
      const [lukas] = await checkIn(t, c, {
        children: [{ personId: c.lukas.id }],
        method: 'kiosk',
      });
      const found = await t.request(
        'GET',
        `${c.base}/households?q=Hutapea&sessionId=${c.session.id}`,
        { token: c.teacher.token },
      );
      expect(found.json.items[0].children[0].currentCheckinId).toBe(lukas!.id);
      const roster = await t.request(
        'GET',
        `${c.sessionPath}/classes/${c.classId('Kelas Tengah')}/roster`,
        { token: c.teacher.token },
      );
      expect(roster.json.checkins.find((item: any) => item.id === lukas!.id).method).toBe('kiosk');
      await t.request('DELETE', `${c.base}/checkins/${lukas!.id}`, { token: c.coordinator.token });
    });

    it('respects class capacity at the kiosk but lets volunteers go over it', async () => {
      const small = await t.request('POST', `${c.base}/classes`, {
        token: c.coordinator.token,
        body: { name: 'Kelas Mini', capacity: 1 },
      });
      const classId = small.json.class.id as string;
      const first = await checkIn(t, c, {
        children: [{ personId: c.lukas.id, classId }],
        method: 'kiosk',
      });
      const full = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.teacher.token,
        body: { children: [{ personId: c.yosua.id, classId }], method: 'kiosk' },
      });
      expect(full.status).toBe(409);
      expect(full.json.error.message).toContain('Kelas Mini');
      const staff = await checkIn(t, c, { children: [{ personId: c.yosua.id, classId }] });
      for (const item of [...first, ...staff]) {
        await t.request('DELETE', `${c.base}/checkins/${item.id}`, { token: c.coordinator.token });
      }
      await t.request('DELETE', `${c.base}/classes/${classId}`, { token: c.coordinator.token });
    });
  });

  describe('children', () => {
    it('lists children with search and alert filters, leaving adults out', async () => {
      const all = await t.request('GET', `${c.base}/children?limit=100`, {
        token: c.teacher.token,
      });
      expect(all.status).toBe(200);
      const names = all.json.items.map((item: any) => item.firstName);
      expect(names).toEqual(expect.arrayContaining(['Yosua', 'Maria', 'Lukas']));
      expect(names).not.toContain('Daniel');
      expect(names).not.toContain('Sari');
      expect(names).not.toContain('Anak');
      const yosua = all.json.items.find((item: any) => item.id === c.yosua.id);
      expect(yosua.householdName).toBe('Keluarga Simanjuntak');
      expect(yosua.age).toBe(6);

      const search = await t.request('GET', `${c.base}/children?q=simanjuntak`, {
        token: c.teacher.token,
      });
      expect(search.json.items.map((item: any) => item.firstName).sort()).toEqual([
        'Maria',
        'Yosua',
      ]);

      await t.request('POST', `${c.base}/children/${c.maria.id}/alerts`, {
        token: c.guardian.token,
        body: { kind: 'allergy', severity: 'critical', description: 'Alergi kacang tanah' },
      });
      const alerts = await t.request('GET', `${c.base}/children?alerts=true`, {
        token: c.teacher.token,
      });
      expect(alerts.json.items.map((item: any) => item.id)).toContain(c.maria.id);
      expect(alerts.json.items.every((item: any) => item.alerts.length > 0)).toBe(true);
      const paged = await t.request('GET', `${c.base}/children?limit=1&page=2`, {
        token: c.teacher.token,
      });
      expect(paged.json.items).toHaveLength(1);
      expect(paged.json.total).toBe(all.json.total);
    });

    it('registers a first-time child with who brought them', async () => {
      const invalid = await t.request('POST', `${c.base}/children`, {
        token: c.teacher.token,
        body: { firstName: '', birthDate: 'kemarin' },
      });
      expect(invalid.status).toBe(422);
      const created = await t.request('POST', `${c.base}/children`, {
        token: c.teacher.token,
        body: {
          firstName: 'Kezia',
          lastName: 'Tamu',
          birthDate: `${new Date().getUTCFullYear() - 5}-01-01`,
          guardianName: 'Ibu Ruth',
          guardianPhone: '0813 5555 1212',
        },
      });
      expect(created.status).toBe(201);
      expect(created.json.child.membershipStatus).toBe('visitor');
      expect(created.json.child.suggestedClassId).toBe(c.classId('Kelas Kecil'));
      const id = created.json.child.id as string;
      const detail = await t.request('GET', `${c.base}/children/${id}`, {
        token: c.teacher.token,
      });
      expect(detail.json.pickups).toHaveLength(1);
      expect(detail.json.pickups[0].name).toBe('Ibu Ruth');
      expect(detail.json.guardians).toEqual([]);
      const [kezia] = await checkIn(t, c, { children: [{ personId: id }] });
      expect(kezia!.className).toBe('Kelas Kecil');
      expect((await auditEntries('checkin_child.create'))[0]!.summary).toContain('Kezia');
      // Members and guardians cannot register children.
      const member = await t.request('POST', `${c.base}/children`, {
        token: c.guardian.token,
        body: { firstName: 'Anak Baru' },
      });
      expect(member.status).toBe(403);
    });

    it('lets coordinators set the usual class', async () => {
      const set = await t.request('PUT', `${c.base}/children/${c.lukas.id}/profile`, {
        token: c.coordinator.token,
        body: { defaultClassId: c.classId('Kelas Besar') },
      });
      expect(set.status).toBe(200);
      expect(set.json.child.defaultClassId).toBe(c.classId('Kelas Besar'));
      expect(set.json.child.suggestedClassId).toBe(c.classId('Kelas Besar'));
      const filtered = await t.request(
        'GET',
        `${c.base}/children?classId=${c.classId('Kelas Besar')}`,
        { token: c.teacher.token },
      );
      expect(filtered.json.items.map((item: any) => item.id)).toEqual([c.lukas.id]);
      const reset = await t.request('PUT', `${c.base}/children/${c.lukas.id}/profile`, {
        token: c.coordinator.token,
        body: { defaultClassId: null },
      });
      expect(reset.json.child.suggestedClassId).toBe(c.classId('Kelas Tengah'));
      const foreign = await t.request('PUT', `${c.base}/children/${c.lukas.id}/profile`, {
        token: c.coordinator.token,
        body: { defaultClassId: c.otherClassId },
      });
      expect(foreign.status).toBe(404);
    });

    it('lets guardians keep alerts up to date, with descriptions redacted in the audit', async () => {
      const created = await t.request('POST', `${c.base}/children/${c.yosua.id}/alerts`, {
        token: c.guardian.token,
        body: { kind: 'custody', severity: 'critical', description: 'Tidak boleh dijemput ayah' },
      });
      expect(created.status).toBe(201);
      const alertId = created.json.alert.id as string;
      const invalid = await t.request(
        'PATCH',
        `${c.base}/children/${c.yosua.id}/alerts/${alertId}`,
        {
          token: c.guardian.token,
          body: { kind: 'unknown', description: 'x' },
        },
      );
      expect(invalid.status).toBe(422);
      const updated = await t.request(
        'PATCH',
        `${c.base}/children/${c.yosua.id}/alerts/${alertId}`,
        {
          token: c.guardian.token,
          body: {
            kind: 'custody',
            severity: 'warning',
            description: 'Hubungi ibu dulu',
            isActive: false,
          },
        },
      );
      expect(updated.status).toBe(200);
      expect(updated.json.alert.isActive).toBe(false);
      const detail = await t.request('GET', `${c.base}/children/${c.yosua.id}`, {
        token: c.guardian.token,
      });
      expect(detail.json.isGuardian).toBe(true);
      expect(detail.json.canEdit).toBe(true);
      expect(detail.json.alerts.find((alert: any) => alert.id === alertId).isActive).toBe(false);
      // Inactive alerts leave the roster badges.
      expect(detail.json.child.alerts.some((alert: any) => alert.id === alertId)).toBe(false);

      const entries = await auditEntries('checkin_alert.update');
      expect(entries[0]!.after.description).toBe('[redacted]');
      expect(JSON.stringify(entries)).not.toContain('Hubungi ibu dulu');
      expect(JSON.stringify(await auditEntries('checkin_alert.create'))).not.toContain('ayah');

      // An alert of another child is not reachable through this child.
      const other = await t.request('POST', `${c.base}/children/${c.lukas.id}/alerts`, {
        token: c.coordinator.token,
        body: { kind: 'other', description: 'Pemalu' },
      });
      expect(
        (
          await t.request(
            'DELETE',
            `${c.base}/children/${c.yosua.id}/alerts/${other.json.alert.id}`,
            {
              token: c.guardian.token,
            },
          )
        ).status,
      ).toBe(404);
      const removed = await t.request(
        'DELETE',
        `${c.base}/children/${c.yosua.id}/alerts/${alertId}`,
        {
          token: c.guardian.token,
        },
      );
      expect(removed.status).toBe(200);
      expect(await auditEntries('checkin_alert.delete')).toHaveLength(1);
    });

    it('keeps an authorized pick-up list that check-out enforces', async () => {
      const path = `${c.base}/children/${c.yosua.id}/pickups`;
      const empty = await t.request('POST', path, { token: c.guardian.token, body: {} });
      expect(empty.status).toBe(422);
      const own = await t.request('POST', path, {
        token: c.guardian.token,
        body: { pickupPersonId: c.yosua.id },
      });
      expect(own.status).toBe(409);
      const foreign = await t.request('POST', path, {
        token: c.guardian.token,
        body: { pickupPersonId: c.outsider.id },
      });
      expect(foreign.status).toBe(404);
      const opung = await t.request('POST', path, {
        token: c.guardian.token,
        body: { pickupPersonId: c.opung.id, relationship: 'Opung', phone: '0812 1111 2222' },
      });
      expect(opung.status).toBe(201);
      expect(opung.json.pickup.name).toBe('Opung Siregar');
      const twice = await t.request('POST', path, {
        token: c.guardian.token,
        body: { pickupPersonId: c.opung.id },
      });
      expect(twice.status).toBe(409);
      const driver = await t.request('POST', path, {
        token: c.coordinator.token,
        body: { name: 'Pak Ujang', relationship: 'Sopir' },
      });
      expect(driver.status).toBe(201);
      const edited = await t.request('PATCH', `${path}/${driver.json.pickup.id}`, {
        token: c.guardian.token,
        body: { name: 'Pak Ujang Sopir', relationship: 'Sopir keluarga', notes: 'Mobil hitam' },
      });
      expect(edited.status).toBe(200);
      expect(edited.json.pickup.notes).toBe('Mobil hitam');
      const audit = JSON.stringify(await auditEntries('checkin_pickup.create'));
      expect(audit).not.toContain('0812 1111 2222');

      const [yosua] = await checkIn(t, c, { children: [{ personId: c.yosua.id }] });
      const dialog = await t.request('GET', `${c.base}/checkins/${yosua!.id}`, {
        token: c.teacher.token,
      });
      expect(dialog.json.pickups.map((item: any) => item.name).sort()).toEqual([
        'Opung Siregar',
        'Pak Ujang Sopir',
      ]);
      const stranger = await t.request('POST', `${c.base}/checkins/${yosua!.id}/checkout`, {
        token: c.teacher.token,
        body: { securityCode: yosua!.securityCode, pickupPersonId: c.neighbour.id },
      });
      expect(stranger.status).toBe(403);
      const ok = await t.request('POST', `${c.base}/checkins/${yosua!.id}/checkout`, {
        token: c.teacher.token,
        body: { securityCode: yosua!.securityCode, pickupPersonId: c.opung.id },
      });
      expect(ok.status).toBe(200);
      expect(ok.json.checkin.pickupName).toBe('Opung Siregar');

      const inbox = await t.request('GET', '/api/notifications', { token: c.guardian.token });
      const picked = inbox.json.items.find(
        (item: any) => item.type === 'checkin.child_picked_up' && item.entityId === yosua!.id,
      );
      expect(picked.body).toContain('Opung Siregar');

      const removed = await t.request('DELETE', `${path}/${driver.json.pickup.id}`, {
        token: c.guardian.token,
      });
      expect(removed.status).toBe(200);
      expect(
        (
          await t.request('DELETE', `${path}/${driver.json.pickup.id}`, {
            token: c.guardian.token,
          })
        ).status,
      ).toBe(404);
    });

    it("shows a child's attendance history to volunteers and the guardian only", async () => {
      const history = await t.request('GET', `${c.base}/children/${c.yosua.id}/attendance`, {
        token: c.guardian.token,
      });
      expect(history.status).toBe(200);
      expect(history.json.total).toBeGreaterThan(0);
      expect(history.json.items[0].sessionName).toBe(c.session.name);
      expect(history.json.items[0].className).toBeTruthy();
      const teacher = await t.request('GET', `${c.base}/children/${c.yosua.id}/attendance`, {
        token: c.teacher.token,
      });
      expect(teacher.json.total).toBe(history.json.total);
      for (const token of [c.s.member.token, c.clerk.token]) {
        expect(
          (await t.request('GET', `${c.base}/children/${c.yosua.id}/attendance`, { token })).status,
        ).toBe(404);
      }
      expect(
        (
          await t.request('GET', `${c.base}/children/${c.lukas.id}/attendance`, {
            token: c.guardian.token,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('GET', `${c.base}/children/${c.outsider.id}/attendance`, {
            token: c.s.owner.token,
          })
        ).status,
      ).toBe(404);
    });
  });
});
