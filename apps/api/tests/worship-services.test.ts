import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from './helpers';
import { createService, inDays, seedWorship, type WorshipSeed } from './worship-fixtures';

describe('worship services, liturgy and songs', () => {
  const t = createTestApp();
  let w: WorshipSeed;
  beforeAll(async () => {
    w = await seedWorship(t);
  });
  afterAll(() => t.close());

  const auditActions = async () => {
    const response = await t.request('GET', `${w.church}/audit-logs?module=worship&limit=200`, {
      token: w.s.owner.token,
    });
    expect(response.status).toBe(200);
    return (response.json.items as { action: string }[]).map((item) => item.action);
  };

  describe('service types and setup', () => {
    it('adds the suggested service types and teams once', async () => {
      const denied = await t.request('POST', `${w.base}/setup`, { token: w.scheduler.token });
      expect(denied.status).toBe(403);

      const first = await t.request('POST', `${w.base}/setup`, { token: w.planner.token });
      expect(first.status).toBe(200);
      expect(first.json).toEqual({ serviceTypes: 7, teams: 6 });
      const again = await t.request('POST', `${w.base}/setup`, { token: w.planner.token });
      expect(again.json).toEqual({ serviceTypes: 0, teams: 0 });

      const types = await t.request('GET', `${w.base}/service-types`, { token: w.s.member.token });
      expect(types.status).toBe(200);
      expect(types.json.items.map((item: { name: string }) => item.name)).toContain(
        'Ibadah Pemuda',
      );
      const teams = await t.request('GET', `${w.base}/teams`, { token: w.s.member.token });
      const musicians = teams.json.items.find((team: { name: string }) => team.name === 'Pemusik');
      expect(musicians.positions.map((p: { name: string }) => p.name)).toEqual([
        'Pianis / Organis',
        'Gitar',
        'Bass',
        'Drum',
      ]);
      expect(await auditActions()).toContain('worship.setup');
    });

    it('manages service types with the services.manage permission only', async () => {
      const body = {
        name: 'Ibadah Natal',
        category: 'holy_day',
        defaultTime: '18:00',
        defaultDurationMinutes: 150,
      };
      const member = await t.request('POST', `${w.base}/service-types`, {
        token: w.s.member.token,
        body,
      });
      expect(member.status).toBe(403);
      const scheduler = await t.request('POST', `${w.base}/service-types`, {
        token: w.scheduler.token,
        body,
      });
      expect(scheduler.status).toBe(403);
      const created = await t.request('POST', `${w.base}/service-types`, {
        token: w.planner.token,
        body,
      });
      expect(created.status).toBe(201);
      expect(created.json.serviceType).toMatchObject({
        category: 'holy_day',
        defaultTime: '18:00',
      });

      const duplicate = await t.request('POST', `${w.base}/service-types`, {
        token: w.s.admin.token,
        body,
      });
      expect(duplicate.status).toBe(409);
      const badTime = await t.request('POST', `${w.base}/service-types`, {
        token: w.s.admin.token,
        body: { ...body, name: 'Ibadah Paskah', defaultTime: '25:00' },
      });
      expect(badTime.status).toBe(422);
      expect(badTime.json.error.issues[0].path).toBe('defaultTime');

      const id = created.json.serviceType.id;
      const updated = await t.request('PATCH', `${w.base}/service-types/${id}`, {
        token: w.planner.token,
        body: { ...body, name: 'Ibadah Malam Natal' },
      });
      expect(updated.status).toBe(200);
      expect(updated.json.serviceType.name).toBe('Ibadah Malam Natal');
      const removed = await t.request('DELETE', `${w.base}/service-types/${id}`, {
        token: w.planner.token,
      });
      expect(removed.status).toBe(200);
      const actions = await auditActions();
      expect(actions).toEqual(
        expect.arrayContaining([
          'service_type.create',
          'service_type.update',
          'service_type.delete',
        ]),
      );
    });
  });

  describe('services', () => {
    let serviceId = '';

    it('plans a service with readings and a preacher', async () => {
      const types = await t.request('GET', `${w.base}/service-types`, { token: w.planner.token });
      const typeId = types.json.items[0].id;
      const created = await t.request('POST', `${w.base}/services`, {
        token: w.planner.token,
        body: {
          serviceTypeId: typeId,
          title: 'Ibadah Minggu Adven I',
          startsAt: inDays(4, 0),
          endsAt: inDays(4, 2),
          location: 'Gedung Gereja',
          theme: 'Bersiaplah menyambut Dia',
          scriptureReadings: ['Yesaya 40:1-11', 'Markus 1:1-8'],
          preacherPersonId: w.plannerPerson.id,
          preacherName: 'ignored',
          status: 'published',
        },
      });
      expect(created.status).toBe(201);
      const service = created.json.service;
      serviceId = service.id;
      expect(service.serviceTypeName).toBe(types.json.items[0].name);
      expect(service.preacher.firstName).toBe('Pdt. Samuel');
      expect(service.preacherName).toBeNull();
      expect(service.scriptureReadings).toHaveLength(2);
      expect(service.totalMinutes).toBe(0);

      const guest = await t.request('POST', `${w.base}/services`, {
        token: w.planner.token,
        body: { title: 'Ibadah Pemuda', startsAt: inDays(5), preacherName: 'Pdt. Tamu' },
      });
      expect(guest.status).toBe(201);
      expect(guest.json.service).toMatchObject({ preacherName: 'Pdt. Tamu', status: 'draft' });
    });

    it('validates the input', async () => {
      const backwards = await t.request('POST', `${w.base}/services`, {
        token: w.planner.token,
        body: { title: 'Bad', startsAt: inDays(3, 10), endsAt: inDays(3, 8) },
      });
      expect(backwards.status).toBe(422);
      expect(backwards.json.error.issues[0].path).toBe('endsAt');
      const noTitle = await t.request('POST', `${w.base}/services`, {
        token: w.planner.token,
        body: { title: '', startsAt: inDays(3) },
      });
      expect(noTitle.status).toBe(422);
      const tooMany = await t.request('POST', `${w.base}/services`, {
        token: w.planner.token,
        body: {
          title: 'Many readings',
          startsAt: inDays(3),
          scriptureReadings: Array.from({ length: 11 }, (_, i) => `Mazmur ${i + 1}`),
        },
      });
      expect(tooMany.status).toBe(422);
    });

    it('enforces the permission matrix for planning', async () => {
      const body = { title: 'Ibadah Doa', startsAt: inDays(6) };
      for (const token of [w.s.member.token, w.s.leader.token, w.scheduler.token]) {
        const denied = await t.request('POST', `${w.base}/services`, { token, body });
        expect(denied.status).toBe(403);
      }
      for (const token of [w.s.owner.token, w.s.admin.token, w.planner.token]) {
        const allowed = await t.request('POST', `${w.base}/services`, { token, body });
        expect(allowed.status).toBe(201);
      }
      const edit = await t.request('PATCH', `${w.base}/services/${serviceId}`, {
        token: w.s.member.token,
        body: { title: 'Hijack', startsAt: inDays(4) },
      });
      expect(edit.status).toBe(403);
    });

    it('hides drafts from plain members and lists by scope', async () => {
      const draft = await createService(t, w, { title: 'Draf Ibadah', status: 'draft' });
      const past = await createService(t, w, { title: 'Ibadah Lalu', startsAt: inDays(-7) });

      const asMember = await t.request('GET', `${w.base}/services`, { token: w.s.member.token });
      expect(asMember.status).toBe(200);
      const memberTitles = asMember.json.items.map((item: { title: string }) => item.title);
      expect(memberTitles).not.toContain('Draf Ibadah');
      expect(memberTitles).toContain('Ibadah Minggu Adven I');
      expect(
        (await t.request('GET', `${w.base}/services/${draft}`, { token: w.s.member.token })).status,
      ).toBe(404);

      const asScheduler = await t.request('GET', `${w.base}/services?q=Draf`, {
        token: w.scheduler.token,
      });
      expect(asScheduler.json.items.map((item: { id: string }) => item.id)).toEqual([draft]);

      const pastList = await t.request('GET', `${w.base}/services?scope=past`, {
        token: w.s.member.token,
      });
      expect(pastList.json.items.map((item: { id: string }) => item.id)).toEqual([past]);

      const upcoming = await t.request('GET', `${w.base}/services?limit=2`, {
        token: w.s.owner.token,
      });
      expect(upcoming.json.items).toHaveLength(2);
      expect(upcoming.json.total).toBeGreaterThan(2);
      const starts = upcoming.json.items.map((item: { startsAt: string }) => item.startsAt);
      expect([...starts].sort()).toEqual(starts);

      const published = await t.request('GET', `${w.base}/services?status=draft&scope=all`, {
        token: w.s.owner.token,
      });
      expect(
        published.json.items.every((item: { status: string }) => item.status === 'draft'),
      ).toBe(true);
    });

    it('saves and reorders the liturgy with durations', async () => {
      const song = await t.request('POST', `${w.base}/songs`, {
        token: w.planner.token,
        body: { title: 'Haleluya, Pujilah', hymnal: 'KJ', hymnalNumber: '1', defaultKey: 'G' },
      });
      expect(song.status).toBe(201);
      const items = [
        {
          type: 'song',
          title: 'Nyanyian Pembuka',
          durationMinutes: 5,
          songId: song.json.song.id,
          songKey: 'G',
        },
        { type: 'prayer', title: 'Votum dan Salam', durationMinutes: 3, personName: 'Liturgos' },
        {
          type: 'reading',
          title: 'Pembacaan Alkitab',
          durationMinutes: 7,
          personId: w.leadPerson.id,
        },
        { type: 'sermon', title: 'Khotbah', durationMinutes: 30, personId: w.plannerPerson.id },
        { type: 'offering', title: 'Persembahan', durationMinutes: 10 },
        { type: 'announcement', title: 'Warta Jemaat' },
      ];
      const denied = await t.request('PUT', `${w.base}/services/${serviceId}/liturgy`, {
        token: w.scheduler.token,
        body: { items },
      });
      expect(denied.status).toBe(403);
      const saved = await t.request('PUT', `${w.base}/services/${serviceId}/liturgy`, {
        token: w.planner.token,
        body: { items },
      });
      expect(saved.status).toBe(200);
      expect(saved.json.totalMinutes).toBe(55);
      expect(saved.json.items[0]).toMatchObject({ songTitle: 'Haleluya, Pujilah', songKey: 'G' });
      expect(saved.json.items[2].person.firstName).toBe('Yohanes');

      const ids = saved.json.items.map((item: { id: string }) => item.id);
      const reversed = [...ids].reverse();
      const reordered = await t.request('POST', `${w.base}/services/${serviceId}/liturgy/reorder`, {
        token: w.planner.token,
        body: { itemIds: reversed },
      });
      expect(reordered.status).toBe(200);
      expect(reordered.json.items.map((item: { id: string }) => item.id)).toEqual(reversed);
      const partial = await t.request('POST', `${w.base}/services/${serviceId}/liturgy/reorder`, {
        token: w.planner.token,
        body: { itemIds: reversed.slice(1) },
      });
      expect(partial.status).toBe(400);

      const detail = await t.request('GET', `${w.base}/services/${serviceId}`, {
        token: w.s.member.token,
      });
      expect(detail.status).toBe(200);
      expect(detail.json.service.totalMinutes).toBe(55);
      expect(detail.json.liturgy).toHaveLength(6);
      expect(detail.json.canManage).toBe(false);
      expect(detail.json.schedulableTeamIds).toEqual([]);

      const badType = await t.request('PUT', `${w.base}/services/${serviceId}/liturgy`, {
        token: w.planner.token,
        body: { items: [{ type: 'dance', title: 'Nope' }] },
      });
      expect(badType.status).toBe(422);
      expect(await auditActions()).toContain('liturgy.update');
    });

    it('cancels a service and records it', async () => {
      const id = await createService(t, w, { title: 'Ibadah Batal' });
      const cancelled = await t.request('PATCH', `${w.base}/services/${id}`, {
        token: w.planner.token,
        body: { title: 'Ibadah Batal', startsAt: inDays(3), status: 'cancelled' },
      });
      expect(cancelled.status).toBe(200);
      expect(cancelled.json.service.status).toBe('cancelled');
      expect(await auditActions()).toContain('service.cancel');
      const removed = await t.request('DELETE', `${w.base}/services/${id}`, {
        token: w.planner.token,
      });
      expect(removed.status).toBe(200);
      expect(
        (await t.request('GET', `${w.base}/services/${id}`, { token: w.planner.token })).status,
      ).toBe(404);
      expect(await auditActions()).toContain('service.delete');
    });
  });

  describe('song library', () => {
    it('stores songs and searches by hymnal number, tag and text', async () => {
      const make = (body: Record<string, unknown>) =>
        t.request('POST', `${w.base}/songs`, { token: w.planner.token, body });
      expect(
        (
          await make({
            title: 'Bapa, Engkau Sungguh Baik',
            author: 'Ir. Ruby Ndoen',
            tags: ['pujian', 'syukur', 'pujian'],
            tempo: 72,
            lyrics: 'Bapa, Engkau sungguh baik, kasih-Mu melimpah di hidupku',
          })
        ).json.song.tags,
      ).toEqual(['pujian', 'syukur']);
      await make({ title: 'Ku Berbahagia', hymnal: 'KJ', hymnalNumber: '392', tags: ['syukur'] });
      await make({ title: 'Tuhan, Kasihani', hymnal: 'PKJ', hymnalNumber: '173', tags: ['doa'] });

      const byNumber = await t.request('GET', `${w.base}/songs?q=kj%20392`, {
        token: w.s.member.token,
      });
      expect(byNumber.status).toBe(200);
      expect(byNumber.json.items.map((item: { title: string }) => item.title)).toEqual([
        'Ku Berbahagia',
      ]);
      const byTag = await t.request('GET', `${w.base}/songs?tag=syukur`, {
        token: w.s.member.token,
      });
      expect(byTag.json.total).toBe(2);
      const byLyrics = await t.request('GET', `${w.base}/songs?q=melimpah`, {
        token: w.s.member.token,
      });
      expect(byLyrics.json.items[0].title).toBe('Bapa, Engkau Sungguh Baik');
      const byHymnal = await t.request('GET', `${w.base}/songs?hymnal=PKJ`, {
        token: w.s.member.token,
      });
      expect(byHymnal.json.items.map((item: { title: string }) => item.title)).toEqual([
        'Tuhan, Kasihani',
      ]);
      const tags = await t.request('GET', `${w.base}/songs/tags`, { token: w.s.member.token });
      expect(tags.json.items[0]).toEqual({ tag: 'syukur', count: 2 });

      const member = await t.request('POST', `${w.base}/songs`, {
        token: w.s.member.token,
        body: { title: 'Nope' },
      });
      expect(member.status).toBe(403);
      const badTempo = await make({ title: 'Too fast', tempo: 999 });
      expect(badTempo.status).toBe(422);
    });

    it('tracks usage and the last time a song was sung', async () => {
      const song = (
        await t.request('POST', `${w.base}/songs`, {
          token: w.planner.token,
          body: { title: 'Kami Puji Dengan Riang', hymnal: 'KJ', hymnalNumber: '3' },
        })
      ).json.song;
      expect(song).toMatchObject({ lastUsedAt: null, useCount: 0 });
      const lastWeek = await createService(t, w, { title: 'Minggu lalu', startsAt: inDays(-7) });
      const twoWeeks = await createService(t, w, { title: 'Dua minggu', startsAt: inDays(-14) });
      const next = await createService(t, w, { title: 'Minggu depan', startsAt: inDays(7) });
      for (const id of [lastWeek, twoWeeks, next]) {
        const saved = await t.request('PUT', `${w.base}/services/${id}/liturgy`, {
          token: w.planner.token,
          body: { items: [{ type: 'song', title: song.title, songId: song.id }] },
        });
        expect(saved.status).toBe(200);
      }
      const detail = await t.request('GET', `${w.base}/songs/${song.id}`, {
        token: w.s.member.token,
      });
      expect(detail.status).toBe(200);
      expect(detail.json.song.useCount).toBe(2);
      expect(detail.json.song.lastUsedAt.slice(0, 10)).toBe(inDays(-7).slice(0, 10));
      expect(detail.json.usage.map((item: { serviceId: string }) => item.serviceId)).toEqual([
        next,
        lastWeek,
        twoWeeks,
      ]);

      const byLastUsed = await t.request('GET', `${w.base}/songs?sort=last_used&limit=1`, {
        token: w.s.member.token,
      });
      expect(byLastUsed.json.items[0].id).toBe(song.id);
      const byMostUsed = await t.request('GET', `${w.base}/songs?sort=most_used&limit=1`, {
        token: w.s.member.token,
      });
      expect(byMostUsed.json.items[0].id).toBe(song.id);

      const removed = await t.request('DELETE', `${w.base}/songs/${song.id}`, {
        token: w.planner.token,
      });
      expect(removed.status).toBe(200);
      const liturgy = await t.request('GET', `${w.base}/services/${lastWeek}`, {
        token: w.planner.token,
      });
      expect(liturgy.json.liturgy[0]).toMatchObject({
        songId: null,
        title: 'Kami Puji Dengan Riang',
      });
      expect(await auditActions()).toContain('song.delete');
    });
  });

  describe('isolation', () => {
    it('answers 404 for ids from another church', async () => {
      const otherOwner = await t.register('Other Owner');
      const other = await t.createChurch(otherOwner.token, 'GKI Lain');
      const otherBase = `/api/churches/${other.id}/worship`;
      const foreignService = (
        await t.request('POST', `${otherBase}/services`, {
          token: otherOwner.token,
          body: { title: 'Ibadah Lain', startsAt: inDays(2) },
        })
      ).json.service.id;
      const foreignSong = (
        await t.request('POST', `${otherBase}/songs`, {
          token: otherOwner.token,
          body: { title: 'Lagu Lain' },
        })
      ).json.song.id;
      const foreignType = (
        await t.request('POST', `${otherBase}/service-types`, {
          token: otherOwner.token,
          body: { name: 'Tipe Lain' },
        })
      ).json.serviceType.id;
      const foreignPerson = await t.createPerson(otherOwner.token, other.id, { firstName: 'Lain' });

      const token = w.s.owner.token;
      expect(
        (await t.request('GET', `${w.base}/services/${foreignService}`, { token })).status,
      ).toBe(404);
      expect(
        (
          await t.request('PATCH', `${w.base}/services/${foreignService}`, {
            token,
            body: { title: 'Hijack', startsAt: inDays(2) },
          })
        ).status,
      ).toBe(404);
      expect(
        (await t.request('DELETE', `${w.base}/services/${foreignService}`, { token })).status,
      ).toBe(404);
      expect((await t.request('GET', `${w.base}/songs/${foreignSong}`, { token })).status).toBe(
        404,
      );
      expect((await t.request('DELETE', `${w.base}/songs/${foreignSong}`, { token })).status).toBe(
        404,
      );
      expect(
        (await t.request('DELETE', `${w.base}/service-types/${foreignType}`, { token })).status,
      ).toBe(404);

      const own = await createService(t, w, { title: 'Milik sendiri' });
      const withForeignSong = await t.request('PUT', `${w.base}/services/${own}/liturgy`, {
        token,
        body: { items: [{ type: 'song', title: 'x', songId: foreignSong }] },
      });
      expect(withForeignSong.status).toBe(404);
      const withForeignPerson = await t.request('PUT', `${w.base}/services/${own}/liturgy`, {
        token,
        body: { items: [{ type: 'sermon', title: 'x', personId: foreignPerson.id }] },
      });
      expect(withForeignPerson.status).toBe(404);
      const foreignPreacher = await t.request('POST', `${w.base}/services`, {
        token,
        body: { title: 'xx', startsAt: inDays(2), preacherPersonId: foreignPerson.id },
      });
      expect(foreignPreacher.status).toBe(404);
      const foreignTypeRef = await t.request('POST', `${w.base}/services`, {
        token,
        body: { title: 'xx', startsAt: inDays(2), serviceTypeId: foreignType },
      });
      expect(foreignTypeRef.status).toBe(404);

      // Not a member of the other church at all.
      expect((await t.request('GET', `${otherBase}/services`, { token })).status).toBe(403);
    });

    it('answers 403 MODULE_DISABLED when the church turns worship off', async () => {
      const owner = await t.register('Switch Owner');
      const church = await t.createChurch(owner.token, 'GKI Tanpa Ibadah');
      const off = await t.request('PATCH', `/api/churches/${church.id}/modules`, {
        token: owner.token,
        body: { modules: { worship: false } },
      });
      expect(off.status).toBe(200);
      for (const path of [
        '/services',
        '/songs',
        '/teams',
        '/me/schedule',
        '/overview',
        '/status',
      ]) {
        const response = await t.request('GET', `/api/churches/${church.id}/worship${path}`, {
          token: owner.token,
        });
        expect(response.status).toBe(403);
        expect(response.json.error.code).toBe('MODULE_DISABLED');
      }
    });
  });
});
