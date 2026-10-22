/**
 * Screenshots of the running app for visual review.
 *
 *   WEB_DIST_DIR=$PWD/apps/web/dist PORT=3901 DATABASE_PATH=/tmp/shots.db bun run --cwd apps/api start &
 *   bun scripts/screenshots.ts --port 3901 --seed --out /tmp/shots
 *
 * Options (all optional):
 *   --base <url>          app origin (default http://localhost:<port>)
 *   --port <n>            used when --base is missing (default 3901)
 *   --out <dir>           output directory (default /tmp/tatagereja-screenshots)
 *   --routes <list>       comma-separated paths; `:church` becomes the first church id
 *   --viewports <list>    e.g. 390x844,1440x900 (default both)
 *   --themes <list>       light,dark (default both)
 *   --locales <list>      id,en (default id)
 *   --email/--password    account to sign in with (default demo@tatagereja.test / demo-password)
 *   --seed                register the account and create a church with sample data if missing
 *   --full                full-page screenshots
 *   --anonymous           also capture the signed-out screens (welcome, login, register)
 *
 * Uses the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH); never run `playwright install`.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1]!.startsWith('--')
    ? args[index + 1]!
    : fallback;
};
const list = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const port = option('port', '3901');
const base = option('base', `http://localhost:${port}`).replace(/\/$/, '');
const out = option('out', '/tmp/tatagereja-screenshots');
const email = option('email', 'demo@tatagereja.test');
const password = option('password', 'demo-password');
const viewports = list(option('viewports', '390x844,1440x900')).map((value) => {
  const [width, height] = value.split('x').map(Number);
  return { width: width ?? 390, height: height ?? 844 };
});
const themes = list(option('themes', 'light,dark'));
const locales = list(option('locales', 'id'));
const routes = list(
  option(
    'routes',
    [
      '/churches',
      '/c/:church',
      '/c/:church/people',
      '/c/:church/more',
      '/c/:church/ministry',
      '/c/:church/finance',
      '/c/:church/worship',
      '/c/:church/profile-missing',
      '/profile',
    ].join(','),
  ),
);

type Session = { token: string; expiresAt: string; user: unknown };

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message: string } };
  if (!response.ok) {
    throw Object.assign(new Error(body.error?.message ?? `HTTP ${response.status}`), {
      status: response.status,
    });
  }
  return body;
}

async function signIn(): Promise<Session> {
  try {
    return await api<Session>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    if (!flag('seed')) throw error;
    return api<Session>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Maria Simanjuntak', email, password }),
    });
  }
}

const daysFromNow = (days: number, hour = 9) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

async function seed(token: string): Promise<string> {
  const mine = await api<{ items: { church: { id: string } }[] }>('/churches', { token });
  if (mine.items[0]) return mine.items[0].church.id;
  const { church } = await api<{ church: { id: string } }>('/churches', {
    method: 'POST',
    token,
    body: JSON.stringify({
      name: 'GKI Kebon Jati',
      description: 'Bertumbuh bersama dalam kasih Kristus.',
      city: 'Bandung',
      address: 'Jl. Kebon Jati No. 100',
      brandColor: '#b4502f',
    }),
  });
  const at = `/churches/${church.id}`;
  const people = [
    ['Andreas', 'Wijaya', 'member', '1985-03-14'],
    ['Maria', 'Simanjuntak', 'member', '1990-10-02'],
    ['Yohanes', 'Tambunan', 'regular', '1978-10-28'],
    ['Ester', 'Lumbantobing', 'member', '2001-06-19'],
    ['Daniel', 'Hutapea', 'visitor', null],
    ['Ruth', 'Siregar', 'member', '1995-01-30'],
    ['Samuel', 'Nainggolan', 'inactive', '1969-11-11'],
  ] as const;
  for (const [firstName, lastName, membershipStatus, birthDate] of people) {
    await api(`${at}/people`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        firstName,
        lastName,
        membershipStatus,
        birthDate,
        phone: '0812-3456-7890',
        email: `${firstName.toLowerCase()}@example.com`,
      }),
    });
  }
  const { group } = await api<{ group: { id: string } }>(`${at}/groups`, {
    method: 'POST',
    token,
    body: JSON.stringify({ name: 'Komisi Pemuda', type: 'komisi', meetingSchedule: 'Sabtu 18.00' }),
  });
  await api(`${at}/groups`, {
    method: 'POST',
    token,
    body: JSON.stringify({ name: 'Paduan Suara Efrata', type: 'choir' }),
  });
  for (const [title, days, groupId] of [
    ['Ibadah Minggu Pagi', 3, null],
    ['Persekutuan Pemuda', 5, group.id],
    ['Rapat Majelis Jemaat', 9, null],
  ] as const) {
    await api(`${at}/events`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        title,
        startsAt: daysFromNow(days),
        endsAt: daysFromNow(days, 11),
        location: 'Gedung Gereja',
        groupId,
      }),
    });
  }
  await api(`${at}/announcements`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      title: 'Perjamuan Kudus Minggu depan',
      body: 'Jemaat diundang mempersiapkan diri mengikuti Perjamuan Kudus.',
      status: 'published',
    }),
  });
  return church.id;
}

async function capture(browser: Browser, session: Session | null, churchId: string | null) {
  for (const locale of locales) {
    for (const theme of themes) {
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: viewport.width < 600 ? 2 : 1,
          colorScheme: theme === 'dark' ? 'dark' : 'light',
          locale: locale === 'id' ? 'id-ID' : 'en-GB',
          reducedMotion: 'reduce',
        });
        await context.addInitScript(
          ({ origin, session, theme, locale }) => {
            localStorage.setItem(
              'tatagereja.ui',
              JSON.stringify({ state: { theme, locale, lastChurchId: null }, version: 1 }),
            );
            if (session) {
              localStorage.setItem(
                'tatagereja.auth',
                JSON.stringify({ state: { sessions: { [origin]: session } }, version: 1 }),
              );
            }
          },
          { origin: base, session, theme, locale },
        );
        const page = await context.newPage();
        page.on('pageerror', (error) => console.error(`  page error: ${error.message}`));
        const targets = session ? routes : ['/welcome', '/login', '/register'];
        for (const route of targets) {
          const path = churchId ? route.replace(':church', churchId) : route;
          if (path.includes(':church')) continue;
          await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(400);
          const name = `${route.replace(/[/:]+/g, '_').replace(/^_|_$/g, '') || 'root'}-${viewport.width}-${theme}-${locale}.png`;
          await page.screenshot({ path: join(out, name), fullPage: flag('full') });
          console.info(`  ${name}`);
        }
        await context.close();
      }
    }
  }
}

mkdirSync(out, { recursive: true });
const session = await signIn();
const churchId = flag('seed')
  ? await seed(session.token)
  : ((await api<{ items: { church: { id: string } }[] }>('/churches', { token: session.token }))
      .items[0]?.church.id ?? null);
const browser = await chromium.launch();
try {
  console.info(`Capturing ${base} into ${out}`);
  await capture(browser, session, churchId);
  if (flag('anonymous')) await capture(browser, null, null);
} finally {
  await browser.close();
}
