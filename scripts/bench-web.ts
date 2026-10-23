/**
 * Page-load benchmark of the built web app on a throttled mid-range phone profile.
 *
 *   bun run build
 *   WEB_DIST_DIR=$PWD/apps/web/dist PORT=3204 DATABASE_PATH=/tmp/bench-web.db bun run --cwd apps/api start &
 *   bun scripts/seed-demo.ts --port 3204
 *   bun scripts/bench-web.ts --port 3204 --runs 3 --json /tmp/bench-web.json
 *
 * Every run opens the page in a fresh browser context (an empty HTTP cache, a cold load) with
 * Chrome DevTools Protocol throttling: the CPU slowed down four times and the DevTools "Fast 3G"
 * network (562.5 ms round trip, 1.44 Mbit/s down, 675 kbit/s up). It reports the median of:
 *
 *   LCP    largest contentful paint
 *   Ready  the last change to the page before it went quiet (data shown, skeletons gone)
 *   TBT    total blocking time, approximated as the sum of every long task's time over 50 ms
 *          from the first contentful paint until the page went quiet
 *   Busy   the same sum over every long task, before the first paint too (script parsing and
 *          the first render of a single-page app happen before anything is painted)
 *   API    the median time of the page's API requests (the network profile at work)
 *   JS     script bytes on the wire (compressed) before the first paint, in total, and every
 *          byte on the wire (idle-time prefetches included)
 *
 * The page counts as quiet when no request is in flight and nothing was painted, changed or
 * run as a long task for 1.5 s.
 *
 * Options (all optional):
 *   --base <url> | --port <n>   app origin (default http://localhost:3204)
 *   --runs <n>                  cold loads per page (default 3)
 *   --routes <list>             comma-separated paths; `:church` becomes the first church id
 *   --email/--password          account for signed-in pages (default demo@tatagereja.test)
 *   --no-throttle               measure without throttling
 *   --warm                      a second load in the same context after each cold one (HTTP
 *                               cache and the service worker's precache in place), reported
 *                               separately; the service worker's own requests get the same
 *                               throttling (Playwright routing) as the page's
 *   --json <file>               also write the raw results
 *
 * Uses the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH); never run `playwright install`.
 */
import { writeFileSync } from 'node:fs';
import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright';

// Lets Playwright see and route the requests a service worker makes (Chromium only).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= '1';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1]!.startsWith('--')
    ? args[index + 1]!
    : fallback;
};

const base = option('base', `http://localhost:${option('port', '3204')}`).replace(/\/$/, '');
const runs = Number(option('runs', '3'));
const email = option('email', 'demo@tatagereja.test');
const password = option('password', 'demo-password');
const throttle = !flag('no-throttle');
const routes = option(
  'routes',
  '/welcome,/login,/c/:church,/c/:church/people,/c/:church/finance,/c/:church/calendar',
)
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean);

/** DevTools "Fast 3G" (the values Chrome itself uses for the preset). */
const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9,
  uploadThroughput: ((750 * 1000) / 8) * 0.9,
};

type Sample = {
  lcp: number;
  fcp: number;
  ready: number;
  tbt: number;
  busy: number;
  apiMs: number;
  firstJsKb: number;
  jsKb: number;
  totalKb: number;
  requests: number;
};

type Vitals = {
  lcp: number;
  fcp: number;
  changed: number;
  longTasks: { start: number; duration: number }[];
};

type BrowserSession = { cookie: { name: string; value: string }; user: unknown; expiresAt: string };

async function browserSignIn(): Promise<BrowserSession> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email, password, transport: 'cookie' }),
  });
  const body = (await response.json()) as { user: unknown; sessionExpiresAt: string };
  const [pair = ''] = (response.headers.get('set-cookie') ?? '').split(';');
  const [name = '', value = ''] = pair.split('=');
  if (!response.ok || !value) throw new Error(`Cookie sign-in failed (HTTP ${response.status})`);
  return { cookie: { name, value }, user: body.user, expiresAt: body.sessionExpiresAt };
}

async function firstChurchId(session: BrowserSession): Promise<string | null> {
  const response = await fetch(`${base}/api/churches`, {
    headers: { cookie: `${session.cookie.name}=${session.cookie.value}` },
  });
  const body = (await response.json()) as { items?: { church: { id: string } }[] };
  return body.items?.[0]?.church.id ?? null;
}

/** Records paints and long tasks from the very start of the document. */
const observeVitals = () => {
  const vitals = {
    lcp: 0,
    fcp: 0,
    changed: 0,
    longTasks: [] as { start: number; duration: number }[],
  };
  (window as unknown as { __vitals: typeof vitals }).__vitals = vitals;
  new MutationObserver(() => {
    vitals.changed = performance.now();
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) vitals.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') vitals.fcp = entry.startTime;
    }
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      vitals.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }
  }).observe({ type: 'longtask', buffered: true });
};

async function throttled(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', FAST_3G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  return cdp;
}

async function measure(page: Page, url: string): Promise<Sample> {
  const cdp = await throttled(page);
  const types = new Map<string, string>();
  const inFlight = new Set<string>();
  let lastNetwork = Date.now();
  let jsBytes = 0;
  let totalBytes = 0;
  const scripts: { at: number; bytes: number }[] = [];
  let requests = 0;
  cdp.on('Network.requestWillBeSent', (event) => {
    inFlight.add(event.requestId);
    lastNetwork = Date.now();
  });
  cdp.on('Network.responseReceived', (event) => {
    types.set(event.requestId, event.type);
  });
  const done = (requestId: string) => {
    inFlight.delete(requestId);
    lastNetwork = Date.now();
  };
  cdp.on('Network.loadingFailed', (event) => done(event.requestId));
  cdp.on('Network.loadingFinished', (event) => {
    done(event.requestId);
    requests += 1;
    totalBytes += event.encodedDataLength;
    if (types.get(event.requestId) === 'Script') {
      jsBytes += event.encodedDataLength;
      scripts.push({ at: Date.now(), bytes: event.encodedDataLength });
    }
  });
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  const read = () => page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals);
  const deadline = Date.now() + 60_000;
  let vitals: Vitals;
  for (;;) {
    await page.waitForTimeout(250);
    vitals = await read();
    const now = await page.evaluate(() => performance.now());
    const lastTask = vitals.longTasks.reduce(
      (last, task) => Math.max(last, task.start + task.duration),
      0,
    );
    const quietPage = now - Math.max(vitals.lcp, vitals.changed, lastTask) > 1500;
    const quietNetwork = inFlight.size === 0 && Date.now() - lastNetwork > 1500;
    if ((quietPage && quietNetwork) || Date.now() > deadline) break;
  }
  const overFifty = (tasks: { start: number; duration: number }[], from: number) =>
    tasks
      .filter((task) => task.start + task.duration > from)
      .reduce((sum, task) => {
        const start = Math.max(task.start, from);
        return sum + Math.max(0, task.start + task.duration - start - 50);
      }, 0);
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const apiMs = await page.evaluate(() => {
    const durations = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/api/'))
      .map((entry) => entry.duration)
      .sort((a, b) => a - b);
    return durations[Math.floor(durations.length / 2)] ?? 0;
  });
  const firstPaint = timeOrigin + vitals.fcp;
  await cdp.detach();
  return {
    firstJsKb:
      scripts.filter((script) => script.at <= firstPaint).reduce((sum, s) => sum + s.bytes, 0) /
      1024,
    lcp: vitals.lcp,
    fcp: vitals.fcp,
    ready: vitals.changed,
    tbt: overFifty(vitals.longTasks, vitals.fcp),
    busy: overFifty(vitals.longTasks, 0),
    apiMs,
    jsKb: jsBytes / 1024,
    totalKb: totalBytes / 1024,
    requests,
  };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function newContext(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  session: BrowserSession | null,
  serviceWorkers: 'allow' | 'block',
): Promise<BrowserContext> {
  const context = await browser.newContext({
    serviceWorkers,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'id-ID',
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-A346E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  });
  await context.addInitScript(observeVitals);
  if (serviceWorkers === 'allow' && throttle) {
    // DevTools throttling only slows the page's own requests. What the service worker
    // fetches (API reads, precaching) gets the same round trip and bandwidth here.
    await context.route('**/*', async (route) => {
      if (!route.request().serviceWorker()) return route.fallback();
      const response = await route.fetch();
      const body = await response.body();
      await sleep(FAST_3G.latency + (body.byteLength / FAST_3G.downloadThroughput) * 1000);
      return route.fulfill({ response, body });
    });
  }
  if (session) {
    await context.addCookies([
      { ...session.cookie, url: base, httpOnly: true, sameSite: 'Strict' },
    ]);
    await context.addInitScript(
      ({ origin, session }) => {
        localStorage.setItem(
          'tatagereja.auth',
          JSON.stringify({
            state: {
              sessions: {
                [origin]: {
                  transport: 'cookie',
                  user: session.user,
                  sessionExpiresAt: session.expiresAt,
                  refreshToken: null,
                },
              },
            },
            version: 2,
          }),
        );
      },
      { origin: base, session },
    );
  }
  return context;
}

const session = await browserSignIn();
const churchId = await firstChurchId(session);
const browser = await chromium.launch();
const results: { route: string; kind: 'cold' | 'warm'; samples: Sample[] }[] = [];

for (const route of routes) {
  if (route.includes(':church') && !churchId) continue;
  const path = route.replace(':church', churchId ?? '');
  const signedIn = !['/welcome', '/login', '/register', '/server'].includes(route);
  const cold: Sample[] = [];
  const warm: Sample[] = [];
  for (let run = 0; run < runs; run += 1) {
    // Cold loads are a first visit: no service worker yet (it installs after the page).
    const context = await newContext(
      browser,
      signedIn ? session : null,
      flag('warm') ? 'allow' : 'block',
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(`  page error: ${error.message}`));
    cold.push(await measure(page, `${base}${path}`));
    if (flag('warm')) {
      // The service worker finishes precaching the shell before it activates.
      await page.evaluate(() =>
        Promise.race([
          navigator.serviceWorker?.ready,
          new Promise((resolve) => setTimeout(resolve, 60_000)),
        ]).then(() => undefined),
      );
      const again = await context.newPage();
      warm.push(await measure(again, `${base}${path}`));
    }
    await context.close();
  }
  results.push({ route, kind: 'cold', samples: cold });
  if (warm.length > 0) results.push({ route, kind: 'warm', samples: warm });
}
await browser.close();

const pad = (value: string, width: number) => value.padStart(width);
console.info(
  `${'Page'.padEnd(26)} ${pad('FCP ms', 7)} ${pad('LCP ms', 7)} ${pad('Ready', 7)} ${pad('TBT ms', 7)} ${pad('Busy', 7)} ${pad('API ms', 7)} ${pad('JS@FCP', 7)} ${pad('JS KB', 7)} ${pad('All KB', 7)} ${pad('Req', 4)}`,
);
for (const { route, kind, samples } of results) {
  const of = (key: keyof Sample) => median(samples.map((sample) => sample[key]));
  const label = kind === 'warm' ? `${route} (warm)` : route;
  console.info(
    `${label.padEnd(26)} ${pad(of('fcp').toFixed(0), 7)} ${pad(of('lcp').toFixed(0), 7)} ${pad(of('ready').toFixed(0), 7)} ${pad(of('tbt').toFixed(0), 7)} ${pad(of('busy').toFixed(0), 7)} ${pad(of('apiMs').toFixed(0), 7)} ${pad(of('firstJsKb').toFixed(1), 7)} ${pad(of('jsKb').toFixed(1), 7)} ${pad(of('totalKb').toFixed(1), 7)} ${pad(of('requests').toFixed(0), 4)}`,
  );
}
const json = option('json', '');
if (json) writeFileSync(json, JSON.stringify({ base, throttle, runs, results }, null, 2));
