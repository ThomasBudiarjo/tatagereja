/**
 * Latency benchmark of the endpoints people use most, against a running server with the large
 * church from scripts/seed-large.ts.
 *
 *   bun scripts/seed-large.ts --db /tmp/tatagereja-large.db --reset
 *   PORT=3202 DATABASE_PATH=/tmp/tatagereja-large.db bun run start
 *   bun scripts/bench-api.ts --port 3202
 *
 * Each endpoint is called sequentially (one connection, like one busy phone): a few warm-up
 * calls, then --runs measured calls. Prints p50, p95 and max in milliseconds and the response
 * size on the wire as a Markdown table (the format of docs/PERFORMANCE.md); --json <file> also
 * writes the raw numbers. Requests send `Accept-Encoding: gzip, br` like a browser, so
 * compression counts.
 * Report endpoints are measured cold: each call moves the start date by a day, so a report
 * cache never answers them.
 *
 * Options: --port <n> (default 3202) or --base <url>, --password <secret>, --runs <n> (default 30),
 * --only <substring> to run matching endpoints.
 */
export {};

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `${option('base', `http://localhost:${option('port', '3202')}`).replace(/\/$/, '')}/api`;
const password = option('password', 'bench-password');
const runs = Number(option('runs', '30'));
const only = option('only', '');
const jsonOut = option('json', '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose API payloads in a dev script
type Json = Record<string, any>;

async function api<T = Json>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message: string } };
  if (!response.ok) throw new Error(`${path}: ${response.status} ${json.error?.message ?? ''}`);
  return json;
}

const login = async (email: string) =>
  (await api<{ token: string }>('/auth/login', undefined, { email, password })).token;

const owner = await login('owner@large.test');
const member = await login('member@large.test');
// Cold report calls alternate between two staff accounts: report computations are rate-limited
// per person (300 in five minutes), and one run makes about 270 of them.
const admin = await login('admin@large.test');
const churchId = (await api<{ items: { church: { id: string } }[] }>('/churches', owner)).items[0]!
  .church.id;
const c = `/churches/${churchId}`;
const first = async (path: string, key = 'items') =>
  ((await api<Json>(path, owner))[key] as Json[])[0]!;

const person = await first(`${c}/people?limit=1&sort=name`);
const household = await first(`${c}/households?limit=1`);
const group = await first(`${c}/groups`);
const event = await first(`${c}/events?limit=1`);
const session = await first(`${c}/attendance/sessions?limit=1`);
const service = await first(`${c}/worship/services?limit=1`);
const careCase = await first(`${c}/care/cases?limit=1`);
const record = await first(`${c}/records/entries?limit=1`);

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const yearRange = `from=${day(-365)}&to=${day(0)}`;
const monthFrom = `${day(-15)}T00:00:00.000Z`;
const monthTo = `${day(16)}T00:00:00.000Z`;

/**
 * `bust`: each call asks for another date range, so the report cache never answers.
 * `cold`: a cheap write to the church before each call drops its result cache, so the call
 * computes from the database like the first one after any change.
 */
type Endpoint = { name: string; path: string; token?: string; bust?: boolean; cold?: boolean };
const endpoints: Endpoint[] = [
  { name: 'Session: me', path: '/auth/me' },
  { name: 'Churches of the account', path: '/churches' },
  { name: 'Church detail', path: c },
  { name: 'Notifications unread count', path: '/notifications/unread-count' },
  { name: 'Notifications list', path: '/notifications?limit=20' },
  { name: 'Home dashboard (owner)', path: `${c}/dashboard` },
  { name: 'Home dashboard (owner), after a write', path: `${c}/dashboard`, cold: true },
  { name: 'Home dashboard (member)', path: `${c}/dashboard`, token: member },
  { name: 'Directory summary', path: `${c}/directory/summary` },
  { name: 'Directory summary, after a write', path: `${c}/directory/summary`, cold: true },
  { name: 'People list', path: `${c}/people?limit=25` },
  { name: 'People search + filter', path: `${c}/people?q=sim&status=member&limit=25` },
  { name: 'People list, page 200', path: `${c}/people?limit=25&page=200` },
  { name: 'People list (member)', path: `${c}/people?limit=25`, token: member },
  { name: 'Person detail', path: `${c}/people/${person.id}` },
  { name: 'Person timeline', path: `${c}/people/${person.id}/timeline` },
  { name: 'Person attendance', path: `${c}/attendance/people/${person.id}` },
  { name: 'Households list', path: `${c}/households?limit=25` },
  { name: 'Household detail', path: `${c}/households/${household.id}` },
  { name: 'Groups list', path: `${c}/groups` },
  { name: 'Group detail', path: `${c}/groups/${group.id}` },
  { name: 'Events list', path: `${c}/events?limit=25` },
  { name: 'Event detail', path: `${c}/events/${event.id}` },
  { name: 'Announcements list', path: `${c}/announcements?limit=20` },
  { name: 'Calendar month', path: `${c}/calendar?from=${monthFrom}&to=${monthTo}` },
  { name: 'Warta Jemaat list', path: `${c}/bulletins?limit=20` },
  { name: 'Attendance sessions', path: `${c}/attendance/sessions?limit=25` },
  { name: 'Attendance session detail', path: `${c}/attendance/sessions/${session.id}` },
  { name: 'Absence alerts', path: `${c}/attendance/absences` },
  { name: 'Absence alerts, after a write', path: `${c}/attendance/absences`, cold: true },
  { name: 'Worship overview', path: `${c}/worship/overview` },
  { name: 'Worship services', path: `${c}/worship/services?limit=25` },
  { name: 'Worship service detail', path: `${c}/worship/services/${service.id}` },
  { name: 'Song library', path: `${c}/worship/songs?limit=30` },
  { name: 'Care overview', path: `${c}/care/overview` },
  { name: 'Care cases', path: `${c}/care/cases?limit=25` },
  { name: 'Care case detail', path: `${c}/care/cases/${careCase.id}` },
  { name: 'Registry entries', path: `${c}/records/entries?limit=20` },
  { name: 'Registry entry detail', path: `${c}/records/entries/${record.id}` },
  { name: 'Finance summary', path: `${c}/finance/summary` },
  { name: 'Finance ledger', path: `${c}/finance/entries?limit=25` },
  { name: 'Finance ledger, 1 year filter', path: `${c}/finance/entries?limit=25&${yearRange}` },
  { name: 'Contributions', path: `${c}/finance/contributions?limit=25` },
  {
    name: 'Finance report: income vs expense',
    path: `${c}/finance/reports/income_expense?${yearRange}`,
    bust: true,
  },
  {
    name: 'Finance report: by category',
    path: `${c}/finance/reports/by_category?${yearRange}`,
    bust: true,
  },
  {
    name: 'Finance report: weekly trend',
    path: `${c}/finance/reports/trend?${yearRange}`,
    bust: true,
  },
  {
    name: 'Report: attendance trend',
    path: `${c}/insights/reports/attendance_trend?${yearRange}`,
    bust: true,
  },
  {
    name: 'Report: membership growth',
    path: `${c}/insights/reports/membership_growth?${yearRange}`,
    bust: true,
  },
  {
    name: 'Report: demographics',
    path: `${c}/insights/reports/demographics?${yearRange}`,
    bust: true,
  },
  {
    name: 'Report: giving trend',
    path: `${c}/insights/reports/giving_trend?${yearRange}`,
    bust: true,
  },
  {
    name: 'Report: volunteer engagement',
    path: `${c}/insights/reports/volunteer_engagement?${yearRange}`,
    bust: true,
  },
  { name: 'Facility bookings', path: `${c}/facilities/bookings?limit=25` },
  { name: 'Inventory assets', path: `${c}/inventory/assets?limit=25` },
  { name: 'Audit log', path: `${c}/audit-logs?limit=50` },
  { name: 'Export: people CSV', path: `${c}/people/export` },
];

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;

type Result = { name: string; path: string; p50: number; p95: number; max: number; bytes: number };
const results: Result[] = [];

async function measure(endpoint: Endpoint, index: number) {
  const url = (call: number) =>
    `${base}${endpoint.bust ? endpoint.path.replace(yearRange, `from=${day(-365 - (call % 300) - 1)}&to=${day(0)}`) : endpoint.path}`;
  const call = async (n: number) => {
    if (endpoint.cold) {
      // Saving the same home layout again is a write to the church: its cache is dropped.
      await fetch(`${base}${c}/dashboard/preferences`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${owner}`, 'content-type': 'application/json' },
        body: JSON.stringify({ hiddenWidgets: [], widgetOrder: [] }),
      });
    }
    const started = performance.now();
    const response = await fetch(url(n), {
      headers: {
        authorization: `Bearer ${endpoint.token ?? (endpoint.bust && n % 2 === 1 ? admin : owner)}`,
        'accept-encoding': 'gzip, br',
      },
      // Bytes as sent: compressed when the server compresses.
      decompress: false,
    });
    const body = await response.arrayBuffer();
    const elapsed = performance.now() - started;
    if (!response.ok) {
      throw new Error(
        `${endpoint.name}: ${response.status} ${new TextDecoder().decode(body).slice(0, 200)}`,
      );
    }
    return { elapsed, bytes: body.byteLength };
  };
  for (let warm = 0; warm < 3; warm += 1) await call(index * 1000 + runs + warm);
  const times: number[] = [];
  let bytes = 0;
  for (let run = 0; run < runs; run += 1) {
    const result = await call(index * 1000 + run);
    times.push(result.elapsed);
    bytes = result.bytes;
  }
  times.sort((a, b) => a - b);
  results.push({
    name: endpoint.name,
    path: endpoint.path.replace(churchId, ':church'),
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    max: times[times.length - 1] ?? 0,
    bytes,
  });
}

const selected = endpoints.filter(
  (endpoint) => !only || endpoint.name.toLowerCase().includes(only.toLowerCase()),
);
for (const [index, endpoint] of selected.entries()) {
  try {
    await measure(endpoint, index);
  } catch (error) {
    console.warn(`  failed ${endpoint.name}: ${(error as Error).message}`);
  }
}

const ms = (value: number) => value.toFixed(1);
const kb = (value: number) => (value / 1024).toFixed(1);
const lines = [
  '| Endpoint | p50 ms | p95 ms | max ms | KB |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...results.map(
    (row) =>
      `| ${row.name} | ${ms(row.p50)} | ${ms(row.p95)} | ${ms(row.max)} | ${kb(row.bytes)} |`,
  ),
];
console.info(lines.join('\n'));
if (jsonOut) await Bun.write(jsonOut, JSON.stringify(results, null, 2));
