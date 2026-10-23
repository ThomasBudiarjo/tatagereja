import { afterAll, describe, expect, it } from 'bun:test';
import { defaultLimiters } from '../src/app';
import { createTestApp } from './helpers';

describe('meta', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('exposes server metadata', async () => {
    const response = await t.request('GET', '/api/meta');
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      app: 'tatagereja',
      apiVersion: 1,
      registrationMode: 'public',
      turnstileSiteKey: null,
    });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const response = await t.request('GET', '/api/nope');
    expect(response.status).toBe(404);
    expect(response.json.error.code).toBe('NOT_FOUND');
  });
});

describe('auth', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('registers, logs in and reads the profile', async () => {
    const registered = await t.request('POST', '/api/auth/register', {
      body: { name: '  Jane Doe ', email: 'Jane@Example.com', password: 'kidung-pujian-91' },
    });
    expect(registered.status).toBe(201);
    expect(registered.json.user.email).toBe('jane@example.com');
    expect(registered.json.user.name).toBe('Jane Doe');
    expect(registered.json.token).toBeString();
    expect(registered.json.joinedChurchId).toBeNull();

    const me = await t.request('GET', '/api/auth/me', { token: registered.json.token });
    expect(me.status).toBe(200);
    expect(me.json.user.id).toBe(registered.json.user.id);

    const login = await t.request('POST', '/api/auth/login', {
      body: { email: 'jane@example.com', password: 'kidung-pujian-91' },
    });
    expect(login.status).toBe(200);
    expect(login.json.token).not.toBe(registered.json.token);
  });

  it('rejects duplicate emails', async () => {
    const response = await t.request('POST', '/api/auth/register', {
      body: { name: 'Again', email: 'jane@example.com', password: 'kidung-pujian-91' },
    });
    expect(response.status).toBe(409);
    expect(response.json.error.code).toBe('CONFLICT');
  });

  it('validates the registration body', async () => {
    const response = await t.request('POST', '/api/auth/register', {
      body: { name: '', email: 'not-an-email', password: 'short' },
    });
    expect(response.status).toBe(422);
    expect(response.json.error.code).toBe('VALIDATION');
    const paths = response.json.error.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toContain('name');
    expect(paths).toContain('email');
    expect(paths).toContain('password');
  });

  it('rejects malformed JSON', async () => {
    const response = await t.app.handle(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );
    expect([400, 422]).toContain(response.status);
  });

  it('rejects wrong passwords and unknown users identically', async () => {
    const wrong = await t.request('POST', '/api/auth/login', {
      body: { email: 'jane@example.com', password: 'wrong-password' },
    });
    expect(wrong.status).toBe(401);
    const unknown = await t.request('POST', '/api/auth/login', {
      body: { email: 'nobody@example.com', password: 'wrong-password' },
    });
    expect(unknown.status).toBe(401);
    expect(unknown.json.error.message).toBe(wrong.json.error.message);
  });

  it('requires a valid bearer token', async () => {
    expect((await t.request('GET', '/api/auth/me')).status).toBe(401);
    expect((await t.request('GET', '/api/auth/me', { token: 'bogus' })).status).toBe(401);
    expect(
      (await t.request('GET', '/api/auth/me', { headers: { authorization: 'Basic abc' } })).status,
    ).toBe(401);
  });

  it('updates the profile and changes the password, revoking other sessions', async () => {
    const a = await t.request('POST', '/api/auth/login', {
      body: { email: 'jane@example.com', password: 'kidung-pujian-91' },
    });
    const b = await t.request('POST', '/api/auth/login', {
      body: { email: 'jane@example.com', password: 'kidung-pujian-91' },
    });

    const updated = await t.request('PATCH', '/api/auth/me', {
      token: a.json.token,
      body: { name: 'Jane Updated', avatarUrl: 'https://example.com/avatar.png' },
    });
    expect(updated.status).toBe(200);
    expect(updated.json.user.name).toBe('Jane Updated');
    expect(updated.json.user.avatarUrl).toBe('https://example.com/avatar.png');

    const bad = await t.request('POST', '/api/auth/change-password', {
      token: a.json.token,
      body: { currentPassword: 'nope', newPassword: 'newpassword123' },
    });
    expect(bad.status).toBe(401);

    const sessions = await t.request('GET', '/api/auth/sessions', { token: a.json.token });
    expect(sessions.status).toBe(200);
    expect(sessions.json.items.length).toBeGreaterThanOrEqual(2);
    expect(sessions.json.items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const ok = await t.request('POST', '/api/auth/change-password', {
      token: a.json.token,
      body: { currentPassword: 'kidung-pujian-91', newPassword: 'newpassword123' },
    });
    expect(ok.status).toBe(200);
    expect((await t.request('GET', '/api/auth/me', { token: a.json.token })).status).toBe(401);
    expect(
      (await t.request('GET', '/api/auth/me', { token: ok.json.session.token })).status,
    ).toBe(200);
    expect((await t.request('GET', '/api/auth/me', { token: b.json.token })).status).toBe(401);

    const login = await t.request('POST', '/api/auth/login', {
      body: { email: 'jane@example.com', password: 'newpassword123' },
    });
    expect(login.status).toBe(200);
  });

  it('logs out', async () => {
    const login = await t.request('POST', '/api/auth/login', {
      body: { email: 'jane@example.com', password: 'newpassword123' },
    });
    const logout = await t.request('POST', '/api/auth/logout', { token: login.json.token });
    expect(logout.status).toBe(200);
    expect((await t.request('GET', '/api/auth/me', { token: login.json.token })).status).toBe(401);
  });
});

describe('rate limiting', () => {
  const t = createTestApp({}, { limiters: defaultLimiters() });
  afterAll(() => t.close());

  it('rate limits repeated failed logins per IP and email', async () => {
    const codes: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const response = await t.request('POST', '/api/auth/login', {
        body: { email: 'limited@example.com', password: 'wrong' },
        headers: { 'x-forwarded-for': '10.0.0.9' },
      });
      codes.push(response.json.error.code);
    }
    // An unknown address locks after five failures exactly like an account would…
    expect(codes.slice(0, 4).every((code) => code === 'UNAUTHORIZED')).toBe(true);
    expect(codes.slice(4, 10).every((code) => code === 'ACCOUNT_LOCKED')).toBe(true);
    // …and the per address and email limit stops the eleventh attempt.
    expect(codes.slice(10)).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
    // Another email from the same IP is unaffected.
    const other = await t.request('POST', '/api/auth/login', {
      body: { email: 'other-limited@example.com', password: 'wrong' },
      headers: { 'x-forwarded-for': '10.0.0.9' },
    });
    expect(other.status).toBe(401);
  });

  it('rate limits registrations per IP', async () => {
    let last = 0;
    for (let i = 0; i < 31; i += 1) {
      const response = await t.request('POST', '/api/auth/register', {
        body: { name: 'Bulk', email: `bulk${i}@example.com`, password: 'kidung-pujian-91' },
        headers: { 'x-forwarded-for': '10.0.0.11' },
      });
      last = response.status;
    }
    expect(last).toBe(429);
  });
});

describe('registration modes', () => {
  it('blocks registration when disabled', async () => {
    const t = createTestApp({ registrationMode: 'disabled' });
    const response = await t.request('POST', '/api/auth/register', {
      body: { name: 'X', email: 'x@example.com', password: 'kidung-pujian-91' },
    });
    expect(response.status).toBe(403);
    expect(response.json.error.code).toBe('REGISTRATION_DISABLED');
    t.close();
  });

  it('requires an invitation when invite_only, and joins the church when provided', async () => {
    const t = createTestApp({ registrationMode: 'public' });
    const owner = await t.register('Owner');
    const church = await t.createChurch(owner.token);
    const invitation = await t.invite(owner.token, church.id, { role: 'member' });

    t.deps.config.registrationMode = 'invite_only';
    const denied = await t.request('POST', '/api/auth/register', {
      body: { name: 'New', email: 'new@example.com', password: 'kidung-pujian-91' },
    });
    expect(denied.status).toBe(403);
    expect(denied.json.error.code).toBe('INVITATION_REQUIRED');

    const invalid = await t.request('POST', '/api/auth/register', {
      body: {
        name: 'New',
        email: 'new@example.com',
        password: 'kidung-pujian-91',
        invitationToken: 'nope',
      },
    });
    expect(invalid.status).toBe(404);
    expect(invalid.json.error.code).toBe('INVITATION_INVALID');

    const accepted = await t.request('POST', '/api/auth/register', {
      body: {
        name: 'New',
        email: 'new@example.com',
        password: 'kidung-pujian-91',
        invitationToken: invitation.token,
      },
    });
    expect(accepted.status).toBe(201);
    expect(accepted.json.joinedChurchId).toBe(church.id);

    const churches = await t.request('GET', '/api/churches', { token: accepted.json.token });
    expect(churches.json.items).toHaveLength(1);
    expect(churches.json.items[0].role).toBe('member');
    t.close();
  });

  it('verifies Turnstile tokens when enabled', async () => {
    const seen: string[] = [];
    const t = createTestApp(
      { turnstile: { siteKey: 'site', secretKey: 'secret' } },
      {
        verifyTurnstile: async (token) => {
          seen.push(token);
          return token === 'good';
        },
      },
    );
    const meta = await t.request('GET', '/api/meta');
    expect(meta.json.turnstileSiteKey).toBe('site');

    const missing = await t.request('POST', '/api/auth/register', {
      body: { name: 'T', email: 't1@example.com', password: 'kidung-pujian-91' },
    });
    expect(missing.status).toBe(400);
    expect(missing.json.error.code).toBe('TURNSTILE_REQUIRED');

    const failed = await t.request('POST', '/api/auth/register', {
      body: { name: 'T', email: 't1@example.com', password: 'kidung-pujian-91', turnstileToken: 'bad' },
    });
    expect(failed.status).toBe(400);
    expect(failed.json.error.code).toBe('TURNSTILE_FAILED');

    const ok = await t.request('POST', '/api/auth/register', {
      body: { name: 'T', email: 't1@example.com', password: 'kidung-pujian-91', turnstileToken: 'good' },
    });
    expect(ok.status).toBe(201);
    expect(seen).toEqual(['bad', 'good']);
    t.close();
  });
});
