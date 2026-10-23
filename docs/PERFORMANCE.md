# Performance

TataGereja runs on one Bun process and one SQLite file. This page records how fast the API is for
a large congregation, what keeps it fast, and the rules new code follows so it stays that way.

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
changes a church shows (profile, account deletion, joining). The TTL bounds what no request
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
   every mutating church request drops the church's entries. A write outside
   `/api/churches/:churchId` that changes church data must be added to `invalidateForRequest`.
6. A column copied from another table for speed is written at every write site, kept in step
   when the source changes, and backfilled at startup in `backfillCopiedColumns`.
7. Run the benchmark before and after a change that touches a hot path.
