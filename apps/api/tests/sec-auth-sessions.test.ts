import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { sessionRefreshTokens, sessions } from '../src/db/schema';
import { createRateLimiter } from '../src/lib/rate-limit';
import { securityHeaders } from '../src/lib/security-headers';
import { createTestApp, permissiveLimiters } from './helpers';

type TestApp = ReturnType<typeof createTestApp>;
type RawResponse = { status: number; json: any; headers: Headers };

const APP = 'http://localhost:5173';

/** A request as a browser page would send it, with cookies and the headers it adds itself. */
async function browser(
  t: TestApp,
  method: string,
  path: string,
  options: {
    body?: unknown;
    cookie?: string | null;
    csrf?: string | null;
    origin?: string | null;
    site?: string | null;
    https?: boolean;
    headers?: Record<string, string>;
  } = {},
): Promise<RawResponse> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  if (options.csrf) headers['x-csrf-token'] = options.csrf;
  if (options.origin !== null) headers.origin = options.origin ?? APP;
  if (options.site !== null) headers['sec-fetch-site'] = options.site ?? 'same-origin';
  if (options.https) headers['x-forwarded-proto'] = 'https';
  const response = await t.app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    json: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

/** `name=value` from a Set-Cookie header, as the browser would send it back. */
const cookieOf = (response: RawResponse): string =>
  (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

describe('cookie sessions and CSRF', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  const email = 'cookie@example.com';
  const password = 'kidung-pujian-91';

  beforeAll(async () => {
    await t.register('Cookie Jemaat', email, password);
  });

  const cookieLogin = (options: Parameters<typeof browser>[3] = {}) =>
    browser(t, 'POST', '/api/auth/login', {
      body: { email, password, transport: 'cookie' },
      ...options,
    });

  it('keeps the session token out of the body and out of reach of JavaScript', async () => {
    const login = await cookieLogin();
    expect(login.status).toBe(200);
    expect(login.json.transport).toBe('cookie');
    expect(login.json.token).toBeNull();
    expect(login.json.refreshToken).toBeNull();
    expect(login.json.csrfToken).toBeString();
    const setCookie = login.headers.get('set-cookie') ?? '';
    expect(setCookie).toStartWith('tg_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Secure');
    // The CSRF token is not the session token.
    expect(cookieOf(login)).not.toContain(login.json.csrfToken);

    const me = await browser(t, 'GET', '/api/auth/me', { cookie: cookieOf(login) });
    expect(me.status).toBe(200);
    expect(me.json.user.email).toBe(email);
    const session = await browser(t, 'GET', '/api/auth/session', { cookie: cookieOf(login) });
    expect(session.json).toMatchObject({ transport: 'cookie', csrfToken: login.json.csrfToken });
  });

  it('uses a __Host- Secure cookie over HTTPS and ignores the plain one there', async () => {
    const login = await cookieLogin({ https: true, origin: 'https://localhost' });
    expect(login.status).toBe(200);
    const setCookie = login.headers.get('set-cookie') ?? '';
    expect(setCookie).toStartWith('__Host-tg_session=');
    expect(setCookie).toContain('; Secure');
    const token = cookieOf(login).split('=')[1];
    const plain = await browser(t, 'GET', '/api/auth/me', {
      cookie: `tg_session=${token}`,
      https: true,
    });
    expect(plain.status).toBe(401);
    const secure = await browser(t, 'GET', '/api/auth/me', {
      cookie: cookieOf(login),
      https: true,
    });
    expect(secure.status).toBe(200);
  });

  it('refuses writes without the CSRF token or from another site', async () => {
    const login = await cookieLogin();
    const cookie = cookieOf(login);
    const csrf = login.json.csrfToken as string;
    const body = { name: 'Cookie Jemaat', avatarUrl: null };

    const missing = await browser(t, 'PATCH', '/api/auth/me', { cookie, body });
    expect(missing.status).toBe(403);
    expect(missing.json.error.code).toBe('CSRF_FAILED');
    const wrong = await browser(t, 'PATCH', '/api/auth/me', { cookie, body, csrf: 'x'.repeat(43) });
    expect(wrong.json.error.code).toBe('CSRF_FAILED');
    const crossSite = await browser(t, 'PATCH', '/api/auth/me', {
      cookie,
      body,
      csrf,
      site: 'cross-site',
    });
    expect(crossSite.json.error.code).toBe('CSRF_FAILED');
    const sameSite = await browser(t, 'PATCH', '/api/auth/me', {
      cookie,
      body,
      csrf,
      site: 'same-site',
    });
    expect(sameSite.json.error.code).toBe('CSRF_FAILED');
    const foreignOrigin = await browser(t, 'PATCH', '/api/auth/me', {
      cookie,
      body,
      csrf,
      origin: 'https://evil.example',
    });
    expect(foreignOrigin.json.error.code).toBe('CSRF_FAILED');

    const ok = await browser(t, 'PATCH', '/api/auth/me', { cookie, body, csrf });
    expect(ok.status).toBe(200);
    // Its own origin (the server serving the app) counts as same-origin too.
    const own = await browser(t, 'PATCH', '/api/auth/me', {
      cookie,
      body,
      csrf,
      origin: 'http://localhost',
    });
    expect(own.status).toBe(200);
    // Reads need no token.
    expect((await browser(t, 'GET', '/api/auth/sessions', { cookie })).status).toBe(200);
  });

  it('never hands a cookie session to another site (login CSRF)', async () => {
    const foreign = await cookieLogin({ origin: 'https://evil.example', site: 'cross-site' });
    expect(foreign.status).toBe(403);
    expect(foreign.json.error.code).toBe('CSRF_FAILED');
    expect(foreign.headers.get('set-cookie')).toBeNull();
  });

  it('keeps cookie and bearer credentials apart', async () => {
    const login = await cookieLogin();
    const token = cookieOf(login).split('=')[1];
    const asBearer = await t.request('GET', '/api/auth/me', { token });
    expect(asBearer.status).toBe(401);
    const bearer = await t.request('POST', '/api/auth/login', { body: { email, password } });
    const asCookie = await browser(t, 'GET', '/api/auth/me', {
      cookie: `tg_session=${bearer.json.token}`,
    });
    expect(asCookie.status).toBe(401);
  });

  it('replaces the session a browser already had when it signs in again (fixation)', async () => {
    const first = await cookieLogin();
    const second = await cookieLogin({ cookie: cookieOf(first) });
    expect(second.status).toBe(200);
    expect((await browser(t, 'GET', '/api/auth/me', { cookie: cookieOf(first) })).status).toBe(401);
    expect((await browser(t, 'GET', '/api/auth/me', { cookie: cookieOf(second) })).status).toBe(
      200,
    );
  });

  it('clears the cookie on logout and the session stops working', async () => {
    const login = await cookieLogin();
    const cookie = cookieOf(login);
    const logout = await browser(t, 'POST', '/api/auth/logout', {
      cookie,
      csrf: login.json.csrfToken,
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await browser(t, 'GET', '/api/auth/me', { cookie })).status).toBe(401);
  });

  it('rotates the cookie and CSRF token on a password change', async () => {
    const login = await cookieLogin();
    const changed = await browser(t, 'POST', '/api/auth/change-password', {
      cookie: cookieOf(login),
      csrf: login.json.csrfToken,
      body: { currentPassword: password, newPassword: 'kidung-baru-2031' },
    });
    expect(changed.status).toBe(200);
    expect(changed.json.session.transport).toBe('cookie');
    expect(changed.json.session.csrfToken).not.toBe(login.json.csrfToken);
    const next = cookieOf(changed);
    expect(next).not.toBe(cookieOf(login));
    expect((await browser(t, 'GET', '/api/auth/me', { cookie: cookieOf(login) })).status).toBe(401);
    expect((await browser(t, 'GET', '/api/auth/me', { cookie: next })).status).toBe(200);
  });
});

describe('bearer sessions: short access tokens and rotating refresh tokens', () => {
  const t = createTestApp({ accessTokenTtlMinutes: 15 });
  afterAll(() => t.close());
  const email = 'bearer@example.com';
  const password = 'kidung-pujian-91';
  let userId = '';

  beforeAll(async () => {
    userId = (await t.register('Bearer Jemaat', email, password)).user.id;
  });

  const login = async () => {
    const response = await t.request('POST', '/api/auth/login', { body: { email, password } });
    expect(response.status).toBe(200);
    return response.json as {
      token: string;
      refreshToken: string;
      expiresAt: string;
      sessionExpiresAt: string;
      transport: string;
    };
  };

  it('issues a short-lived access token and a refresh token', async () => {
    const session = await login();
    expect(session.transport).toBe('bearer');
    const lifetime = new Date(session.expiresAt).getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(14 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(15 * 60_000);
    expect(new Date(session.sessionExpiresAt).getTime()).toBeGreaterThan(
      Date.now() + 29 * 24 * 3600_000,
    );
    expect(session.refreshToken).not.toBe(session.token);
  });

  it('refuses an expired access token until it is refreshed', async () => {
    const session = await login();
    t.db
      .update(sessions)
      .set({ accessExpiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(sessions.userId, userId))
      .run();
    expect((await t.request('GET', '/api/auth/me', { token: session.token })).status).toBe(401);
    const refreshed = await t.request('POST', '/api/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.json.refreshToken).not.toBe(session.refreshToken);
    expect((await t.request('GET', '/api/auth/me', { token: refreshed.json.token })).status).toBe(
      200,
    );
  });

  it('rotates on refresh and revokes the whole session when an old refresh token comes back', async () => {
    const session = await login();
    const first = await t.request('POST', '/api/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    });
    expect(first.status).toBe(200);
    // The previous access token stops working at once.
    expect((await t.request('GET', '/api/auth/me', { token: session.token })).status).toBe(401);
    const second = await t.request('POST', '/api/auth/refresh', {
      body: { refreshToken: first.json.refreshToken },
    });
    expect(second.status).toBe(200);
    const sessionId = t.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.tokenHash, sessionHash(second.json.token)))
      .get()?.id;
    expect(sessionId).toBeString();
    // Both earlier refresh tokens are remembered for reuse detection.
    expect(
      t.db
        .select()
        .from(sessionRefreshTokens)
        .where(eq(sessionRefreshTokens.sessionId, sessionId!))
        .all(),
    ).toHaveLength(2);

    // Someone replays the first refresh token: both copies are cut off.
    const replay = await t.request('POST', '/api/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    });
    expect(replay.status).toBe(401);
    expect(replay.json.error.code).toBe('SESSION_REVOKED');
    expect((await t.request('GET', '/api/auth/me', { token: second.json.token })).status).toBe(401);
    const after = await t.request('POST', '/api/auth/refresh', {
      body: { refreshToken: second.json.refreshToken },
    });
    expect(after.status).toBe(401);
    expect(t.db.select().from(sessions).where(eq(sessions.id, sessionId!)).get()).toBeUndefined();

    const fresh = await login();
    const history = await t.request('GET', '/api/auth/login-events?limit=50', {
      token: fresh.token,
    });
    expect(history.json.items.map((event: { outcome: string }) => event.outcome)).toContain(
      'refresh_reuse',
    );
    const notices = await t.request('GET', '/api/notifications?limit=50', { token: fresh.token });
    expect(
      notices.json.items.some(
        (notice: { type: string }) => notice.type === 'account.session_revoked',
      ),
    ).toBe(true);
  });

  it('refuses unknown refresh tokens without revealing anything', async () => {
    const response = await t.request('POST', '/api/auth/refresh', {
      body: { refreshToken: 'x'.repeat(43) },
    });
    expect(response.status).toBe(401);
    expect(response.json.error.code).toBe('UNAUTHORIZED');
  });

  it('ends sessions that were idle too long or reached their absolute lifetime', async () => {
    const idle = await login();
    const idleRow = t.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, sessionHash(idle.token)))
      .get();
    t.db
      .update(sessions)
      .set({ lastUsedAt: new Date(Date.now() - 8 * 24 * 3600_000).toISOString() })
      .where(eq(sessions.id, idleRow!.id))
      .run();
    expect((await t.request('GET', '/api/auth/me', { token: idle.token })).status).toBe(401);
    const refreshIdle = await t.request('POST', '/api/auth/refresh', {
      body: { refreshToken: idle.refreshToken },
    });
    expect(refreshIdle.status).toBe(401);

    const old = await login();
    t.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(sessions.tokenHash, sessionHash(old.token)))
      .run();
    const refreshOld = await t.request('POST', '/api/auth/refresh', {
      body: { refreshToken: old.refreshToken },
    });
    expect(refreshOld.status).toBe(401);
  });

  it('lists sessions with device details and signs out everywhere', async () => {
    const phone = await t.request('POST', '/api/auth/login', {
      body: { email, password },
      headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile' },
    });
    const laptop = await login();
    const list = await t.request('GET', '/api/auth/sessions', { token: laptop.token });
    const current = list.json.items.find((item: { current: boolean }) => item.current);
    expect(current.transport).toBe('bearer');
    expect(current.idleExpiresAt).toBeString();
    expect(
      list.json.items.some((item: { userAgent: string | null }) =>
        item.userAgent?.includes('Android'),
      ),
    ).toBe(true);

    // The current session is ended by signing out, not from the list.
    const self = await t.request('DELETE', `/api/auth/sessions/${current.id}`, {
      token: laptop.token,
    });
    expect(self.status).toBe(403);

    const everywhere = await t.request('POST', '/api/auth/logout/everywhere', {
      token: laptop.token,
    });
    expect(everywhere.status).toBe(200);
    expect(everywhere.json.revokedSessions).toBeGreaterThanOrEqual(2);
    expect((await t.request('GET', '/api/auth/me', { token: laptop.token })).status).toBe(401);
    expect((await t.request('GET', '/api/auth/me', { token: phone.json.token })).status).toBe(401);
  });
});

const sessionHash = (token: string) => new Bun.CryptoHasher('sha256').update(token).digest('hex');

describe('enumeration and brute force', () => {
  it('answers an unknown account, a wrong password and a locked account in the same time', async () => {
    const t = createTestApp();
    try {
      await t.register('Timing', 'timing@example.com', 'kidung-pujian-91');
      await t.register('Locked', 'locked@example.com', 'kidung-pujian-91');
      for (let i = 0; i < 5; i += 1) {
        await t.request('POST', '/api/auth/login', {
          body: { email: 'locked@example.com', password: `wrong-${i}` },
        });
      }
      const time = async (email: string) => {
        const samples: number[] = [];
        for (let i = 0; i < 6; i += 1) {
          const start = performance.now();
          await t.request('POST', '/api/auth/login', {
            body: { email: i % 2 ? email : email.toUpperCase(), password: 'not-the-password' },
          });
          samples.push(performance.now() - start);
        }
        return samples.sort((a, b) => a - b)[3]!;
      };
      // Unknown addresses are timed after the first five, when they lock like accounts do.
      const unknown = await time('nobody@example.com');
      const known = await time('timing@example.com');
      const locked = await time('locked@example.com');
      for (const pair of [
        [unknown, known],
        [locked, known],
      ] as const) {
        const ratio = pair[0] / pair[1];
        expect(ratio).toBeGreaterThan(0.5);
        expect(ratio).toBeLessThan(2);
      }
    } finally {
      t.close();
    }
  });

  it('answers the same for unknown and known accounts, also once locked', async () => {
    const t = createTestApp();
    try {
      await t.register('Known', 'known@example.com', 'kidung-pujian-91');
      const attempt = (email: string) =>
        t.request('POST', '/api/auth/login', { body: { email, password: 'wrong-password' } });
      const known: string[] = [];
      const unknown: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        const a = await attempt('known@example.com');
        const b = await attempt('unknown@example.com');
        known.push(`${a.status} ${a.json.error.code}`);
        unknown.push(`${b.status} ${b.json.error.code}`);
      }
      expect(unknown).toEqual(known);
      expect(known[0]).toBe('401 UNAUTHORIZED');
      expect(known[6]).toBe('429 ACCOUNT_LOCKED');
    } finally {
      t.close();
    }
  });

  it('limits sign-in attempts per address across many accounts', async () => {
    const t = createTestApp(
      {},
      {
        limiters: {
          ...permissiveLimiters(),
          loginIp: createRateLimiter({ windowMs: 60_000, max: 3 }),
        },
      },
    );
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const response = await t.request('POST', '/api/auth/login', {
          body: { email: `spray${i}@example.com`, password: 'guess-guess' },
          headers: { 'x-forwarded-for': '198.51.100.20' },
        });
        statuses.push(response.status);
      }
      expect(statuses).toEqual([401, 401, 401, 429, 429]);
      const elsewhere = await t.request('POST', '/api/auth/login', {
        body: { email: 'spray9@example.com', password: 'guess-guess' },
        headers: { 'x-forwarded-for': '198.51.100.21' },
      });
      expect(elsewhere.status).toBe(401);
    } finally {
      t.close();
    }
  });

  it('keeps the registration conflict message generic', async () => {
    const t = createTestApp();
    try {
      await t.register('First', 'taken@example.com', 'kidung-pujian-91');
      const again = await t.request('POST', '/api/auth/register', {
        body: { name: 'Second', email: 'taken@example.com', password: 'kidung-pujian-92' },
      });
      expect(again.status).toBe(409);
      expect(again.json.error.message).not.toContain('already exists');
      expect(again.json.error.message).toContain('sign in');
    } finally {
      t.close();
    }
  });
});

describe('security headers', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  it('sends a strict policy for the app without inline scripts', () => {
    const headers = securityHeaders(new Request('http://localhost/c/123'));
    const csp = headers['content-security-policy']!;
    const scriptSrc = csp.split('; ').find((part) => part.startsWith('script-src '))!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(headers['permissions-policy']).toContain('geolocation=()');
    expect(headers['permissions-policy']).toContain('microphone=()');
    expect(headers['strict-transport-security']).toBeUndefined();
  });

  it('adds HSTS ready for preloading over HTTPS', () => {
    const headers = securityHeaders(
      new Request('http://localhost/', { headers: { 'x-forwarded-proto': 'https' } }),
    );
    expect(headers['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    expect(headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });

  it('locks API answers down completely', async () => {
    const response = await t.app.handle(new Request('http://localhost/api/meta'));
    expect(response.headers.get('content-security-policy')).toStartWith("default-src 'none'");
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
