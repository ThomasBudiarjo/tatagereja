import { SECURITY_CODE_ALPHABET } from '@tatagereja/shared';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { attendanceRecords } from '../src/db/schema';
import { bornYearsAgo, checkIn, seedCheckin, type CheckinSeed } from './checkin-fixtures';
import { createTestApp } from './helpers';

describe('kids check-in classes, sessions and rosters', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CheckinSeed;

  beforeAll(async () => {
    c = await seedCheckin(t);
  });

  const auditActions = async (query = '') => {
    const response = await t.request(
      'GET',
      `${c.church}/audit-logs?module=checkin&limit=200${query}`,
      { token: c.s.owner.token },
    );
    expect(response.status).toBe(200);
    return response.json.items as {
      action: string;
      entityId: string | null;
      summary: string;
      before: any;
      after: any;
    }[];
  };

  describe('classes', () => {
    it('creates the suggested classes once and lists them in order', async () => {
      const again = await t.request('POST', `${c.base}/classes/defaults`, {
        token: c.coordinator.token,
      });
      expect(again.status).toBe(200);
      expect(again.json.created).toBe(0);
      const list = await t.request('GET', `${c.base}/classes`, { token: c.teacher.token });
      expect(list.json.items.map((item: any) => item.name)).toEqual([
        'Balita',
        'Kelas Kecil',
        'Kelas Tengah',
        'Kelas Besar',
        'Tunas Remaja',
      ]);
      expect((await auditActions()).some((e) => e.action === 'checkin_class.create_defaults')).toBe(
        true,
      );
    });

    it('validates classes and keeps names unique', async () => {
      const ages = await t.request('POST', `${c.base}/classes`, {
        token: c.coordinator.token,
        body: { name: 'Kelas Terbalik', minAge: 9, maxAge: 4 },
      });
      expect(ages.status).toBe(422);
      expect(ages.json.error.issues[0].path).toBe('maxAge');
      const short = await t.request('POST', `${c.base}/classes`, {
        token: c.coordinator.token,
        body: { name: 'K' },
      });
      expect(short.status).toBe(422);
      const color = await t.request('POST', `${c.base}/classes`, {
        token: c.coordinator.token,
        body: { name: 'Kelas Warna', color: 'merah' },
      });
      expect(color.status).toBe(422);
      const duplicate = await t.request('POST', `${c.base}/classes`, {
        token: c.coordinator.token,
        body: { name: 'Balita' },
      });
      expect(duplicate.status).toBe(422);
      expect(duplicate.json.error.issues[0].path).toBe('name');
    });

    it('updates a class with an audit entry of what changed', async () => {
      const id = c.classId('Kelas Tengah');
      const updated = await t.request('PATCH', `${c.base}/classes/${id}`, {
        token: c.coordinator.token,
        body: {
          name: 'Kelas Tengah',
          minAge: 7,
          maxAge: 9,
          location: 'Ruang Yusuf, lantai 2',
          capacity: 30,
          maxChildrenPerTeacher: 6,
          color: '#2563eb',
          sortOrder: 30,
        },
      });
      expect(updated.status).toBe(200);
      expect(updated.json.class.location).toBe('Ruang Yusuf, lantai 2');
      const entry = (await auditActions()).find(
        (e) => e.action === 'checkin_class.update' && e.entityId === id,
      );
      expect(entry?.after).toEqual({
        location: 'Ruang Yusuf, lantai 2',
        capacity: 30,
        maxChildrenPerTeacher: 6,
        color: '#2563eb',
      });
    });

    it('assigns teachers, notifies the new ones and audits the change', async () => {
      const teacherPerson = await t.createPerson(c.s.owner.token, c.s.church.id, {
        firstName: 'Kak',
        lastName: 'Ruth',
      });
      const linked = await t.request('PUT', `${c.church}/people/${teacherPerson.id}/user`, {
        token: c.s.owner.token,
        body: { userId: c.teacher.user.id },
      });
      expect(linked.status).toBe(200);
      const id = c.classId('Kelas Besar');
      const set = await t.request('PUT', `${c.base}/classes/${id}/teachers`, {
        token: c.coordinator.token,
        body: {
          teachers: [
            { personId: teacherPerson.id, isLead: true },
            { personId: c.budi.id },
          ],
        },
      });
      expect(set.status).toBe(200);
      expect(set.json.class.teachers).toHaveLength(2);
      expect(set.json.class.teachers[0]).toMatchObject({ firstName: 'Kak', isLead: true });
      const inbox = await t.request('GET', '/api/notifications', { token: c.teacher.token });
      const notice = inbox.json.items.find((item: any) => item.type === 'checkin.teacher_assigned');
      expect(notice.title).toContain('Kelas Besar');
      // Setting the same teachers again does not notify twice.
      await t.request('PUT', `${c.base}/classes/${id}/teachers`, {
        token: c.coordinator.token,
        body: { teachers: [{ personId: teacherPerson.id, isLead: true }, { personId: c.budi.id }] },
      });
      const again = await t.request('GET', '/api/notifications', { token: c.teacher.token });
      expect(
        again.json.items.filter((item: any) => item.type === 'checkin.teacher_assigned'),
      ).toHaveLength(1);
      expect((await auditActions()).some((e) => e.action === 'checkin_class.teachers')).toBe(true);
    });

    it('refuses to delete a class with history and deletes an unused one', async () => {
      const temp = await t.request('POST', `${c.base}/classes`, {
        token: c.coordinator.token,
        body: { name: 'Kelas Sementara', minAge: 20, maxAge: 21 },
      });
      const [item] = await checkIn(t, c, {
        children: [{ personId: c.neighbour.id, classId: temp.json.class.id }],
      });
      const blocked = await t.request('DELETE', `${c.base}/classes/${temp.json.class.id}`, {
        token: c.coordinator.token,
      });
      expect(blocked.status).toBe(409);
      await t.request('DELETE', `${c.base}/checkins/${item!.id}`, { token: c.coordinator.token });
      const deleted = await t.request('DELETE', `${c.base}/classes/${temp.json.class.id}`, {
        token: c.coordinator.token,
      });
      expect(deleted.status).toBe(200);
      const actions = (await auditActions()).map((e) => e.action);
      expect(actions).toContain('checkin_class.delete');
      expect(actions).toContain('checkin.delete');
    });
  });

  describe('check-in', () => {
    it('checks siblings in with unique codes and suggested classes, and tells the guardian', async () => {
      const items = await checkIn(t, c, {
        children: [{ personId: c.yosua.id }, { personId: c.maria.id }],
        guardianPersonId: c.budi.id,
      });
      expect(items.map((item) => item.className)).toEqual(['Kelas Kecil', 'Balita']);
      const pattern = new RegExp(`^[${SECURITY_CODE_ALPHABET}]{4}$`);
      for (const item of items) expect(item.securityCode).toMatch(pattern);
      expect(new Set(items.map((item) => item.securityCode)).size).toBe(2);

      const inbox = await t.request('GET', '/api/notifications', { token: c.guardian.token });
      const notices = inbox.json.items.filter(
        (item: any) => item.type === 'checkin.child_checked_in',
      );
      expect(notices).toHaveLength(2);
      expect(notices.map((item: any) => item.title).join(' ')).toContain('Yosua');
      expect(notices[0].body).toContain('Budi Simanjuntak');

      const duplicate = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.teacher.token,
        body: { children: [{ personId: c.yosua.id }] },
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.json.error.message).toContain('Yosua');
    });

    it('asks for a class when nothing fits and refuses inactive classes', async () => {
      const adult = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.teacher.token,
        body: { children: [{ personId: c.lukas.id }, { personId: c.adultChild.id }] },
      });
      expect(adult.status).toBe(422);
      expect(adult.json.error.issues[0].path).toBe('children.1.classId');
      // Nothing was saved: Lukas is not checked in.
      const roster = await t.request(
        'GET',
        `${c.sessionPath}/classes/${c.classId('Kelas Tengah')}/roster`,
        { token: c.teacher.token },
      );
      expect(roster.json.checkins.some((item: any) => item.child.id === c.lukas.id)).toBe(false);

      const off = await t.request('POST', `${c.base}/classes`, {
        token: c.coordinator.token,
        body: { name: 'Kelas Libur', isActive: false },
      });
      const inactive = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.teacher.token,
        body: { children: [{ personId: c.lukas.id, classId: off.json.class.id }] },
      });
      expect(inactive.status).toBe(422);

      const twice = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.teacher.token,
        body: { children: [{ personId: c.lukas.id }, { personId: c.lukas.id }] },
      });
      expect(twice.status).toBe(422);
      const empty = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.teacher.token,
        body: { children: [] },
      });
      expect(empty.status).toBe(422);
    });

    it('hands out codes that stay unique across a busy session', async () => {
      const session = await t.request('POST', `${c.base}/sessions`, {
        token: c.coordinator.token,
        body: { name: 'Natal Anak', date: '2026-12-20' },
      });
      const path = `${c.base}/sessions/${session.json.session.id}`;
      const codes = new Set<string>();
      for (let batch = 0; batch < 4; batch += 1) {
        const kids = [];
        for (let i = 0; i < 10; i += 1) {
          kids.push(
            await t.createPerson(c.s.owner.token, c.s.church.id, {
              firstName: `Anak ${batch}-${i}`,
              birthDate: bornYearsAgo(5),
            }),
          );
        }
        const items = await checkIn(
          t,
          c,
          { children: kids.map((kid) => ({ personId: kid.id })) },
          c.teacher.token,
          path,
        );
        for (const item of items) codes.add(item.securityCode);
      }
      expect(codes.size).toBe(40);
      const detail = await t.request('GET', path, { token: c.teacher.token });
      expect(detail.json.session.checkedInCount).toBe(40);
      const kecil = detail.json.classes.find((item: any) => item.name === 'Kelas Kecil');
      expect(kecil.presentCount).toBe(40);
    });

    it('prints labels with the codes and audits reprints', async () => {
      const [lukas] = await checkIn(t, c, { children: [{ personId: c.lukas.id }] });
      const first = await t.request('POST', `${c.base}/checkins/labels`, {
        token: c.teacher.token,
        body: { ids: [lukas!.id] },
      });
      expect(first.status).toBe(200);
      expect(first.json.items[0]).toMatchObject({
        securityCode: lukas!.securityCode,
        sessionName: 'Ibadah Minggu Pagi',
        className: 'Kelas Tengah',
        birthDate: bornYearsAgo(8),
      });
      expect(first.json.items[0].labelPrintedAt).not.toBeNull();
      const before = (await auditActions()).filter((e) => e.action === 'checkin.label_reprint');
      await t.request('POST', `${c.base}/checkins/labels`, {
        token: c.teacher.token,
        body: { ids: [lukas!.id] },
      });
      const after = (await auditActions()).filter((e) => e.action === 'checkin.label_reprint');
      expect(after.length).toBe(before.length + 1);
      expect(JSON.stringify(after)).not.toContain(lukas!.securityCode);
      const tooMany = await t.request('POST', `${c.base}/checkins/labels`, {
        token: c.teacher.token,
        body: { ids: [] },
      });
      expect(tooMany.status).toBe(422);
    });
  });

  describe('rosters', () => {
    it('shows headcount, alerts and a ratio warning for the class', async () => {
      const balita = c.classId('Balita');
      await t.request('PATCH', `${c.base}/classes/${balita}`, {
        token: c.coordinator.token,
        body: { name: 'Balita', minAge: 0, maxAge: 3, maxChildrenPerTeacher: 1, sortOrder: 10 },
      });
      await t.request('POST', `${c.base}/children/${c.maria.id}/alerts`, {
        token: c.guardian.token,
        body: { kind: 'allergy', severity: 'critical', description: 'Alergi kacang tanah' },
      });
      const roster = await t.request('GET', `${c.sessionPath}/classes/${balita}/roster`, {
        token: c.teacher.token,
      });
      expect(roster.status).toBe(200);
      expect(roster.json.presentCount).toBe(1);
      expect(roster.json.teacherCount).toBe(0);
      expect(roster.json.ratioExceeded).toBe(true);
      expect(roster.json.checkins[0].alerts[0]).toMatchObject({
        kind: 'allergy',
        severity: 'critical',
        description: 'Alergi kacang tanah',
      });

      await t.request('PUT', `${c.base}/classes/${balita}/teachers`, {
        token: c.coordinator.token,
        body: { teachers: [{ personId: c.opung.id }] },
      });
      const staffed = await t.request('GET', `${c.sessionPath}/classes/${balita}/roster`, {
        token: c.teacher.token,
      });
      expect(staffed.json.ratioExceeded).toBe(false);
      const detail = await t.request('GET', c.sessionPath, { token: c.teacher.token });
      const stat = detail.json.classes.find((item: any) => item.classId === balita);
      expect(stat).toMatchObject({ presentCount: 1, teacherCount: 1, alertCount: 1 });
    });

    it('lists the session check-ins with filters and pagination', async () => {
      const all = await t.request('GET', `${c.sessionPath}/checkins?limit=2`, {
        token: c.teacher.token,
      });
      expect(all.status).toBe(200);
      expect(all.json.items).toHaveLength(2);
      expect(all.json.total).toBeGreaterThanOrEqual(3);
      const named = await t.request('GET', `${c.sessionPath}/checkins?q=Yosua`, {
        token: c.teacher.token,
      });
      expect(named.json.items.map((item: any) => item.child.firstName)).toEqual(['Yosua']);
      const byClass = await t.request(
        'GET',
        `${c.sessionPath}/checkins?classId=${c.classId('Balita')}&status=checked_in`,
        { token: c.teacher.token },
      );
      expect(byClass.json.items.map((item: any) => item.child.firstName)).toEqual(['Maria']);
      const bad = await t.request('GET', `${c.sessionPath}/checkins?status=gone`, {
        token: c.teacher.token,
      });
      expect(bad.status).toBe(422);
    });
  });

  describe('sessions', () => {
    it('lists sessions with filters and validates input', async () => {
      const invalid = await t.request('POST', `${c.base}/sessions`, {
        token: c.coordinator.token,
        body: { name: 'Sesi', date: '23-10-2026' },
      });
      expect(invalid.status).toBe(422);
      const filtered = await t.request('GET', `${c.base}/sessions?from=2026-12-01&to=2026-12-31`, {
        token: c.teacher.token,
      });
      expect(filtered.json.items.map((item: any) => item.name)).toEqual(['Natal Anak']);
      const open = await t.request('GET', `${c.base}/sessions?status=open&q=Pagi`, {
        token: c.teacher.token,
      });
      expect(open.json.total).toBe(1);
      expect(open.json.items[0].checkedInCount).toBeGreaterThan(0);
    });

    it('closes a session into attendance, blocks new check-ins and reopens', async () => {
      const closed = await t.request('POST', `${c.sessionPath}/close`, {
        token: c.coordinator.token,
      });
      expect(closed.status).toBe(200);
      expect(closed.json.session.status).toBe('closed');
      const attendanceId = closed.json.session.attendanceSessionId;
      expect(attendanceId).toBeTruthy();
      const attendance = await t.request('GET', `${c.church}/attendance/sessions/${attendanceId}`, {
        token: c.s.owner.token,
      });
      // The copy shows up in the attendance module as a Sekolah Minggu session.
      expect(attendance.status).toBe(200);
      expect(JSON.stringify(attendance.json)).toContain('Sekolah Minggu · Ibadah Minggu Pagi');

      expect(
        (await t.request('POST', `${c.sessionPath}/close`, { token: c.coordinator.token })).status,
      ).toBe(409);
      const late = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.teacher.token,
        body: { children: [{ personId: c.hutapea.id, classId: c.classId('Balita') }] },
      });
      expect(late.status).toBe(409);

      const reopened = await t.request('POST', `${c.sessionPath}/reopen`, {
        token: c.coordinator.token,
      });
      expect(reopened.json.session.status).toBe('open');
      const pickedLate = await t.request('POST', `${c.sessionPath}/checkins`, {
        token: c.teacher.token,
        body: { children: [{ personId: c.hutapea.id, classId: c.classId('Balita') }] },
      });
      expect(pickedLate.status).toBe(201);
      const again = await t.request('POST', `${c.sessionPath}/close`, {
        token: c.coordinator.token,
      });
      // The same attendance session is reused and gains the late child.
      expect(again.json.session.attendanceSessionId).toBe(attendanceId);
      const rows = t.db
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.sessionId, attendanceId))
        .all();
      expect(rows.map((row) => row.personId)).toContain(c.hutapea.id);
      expect(rows.map((row) => row.personId)).toContain(c.yosua.id);
      expect(rows.every((row) => row.status === 'present')).toBe(true);
      expect(new Set(rows.map((row) => row.personId)).size).toBe(rows.length);

      const actions = (await auditActions()).map((e) => e.action);
      expect(actions).toContain('checkin_session.close');
      expect(actions).toContain('checkin_session.reopen');
      // Children still in class can be picked up after the session closes.
      const roster = await t.request(
        'GET',
        `${c.sessionPath}/classes/${c.classId('Kelas Kecil')}/roster`,
        { token: c.coordinator.token },
      );
      const yosua = roster.json.checkins.find((item: any) => item.child.id === c.yosua.id);
      const out = await t.request('POST', `${c.base}/checkins/${yosua.id}/checkout`, {
        token: c.teacher.token,
        body: { securityCode: yosua.securityCode },
      });
      expect(out.status).toBe(200);
      await t.request('POST', `${c.sessionPath}/reopen`, { token: c.coordinator.token });
    });

    it('edits and deletes only empty sessions', async () => {
      const blank = await t.request('POST', `${c.base}/sessions`, {
        token: c.coordinator.token,
        body: { name: 'Sesi Salah', date: '2026-11-08' },
      });
      const renamed = await t.request('PATCH', `${c.base}/sessions/${blank.json.session.id}`, {
        token: c.coordinator.token,
        body: { name: 'Ibadah Minggu Sore', date: '2026-11-08' },
      });
      expect(renamed.json.session.name).toBe('Ibadah Minggu Sore');
      const service = await t.request('PATCH', `${c.base}/sessions/${blank.json.session.id}`, {
        token: c.coordinator.token,
        body: {
          name: 'Ibadah Minggu Sore',
          date: '2026-11-08',
          worshipServiceId: '00000000-0000-4000-8000-000000000000',
        },
      });
      expect(service.status).toBe(404);
      expect(
        (await t.request('DELETE', c.sessionPath, { token: c.coordinator.token })).status,
      ).toBe(409);
      expect(
        (
          await t.request('DELETE', `${c.base}/sessions/${blank.json.session.id}`, {
            token: c.coordinator.token,
          })
        ).status,
      ).toBe(200);
    });

    it('summarises the module on the overview', async () => {
      const overview = await t.request('GET', `${c.base}/overview`, { token: c.teacher.token });
      expect(overview.status).toBe(200);
      expect(overview.json.openSessions.length).toBeGreaterThanOrEqual(1);
      expect(overview.json.openSessions[0].classes.length).toBeGreaterThan(0);
      expect(overview.json.stats.activeClasses).toBe(5);
      expect(overview.json.stats.childrenWithAlerts).toBe(1);
      expect(overview.json.stats.checkinsLast30Days).toBeGreaterThan(40);
      expect(overview.json.trend.length).toBeGreaterThan(0);
    });
  });
});
