import { afterAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { auditLogs, calendarFeedTokens } from '../src/db/schema';
import { withoutCredentials } from '../src/modules/admin-security/introspection';
import { newId } from '../src/lib/tokens';
import { createTestApp, seedChurch } from './helpers';

/** Holes found in review: password guessing behind a session, leftovers, unaudited actions. */
describe('admin-security hardening', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('stops guessing the current password through change-password', async () => {
    const account = await t.register('Guesser', 'guesser@example.com', 'right-password-1');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await t.request('POST', '/api/auth/change-password', {
        token: account.token,
        body: { currentPassword: `wrong-${attempt}`, newPassword: 'another-password-2' },
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // Even the right password waits until the window passes.
    const right = await t.request('POST', '/api/auth/change-password', {
      token: account.token,
      body: { currentPassword: 'right-password-1', newPassword: 'another-password-2' },
    });
    expect(right.status).toBe(429);
  });

  it('stops guessing the password through delete church and transfer ownership', async () => {
    const s = await seedChurch(t);
    const base = `/api/churches/${s.church.id}`;
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push(
        (
          await t.request('DELETE', base, {
            token: s.owner.token,
            body: { password: `wrong-${attempt}` },
          })
        ).status,
      );
      statuses.push(
        (
          await t.request('POST', `${base}/transfer-ownership`, {
            token: s.owner.token,
            body: { userId: s.admin.user.id, password: `wrong-${attempt}` },
          })
        ).status,
      );
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    expect((await t.request('GET', base, { token: s.owner.token })).status).toBe(200);
  });

  it('records signing out a single session in the account history', async () => {
    const account = await t.register('Single', 'single@example.com', 'single-password-1');
    const other = await t.request('POST', '/api/auth/login', {
      body: { email: 'single@example.com', password: 'single-password-1' },
    });
    const sessions = await t.request('GET', '/api/auth/sessions', { token: account.token });
    const target = sessions.json.items.find((item: { current: boolean }) => !item.current);
    const revoke = await t.request('DELETE', `/api/auth/sessions/${target.id}`, {
      token: account.token,
    });
    expect(revoke.status).toBe(200);
    expect((await t.request('GET', '/api/auth/me', { token: other.json.token })).status).toBe(401);
    const entries = t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, account.user.id))
      .all();
    expect(entries.map((entry) => entry.action)).toContain('account.session_revoke');
  });

  it('ends private calendar feeds of a member who is removed or leaves', async () => {
    const s = await seedChurch(t);
    const base = `/api/churches/${s.church.id}`;
    const now = new Date().toISOString();
    for (const userId of [s.member.user.id, s.leader.user.id]) {
      t.db
        .insert(calendarFeedTokens)
        .values({ id: newId(), churchId: s.church.id, userId, tokenHash: newId(), createdAt: now })
        .run();
    }
    const feedsOf = (userId: string) =>
      t.db
        .select()
        .from(calendarFeedTokens)
        .where(
          and(eq(calendarFeedTokens.churchId, s.church.id), eq(calendarFeedTokens.userId, userId)),
        )
        .all();
    const members = await t.request('GET', `${base}/members`, { token: s.owner.token });
    const memberId = members.json.items.find(
      (item: { userId: string }) => item.userId === s.member.user.id,
    ).id;
    expect(
      (await t.request('DELETE', `${base}/members/${memberId}`, { token: s.owner.token })).status,
    ).toBe(200);
    expect(feedsOf(s.member.user.id)).toHaveLength(0);
    expect((await t.request('POST', `${base}/leave`, { token: s.leader.token })).status).toBe(200);
    expect(feedsOf(s.leader.user.id)).toHaveLength(0);
  });

  it('leaves check-in pickup codes out of backups and exports', () => {
    const row = withoutCredentials({ id: 'x', securityCode: 'K7Q2', childPersonId: 'p' });
    expect(row).toEqual({ id: 'x', childPersonId: 'p' });
  });
});
