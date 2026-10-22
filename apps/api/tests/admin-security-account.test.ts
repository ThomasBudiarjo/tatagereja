import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createRateLimiter } from '../src/lib/rate-limit';
import { userTwoFactor, users } from '../src/db/schema';
import { base32Decode, base32Encode, hotp, totpCode } from '../src/modules/admin-security/totp';
import { createTestApp } from './helpers';

type TestApp = ReturnType<typeof createTestApp>;

/** A code for the current step; the replay guard is reset so tests can use one per step. */
const freshCode = (t: TestApp, userId: string, secret: string) => {
  t.db
    .update(userTwoFactor)
    .set({ lastUsedStep: null })
    .where(eq(userTwoFactor.userId, userId))
    .run();
  return totpCode(secret);
};

/** Turns 2FA on for an account and returns its secret and recovery codes. */
async function enableTwoFactor(
  t: TestApp,
  account: { token: string; password: string; user: { id: string } },
) {
  const setup = await t.request('POST', '/api/auth/two-factor/setup', {
    token: account.token,
    body: { password: account.password },
  });
  expect(setup.status).toBe(200);
  const secret = setup.json.secret as string;
  const enable = await t.request('POST', '/api/auth/two-factor/enable', {
    token: account.token,
    body: { code: totpCode(secret) },
  });
  expect(enable.status).toBe(200);
  return { secret, recoveryCodes: enable.json.recoveryCodes as string[] };
}

const notificationsOf = async (t: TestApp, token: string) =>
  (await t.request('GET', '/api/notifications?limit=50', { token })).json.items as {
    type: string;
    title: string;
    churchId: string | null;
  }[];

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC 4226 and RFC 6238 test vectors', () => {
    const rfcSecret = Buffer.from('12345678901234567890');
    expect(hotp(rfcSecret, 0)).toBe('755224');
    expect(hotp(rfcSecret, 9)).toBe('520489');
    // RFC 6238 appendix B, SHA-1, T = 59 s → 94287082 (8 digits).
    expect(hotp(rfcSecret, 1, 8)).toBe('94287082');
    const encoded = base32Encode(rfcSecret);
    expect(encoded).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(encoded).equals(rfcSecret)).toBe(true);
    expect(totpCode(encoded, 59_000)).toBe('287082');
  });
});

describe('two-step verification', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let account: Awaited<ReturnType<TestApp['register']>>;
  let secret = '';
  let recoveryCodes: string[] = [];

  beforeAll(async () => {
    account = await t.register('Yohana Sitompul', 'yohana@example.com', 'Kasih-Setia 2026!');
  });

  it('starts off and requires the password to begin setup', async () => {
    const status = await t.request('GET', '/api/auth/two-factor', { token: account.token });
    expect(status.status).toBe(200);
    expect(status.json).toMatchObject({ enabled: false, recoveryCodesRemaining: 0 });

    const wrong = await t.request('POST', '/api/auth/two-factor/setup', {
      token: account.token,
      body: { password: 'not-my-password' },
    });
    expect(wrong.status).toBe(422);
    expect(wrong.json.error.issues[0].path).toBe('password');
    expect(
      (await t.request('POST', '/api/auth/two-factor/setup', { body: { password: 'x' } })).status,
    ).toBe(401);
  });

  it('enables with a valid code, stores the secret encrypted and shows recovery codes once', async () => {
    const setup = await t.request('POST', '/api/auth/two-factor/setup', {
      token: account.token,
      body: { password: account.password },
    });
    expect(setup.status).toBe(200);
    secret = setup.json.secret;
    expect(setup.json.otpauthUrl).toStartWith('otpauth://totp/');
    expect(setup.json.otpauthUrl).toContain(`secret=${secret}`);

    const stored = t.db
      .select()
      .from(userTwoFactor)
      .where(eq(userTwoFactor.userId, account.user.id))
      .get();
    expect(stored?.secretEncrypted).toStartWith('v1:');
    expect(stored?.secretEncrypted).not.toContain(secret);
    expect(stored?.enabledAt).toBeNull();

    const badCode = await t.request('POST', '/api/auth/two-factor/enable', {
      token: account.token,
      body: { code: '000000' === totpCode(secret) ? '111111' : '000000' },
    });
    expect(badCode.status).toBe(422);
    expect(badCode.json.error.issues[0].path).toBe('code');
    const malformed = await t.request('POST', '/api/auth/two-factor/enable', {
      token: account.token,
      body: { code: '12ab' },
    });
    expect(malformed.status).toBe(422);

    const enable = await t.request('POST', '/api/auth/two-factor/enable', {
      token: account.token,
      body: { code: totpCode(secret) },
    });
    expect(enable.status).toBe(200);
    recoveryCodes = enable.json.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
    for (const code of recoveryCodes) expect(code).toMatch(/^[A-Z2-9]{10}$/);

    const status = await t.request('GET', '/api/auth/two-factor', { token: account.token });
    expect(status.json).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 });

    const again = await t.request('POST', '/api/auth/two-factor/setup', {
      token: account.token,
      body: { password: account.password },
    });
    expect(again.status).toBe(409);

    const notices = await notificationsOf(t, account.token);
    expect(notices.some((notice) => notice.type === 'account.two_factor_changed')).toBe(true);
  });

  it('asks for a second step at sign-in and accepts a valid code', async () => {
    const login = await t.request('POST', '/api/auth/login', {
      body: { email: 'yohana@example.com', password: account.password },
    });
    expect(login.status).toBe(200);
    expect(login.json.twoFactorRequired).toBe(true);
    expect(login.json.token).toBeUndefined();
    expect(typeof login.json.challengeToken).toBe('string');

    const wrong = await t.request('POST', '/api/auth/login/two-factor', {
      body: {
        challengeToken: login.json.challengeToken,
        code: totpCode(secret) === '123456' ? '654321' : '123456',
      },
    });
    expect(wrong.status).toBe(401);
    expect(wrong.json.error.code).toBe('TWO_FACTOR_INVALID');

    const ok = await t.request('POST', '/api/auth/login/two-factor', {
      body: {
        challengeToken: login.json.challengeToken,
        code: freshCode(t, account.user.id, secret),
      },
    });
    expect(ok.status).toBe(200);
    expect(typeof ok.json.token).toBe('string');
    expect((await t.request('GET', '/api/auth/me', { token: ok.json.token })).status).toBe(200);

    // A challenge works once.
    const reuse = await t.request('POST', '/api/auth/login/two-factor', {
      body: {
        challengeToken: login.json.challengeToken,
        code: freshCode(t, account.user.id, secret),
      },
    });
    expect(reuse.status).toBe(401);
    expect(reuse.json.error.code).toBe('TWO_FACTOR_INVALID');
  });

  it('refuses a code replayed inside its time window', async () => {
    const code = freshCode(t, account.user.id, secret);
    const first = await t.request('POST', '/api/auth/login', {
      body: { email: 'yohana@example.com', password: account.password },
    });
    expect(
      (
        await t.request('POST', '/api/auth/login/two-factor', {
          body: { challengeToken: first.json.challengeToken, code },
        })
      ).status,
    ).toBe(200);
    const second = await t.request('POST', '/api/auth/login', {
      body: { email: 'yohana@example.com', password: account.password },
    });
    const replay = await t.request('POST', '/api/auth/login/two-factor', {
      body: { challengeToken: second.json.challengeToken, code },
    });
    expect(replay.status).toBe(401);
  });

  it('accepts each recovery code once and warns the owner', async () => {
    const login = await t.request('POST', '/api/auth/login', {
      body: { email: 'yohana@example.com', password: account.password },
    });
    const code = recoveryCodes[0] ?? '';
    const ok = await t.request('POST', '/api/auth/login/two-factor', {
      body: {
        challengeToken: login.json.challengeToken,
        recoveryCode: `${code.slice(0, 5)}-${code.slice(5).toLowerCase()}`,
      },
    });
    expect(ok.status).toBe(200);
    const status = await t.request('GET', '/api/auth/two-factor', { token: account.token });
    expect(status.json.recoveryCodesRemaining).toBe(9);

    const again = await t.request('POST', '/api/auth/login', {
      body: { email: 'yohana@example.com', password: account.password },
    });
    const reused = await t.request('POST', '/api/auth/login/two-factor', {
      body: { challengeToken: again.json.challengeToken, recoveryCode: code },
    });
    expect(reused.status).toBe(401);

    const both = await t.request('POST', '/api/auth/login/two-factor', {
      body: { challengeToken: again.json.challengeToken, code: '123456', recoveryCode: code },
    });
    expect(both.status).toBe(422);
    const notices = await notificationsOf(t, account.token);
    expect(notices.some((notice) => notice.title.includes('recovery code'))).toBe(true);
  });

  it('ends a challenge after five wrong codes', async () => {
    const login = await t.request('POST', '/api/auth/login', {
      body: { email: 'yohana@example.com', password: account.password },
    });
    const wrongCode = totpCode(secret) === '000000' ? '999999' : '000000';
    const statuses: string[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await t.request('POST', '/api/auth/login/two-factor', {
        body: { challengeToken: login.json.challengeToken, code: wrongCode },
      });
      statuses.push(response.json.error.code);
    }
    expect(
      statuses.every((code) => code === 'TWO_FACTOR_INVALID' || code === 'ACCOUNT_LOCKED'),
    ).toBe(true);
    const valid = await t.request('POST', '/api/auth/login/two-factor', {
      body: {
        challengeToken: login.json.challengeToken,
        code: freshCode(t, account.user.id, secret),
      },
    });
    expect(valid.status).not.toBe(200);
    // Clean up the failures for the next tests.
    t.db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastFailedLoginAt: null })
      .where(eq(users.id, account.user.id))
      .run();
  });

  it('regenerates recovery codes with the password and a code', async () => {
    const missing = await t.request('POST', '/api/auth/two-factor/recovery-codes', {
      token: account.token,
      body: { password: account.password },
    });
    expect(missing.status).toBe(422);
    const regenerated = await t.request('POST', '/api/auth/two-factor/recovery-codes', {
      token: account.token,
      body: { password: account.password, code: freshCode(t, account.user.id, secret) },
    });
    expect(regenerated.status).toBe(200);
    expect(regenerated.json.recoveryCodes).toHaveLength(10);
    expect(regenerated.json.recoveryCodes).not.toContain(recoveryCodes[1]);
    recoveryCodes = regenerated.json.recoveryCodes;
  });

  it('turns off only with the password and a second factor', async () => {
    const wrongPassword = await t.request('POST', '/api/auth/two-factor/disable', {
      token: account.token,
      body: { password: 'nope-nope', code: freshCode(t, account.user.id, secret) },
    });
    expect(wrongPassword.status).toBe(422);
    expect(wrongPassword.json.error.issues[0].path).toBe('password');
    const wrongCode = await t.request('POST', '/api/auth/two-factor/disable', {
      token: account.token,
      body: { password: account.password, recoveryCode: 'AAAAA-AAAAA' },
    });
    expect(wrongCode.status).toBe(422);
    expect(wrongCode.json.error.issues[0].path).toBe('recoveryCode');

    const off = await t.request('POST', '/api/auth/two-factor/disable', {
      token: account.token,
      body: { password: account.password, recoveryCode: recoveryCodes[0] },
    });
    expect(off.status).toBe(200);
    const status = await t.request('GET', '/api/auth/two-factor', { token: account.token });
    expect(status.json).toMatchObject({ enabled: false, recoveryCodesRemaining: 0 });

    const login = await t.request('POST', '/api/auth/login', {
      body: { email: 'yohana@example.com', password: account.password },
    });
    expect(login.status).toBe(200);
    expect(typeof login.json.token).toBe('string');
  });

  it('records sign-in history for the account only', async () => {
    const other = await t.register('Other person');
    const history = await t.request('GET', '/api/auth/login-events?limit=100', {
      token: account.token,
    });
    expect(history.status).toBe(200);
    const outcomes = history.json.items.map((event: { outcome: string }) => event.outcome);
    expect(outcomes).toContain('two_factor_required');
    expect(outcomes).toContain('two_factor_success');
    expect(outcomes).toContain('recovery_code_used');
    expect(outcomes).toContain('two_factor_failure');
    expect(outcomes).toContain('success');
    const failed = await t.request('GET', '/api/auth/login-events?outcome=failed', {
      token: account.token,
    });
    expect(
      failed.json.items.every((event: { outcome: string }) =>
        ['failure', 'locked', 'two_factor_failure'].includes(event.outcome),
      ),
    ).toBe(true);
    const otherHistory = await t.request('GET', '/api/auth/login-events', { token: other.token });
    expect(otherHistory.json.total).toBe(0);
    expect(
      (await t.request('GET', '/api/auth/login-events?limit=1000', { token: account.token }))
        .status,
    ).toBe(422);
  });
});

describe('progressive lockout', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('locks an account after five wrong passwords, even for the right password', async () => {
    const account = await t.register('Lockout', 'lock@example.com', 'right-password-1');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await t.request('POST', '/api/auth/login', {
        body: { email: 'lock@example.com', password: 'wrong-password' },
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 4)).toEqual([401, 401, 401, 401]);
    expect(statuses[4]).toBe(429);
    const locked = await t.request('POST', '/api/auth/login', {
      body: { email: 'lock@example.com', password: 'right-password-1' },
    });
    expect(locked.status).toBe(429);
    expect(locked.json.error.code).toBe('ACCOUNT_LOCKED');

    const row = t.db.select().from(users).where(eq(users.id, account.user.id)).get();
    expect(row?.failedLoginCount).toBe(5);
    expect(new Date(row?.lockedUntil ?? 0).getTime()).toBeGreaterThan(Date.now());

    const notices = await notificationsOf(t, account.token);
    expect(notices.some((notice) => notice.type === 'account.locked')).toBe(true);
    const history = await t.request('GET', '/api/auth/login-events', { token: account.token });
    expect(history.json.items[0].outcome).toBe('locked');

    // Once the lock expires the right password works and the counter resets.
    t.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000).toISOString() })
      .where(eq(users.id, account.user.id))
      .run();
    const ok = await t.request('POST', '/api/auth/login', {
      body: { email: 'lock@example.com', password: 'right-password-1' },
    });
    expect(ok.status).toBe(200);
    expect(
      t.db.select().from(users).where(eq(users.id, account.user.id)).get()?.failedLoginCount,
    ).toBe(0);
  });

  it('doubles the wait for each further failure', async () => {
    await t.register('Doubling', 'double@example.com', 'right-password-1');
    const user = t.db.select().from(users).where(eq(users.email, 'double@example.com')).get();
    t.db
      .update(users)
      .set({ failedLoginCount: 6, lastFailedLoginAt: new Date().toISOString() })
      .where(eq(users.id, user?.id ?? ''))
      .run();
    const response = await t.request('POST', '/api/auth/login', {
      body: { email: 'double@example.com', password: 'wrong' },
    });
    expect(response.json.error.code).toBe('ACCOUNT_LOCKED');
    const after = t.db
      .select()
      .from(users)
      .where(eq(users.id, user?.id ?? ''))
      .get();
    const minutes = (new Date(after?.lockedUntil ?? 0).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(3);
    expect(minutes).toBeLessThanOrEqual(4.1);
  });

  it('forgets old failures after a day', async () => {
    await t.register('Forgetful', 'forget@example.com', 'right-password-1');
    const user = t.db.select().from(users).where(eq(users.email, 'forget@example.com')).get();
    t.db
      .update(users)
      .set({
        failedLoginCount: 4,
        lastFailedLoginAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      })
      .where(eq(users.id, user?.id ?? ''))
      .run();
    const response = await t.request('POST', '/api/auth/login', {
      body: { email: 'forget@example.com', password: 'wrong' },
    });
    expect(response.status).toBe(401);
    expect(
      t.db
        .select()
        .from(users)
        .where(eq(users.id, user?.id ?? ''))
        .get()?.failedLoginCount,
    ).toBe(1);
  });

  it('rate limits the second step per IP', async () => {
    const strict = createTestApp(
      {},
      {
        limiters: {
          login: createRateLimiter({ windowMs: 60_000, max: 1000 }),
          register: createRateLimiter({ windowMs: 60_000, max: 1000 }),
          invitation: createRateLimiter({ windowMs: 60_000, max: 1000 }),
          'auth.two_factor': createRateLimiter({ windowMs: 60_000, max: 2 }),
        },
      },
    );
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push(
        (
          await strict.request('POST', '/api/auth/login/two-factor', {
            body: { challengeToken: 'nope', code: '123456' },
            headers: { 'x-forwarded-for': '10.1.1.1' },
          })
        ).status,
      );
    }
    expect(statuses).toEqual([401, 401, 429]);
    strict.close();
  });
});

describe('sessions and password changes', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('lists sessions with their address and signs out the others', async () => {
    const account = await t.register('Session owner', 'sessions@example.com', 'password-one-1');
    const login = (ip: string) =>
      t.request('POST', '/api/auth/login', {
        body: { email: 'sessions@example.com', password: 'password-one-1' },
        headers: { 'x-forwarded-for': ip, 'user-agent': 'Mozilla/5.0 (Android 14) Chrome/130' },
      });
    const a = await login('203.0.113.7');
    await login('203.0.113.8');
    const list = await t.request('GET', '/api/auth/sessions', { token: a.json.token });
    expect(list.json.items).toHaveLength(3);
    expect(list.json.items.map((session: { ip: string | null }) => session.ip)).toContain(
      '203.0.113.7',
    );

    const revoke = await t.request('DELETE', '/api/auth/sessions', { token: a.json.token });
    expect(revoke.status).toBe(200);
    expect(revoke.json.revokedSessions).toBe(2);
    expect((await t.request('GET', '/api/auth/me', { token: account.token })).status).toBe(401);
    expect((await t.request('GET', '/api/auth/me', { token: a.json.token })).status).toBe(200);
  });

  it('keeps other sessions when asked and refuses reusing the password', async () => {
    const account = await t.register('Keeper', 'keeper@example.com', 'password-one-1');
    const other = await t.request('POST', '/api/auth/login', {
      body: { email: 'keeper@example.com', password: 'password-one-1' },
    });
    const same = await t.request('POST', '/api/auth/change-password', {
      token: account.token,
      body: { currentPassword: 'password-one-1', newPassword: 'password-one-1' },
    });
    expect(same.status).toBe(422);
    expect(same.json.error.issues[0].path).toBe('newPassword');

    const keep = await t.request('POST', '/api/auth/change-password', {
      token: account.token,
      body: {
        currentPassword: 'password-one-1',
        newPassword: 'password-two-2',
        revokeOtherSessions: false,
      },
    });
    expect(keep.status).toBe(200);
    expect(keep.json.revokedSessions).toBe(0);
    expect((await t.request('GET', '/api/auth/me', { token: other.json.token })).status).toBe(200);

    const revoke = await t.request('POST', '/api/auth/change-password', {
      token: account.token,
      body: { currentPassword: 'password-two-2', newPassword: 'password-three-3' },
    });
    expect(revoke.json.revokedSessions).toBe(1);
    expect((await t.request('GET', '/api/auth/me', { token: other.json.token })).status).toBe(401);

    const row = t.db.select().from(users).where(eq(users.id, account.user.id)).get();
    expect(row?.passwordChangedAt).not.toBeNull();
    const notices = await notificationsOf(t, account.token);
    expect(notices.filter((notice) => notice.type === 'account.password_changed')).toHaveLength(2);
    expect(notices.every((notice) => notice.churchId === null)).toBe(true);
  });
});

describe('data rights', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('exports the account and its own records, without credentials or other people', async () => {
    const owner = await t.register('Pdt. Samuel', 'samuel@example.com', 'password-owner-1');
    const church = await t.createChurch(owner.token, 'GKI Damai');
    const invitation = await t.invite(owner.token, church.id, { expiresInDays: 7 });
    const member = await t.register('Ruth Hutagalung', 'ruth@example.com', 'password-member-1');
    await t.join(member.token, invitation.token);
    const ruth = await t.createPerson(owner.token, church.id, {
      firstName: 'Ruth',
      lastName: 'Hutagalung',
    });
    await t.createPerson(owner.token, church.id, { firstName: 'Someone', lastName: 'Else' });
    await t.request('PUT', `/api/churches/${church.id}/people/${ruth.id}/user`, {
      token: owner.token,
      body: { userId: member.user.id },
    });

    const wrong = await t.request('POST', '/api/auth/export', {
      token: member.token,
      body: { password: 'wrong' },
    });
    expect(wrong.status).toBe(422);
    const exported = await t.request('POST', '/api/auth/export', {
      token: member.token,
      body: { password: 'password-member-1' },
    });
    expect(exported.status).toBe(200);
    expect(exported.json.format).toBe('tatagereja-personal-data');
    expect(exported.json.account.email).toBe('ruth@example.com');
    expect(exported.json.churches).toHaveLength(1);
    const records = exported.json.churches[0].records;
    expect(records.people).toHaveLength(1);
    expect(records.people[0].firstName).toBe('Ruth');
    expect(records.church_memberships).toHaveLength(1);
    const text = JSON.stringify(exported.json);
    expect(text).not.toContain('Someone');
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('tokenHash');
  });

  it('blocks deleting an account that owns a church and explains why', async () => {
    const owner = await t.register('Church owner', 'owner2@example.com', 'password-owner-2');
    await t.createChurch(owner.token, 'GPIB Sion');
    const blockers = await t.request('GET', '/api/auth/account/deletion', { token: owner.token });
    expect(blockers.json.ownedChurches.map((church: { name: string }) => church.name)).toEqual([
      'GPIB Sion',
    ]);
    const refused = await t.request('DELETE', '/api/auth/account', {
      token: owner.token,
      body: { password: 'password-owner-2' },
    });
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toContain('GPIB Sion');
  });

  it('deletes an account, hands its content to the owner and keeps the person record', async () => {
    const owner = await t.register('HKBP owner', 'hkbp@example.com', 'password-owner-3');
    const church = await t.createChurch(owner.token, 'HKBP Menteng');
    const invitation = await t.invite(owner.token, church.id, { expiresInDays: 7 });
    const admin = await t.register('Leaving admin', 'leaving@example.com', 'password-admin-3');
    await t.join(admin.token, invitation.token);
    const members = await t.request('GET', `/api/churches/${church.id}/members`, {
      token: owner.token,
    });
    const adminMembership = members.json.items.find(
      (item: { userId: string }) => item.userId === admin.user.id,
    );
    await t.request('PATCH', `/api/churches/${church.id}/members/${adminMembership.id}`, {
      token: owner.token,
      body: { role: 'administrator' },
    });
    // Content the admin created must survive their account.
    const event = await t.request('POST', `/api/churches/${church.id}/events`, {
      token: admin.token,
      body: {
        title: 'Partangiangan Wijk',
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(event.status).toBe(201);
    await t.invite(admin.token, church.id, { label: 'By admin' });
    const person = await t.createPerson(owner.token, church.id, { firstName: 'Leaving' });
    await t.request('PUT', `/api/churches/${church.id}/people/${person.id}/user`, {
      token: owner.token,
      body: { userId: admin.user.id },
    });

    const wrong = await t.request('DELETE', '/api/auth/account', {
      token: admin.token,
      body: { password: 'nope' },
    });
    expect(wrong.status).toBe(422);
    const deleted = await t.request('DELETE', '/api/auth/account', {
      token: admin.token,
      body: { password: 'password-admin-3' },
    });
    expect(deleted.status).toBe(200);
    expect((await t.request('GET', '/api/auth/me', { token: admin.token })).status).toBe(401);
    expect(
      (
        await t.request('POST', '/api/auth/login', {
          body: { email: 'leaving@example.com', password: 'password-admin-3' },
        })
      ).status,
    ).toBe(401);

    const eventAfter = await t.request(
      'GET',
      `/api/churches/${church.id}/events/${event.json.event.id}`,
      {
        token: owner.token,
      },
    );
    expect(eventAfter.status).toBe(200);
    expect(eventAfter.json.event.createdBy).toBe(owner.user.id);
    const personAfter = await t.request('GET', `/api/churches/${church.id}/people/${person.id}`, {
      token: owner.token,
    });
    expect(personAfter.json.person.userId).toBeNull();
    const membersAfter = await t.request('GET', `/api/churches/${church.id}/members`, {
      token: owner.token,
    });
    expect(membersAfter.json.items).toHaveLength(1);
    const log = await t.request(
      'GET',
      `/api/churches/${church.id}/audit-logs?action=member.account_delete`,
      {
        token: owner.token,
      },
    );
    expect(log.json.items).toHaveLength(1);
  });

  it('needs a second factor to delete an account with two-step verification', async () => {
    const account = await t.register('Protected', 'protected@example.com', 'password-prot-1');
    const { secret } = await enableTwoFactor(t, account);
    const missing = await t.request('DELETE', '/api/auth/account', {
      token: account.token,
      body: { password: 'password-prot-1' },
    });
    expect(missing.status).toBe(400);
    expect(missing.json.error.code).toBe('TWO_FACTOR_REQUIRED');
    const ok = await t.request('DELETE', '/api/auth/account', {
      token: account.token,
      body: { password: 'password-prot-1', code: freshCode(t, account.user.id, secret) },
    });
    expect(ok.status).toBe(200);
    expect(
      t.db.select().from(userTwoFactor).where(eq(userTwoFactor.userId, account.user.id)).get(),
    ).toBeUndefined();
  });
});
