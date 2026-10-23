import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from './helpers';
import { baptism, createRecord, seedRecords, type RecordsSeed } from './records-fixtures';

describe('church registry access', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let r: RecordsSeed;
  let memberBaptismId: string;
  let otherBaptismId: string;

  beforeAll(async () => {
    r = await seedRecords(t);
    memberBaptismId = (await createRecord(t, r, baptism(r.s.memberPerson.id))).record.id;
    otherBaptismId = (await createRecord(t, r, baptism(r.budi.id))).record.id;
  });

  describe('permission matrix', () => {
    type Who = 'owner' | 'admin' | 'secretary' | 'viewer' | 'clerk' | 'leader' | 'member';
    const tokenOf = (who: Who) =>
      ({
        owner: r.s.owner.token,
        admin: r.s.admin.token,
        secretary: r.secretary.token,
        viewer: r.viewer.token,
        clerk: r.clerk.token,
        leader: r.s.leader.token,
        member: r.s.member.token,
      })[who];
    const everyone: Who[] = ['owner', 'admin', 'secretary', 'viewer', 'clerk', 'leader', 'member'];

    const expectMatrix = async (
      call: (token: string) => Promise<{ status: number }>,
      allowed: Who[],
      okStatus = 200,
    ) => {
      for (const who of everyone) {
        const response = await call(tokenOf(who));
        expect({ who, status: response.status }).toEqual({
          who,
          status: allowed.includes(who) ? okStatus : 403,
        });
      }
    };

    it('lets register viewers read the register and overview', async () => {
      const readers: Who[] = ['owner', 'admin', 'secretary', 'viewer'];
      await expectMatrix((token) => t.request('GET', r.entries, { token }), readers);
      await expectMatrix((token) => t.request('GET', `${r.base}/overview`, { token }), readers);
      await expectMatrix((token) => t.request('GET', `${r.base}/settings`, { token }), readers);
    });

    it('lets only registry managers enter records and search people', async () => {
      const managers: Who[] = ['owner', 'admin', 'secretary'];
      let counter = 0;
      await expectMatrix(
        async (token) => {
          counter += 1;
          return t.request('POST', r.entries, {
            token,
            body: {
              type: 'custom',
              subtype: 'Peneguhan majelis',
              date: '2026-01-11',
              people: [{ name: `Penatua ${counter}`, role: 'subject' }],
            },
          });
        },
        managers,
        201,
      );
      await expectMatrix(
        (token) =>
          t.request('POST', `${r.entries}/preview`, {
            token,
            body: { record: baptism(r.sari.id) },
          }),
        managers,
      );
      await expectMatrix((token) => t.request('GET', `${r.base}/people?q=Bu`, { token }), managers);
      await expectMatrix(
        (token) =>
          t.request('PUT', `${r.entries}/${otherBaptismId}`, {
            token,
            body: { record: baptism(r.budi.id), correctionNote: 'Cek izin' },
          }),
        managers,
      );
    });

    it('reports the module permissions on the status route', async () => {
      const status = await t.request('GET', `${r.base}/status`, { token: r.viewer.token });
      expect(status.status).toBe(200);
      expect(status.json.permissions).toEqual(['records.view']);
      const member = await t.request('GET', `${r.base}/status`, { token: r.s.member.token });
      expect(member.json.permissions).toEqual([]);
    });
  });

  describe('own records', () => {
    it('lets a member open their own record and certificate but no one else’s', async () => {
      const own = await t.request('GET', `${r.entries}/${memberBaptismId}`, {
        token: r.s.member.token,
      });
      expect(own.status).toBe(200);
      expect(own.json.canManage).toBe(false);
      expect(own.json.history).toEqual([]);
      expect(own.json.certificate).toBeDefined();

      const other = await t.request('GET', `${r.entries}/${otherBaptismId}`, {
        token: r.s.member.token,
      });
      expect(other.status).toBe(404);
      const forClerk = await t.request('GET', `${r.entries}/${memberBaptismId}`, {
        token: r.clerk.token,
      });
      expect(forClerk.status).toBe(404);
      const forViewer = await t.request('GET', `${r.entries}/${otherBaptismId}`, {
        token: r.viewer.token,
      });
      expect(forViewer.status).toBe(200);
      // Entered once, then corrected by the owner, the administrator and the secretary above.
      expect(forViewer.json.history).toHaveLength(4);
    });

    it('lists a person’s records for viewers and for the person only', async () => {
      // The member also witnessed a marriage: their own list leaves it out, viewers see it.
      await createRecord(t, r, {
        type: 'marriage',
        date: '2026-06-06',
        people: [
          { personId: r.budi.id, role: 'spouse' },
          { personId: r.sari.id, role: 'spouse' },
          { personId: r.s.memberPerson.id, role: 'witness' },
        ],
      });
      const url = `${r.church}/people/${r.s.memberPerson.id}/records`;
      const mine = await t.request('GET', url, { token: r.s.member.token });
      expect(mine.status).toBe(200);
      expect(
        mine.json.items.map((item: { type: string; role: string }) => [item.type, item.role]),
      ).toEqual([['baptism', 'subject']]);
      const asViewer = await t.request('GET', url, { token: r.viewer.token });
      expect(asViewer.json.items.map((item: { role: string }) => item.role).sort()).toEqual([
        'subject',
        'witness',
      ]);

      const someoneElse = await t.request('GET', `${r.church}/people/${r.budi.id}/records`, {
        token: r.s.member.token,
      });
      expect(someoneElse.status).toBe(404);
      expect(
        (
          await t.request('GET', `${r.church}/people/${r.budi.id}/records`, {
            token: r.clerk.token,
          })
        ).status,
      ).toBe(404);
    });

    it('hides voided records from the person', async () => {
      const voided = await t.request('POST', `${r.entries}/${memberBaptismId}/void`, {
        token: r.s.owner.token,
        body: { reason: 'Contoh pembatalan' },
      });
      expect(voided.status).toBe(200);
      const mine = await t.request('GET', `${r.church}/people/${r.s.memberPerson.id}/records`, {
        token: r.s.member.token,
      });
      expect(mine.json.items).toEqual([]);
      const asOwner = await t.request('GET', `${r.church}/people/${r.s.memberPerson.id}/records`, {
        token: r.s.owner.token,
      });
      expect(
        asOwner.json.items.find((item: { id: string }) => item.id === memberBaptismId).status,
      ).toBe('voided');
    });
  });

  describe('cross-church isolation', () => {
    it('answers 404 for records and people of another church', async () => {
      const foreign = `${r.entries}/${r.outsiderRecordId}`;
      expect((await t.request('GET', foreign, { token: r.s.owner.token })).status).toBe(404);
      expect(
        (
          await t.request('PUT', foreign, {
            token: r.s.owner.token,
            body: {
              record: {
                type: 'sidi',
                date: '2026-04-05',
                people: [{ name: 'X', role: 'subject' }],
              },
              correctionNote: 'Coba ubah',
            },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', `${foreign}/void`, {
            token: r.s.owner.token,
            body: { reason: 'Coba batal' },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', `${r.entries}/preview`, {
            token: r.s.owner.token,
            body: {
              record: {
                type: 'sidi',
                date: '2026-04-05',
                people: [{ name: 'X', role: 'subject' }],
              },
              recordId: r.outsiderRecordId,
            },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', r.entries, {
            token: r.s.owner.token,
            body: baptism(r.outsider.id),
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('POST', r.entries, {
            token: r.s.owner.token,
            body: { ...baptism(r.sari.id), officiantPersonId: r.outsider.id },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await t.request('GET', `${r.church}/people/${r.outsider.id}/records`, {
            token: r.s.owner.token,
          })
        ).status,
      ).toBe(404);
      const search = await t.request('GET', `${r.base}/people?q=Orang`, { token: r.s.owner.token });
      expect(search.json.items).toEqual([]);
      const list = await t.request('GET', `${r.entries}?personId=${r.outsider.id}`, {
        token: r.s.owner.token,
      });
      expect(list.json.items).toEqual([]);
    });

    it('refuses people who are not members of the church', async () => {
      const otherBase = `/api/churches/${r.otherChurch.id}/records`;
      expect(
        (await t.request('GET', `${otherBase}/entries`, { token: r.s.owner.token })).status,
      ).toBe(403);
      expect(
        (
          await t.request('GET', `${otherBase}/entries/${r.outsiderRecordId}`, {
            token: r.s.owner.token,
          })
        ).status,
      ).toBe(403);
      // The other church's own numbering is separate.
      const own = await t.request('GET', `${otherBase}/entries`, { token: r.other.token });
      expect(own.json.items.map((item: { number: string }) => item.number)).toEqual(['S/2026/001']);
    });
  });

  describe('module switch', () => {
    it('answers MODULE_DISABLED on every route while the module is off', async () => {
      const off = await t.request('PATCH', `${r.church}/modules`, {
        token: r.s.owner.token,
        body: { modules: { records: false } },
      });
      expect(off.status).toBe(200);
      for (const [method, path] of [
        ['GET', r.entries],
        ['GET', `${r.entries}/${otherBaptismId}`],
        ['GET', `${r.base}/overview`],
        ['GET', `${r.base}/settings`],
        ['GET', `${r.base}/status`],
        ['GET', `${r.church}/people/${r.s.memberPerson.id}/records`],
      ] as const) {
        const response = await t.request(method, path, { token: r.s.owner.token });
        expect({ path, code: response.json.error?.code }).toEqual({
          path,
          code: 'MODULE_DISABLED',
        });
      }
      const blocked = await t.request('POST', r.entries, {
        token: r.s.owner.token,
        body: baptism(r.sari.id),
      });
      expect(blocked.status).toBe(403);
      await t.request('PATCH', `${r.church}/modules`, {
        token: r.s.owner.token,
        body: { modules: { records: true } },
      });
      expect((await t.request('GET', r.entries, { token: r.s.owner.token })).status).toBe(200);
    });
  });
});
