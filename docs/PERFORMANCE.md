# Performance

TataGereja runs on one Bun process and one SQLite file. This page records how fast the API is for
a large congregation and how fast the web app opens on a mid-range Android phone over 3G
([Web app](#web-app)), what keeps both fast, and the rules new code follows so it stays that way.

## Measuring

```sh
bun scripts/seed-large.ts --db /tmp/tatagereja-large.db --reset   # ~20 s
PORT=3202 DATABASE_PATH=/tmp/tatagereja-large.db bun run start
bun scripts/bench-api.ts --port 3202 --runs 20 --json /tmp/bench.json
```

`scripts/seed-large.ts` builds the church of a big GKI/HKBP congregation after two years of use,
with a fixed random seed so every run is the same: 8,000 people in 2,500 households and 20
Wilayah, 150 groups, 104 weeks of two Sunday services with roster attendance (477k marks), 47k
ledger entries (46k Persembahan and Perpuluhan, counted offerings, paid expenses), 5k care
entries (cases, notes, Perkunjungan, prayer requests, tasks, diakonia), 3k registry records,
2k bookings, 1k assets, 300 events with registrations, 20k notifications and 50k audit rows.
Accounts, the church, its roles and the finance setup go through the API in-process; the bulk
rows are inserted directly (`apps/api/src/db/bulk.ts`). Sign in as `owner@large.test`,
`admin@large.test`, `treasurer@large.test` or `member@large.test` with `bench-password`.

`scripts/bench-api.ts` signs in and calls each endpoint one request at a time (one busy phone):
three warm-up calls, then `--runs` measured calls, reporting p50, p95 and the bytes on the wire
with `Accept-Encoding: gzip, br`. Report endpoints are measured cold: each call asks for another
date range, so the report cache never answers. Rows marked "after a write" save the home layout
(a write to the church) before every call, so they measure the first request after any change.

Both tables below were taken on the same machine: 4 vCPU Intel Xeon @ 2.10 GHz, 15 GB RAM,
Bun 1.4.2 with `BUN_OPTIONS=--smol`, the database on local disk.

## Before

Measured on `ccr-b98ad5cc-t4fgxr` at `c7991e0` (20 runs). Bodies were sent uncompressed.

| Endpoint                          | p50 ms | p95 ms |     KB |
| --------------------------------- | -----: | -----: | -----: |
| Session: me                       |    0.6 |    1.0 |    0.2 |
| Churches of the account           |    0.9 |    1.4 |    0.6 |
| Church detail                     |    1.3 |    2.9 |    2.1 |
| Notifications unread count        |    2.7 |    3.3 |    0.0 |
| Notifications list                |   14.2 |   17.5 |    7.4 |
| Home dashboard (owner)            |  962.3 | 1206.8 |   26.5 |
| Home dashboard (member)           |   73.4 |   99.4 |   23.4 |
| Directory summary                 |   71.7 |   88.5 |    2.9 |
| People list                       |    3.7 |    4.8 |   15.8 |
| People search + filter            |    9.6 |   13.3 |   16.5 |
| People list, page 200             |   11.0 |   15.0 |   16.3 |
| People list (member)              |    3.3 |    4.7 |   15.8 |
| Person detail                     |    3.1 |    6.2 |    2.7 |
| Person timeline                   |    3.3 |    3.9 |    0.9 |
| Person attendance                 |    7.7 |   10.0 |   18.3 |
| Households list                   |    3.2 |    5.2 |   28.3 |
| Household detail                  |    2.2 |    8.8 |    1.4 |
| Groups list                       |    4.9 |    8.0 |   88.0 |
| Group detail                      |    5.5 |    6.1 |   16.0 |
| Events list                       |    2.7 |    3.9 |   24.7 |
| Event detail                      |    2.4 |    2.9 |    1.5 |
| Announcements list                |    4.0 |    7.7 |   46.8 |
| Calendar month                    |    3.3 |    5.6 |   33.9 |
| Warta Jemaat list                 |    1.9 |    2.5 |    8.5 |
| Attendance sessions               |   51.4 |   70.4 |   12.1 |
| Attendance session detail         |  113.7 |  179.2 | 1283.2 |
| Absence alerts                    |  959.3 | 1231.1 |    4.3 |
| Worship overview                  |   14.6 |   22.5 |   10.3 |
| Worship services                  |    2.5 |    4.8 |    5.7 |
| Worship service detail            |    3.7 |    6.2 |    8.2 |
| Song library                      |    2.9 |    3.7 |   78.7 |
| Care overview                     |    8.3 |   14.3 |    4.7 |
| Care cases                        |    4.4 |    5.6 |   13.5 |
| Care case detail                  |    1.4 |    1.6 |    1.1 |
| Registry entries                  |    3.6 |    7.3 |   18.7 |
| Registry entry detail             |    1.5 |    2.6 |    1.2 |
| Finance summary                   |  124.2 |  142.0 |    5.7 |
| Finance ledger                    |   11.3 |   13.2 |   12.7 |
| Finance ledger, 1 year filter     |   34.4 |   41.1 |   12.7 |
| Contributions                     |   33.7 |   40.7 |   18.4 |
| Finance report: income vs expense |   67.0 |   69.6 |    2.2 |
| Finance report: by category       |   71.2 |   86.5 |    2.1 |
| Finance report: weekly trend      |   77.5 |  102.7 |    7.2 |
| Report: attendance trend          |  286.7 |  379.0 |    2.5 |
| Report: membership growth         |   21.7 |   31.1 |    1.9 |
| Report: demographics              |   33.6 |   50.5 |    2.6 |
| Report: giving trend              |  134.1 |  178.9 |    2.9 |
| Report: volunteer engagement      |   67.1 |   86.6 |    2.3 |
| Facility bookings                 |    4.8 |   10.3 |   18.9 |
| Inventory assets                  |    2.8 |    4.3 |   15.2 |
| Audit log                         |   12.0 |   16.7 |   22.3 |
| Export: people CSV                |  200.3 |  252.1 | 1074.1 |

The slow ones had one cause each: the absence list and the home dashboard read every attendance
mark of the church into memory (477k rows) to find streaks; reports loaded every matching row and
summed in JavaScript, creating a date formatter per row; the attendance roster looked each
recorded person up with a linear scan of the list; finance totals scanned the ledger once per
account, fund and month.

## After

Same machine, data and runs. "KB sent" is the compressed size; "p95 before" repeats the column
above (for "after a write" rows it is the same endpoint, which was always computed then).

| Endpoint                              | p50 ms | p95 ms | KB sent | p95 before |
| ------------------------------------- | -----: | -----: | ------: | ---------: |
| Session: me                           |    0.7 |    1.0 |     0.2 |        1.0 |
| Churches of the account               |    1.3 |    1.7 |     0.6 |        1.4 |
| Church detail                         |    1.8 |    5.3 |     0.8 |        2.9 |
| Notifications unread count            |    1.7 |    1.8 |     0.0 |        3.3 |
| Notifications list                    |    6.9 |   10.0 |     1.4 |       17.5 |
| Home dashboard (owner)                |   10.5 |   13.9 |     3.2 |     1206.8 |
| Home dashboard (owner), after a write |   70.5 |   98.7 |     3.2 |     1206.8 |
| Home dashboard (member)               |    6.5 |    8.4 |     2.4 |       99.4 |
| Directory summary                     |    1.7 |    1.9 |     0.8 |       88.5 |
| Directory summary, after a write      |   25.9 |   36.2 |     0.8 |       88.5 |
| People list                           |    3.9 |    5.8 |     2.9 |        4.8 |
| People search + filter                |    7.7 |    8.3 |     3.0 |       13.3 |
| People list, page 200                 |    9.2 |   10.6 |     3.0 |       15.0 |
| People list (member)                  |    3.5 |    4.2 |     2.9 |        4.7 |
| Person detail                         |    4.0 |    7.3 |     1.0 |        6.2 |
| Person timeline                       |    3.3 |    3.8 |     0.9 |        3.9 |
| Person attendance                     |    3.6 |    3.9 |     2.8 |       10.0 |
| Households list                       |    3.6 |    6.7 |     4.6 |        5.2 |
| Household detail                      |    2.4 |    2.5 |     0.6 |        8.8 |
| Groups list                           |    5.5 |    7.4 |     5.3 |        8.0 |
| Group detail                          |    4.8 |    5.4 |     3.5 |        6.1 |
| Events list                           |    2.9 |    3.4 |     2.3 |        3.9 |
| Event detail                          |    2.7 |    3.6 |     0.8 |        2.9 |
| Announcements list                    |    3.0 |    4.3 |     1.4 |        7.7 |
| Calendar month                        |    3.6 |    4.1 |     4.2 |        5.6 |
| Warta Jemaat list                     |    2.0 |    2.4 |     1.0 |        2.5 |
| Attendance sessions                   |    6.9 |    9.6 |     1.5 |       70.4 |
| Attendance session detail             |   27.5 |   39.5 |   187.4 |      179.2 |
| Absence alerts                        |    1.4 |    2.1 |     0.8 |     1231.1 |
| Absence alerts, after a write         |   33.9 |   40.0 |     0.8 |     1231.1 |
| Worship overview                      |   10.1 |   12.9 |     1.7 |       22.5 |
| Worship services                      |    2.1 |    2.5 |     0.8 |        4.8 |
| Worship service detail                |    3.2 |    4.4 |     1.9 |        6.2 |
| Song library                          |    2.2 |    3.3 |     1.6 |        3.7 |
| Care overview                         |    5.5 |    6.0 |     1.2 |       14.3 |
| Care cases                            |    5.0 |    6.8 |     2.3 |        5.6 |
| Care case detail                      |    1.7 |    2.5 |     0.6 |        1.6 |
| Registry entries                      |    4.2 |    5.5 |     2.5 |        7.3 |
| Registry entry detail                 |    2.1 |    4.7 |     0.6 |        2.6 |
| Finance summary                       |   17.7 |   24.6 |     1.3 |      142.0 |
| Finance ledger                        |    5.5 |    7.8 |     1.9 |       13.2 |
| Finance ledger, 1 year filter         |    3.8 |    4.2 |     1.9 |       41.1 |
| Contributions                         |    6.4 |    9.2 |     2.4 |       40.7 |
| Finance report: income vs expense     |   17.7 |   22.8 |     0.4 |       69.6 |
| Finance report: by category           |   23.9 |   32.9 |     0.7 |       86.5 |
| Finance report: weekly trend          |   28.7 |   46.7 |     1.1 |      102.7 |
| Report: attendance trend              |   26.6 |   37.0 |     0.7 |      379.0 |
| Report: membership growth             |   19.5 |   27.7 |     0.4 |       31.1 |
| Report: demographics                  |   30.8 |   44.5 |     1.1 |       50.5 |
| Report: giving trend                  |   44.0 |   60.1 |     0.9 |      178.9 |
| Report: volunteer engagement          |    9.7 |   12.0 |     0.6 |       86.6 |
| Facility bookings                     |    5.3 |    7.6 |     2.3 |       10.3 |
| Inventory assets                      |    2.9 |    3.3 |     2.4 |        4.3 |
| Audit log                             |    4.0 |    5.4 |     3.3 |       16.7 |
| Export: people CSV                    |  127.8 |  152.3 |   243.5 |      252.1 |

Every list and detail is under 50 ms at p95 and every report under 200 ms, cold. The home
dashboard is a composite of a dozen widgets: 14 ms from the cache, about 100 ms at p95 right after a write. The people CSV export (8,000 rows, 1 MB before compression) takes about 150 ms.

## What keeps it fast

### SQLite

`openDatabase` (`apps/api/src/db/client.ts`) tunes the single connection: WAL with
`synchronous = NORMAL` (no fsync per commit; a power cut can lose the last commits but never
corrupts), `foreign_keys = ON`, a 64 MB page cache, 256 MB of memory-mapped reads,
`temp_store = MEMORY`, and `PRAGMA optimize` at open, every six hours and at close. After a
migration it runs a full `ANALYZE`, because new indexes have no statistics and the planner may
otherwise keep using an older, worse index.

### Indexes

Hot queries are answered from covering indexes (checked with `EXPLAIN QUERY PLAN`):

| Index                                                                                                                       | Serves                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `attendance_records (church_id, status, person_id, session_at)`                                                             | absence streaks, last present                                                   |
| `attendance_records (session_id, status)`                                                                                   | present/absent counts per session, attendance trend                             |
| `finance_entries (church_id, entry_date, created_at, id, voided_at, source_type, amount, account_id, fund_id, category_id)` | the ledger in posting order, date-range counts, every finance and giving report |
| `finance_entries (church_id, account_id, fund_id, voided_at, amount)`                                                       | account and fund balances                                                       |
| `finance_entries (church_id, account_id, entry_date, created_at, id, voided_at, amount)`                                    | one account's ledger and its running balance                                    |
| `finance_contributions (church_id, received_at, created_at, voided_at, amount)`                                             | the gift list with its count and total                                          |
| `person_privacy_settings (church_id)`                                                                                       | directory counts and exports                                                    |

`attendance_records.session_at` is a copy of the session's time, kept in step by
`services/attendance.ts` (`syncRecordTimes` on every move of a session) and filled in at startup
for older rows. With it, a person's streak is two index seeks instead of joining every mark to
its session.

### Queries

- **Aggregate in SQL.** Reports, balances and counts use `GROUP BY` and `sum()` over the indexes
  above; JavaScript only folds days into periods. The finance summary reads its six months in
  one grouped query, running balances come from a window `sum() over (...)` for the rows of the
  page only.
- **No N+1.** Hydrators load related rows for a whole page with `inArray` (and roster names once
  for a whole schedule). Very long id lists (over 500, e.g. the CSV export) match through a
  subquery of the church's people (`personIdsIn`) instead of binding thousands of parameters.
- **Summaries in lists.** Lists select only what they show: the song list leaves lyrics to the
  detail, rosters select the person summary columns.
- **One query for the church context.** The `church` macro loads the church, the membership, the
  linked person, the custom roles and the led groups in one query; enabled modules are parsed
  once per church row.
- **Cached formatters.** `dateTimeFormat()` (shared) caches `Intl.DateTimeFormat` objects;
  creating one costs about fifty times as much as formatting with it.

### Bounded lists

Every list has a hard maximum: paged lists through their query schema (`LIMITS.pageSizeMax`,
`LIMITS.auditPageSizeMax`), lists that are not paged through `LIMITS.listMax` (500). The audit
log, notifications, the ledger and attendance sessions also page with a cursor: pass a page's
`nextCursor` back as `cursor` to get the rows after it with an index range instead of `OFFSET`,
at the same cost on page 1,000 as on page 1 and without skipping or repeating rows when new ones
arrive (`apps/api/src/lib/cursor.ts`).

### Result cache

Reports, absence lists and directory counts go through a small per-church cache
(`apps/api/src/lib/cache.ts`): entries live for a minute and are dropped by any mutating request
to the church (`POST`, `PUT`, `PATCH`, `DELETE` under `/api/churches/:churchId`) and by account
changes a church shows (profile, account deletion, joining, registering with an invitation). The TTL bounds what no request
changes: today, "upcoming", scheduled posts. Report computations that miss the cache count
against a per-person budget of 300 in five minutes (`services/report-cache.ts`); answers from the
cache are free.

### HTTP

- JSON and text of 1 KB and more are sent with brotli (quality 4; quality 1 above 256 KB) or gzip
  when the client accepts it.
- Compression does not open a BREACH-style leak: the API authenticates with a bearer token that
  browsers never attach to cross-site requests, so another site cannot make a member's browser
  fetch authenticated answers to compare their sizes.
- Successful `GET`s carry a weak `ETag`; a matching `If-None-Match` gets `304` with no body. API
  answers stay `Cache-Control: no-store`, so browsers do not keep member data on shared church
  computers; clients that revalidate on their own (calendar apps, scripts) benefit.
- The web build writes a `.br` and a `.gz` twin of every compressible file (Vite plugin in
  `apps/web/vite.config.ts`), and the server sends them as they are. Fingerprinted files under
  `assets/` are `immutable` for a year; `index.html` and other files are `no-cache` with `ETag`
  and `Last-Modified`, answered with `304` when unchanged.

## Rules for new code

1. Check the plan of every new hot query on the large church (`EXPLAIN QUERY PLAN`) and add an
   index in the owning schema file when it scans or sorts a big table.
2. Sum, count and group in SQL. Never load a table's rows to count them in JavaScript.
3. Hydrate pages with one query per related table; for whole-church lists use `personIdsIn`.
4. Give every list a maximum; use a cursor (`lib/cursor.ts`) for tables that grow without bound.
5. Expensive read-only results go through `cachedReport` (or `deps.cache.remember` with a key that
   names everything the result depends on, including the caller's scope). Writes need nothing:
   every mutating church request drops the church's entries, and any other write drops every
   church unless its path is in `ACCOUNT_ONLY` (`lib/cache.ts`). Add a route there only when it
   can never change church data (registration cannot: an invitation token joins a church).
6. A column copied from another table for speed is written at every write site, kept in step
   when the source changes, and backfilled at startup in `backfillCopiedColumns`.
7. Run the benchmark before and after a change that touches a hot path.

## Web app

### Measuring

```sh
bun run build
WEB_DIST_DIR=$PWD/apps/web/dist PORT=3204 DATABASE_PATH=/tmp/bench-web.db bun run start &
bun scripts/seed-demo.ts --port 3204
bun scripts/bench-web.ts --port 3204 --runs 3 [--warm] --json /tmp/bench-web.json

BUNDLE_REPORT=/tmp/bundle.json bun run --cwd apps/web build
bun scripts/bundle-report.ts /tmp/bundle.json            # first download, biggest chunks
bun scripts/bundle-report.ts /tmp/bundle.json --chunk vendor   # what fills one chunk
```

`scripts/bench-web.ts` opens each page of the built app in a fresh Chromium context (an empty
cache: a first visit) through the Chrome DevTools Protocol with the CPU slowed down four times
and the DevTools "Fast 3G" network: 562.5 ms round trip, 1.44 Mbit/s down, 675 kbit/s up, a
390 × 844 phone screen. It reports the median of three runs:

| Column | Meaning                                                                                   |
| ------ | ----------------------------------------------------------------------------------------- |
| FCP    | first contentful paint                                                                    |
| LCP    | largest contentful paint                                                                  |
| Ready  | the last change to the page before it went quiet (data shown, idle-time prefetches done)  |
| TBT    | total blocking time: long tasks' time over 50 ms between the first paint and quiet        |
| Busy   | the same sum from the start (a single-page app parses and renders before its first paint) |
| JS     | script bytes on the wire (brotli) before the first paint                                  |

With `--warm` every first visit is followed by a second load in the same context once the
service worker has precached the app shell: a repeat visit, how people use an installed app.
The service worker's own requests get the same round trip and bandwidth as the page's.

Both tables were taken on the machine of the API tables (4 vCPU Intel Xeon @ 2.10 GHz),
Chromium 141, against the demo church of `scripts/seed-demo.ts` signed in as its owner.

### Before

Measured on `ccr-b98ad5cc-t4fgxr` at `6b7aa97`.

| Page             | FCP ms | LCP ms | Ready ms | TBT ms | Busy ms | JS KB |
| ---------------- | -----: | -----: | -------: | -----: | ------: | ----: |
| `/welcome`       |  4,876 |  4,876 |    4,866 |      0 |     461 | 385.0 |
| `/login`         |  5,024 |  5,024 |    5,007 |      0 |     711 | 385.0 |
| Home             |  4,204 |  8,120 |    8,375 |    328 |     859 | 385.1 |
| People list      |  4,224 |  8,708 |    9,276 |    311 |     798 | 385.1 |
| Finance home     |  4,280 |  9,236 |    9,020 |    314 |   1,077 | 385.1 |
| Calendar (month) |  4,332 |  9,012 |    9,011 |    351 |     930 | 385.1 |

Every page started with the same 1.4 MB of script (429 KB gzip, 385 KB brotli) in 14 chunks,
two of them over Vite's 500 KB warning: React and every dependency, every module manifest with
its badge queries and their schemas, every dictionary in both languages and most shared schemas.
Signed-in pages then waited for the page chunk, then the church, then the widgets, one round
trip after the other. On a big church the attendance roster of a service (7,100 people) mounted
114,000 elements: 29.6 s until the roster showed, the longest task 12 s, and a search in the
roster 11 s.

### After

First visit (no service worker yet):

| Page             | FCP ms | LCP ms | Ready ms | TBT ms | Busy ms | JS KB |
| ---------------- | -----: | -----: | -------: | -----: | ------: | ----: |
| `/welcome`       |  3,544 |  3,544 |    3,531 |      0 |     233 | 212.0 |
| `/login`         |  3,672 |  3,672 |   6,775¹ |    167 |     585 | 212.0 |
| Home             |  2,880 |  6,652 |    7,549 |    293 |     502 | 212.1 |
| People list      |  2,888 |  6,680 |    7,890 |    293 |     506 | 212.1 |
| Finance home     |  2,880 |  7,484 |    8,714 |    410 |     599 | 212.1 |
| Calendar (month) |  2,892 |  8,136 |    8,458 |    336 |     565 | 212.1 |

¹ Includes the idle-time download of the signed-in shell while the person types.

Repeat visit (the service worker serves the app shell; API reads still take the network):

| Page             | FCP ms | LCP ms | Ready ms | TBT ms | Busy ms |
| ---------------- | -----: | -----: | -------: | -----: | ------: |
| `/welcome`       |  1,232 |  1,232 |    1,220 |      0 |     255 |
| `/login`         |  1,232 |  1,232 |    1,958 |    159 |     498 |
| Home             |    560 |  1,816 |    2,435 |    470 |     716 |
| People list      |    532 |  2,224 |    2,995 |    374 |     554 |
| Finance home     |    600 |  2,740 |    3,041 |    418 |     685 |
| Calendar (month) |    644 |  2,796 |    3,132 |    292 |     557 |

| Bundle                          | Before                   | After               |
| ------------------------------- | ------------------------ | ------------------- |
| First download (sign-in pages)  | 1,417 KB, 429 KB gzip    | 729 KB, 228 KB gzip |
| … on the wire (brotli)          | 385 KB                   | 198 KB              |
| Chunks in the first download    | 14                       | 7                   |
| Chunks over 500 KB              | 2                        | 0 (largest 308 KB)  |
| Attendance roster, 7,100 people | 29.6 s, 114,096 elements | 2.0 s, 900 elements |
| Roster search                   | 11.2 s                   | 0.09 s              |

The sign-in screens paint 1.3 s sooner on a first visit and in 1.2 s on a repeat one; every
church screen paints its shell 1.3 s sooner and, on a repeat visit, its content in 1.8 to 2.8 s
instead of 8 to 9 s.

### Targets

- **Home LCP under 2.5 s on the throttled profile: met on repeat visits (1.8 s)**, which is how
  an installed app opens. A first visit cannot reach it on Fast 3G: the HTML, the first scripts,
  the church shell and the data are four round trips of 562 ms each before the bytes (about
  400 KB at 180 KB/s) have even started to count; home now shows at 6.7 s instead of 8.1 s.
- **Initial JS for the sign-in page under 150 KB gzip: not met (228 KB gzip, 198 KB brotli).**
  The dependencies the sign-in page cannot do without already weigh 188 KB gzip: react-dom 66,
  react-router 31, zod 24, axios 18, react-hook-form 13, TanStack Query 10, sonner 9,
  tailwind-merge 8, the icons and the rest 9. The app's own code is 43 KB. The next steps, in
  order of size: replace axios with `fetch` in `lib/api.ts` (18 KB), load sonner with the first
  toast (9 KB), move the sign-in hooks out of `features/admin-security/api.ts` so the sign-in
  page does not pull the module's schemas and the permission catalog (6 KB). That still leaves
  about 195 KB: below 150 KB needs a lighter renderer than React DOM.

### What keeps it fast

**The first download.** Only the welcome and sign-in screens, the router and the parts every
screen needs are in it. Everything inside a church (`church-routes.tsx`: the church shell, the
module registry and every module route) is patched into the router on the first visit to a
church (`patchRoutesOnNavigation` in `router.tsx`), and every other screen, the account pages
included, is its own chunk through `lazyPage`. The shared package is side-effect free
(`"sideEffects": false`), so schemas no screen uses are dropped.

**Messages.** The first download carries the common, sign-in and invitation dictionaries; every
other message comes in one chunk per language (`virtual:locale-messages/<locale>`, generated from
`features/dictionaries.ts` by a plugin in `vite.config.ts`, about 54 KB gzip). `lazyPage` awaits
it in parallel with the page, so no screen renders a raw key. Switching language downloads the
other chunk and screens translate again in place.

**Chunks** (`build.rolldownOptions.output.codeSplitting` in `vite.config.ts`): React with React
Router and the other first-screen dependencies are two vendor chunks an app release does not
change (`immutable` for a year); the Radix UI primitives and the icons of later screens are one
chunk each instead of dozens of tiny requests, each a round trip on HTTP/1.1. Rare and heavy
dependencies load with the screens that use them: charts, print views, CSV parsing, date-fns
(tree-shaken; dates format with `Intl`, there are no date-fns locales) and the QR encoder, which
loads with the first QR code actually shown. Icons are named `lucide-react` imports, one module
each.

**Fetching ahead.** The first visit to a church fetches the church, the home screen and the
dashboard while the registry downloads. Routes with a `prefetch` handle (home, directory,
events, finance home) start their data while their code downloads, on a deep link too (a loader
that returns at once). Touching, hovering (80 ms) or focusing a link fetches that screen's code
and data (`components/layout/link-prefetch.tsx`). Once the current screen has its data
(`whenQuiet`), the bottom tabs' code and, on the sign-in page, the church shell download in idle
time. Nothing speculative is fetched with Data Saver on or on 2G (`mayPrefetch`).

**Query freshness** (`lib/query-client.ts`). Reports, statements, summaries and the audit log are
fresh for five minutes and never refetched because the app regained focus; setup and reference
data (settings, roles, funds, service types, tags, custom fields) for five minutes; lists,
details and the dashboard for thirty seconds. Screens left behind stay cached ten minutes for back
navigation; paged lists keep the previous page on screen while the next loads
(`placeholderData: keepPreviousData`).

**Long lists.** `lib/use-window-virtualizer.ts` mounts only the rows near the screen of a list
that scrolls with the page, with measured row heights, keyboard focus that scrolls the row in,
and `aria-setsize`/`aria-posinset`; the attendance roster uses it and filters behind
`useDeferredValue`. Days of the notifications inbox and of the audit log skip layout and paint
while off screen (`offscreen-lazy`: `content-visibility: auto`), and loaded inbox rows are
memoized, so the next page does not re-render them. Directory and ledger pages show 50 rows and
need neither. Search inputs are debounced; list images load lazily with a fixed aspect ratio.
Text uses the system font stack: there is no font to download.

**The service worker** (`service-worker.js`, built to `/sw.js` with its precache list). It
registers once the first screen has its data and precaches the app shell: `index.html`, the
first download, the church shell, the home screen and both message chunks. Fingerprinted files
are cache-first, navigations get the cached shell. API reads go to the network first; for the
account the page announced, the answers of the screens viewed last (at most 80, for a day) are
kept as an offline fallback, never for care, the register, finance, security, audit, members,
invitations or exports, and deleted on sign-out or when another account signs in (see
[SECURITY.md](./SECURITY.md#offline-copies)). A new release shows "Versi baru tersedia" with
"Muat ulang"; nothing reloads by itself. The app is installable: an Indonesian manifest with SVG
and PNG icons (regular and maskable, from `scripts/generate-icons.ts`) and theme colors for light
and dark.

### Rules for new web code

1. Load every screen with `lazyPage`; never import a page, a page's API module or a heavy
   dependency from a `module.tsx`, `router.tsx`, a shell or `lib/`. Check the first download with
   `scripts/bundle-report.ts` after adding a dependency: it must stay out unless the sign-in page
   needs it.
2. Load a heavy dependency that only part of a screen needs (an encoder, a chart, an editor) with
   `React.lazy` where it is shown.
3. Give a module's main screens a `prefetch` handle that fetches what they open with, importing
   query factories inside it and checking `access` like the screen.
4. Give queries a `staleTime` that fits the data; reports and other expensive reads go under a
   key with `report`, `summary` or `statement` so the defaults treat them as heavy.
5. Virtualize a list that can show more than about a hundred rows at once
   (`useWindowVirtualizer`); page or cursor everything else.
6. Run `scripts/bench-web.ts` before and after a change to the first download, the shells or the
   service worker.
