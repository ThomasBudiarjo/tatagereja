import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { checkIn, seedCheckin, type CheckinSeed } from './checkin-fixtures';
import { createTestApp } from './helpers';

describe('kids check-in access', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let c: CheckinSeed;

  beforeAll(async () => {
    c = await seedCheckin(t);
  });

  const status = async (method: string, path: string, token: string, body?: unknown) =>
    (await t.request(method, path, { token, body })).status;

  it('lets volunteers read the module and keeps members and other permissions out', async () => {
    const reads = [
      `${c.base}/overview`,
      `${c.base}/classes`,
      `${c.base}/sessions`,
      c.sessionPath,
      `${c.sessionPath}/checkins`,
      `${c.sessionPath}/classes/${c.classId('Kelas Kecil')}/roster`,
      `${c.base}/children`,
      `${c.base}/households?q=Simanjuntak`,
    ];
    for (const path of reads) {
      for (const token of [
        c.s.owner.token,
        c.s.admin.token,
        c.teacher.token,
        c.coordinator.token,
      ]) {
        expect(await status('GET', path, token)).toBe(200);
      }
      for (const token of [c.s.member.token, c.s.leader.token, c.clerk.token, c.guardian.token]) {
        expect(await status('GET', path, token)).toBe(403);
      }
    }
  });

  it('reports the caller permissions on the status route', async () => {
    const teacher = await t.request('GET', `${c.base}/status`, { token: c.teacher.token });
    expect(teacher.json.permissions).toEqual(['checkin.operate']);
    const member = await t.request('GET', `${c.base}/status`, { token: c.s.member.token });
    expect(member.status).toBe(200);
    expect(member.json.permissions).toEqual([]);
    const admin = await t.request('GET', `${c.base}/status`, { token: c.s.admin.token });
    expect(admin.json.permissions.sort()).toEqual(['checkin.manage', 'checkin.operate']);
  });

  it('keeps class, session and settings management to coordinators', async () => {
    const classBody = { name: 'Kelas Coba', minAge: 3, maxAge: 5 };
    for (const token of [c.teacher.token, c.s.member.token, c.clerk.token, c.s.leader.token]) {
      expect(await status('POST', `${c.base}/classes`, token, classBody)).toBe(403);
      expect(
        await status('POST', `${c.base}/sessions`, token, { name: 'Sesi', date: '2026-11-01' }),
      ).toBe(403);
      expect(await status('POST', `${c.sessionPath}/close`, token)).toBe(403);
      expect(
        await status('PUT', `${c.base}/classes/${c.classId('Balita')}/teachers`, token, {
          teachers: [],
        }),
      ).toBe(403);
      expect(
        await status('PUT', `${c.base}/settings`, token, {
          allowSelfCheckIn: false,
          childMaxAge: 12,
        }),
      ).toBe(403);
      expect(
        await status('PUT', `${c.base}/children/${c.yosua.id}/profile`, token, {
          defaultClassId: null,
        }),
      ).toBe(403);
    }
    for (const token of [c.s.owner.token, c.s.admin.token, c.coordinator.token]) {
      const created = await t.request('POST', `${c.base}/classes`, {
        token,
        body: { ...classBody, name: `Kelas ${Math.random().toString(36).slice(2, 8)}` },
      });
      expect(created.status).toBe(201);
      expect(await status('DELETE', `${c.base}/classes/${created.json.class.id}`, token)).toBe(200);
    }
  });

  it('lets only volunteers check in for other families and check children out', async () => {
    for (const token of [c.s.member.token, c.clerk.token, c.guardian.token]) {
      expect(
        await status('POST', `${c.sessionPath}/checkins`, token, {
          children: [{ personId: c.lukas.id }],
          method: 'staff',
        }),
      ).toBe(403);
      expect(
        await status('POST', `${c.sessionPath}/checkins`, token, {
          children: [{ personId: c.lukas.id }],
          method: 'kiosk',
        }),
      ).toBe(403);
    }
    const [lukas] = await checkIn(t, c, { children: [{ personId: c.lukas.id }] });
    for (const token of [c.s.member.token, c.clerk.token, c.guardian.token]) {
      expect(
        await status('POST', `${c.base}/checkins/${lukas!.id}/checkout`, token, {
          securityCode: lukas!.securityCode,
        }),
      ).toBe(403);
    }
    // Only coordinators override; teachers must use the code.
    expect(
      await status('POST', `${c.base}/checkins/${lukas!.id}/override`, c.teacher.token, {
        reason: 'Kode hilang',
      }),
    ).toBe(403);
    expect(await status('DELETE', `${c.base}/checkins/${lukas!.id}`, c.teacher.token)).toBe(403);
    expect(
      await status('POST', `${c.base}/checkins/${lukas!.id}/checkout`, c.teacher.token, {
        securityCode: lukas!.securityCode,
      }),
    ).toBe(200);
  });

  it('hides other families and their codes from guardians', async () => {
    const [lukas] = await checkIn(t, c, { children: [{ personId: c.lukas.id }] });
    // Not their household: the child and the check-in do not exist for them.
    expect(await status('GET', `${c.base}/children/${c.lukas.id}`, c.guardian.token)).toBe(404);
    expect(await status('GET', `${c.base}/checkins/${lukas!.id}`, c.guardian.token)).toBe(404);
    expect(
      await status('POST', `${c.base}/checkins/labels`, c.guardian.token, { ids: [lukas!.id] }),
    ).toBe(404);
    expect(
      await status('POST', `${c.base}/children/${c.lukas.id}/alerts`, c.guardian.token, {
        kind: 'allergy',
        description: 'Kacang',
      }),
    ).toBe(404);
    expect(
      await status('POST', `${c.sessionPath}/checkins`, c.guardian.token, {
        children: [{ personId: c.lukas.id }],
        method: 'self',
      }),
    ).toBe(403);
    // Their own children are visible.
    expect(await status('GET', `${c.base}/children/${c.yosua.id}`, c.guardian.token)).toBe(200);
    // Teachers see children but never the code of someone else's check-in.
    const detail = await t.request('GET', `${c.base}/checkins/${lukas!.id}`, {
      token: c.teacher.token,
    });
    expect(detail.status).toBe(200);
    expect(detail.json.checkin.securityCode).toBeNull();
    expect(detail.json.canOverride).toBe(false);
    const roster = await t.request('GET', `${c.sessionPath}/classes/${lukas!.classId}/roster`, {
      token: c.teacher.token,
    });
    expect(roster.json.checkins.every((item: any) => item.securityCode === null)).toBe(true);
    const managed = await t.request('GET', `${c.base}/checkins/${lukas!.id}`, {
      token: c.coordinator.token,
    });
    expect(managed.json.checkin.securityCode).toBe(lukas!.securityCode);
    expect(managed.json.canOverride).toBe(true);
  });

  it('lets teachers see alerts but only guardians and coordinators change them', async () => {
    expect(
      await status('POST', `${c.base}/children/${c.lukas.id}/alerts`, c.teacher.token, {
        kind: 'allergy',
        description: 'Alergi telur',
      }),
    ).toBe(403);
    expect(
      await status('POST', `${c.base}/children/${c.lukas.id}/pickups`, c.teacher.token, {
        name: 'Om Tigor',
      }),
    ).toBe(403);
    expect(
      await status('POST', `${c.base}/children/${c.lukas.id}/alerts`, c.coordinator.token, {
        kind: 'allergy',
        description: 'Alergi telur',
      }),
    ).toBe(201);
    expect(
      await status('POST', `${c.base}/children/${c.yosua.id}/alerts`, c.guardian.token, {
        kind: 'medical',
        severity: 'critical',
        description: 'Asma, inhaler di tas',
      }),
    ).toBe(201);
    const detail = await t.request('GET', `${c.base}/children/${c.lukas.id}`, {
      token: c.teacher.token,
    });
    expect(detail.json.canEdit).toBe(false);
    expect(detail.json.alerts).toHaveLength(1);
  });

  it('answers 404 for ids from another church', async () => {
    const tokens = [c.s.owner.token, c.coordinator.token];
    for (const token of tokens) {
      expect(await status('GET', `${c.base}/classes/${c.otherClassId}`, token)).toBe(404);
      expect(
        await status('PATCH', `${c.base}/classes/${c.otherClassId}`, token, { name: 'Diambil' }),
      ).toBe(404);
      expect(await status('DELETE', `${c.base}/classes/${c.otherClassId}`, token)).toBe(404);
      expect(
        await status('PUT', `${c.base}/classes/${c.otherClassId}/teachers`, token, {
          teachers: [],
        }),
      ).toBe(404);
      expect(await status('GET', `${c.base}/sessions/${c.otherSessionId}`, token)).toBe(404);
      expect(await status('POST', `${c.base}/sessions/${c.otherSessionId}/close`, token)).toBe(404);
      expect(await status('GET', `${c.base}/sessions/${c.otherSessionId}/checkins`, token)).toBe(
        404,
      );
      expect(await status('GET', `${c.sessionPath}/classes/${c.otherClassId}/roster`, token)).toBe(
        404,
      );
      expect(await status('GET', `${c.base}/checkins/${c.otherCheckinId}`, token)).toBe(404);
      expect(
        await status('POST', `${c.base}/checkins/${c.otherCheckinId}/checkout`, token, {
          securityCode: 'ABCD',
        }),
      ).toBe(404);
      expect(
        await status('POST', `${c.base}/checkins/${c.otherCheckinId}/override`, token, {
          reason: 'Mencoba IDOR',
        }),
      ).toBe(404);
      expect(
        await status('POST', `${c.base}/checkins/labels`, token, { ids: [c.otherCheckinId] }),
      ).toBe(404);
      expect(await status('GET', `${c.base}/children/${c.outsider.id}`, token)).toBe(404);
      expect(
        await status('POST', `${c.base}/children/${c.outsider.id}/alerts`, token, {
          kind: 'other',
          description: 'Dari gereja lain',
        }),
      ).toBe(404);
      expect(
        await status('PUT', `${c.base}/children/${c.outsider.id}/profile`, token, {
          defaultClassId: null,
        }),
      ).toBe(404);
      expect(
        await status('GET', `${c.base}/households?q=Luar&sessionId=${c.otherSessionId}`, token),
      ).toBe(404);
    }
    // Another church's child or class cannot be used in this church's session.
    expect(
      await status('POST', `${c.sessionPath}/checkins`, c.teacher.token, {
        children: [{ personId: c.outsider.id }],
      }),
    ).toBe(404);
    expect(
      await status('POST', `${c.sessionPath}/checkins`, c.teacher.token, {
        children: [{ personId: c.yosua.id, classId: c.otherClassId }],
      }),
    ).toBe(404);
    expect(
      await status('POST', `${c.sessionPath}/checkins`, c.teacher.token, {
        children: [{ personId: c.maria.id }],
        guardianPersonId: c.outsider.id,
      }),
    ).toBe(404);
    expect(
      await status('PUT', `${c.base}/children/${c.yosua.id}/profile`, c.coordinator.token, {
        defaultClassId: c.otherClassId,
      }),
    ).toBe(404);
    expect(
      await status(
        'PUT',
        `${c.base}/classes/${c.classId('Balita')}/teachers`,
        c.coordinator.token,
        {
          teachers: [{ personId: c.outsider.id }],
        },
      ),
    ).toBe(404);
    expect(
      await status('POST', `${c.base}/children/${c.yosua.id}/pickups`, c.guardian.token, {
        pickupPersonId: c.outsider.id,
      }),
    ).toBe(404);
    // The other church's own data is unchanged.
    const theirs = await t.request('GET', `${c.otherBase}/checkins/${c.otherCheckinId}`, {
      token: c.other.token,
    });
    expect(theirs.json.checkin.status).toBe('checked_in');
    expect(await status('GET', `${c.otherBase}/overview`, c.s.owner.token)).toBe(403);
  });

  it('answers 403 MODULE_DISABLED once the module is switched off', async () => {
    const t2 = createTestApp();
    try {
      const c2 = await seedCheckin(t2);
      const off = await t2.request('PATCH', `/api/churches/${c2.s.church.id}/modules`, {
        token: c2.s.owner.token,
        body: { modules: { checkin: false } },
      });
      expect(off.status).toBe(200);
      for (const [method, path, token] of [
        ['GET', `${c2.base}/status`, c2.s.owner.token],
        ['GET', `${c2.base}/overview`, c2.s.owner.token],
        ['GET', `${c2.base}/me`, c2.guardian.token],
        ['GET', `${c2.base}/classes`, c2.teacher.token],
        ['POST', `${c2.sessionPath}/checkins`, c2.teacher.token],
        ['GET', `${c2.base}/children/${c2.yosua.id}`, c2.guardian.token],
      ] as const) {
        const response = await t2.request(method, path, {
          token,
          body: method === 'POST' ? { children: [{ personId: c2.yosua.id }] } : undefined,
        });
        expect(response.status).toBe(403);
        expect(response.json.error.code).toBe('MODULE_DISABLED');
      }
    } finally {
      t2.close();
    }
  });
});
