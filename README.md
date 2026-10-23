# TataGereja

TataGereja is an open-source church management application: a mobile-first single-page app backed by an
[Elysia](https://elysiajs.com) API. Churches can use a hosted server or run the same backend themselves.

One account can belong to several churches with a different role in each. Everything a church records —
people and households, worship services, pastoral care, the church register, finance, facilities and
kids check-in — is scoped to that church and protected by the same permission rules on the server and
in the interface. The interface is in Indonesian and English and uses the terms Indonesian churches
use (Jemaat, Majelis, Komisi, Wilayah, Warta Jemaat, Persembahan, Atestasi and so on).

## Features

Five modules are always on; the six marked _optional_ can be switched off per church (their menus
disappear and their API routes answer `403 MODULE_DISABLED`).

| Module                                | What it does                                                                                                                                                                                                                                                                   | Typical use                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts and servers                  | Email and password sign-up, the hosted server or a self-hosted address (verified before login), per-server sessions, password change with a strength meter, session list and revocation                                                                                        | A jemaat signs up on their phone and joins two churches with one account; a self-hosted church points the app at its own server                                                             |
| Church (`core`)                       | Church profile, logo, colour, currency and time zone, members and suspension, custom roles, invitation links and QR codes with expiry and usage limits, module switches, audit log, ownership transfer, deletion                                                               | The Sekretaris shows an invitation QR code at the Rapat Majelis; the owner hands the church over to the next Ketua Majelis                                                                  |
| Administration and security           | Two-step sign-in (TOTP) with recovery codes, progressive lockout, sign-in history, data export and account deletion; the church security overview, a 2FA policy for managers and the owner-only church backup                                                                  | The Bendahara turns on two-step sign-in; the owner requires it for every member who holds a management permission and keeps a monthly backup                                                |
| People and groups (Jemaat, Komisi)    | Directory with search, filters and pagination, profiles with family and timeline, private details, privacy settings, households (keluarga), Wilayah/Sektor with coordinators, tags, custom fields, CSV import/export, duplicate merging, groups with leaders and join requests | The Sekretaris imports the old buku induk, finds every jemaat of Wilayah 3 over seventy for Perkunjungan, and merges a family entered twice; the Komisi Pemuda leader accepts join requests |
| Communication and events              | Scheduled, pinned and targeted announcements with read tracking; events with recurring series, registration, waitlist and RSVP; the church calendar with private iCal feeds; the weekly Warta Jemaat, printable; in-app notifications in the reader's language                 | The Sekretaris publishes Sunday's Warta Jemaat, sends a notice only to Majelis, and opens registration for the Natal retreat with a waitlist                                                |
| Home, attendance and reports          | A home dashboard with widgets chosen per person, attendance sheets (present, absent, excused) or headcounts, absence alerts, personal history, and reports on membership, demographics, attendance, visitors, volunteers and giving                                            | An usher records the headcount of each Ibadah; a Penatua sees who has missed three Sundays in a row; the Majelis reviews the year's growth                                                  |
| Worship (Ibadah) — _optional_         | Service types and services, the Liturgi editor with printing, a song library, serving teams and positions, Jadwal Pelayanan with blockout dates, accept or decline, and each person's schedule                                                                                 | The Koordinator Pelayanan builds Sunday's liturgy, schedules the song leader and musicians around their blockout dates, and a musician accepts from "my schedule"                           |
| Pastoral care — _optional_            | Care cases (pendampingan) with caregivers, notes and confidentiality; Perkunjungan; prayer requests (pokok doa) with moderation; visitor follow-up; tasks; diakonia aid                                                                                                        | The Pendeta records counselling only she can read; Majelis plan and log hospital visits; a prayer request is moderated before the church sees it                                            |
| Church registry — _optional_          | The numbered register (buku induk) of Baptis, Sidi, Pemberkatan Nikah, Penyerahan Anak, Atestasi masuk/keluar and Kedukaan, with corrections, voiding, certificates and the membership changes a record implies                                                                | The Sekretaris records a Baptis Anak with the next register number, prints the certificate, and an Atestasi keluar marks the family as moved                                                |
| Finance (Keuangan) — _optional_       | Ledger with funds, accounts and categories; offerings counted by two counters and verified by a third person; Persembahan and Perpuluhan with receipts; expenses with approval; budgets (RAPB); campaigns and pledges; closed periods; reports and giving statements           | Two counters enter Sunday's kolekte and a Penatua verifies it; the Bendahara records a Perpuluhan with a receipt; a building campaign tracks pledges against gifts                          |
| Facilities and inventory — _optional_ | Rooms and resources with one-off or recurring bookings, conflict detection and approval; inventory with labels, loans and maintenance                                                                                                                                          | A family books the aula for a wedding reception without clashing with choir practice; Komisi Remaja borrows the projector and its return is tracked                                         |
| Kids check-in — _optional_            | Sekolah Minggu classes and teachers, check-in sessions with staff, kiosk or guardian self check-in, printed labels with a security code that check-out requires, allergy, medical and custody alerts, authorised pick-ups                                                      | A parent checks two children in at the kiosk by the door; the teacher sees an allergy alert, and only an authorised adult with the code from the guardian tag can pick them up              |

Every church amount is stored in integer minor units of the church currency (IDR by default, shown
without decimals).

## Permissions

The API is the security boundary: every write and every read of sensitive data is checked on the
server with the shared permission functions (`packages/shared`), and the interface uses the same
functions only to hide what a person cannot do.

- **Base roles.** Every member has one: `owner` (every permission), `administrator` (everything
  except the owner-only permissions and confidential pastoral care) or `member` (viewing the
  directory, groups, events, announcements, Warta Jemaat, services and facilities, booking requests
  and prayer requests).
- **Custom roles** are built from a catalog of 64 granular permissions such as `finance.record`,
  `care.confidential` or `records.manage`. Six suggested roles are created with every church and can
  be edited freely: **Pendeta**, **Majelis / Penatua**, **Bendahara**, **Sekretaris**,
  **Koordinator Pelayanan** and **Guru Sekolah Minggu**.
- **Group leaders** are a scoped assignment: a leader manages only their own groups' members,
  events, announcements and attendance.
- **Own data** needs no permission: everyone sees their own profile, giving, registry records,
  children's check-ins and serving schedule.
- **Anti-escalation.** Nobody grants, edits or removes a permission they do not hold, the owner's
  roles cannot be edited, and nobody can remove their own ability to manage roles.
- **Segregation of duties** in finance: an offering is verified, and an expense approved, by someone
  other than the person who entered it.

Sensitive changes are written to an audit log with redacted values. The full catalog, the
permissions of each suggested role and the security model are in [PLAN.md](./PLAN.md).

## Stack

- **Backend:** Bun, Elysia, Drizzle ORM, SQLite, Zod
- **Frontend:** React, Vite, TypeScript, Tailwind CSS v4, Radix UI, TanStack Query, Zustand, React Hook Form, Axios, Zod
- **Shared:** one package of Zod schemas, types and permission functions used by both sides

## Repository layout

```text
packages/shared/   Zod schemas, shared types, permission matrix
apps/api/          Elysia server, Drizzle schema and migrations, integration tests
apps/web/          React single-page app (mobile first)
deploy/            Docker Compose for self-hosting
```

## Requirements

- [Bun](https://bun.sh) 1.3 or newer (the API runs on Bun; the web app builds with it too)

## Getting started

```sh
bun install
cp apps/api/.env.example apps/api/.env   # optional, defaults work for local development
bun run dev                              # API on :3000, web app on :5173
```

The web dev server proxies `/api` to `http://127.0.0.1:3000`, so open <http://localhost:5173>, create an
account, and create your first church.

Run the two sides separately when you prefer:

```sh
bun run dev:api
bun run dev:web
```

## Checks

```sh
bun run typecheck   # all three workspaces
bun run lint        # ESLint
bun run test        # shared unit tests + API integration tests
bun run build       # production build of the web app
bun run check       # all of the above
```

## Demo data

`scripts/seed-demo.ts` fills a fresh server with a complete demo church through the public API, so
every permission, audit and notification rule applies: GKI Kebon Jati, Bandung, with about seventy
people in households and four areas, komisi and small groups with leaders, worship services with
liturgy and rosters, events with RSVPs and registrations, announcements and two Warta Jemaat issues,
pastoral care and prayer requests, registry records, Sekolah Minggu classes and check-in sessions,
ten Sundays of counted offerings with giving, expenses, a budget and a campaign, rooms with bookings,
inventory with loans, and half a year of attendance.

```sh
bun run build
WEB_DIST_DIR=$PWD/apps/web/dist PORT=3950 DATABASE_PATH=/tmp/demo.db bun run start
bun scripts/seed-demo.ts --port 3950        # in a second terminal; once per database
```

Open <http://localhost:3950> (the app uses the server it is served from by default) and sign in.
Every account uses the password `demo-password`:

| Account                     | Role in the demo church                                       |
| --------------------------- | ------------------------------------------------------------- |
| `demo@tatagereja.test`      | Owner (and a parent of three Sekolah Minggu children)         |
| `admin@tatagereja.test`     | Administrator with the Sekretaris role                        |
| `bendahara@tatagereja.test` | Member with the Bendahara role (counts and records offerings) |
| `penatua@tatagereja.test`   | Member with the Majelis / Penatua role (verifies, approves)   |
| `pendeta@tatagereja.test`   | Member with the Pendeta role (including confidential care)    |
| `guru@tatagereja.test`      | Member with the Guru Sekolah Minggu role (operates check-in)  |
| `jemaat@tatagereja.test`    | Plain member with two children                                |

The script accepts `--port <n>` or `--base <url>` and `--password <secret>`; the server must accept
public registration. Dates are relative to today in the church time zone (Asia/Jakarta).
Each module also has a smaller seed for reviewing its own screens in
`apps/api/src/modules/<id>/scripts/seed-demo.ts`.

## Screenshots

`scripts/screenshots.ts` signs in to a running server with Playwright and captures each route at
390×844 and 1440×900, in light and dark:

```sh
bun scripts/screenshots.ts --port 3950 --email jemaat@tatagereja.test --out /tmp/shots \
  --routes "/c/:church,/c/:church/people,/c/:church/finance" --locales id,en
```

`:church` stands for the first church of the account. Other options are `--viewports`, `--themes`,
`--full` (whole page), `--anonymous` (also the welcome, login and registration screens) and `--seed`
(create the account and a small sample church when missing). It uses the preinstalled Chromium
(`PLAYWRIGHT_BROWSERS_PATH`).

## Configuration

The API reads its configuration from the environment and validates it at startup; an invalid value stops the
server with a clear message. See `apps/api/.env.example` for the full list.

| Variable                                      | Default                 | Purpose                                         |
| --------------------------------------------- | ----------------------- | ----------------------------------------------- |
| `HOST` / `PORT`                               | `0.0.0.0` / `3000`      | Listen address                                  |
| `DATABASE_PATH`                               | `./data/tatagereja.db`  | SQLite file, created and migrated on start      |
| `REGISTRATION_MODE`                           | `public`                | `public`, `invite_only` or `disabled`           |
| `TURNSTILE_ENABLED`                           | `false`                 | Cloudflare Turnstile check on registration      |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | empty                   | Required when Turnstile is enabled              |
| `CORS_ORIGINS`                                | empty (any)             | Comma-separated list of allowed browser origins |
| `SESSION_TTL_DAYS`                            | `30`                    | Session lifetime                                |
| `WEB_DIST_DIR`                                | empty                   | Serve a built web app from this directory       |
| `APP_URL`                                     | `http://localhost:5173` | Public web address used in invitation links     |
| `SERVER_NAME`                                 | `TataGereja`            | Name shown to people choosing this server       |
| `MAX_BODY_KB`                                 | `2048`                  | Largest accepted request body                   |
| `TRUST_PROXY`                                 | `0`                     | Reverse proxies in front of the API (see below) |
| `TWO_FACTOR_ENCRYPTION_KEY`                   | empty (key file)        | Key for two-factor secrets (see below)          |

Registration mode, invitation validity, Turnstile verification and rate limits are all enforced by the API,
so they cannot be bypassed by calling it directly. Sign-in has per-IP and per-email rate limits, a
progressive lockout per account (after five failures each further one doubles the wait, up to an hour)
and, for accounts that turned it on, a TOTP second step.

Two-factor secrets are encrypted at rest. Without `TWO_FACTOR_ENCRYPTION_KEY` the API creates a key file
(`.tatagereja-2fa.key`, mode 0600) next to the database; keep it with your backups, because a database
restored without it cannot check the codes of accounts that use two-step sign-in.

Rate limits and sign-in history use the client address. Behind a reverse proxy, set `TRUST_PROXY` to the
number of proxies in front of the API (usually `1`) so the address the proxy saw is used; the API then reads
it from the right-hand end of `X-Forwarded-For`, so a client cannot dodge a limit by sending its own header.
With `0` the header is ignored and the connection address is used.

## Self-hosting

```sh
cp deploy/.env.example deploy/.env      # set APP_URL, SERVER_NAME, REGISTRATION_MODE
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

One container serves both the API and the web app on port 3000 and keeps the SQLite database in a named
volume. Put it behind a reverse proxy that terminates TLS, and set `APP_URL` to the public address so
invitation links and QR codes point at the right server.

Without Docker, build the web app and let the API serve it:

```sh
bun install
bun run build
WEB_DIST_DIR=apps/web/dist APP_URL=https://church.example.com bun run start
```

## Database changes

The Drizzle schema lives in `apps/api/src/db/schema/`, one file per module. After editing it:

```sh
bun run db:generate --name <module>_<change>
```

Generated SQL is committed under `apps/api/drizzle/` and applied automatically when the server starts.

## API

All routes are under `/api`. `GET /api/meta` is public and identifies the server; everything else needs a
`Authorization: Bearer <token>` header. Errors always come back as
`{ "error": { "code": "...", "message": "...", "issues": [...] } }`.

The product direction and decisions are documented in [PLAN.md](./PLAN.md). How modules are built —
the permission catalog, schema and migration rules, the audit, notification and module helpers, and the
testing pattern — is described in [docs/ARCHITECTURE-MODULES.md](./docs/ARCHITECTURE-MODULES.md).
