import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  careAudit,
  memberWithRole,
  notificationsOf,
  otherChurch,
  type Member,
} from './care-helpers';
import { createTestApp, seedChurch } from './helpers';

describe('prayer requests', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let base: string;
  let moderator: Member;
  let pastor: Member;
  let careViewer: Member;
  let other: Member;

  const submit = (token: string, body: Record<string, unknown>) =>
    t.request('POST', `${base}/prayer-requests`, { token, body });
  const wall = async (token: string, query = '') => {
    const response = await t.request('GET', `${base}/prayer-requests?scope=wall${query}`, {
      token,
    });
    expect(response.status).toBe(200);
    return response.json.items as { id: string; requesterName: string | null }[];
  };

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}/care`;
    moderator = await memberWithRole(t, s, 'Tim Doa', ['prayer.moderate']);
    pastor = await memberWithRole(t, s, 'Pdt. Lukas', ['care.view', 'care.confidential']);
    careViewer = await memberWithRole(t, s, 'Pnt. Sarah', ['care.view']);
    other = await memberWithRole(t, s, 'Jemaat Lain', []);
  });

  describe('moderation of requests for the whole church', () => {
    let requestId: string;

    beforeAll(async () => {
      const created = await submit(s.member.token, {
        title: 'Kesembuhan ibu saya',
        body: 'Mohon doa untuk ibu yang dirawat karena demam berdarah.',
      });
      expect(created.status).toBe(201);
      expect(created.json.request.moderationStatus).toBe('pending');
      expect(created.json.request.isMine).toBe(true);
      requestId = created.json.request.id;
    });

    it('waits for review before members see it', async () => {
      expect((await wall(other.token)).map((item) => item.id)).not.toContain(requestId);
      const detail = await t.request('GET', `${base}/prayer-requests/${requestId}`, {
        token: other.token,
      });
      expect(detail.status).toBe(404);
      const mine = await t.request('GET', `${base}/prayer-requests?scope=mine`, {
        token: s.member.token,
      });
      expect(mine.json.items.map((item: { id: string }) => item.id)).toEqual([requestId]);
    });

    it('notifies moderators and lists it in their queue', async () => {
      const inbox = await notificationsOf(t, moderator.token);
      expect(
        inbox.some((item) => item.type === 'prayer.submitted' && item.entityId === requestId),
      ).toBe(true);
      // Care managers (the administrator) moderate too.
      const queue = await t.request('GET', `${base}/prayer-requests?scope=moderation`, {
        token: s.admin.token,
      });
      expect(queue.status).toBe(200);
      expect(queue.json.items.map((item: { id: string }) => item.id)).toContain(requestId);
      const denied = await t.request('GET', `${base}/prayer-requests?scope=moderation`, {
        token: careViewer.token,
      });
      expect(denied.status).toBe(403);
    });

    it('only moderators decide, and the requester hears about it', async () => {
      const member = await t.request('POST', `${base}/prayer-requests/${requestId}/moderate`, {
        token: other.token,
        body: { decision: 'approved' },
      });
      expect(member.status).toBe(403);
      const invalid = await t.request('POST', `${base}/prayer-requests/${requestId}/moderate`, {
        token: moderator.token,
        body: { decision: 'maybe' },
      });
      expect(invalid.status).toBe(422);
      const approved = await t.request('POST', `${base}/prayer-requests/${requestId}/moderate`, {
        token: moderator.token,
        body: { decision: 'approved', note: 'Terima kasih' },
      });
      expect(approved.status).toBe(200);
      expect(approved.json.request.moderationStatus).toBe('approved');
      expect((await wall(other.token)).map((item) => item.id)).toContain(requestId);
      const inbox = await notificationsOf(t, s.member.token);
      const notice = inbox.find((item) => item.type === 'prayer.moderated');
      expect(notice?.title).toBe('Pokok doa Anda dibagikan kepada jemaat');
      // Moderation notes are for the requester and moderators only.
      const seen = await t.request('GET', `${base}/prayer-requests/${requestId}`, {
        token: other.token,
      });
      expect(seen.json.request.moderationNote).toBeNull();
      const own = await t.request('GET', `${base}/prayer-requests/${requestId}`, {
        token: s.member.token,
      });
      expect(own.json.request.moderationNote).toBe('Terima kasih');
    });

    it('sends an edited request back for review', async () => {
      const edited = await t.request('PATCH', `${base}/prayer-requests/${requestId}`, {
        token: s.member.token,
        body: {
          title: 'Kesembuhan ibu saya',
          body: 'Ibu sudah keluar dari ICU, mohon terus didoakan.',
        },
      });
      expect(edited.status).toBe(200);
      expect(edited.json.request.moderationStatus).toBe('pending');
      const stranger = await t.request('PATCH', `${base}/prayer-requests/${requestId}`, {
        token: moderator.token,
        body: { title: 'Diubah moderator', body: 'x' },
      });
      expect(stranger.status).toBe(403);
      await t.request('POST', `${base}/prayer-requests/${requestId}/moderate`, {
        token: moderator.token,
        body: { decision: 'approved' },
      });
    });

    it('counts prayers once per tap window and only for shared requests', async () => {
      const first = await t.request('POST', `${base}/prayer-requests/${requestId}/pray`, {
        token: other.token,
      });
      expect(first.status).toBe(200);
      expect(first.json).toEqual({ prayedCount: 1, prayedByMe: true });
      const doubleTap = await t.request('POST', `${base}/prayer-requests/${requestId}/pray`, {
        token: other.token,
      });
      expect(doubleTap.json.prayedCount).toBe(1);
      const second = await t.request('POST', `${base}/prayer-requests/${requestId}/pray`, {
        token: moderator.token,
      });
      expect(second.json.prayedCount).toBe(2);
      const listed = await t.request('GET', `${base}/prayer-requests/${requestId}`, {
        token: other.token,
      });
      expect(listed.json.request.prayedByMe).toBe(true);
      expect(listed.json.request.prayedCount).toBe(2);

      const pending = await submit(s.member.token, { title: 'Belum ditinjau', body: 'Doa' });
      const notShared = await t.request(
        'POST',
        `${base}/prayer-requests/${pending.json.request.id}/pray`,
        { token: moderator.token },
      );
      expect(notShared.status).toBe(409);
    });

    it('marks answered with a testimony and tells those who prayed', async () => {
      const stranger = await t.request('POST', `${base}/prayer-requests/${requestId}/answer`, {
        token: other.token,
        body: { testimony: 'Bukan milik saya' },
      });
      expect(stranger.status).toBe(403);
      const answered = await t.request('POST', `${base}/prayer-requests/${requestId}/answer`, {
        token: s.member.token,
        body: { testimony: 'Puji Tuhan, ibu sudah sembuh dan pulang.' },
      });
      expect(answered.status).toBe(200);
      expect(answered.json.request.answeredAt).not.toBeNull();
      expect(answered.json.request.testimony).toBe('Puji Tuhan, ibu sudah sembuh dan pulang.');
      expect((await wall(other.token)).map((item) => item.id)).not.toContain(requestId);
      const answeredList = await t.request('GET', `${base}/prayer-requests?scope=answered`, {
        token: other.token,
      });
      expect(answeredList.json.items.map((item: { id: string }) => item.id)).toContain(requestId);
      for (const token of [other.token, moderator.token]) {
        const inbox = await notificationsOf(t, token);
        expect(
          inbox.some((item) => item.type === 'prayer.answered' && item.entityId === requestId),
        ).toBe(true);
      }
      const late = await t.request('POST', `${base}/prayer-requests/${requestId}/pray`, {
        token: other.token,
      });
      expect(late.status).toBe(409);
      const reopened = await t.request('DELETE', `${base}/prayer-requests/${requestId}/answer`, {
        token: s.member.token,
      });
      expect(reopened.json.request.answeredAt).toBeNull();
    });

    it('audits moderation without the request text', async () => {
      const entries = await careAudit(t, s, `&entityId=${requestId}`);
      const actions = entries.map((entry) => entry.action);
      expect(actions).toContain('prayer_request.create');
      expect(actions).toContain('prayer_request.approve');
      expect(actions).toContain('prayer_request.answer');
      expect(JSON.stringify(entries)).not.toContain('demam berdarah');
      expect(JSON.stringify(entries)).not.toContain('sudah sembuh');
    });
  });

  it('publishes requests from moderators at once', async () => {
    const created = await submit(moderator.token, {
      title: 'Ibadah Natal',
      body: 'Doakan panitia',
    });
    expect(created.json.request.moderationStatus).toBe('approved');
    expect((await wall(s.member.token)).map((item) => item.id)).toContain(created.json.request.id);
  });

  it('keeps rejected requests off the wall', async () => {
    const created = await submit(s.member.token, { title: 'Tidak pantas', body: 'Iklan jualan' });
    const id = created.json.request.id;
    await t.request('POST', `${base}/prayer-requests/${id}/moderate`, {
      token: moderator.token,
      body: { decision: 'rejected', note: 'Bukan pokok doa' },
    });
    expect((await wall(other.token)).map((item) => item.id)).not.toContain(id);
    const own = await t.request('GET', `${base}/prayer-requests/${id}`, { token: s.member.token });
    expect(own.json.request.moderationStatus).toBe('rejected');
  });

  it('shows care-team and pastors-only requests only to them', async () => {
    const team = await submit(s.member.token, {
      title: 'Masalah keluarga',
      body: 'Hanya untuk tim pastoral',
      visibility: 'care_team',
    });
    const pastors = await submit(s.member.token, {
      title: 'Pergumulan pribadi',
      body: 'Hanya untuk pendeta',
      visibility: 'pastors',
    });
    const teamId = team.json.request.id;
    const pastorsId = pastors.json.request.id;
    expect(team.json.request.moderationStatus).toBe('approved');

    expect((await wall(other.token)).map((item) => item.id)).not.toContain(teamId);
    const viewerWall = (await wall(careViewer.token)).map((item) => item.id);
    expect(viewerWall).toContain(teamId);
    expect(viewerWall).not.toContain(pastorsId);
    // Administrators without care.confidential do not see pastors-only requests.
    expect((await wall(s.admin.token)).map((item) => item.id)).not.toContain(pastorsId);
    expect(
      (await t.request('GET', `${base}/prayer-requests/${pastorsId}`, { token: s.admin.token }))
        .status,
    ).toBe(404);
    expect((await wall(pastor.token)).map((item) => item.id)).toContain(pastorsId);
    expect((await wall(s.owner.token)).map((item) => item.id)).toContain(pastorsId);

    // Pastors are told without the text; the care team gets the title.
    const pastorInbox = await notificationsOf(t, pastor.token);
    const pastorNotice = pastorInbox.find((item) => item.entityId === pastorsId);
    expect(pastorNotice?.body).toBeNull();
    const viewerInbox = await notificationsOf(t, careViewer.token);
    expect(viewerInbox.some((item) => item.entityId === pastorsId)).toBe(false);
    expect(viewerInbox.find((item) => item.entityId === teamId)?.body).toBe('Masalah keluarga');

    // Private requests are not moderated.
    const moderate = await t.request('POST', `${base}/prayer-requests/${teamId}/moderate`, {
      token: s.owner.token,
      body: { decision: 'rejected' },
    });
    expect(moderate.status).toBe(409);
  });

  it('hides the requester of anonymous requests from everyone but moderators', async () => {
    const created = await submit(moderator.token, {
      title: 'Pekerjaan baru',
      body: 'Sedang mencari pekerjaan',
      isAnonymous: true,
    });
    const id = created.json.request.id;
    const seen = await t.request('GET', `${base}/prayer-requests/${id}`, { token: other.token });
    expect(seen.json.request.requesterName).toBeNull();
    expect(seen.json.request.isMine).toBe(false);
    const own = await t.request('GET', `${base}/prayer-requests/${id}`, { token: moderator.token });
    expect(own.json.request.requesterName).toBe('Tim Doa');
    const admin = await t.request('GET', `${base}/prayer-requests/${id}`, { token: s.admin.token });
    expect(admin.json.request.requesterName).toBe('Tim Doa');
    // The requester's own linked person name is used when there is one.
    const named = await submit(s.member.token, { title: 'Studi anak', body: 'Ujian masuk' });
    expect(named.json.request.requesterName).toBe('Mem Ber');
  });

  it('validates input and lets requesters and moderators delete', async () => {
    const invalid = await submit(s.member.token, { title: 'x', body: '', visibility: 'world' });
    expect(invalid.status).toBe(422);
    const paths = invalid.json.error.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['title', 'body', 'visibility']));

    const created = await submit(s.member.token, { title: 'Hapus saya', body: 'Doa' });
    const id = created.json.request.id;
    const stranger = await t.request('DELETE', `${base}/prayer-requests/${id}`, {
      token: other.token,
    });
    expect(stranger.status).toBe(404);
    const removed = await t.request('DELETE', `${base}/prayer-requests/${id}`, {
      token: moderator.token,
    });
    expect(removed.status).toBe(200);
    const audit = await careAudit(t, s, `&entityId=${id}`);
    expect(audit[0]?.summary).toBe('Deleted a prayer request');
  });

  it('lets every member submit (prayer.submit is a member default)', async () => {
    const created = await submit(other.token, { title: 'Doa pagi', body: 'Doakan hari ini' });
    expect(created.status).toBe(201);
    expect(created.json.request.canModerate).toBe(false);
  });

  it('answers 404 across churches', async () => {
    const foreign = await otherChurch(t);
    const created = await t.request('POST', `${foreign.base}/prayer-requests`, {
      token: foreign.owner.token,
      body: { title: 'Gereja lain', body: 'Doa' },
    });
    const id = created.json.request.id;
    for (const [method, path] of [
      ['GET', ''],
      ['POST', '/pray'],
      ['POST', '/answer'],
      ['DELETE', ''],
    ] as const) {
      const response = await t.request(method, `${base}/prayer-requests/${id}${path}`, {
        token: s.owner.token,
        body: method === 'POST' ? {} : undefined,
      });
      expect(response.status).toBe(404);
    }
    const moderate = await t.request('POST', `${base}/prayer-requests/${id}/moderate`, {
      token: s.owner.token,
      body: { decision: 'rejected' },
    });
    expect(moderate.status).toBe(404);
  });
});
