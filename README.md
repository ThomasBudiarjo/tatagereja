# TataGereja

TataGereja is an open-source church management application: a mobile-first single-page app backed by an
[Elysia](https://elysiajs.com) API. Churches can use a hosted server or run the same backend themselves.

One account can belong to several churches with a different role in each. Everything a church records —
people, groups, events, attendance and announcements — is scoped to that church and protected by the
same permission rules on the server and in the interface.

## Features

| Module        | What it does                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Accounts      | Email and password sign-up, per-server sessions, password change, session list and revocation     |
| Servers       | Choose the hosted server or enter a self-hosted address; the app verifies it before showing login |
| Churches      | Create a church, edit its profile, manage members and roles, transfer ownership, delete           |
| Invitations   | Invitation links and QR codes with expiry, usage limits and revocation                            |
| People        | Directory with search, filters and pagination, profiles, private details, linking a login account |
| Groups        | Ministries and small groups, assigned leaders, membership management                              |
| Events        | Church-wide and group events, participants, RSVP                                                  |
| Attendance    | Sessions from an event or standalone, a fast present/absent/excused sheet, personal history       |
| Announcements | Drafts and published posts for the whole church or a single group                                 |

Every member has a base role (`owner`, `administrator` or `member`) and any number of church-defined
**custom roles** built from a catalog of granular permissions. Suggested roles for Pendeta, Majelis,
Bendahara, Sekretaris, Koordinator Pelayanan and Guru Sekolah Minggu are created with every church.
A scoped **group leader** assignment lets a leader manage only their own groups' members, events,
announcements and attendance. Nobody can grant a permission they do not hold, sensitive changes are
recorded in an audit log, and optional modules can be switched off per church. Management actions appear
where the data lives, for the people allowed to use them.

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

`scripts/seed-demo.ts` fills a fresh server with a complete demo church through the public API:
GKI Kebon Jati with about seventy people in households and areas, komisi, worship services with
rosters, events, Warta Jemaat, pastoral care, records, Sekolah Minggu check-in, finance,
facilities and attendance history.

```sh
bun run build
WEB_DIST_DIR=$PWD/apps/web/dist PORT=3950 DATABASE_PATH=/tmp/demo.db bun run start
bun scripts/seed-demo.ts --port 3950
```

Every account uses the password `demo-password`: `demo@tatagereja.test` (owner),
`admin@tatagereja.test` (administrator and Sekretaris), `bendahara@tatagereja.test` (Bendahara),
`penatua@tatagereja.test` (Majelis / Penatua), `pendeta@tatagereja.test` (Pendeta),
`guru@tatagereja.test` (Guru Sekolah Minggu) and `jemaat@tatagereja.test` (member).
`bun scripts/screenshots.ts --port 3950 --email <account>` captures the screens as any of them.

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

Registration mode, invitation validity, Turnstile verification and rate limits are all enforced by the API,
so they cannot be bypassed by calling it directly.

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
