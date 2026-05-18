# Tata Gereja — Church Management Web App: Implementation Plan

> **Audience:** AI coding agent implementing this project from scratch.
> **Goal:** Deliver a working open-source single-tenant-per-account church management web app, hosted by the project owner for free use by a small number of Indonesian Protestant churches.
> **Status:** Greenfield — no existing code.
> **Brand:** `tatagereja.id`. Internal repo/module name: `tatagereja`.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Stack](#2-architecture--stack)
3. [Repository Structure](#3-repository-structure)
4. [Database Design](#4-database-design)
5. [Backend Implementation (Go)](#5-backend-implementation-go)
6. [Frontend Implementation (Svelte SPA)](#6-frontend-implementation-svelte-spa)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [API Contract](#8-api-contract)
9. [Validation Rules](#9-validation-rules)
10. [Development Environment](#10-development-environment)
11. [Deployment](#11-deployment)
12. [Testing Strategy](#12-testing-strategy)
13. [Open Source Housekeeping](#13-open-source-housekeeping)
14. [MVP Scope & Phases](#14-mvp-scope--phases)
15. [Non-Negotiable Rules](#15-non-negotiable-rules)
16. [Out of Scope](#16-out-of-scope)
17. [Glossary](#17-glossary)
18. [Implementation Checklist](#18-implementation-checklist-for-ai-agent)

---

## 1. Project Overview

### 1.1 What it is

Tata Gereja is a web application that helps a church manage:

- **Jemaat** (church members): name, contact, address, birthday, family relations, baptism/confirmation status.
- **Keluarga** (family unit): groups jemaat into household units.
- **Pelayan** (servants/volunteers): which members serve, which service types they can do.
- **Jadwal Pelayanan** (service schedules): assign servants to weekly worship services or fellowship meetings, with role slots (worship leader, singer, musician, multimedia operator, usher, etc.).

### 1.2 Who it is for

- **Direct users:** Church administrators, worship coordinators, pastors. Typically 1–5 people per church share a single account.
- **End beneficiary:** Indonesian Protestant churches (initial target), but design should not hard-code denomination-specific logic.

### 1.3 Operational model

- **Single-tenant logically per account, multi-tenant technically.** One owner-hosted deployment serves multiple churches. Each church gets its own `church_id` scope. Data of one church MUST NEVER leak to another. The application is NOT a SaaS product with self-signup at MVP — the owner manually provisions church accounts.
- **Hosting:** Owner pays nothing or near-zero (Heroku Eco dyno via GitHub Student Pack + Cloudflare Pages free + local SQLite at first, Turso later if needed).
- **No SLA.** Hobby project. Users must be informed via README and in-app disclaimer.

### 1.4 Non-goals (explicitly out of scope at MVP)

See [§16 Out of Scope](#16-out-of-scope).

---

## 2. Architecture & Stack

### 2.1 High-level diagram

```
┌─────────────────────────────┐       HTTPS/JSON      ┌──────────────────────────────┐
│  Svelte 5 SPA               │ ────────────────────► │  Go API (Chi router)          │
│  app.tatagereja.id          │                       │  api.tatagereja.id             │
│  - Vite build → static      │                       │  - Heroku Eco dyno            │
│  - Cloudflare Pages         │  ◄────────────────── │  - JWT auth (single token)    │
└─────────────────────────────┘                       │  - sqlc + feature folders     │
                                                       └──────────────┬────────────────┘
                                                                      │
                                                                      ▼
                                                       ┌──────────────────────────────┐
                                                       │  SQLite (file on dyno disk)   │
                                                       │  WAL mode, single writer pool │
                                                       │  Backed up to CF R2 nightly   │
                                                       └──────────────────────────────┘
```

**Cookie shared via `Domain=.tatagereja.id`, `SameSite=Lax`, `Secure`, `HttpOnly`.**

### 2.2 Stack decisions (final)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend framework | **Svelte 5** + Vite + TypeScript | Lightweight, reactive, small bundle. Pure SPA → static hosting. Better AI-agent + ecosystem support than Solid for this size. |
| Frontend routing | **svelte-spa-router** | Simple hash-based SPA routing. No SSR. |
| Frontend styling | **Tailwind CSS** + **shadcn-svelte** (CLI-copied components) | Fast styling, accessible components. shadcn-svelte is not an npm install — it copies components into the repo. |
| Frontend data fetching | **TanStack Query (Svelte)** | Caching, retries, invalidation. |
| Frontend state | Svelte 5 runes (`$state`, `$derived`, `$effect`) | Built-in. No Redux/Zustand. |
| Frontend forms | Native form handling + Zod on submit | One fewer dep than Felte. Forms in this app are simple. |
| Frontend validation | **Zod** | Schema-based, friendly errors. |
| Backend language | **Go 1.23+** | Fast cold start, single binary, low memory. Perfect for Heroku Eco. |
| Backend router | **chi/v5** | Idiomatic, lightweight, composable middleware. |
| Backend DB driver | **modernc.org/sqlite** | Pure-Go SQLite, no CGO, works unmodified on Heroku Go buildpack. |
| Backend nullable types | **gopkg.in/guregu/null.v4** | `null.String`, `null.Int` — clean Go ergonomics + clean JSON marshaling. |
| Backend DB queries | **sqlc** | Type-safe Go from plain SQL. |
| Backend schema management | **Custom dev-mode schema sync** (see §4.4) | Reads `schema.sql` at boot, drops & recreates in dev. No migrations until real data exists. |
| Backend auth | **golang-jwt/jwt v5** + **bcrypt** | Single 7-day JWT in httpOnly cookie. No refresh tokens. |
| Backend validation | **go-playground/validator v10** | Standard. |
| Backend rate limit | **go-chi/httprate** | Drop-in. |
| Backend CORS | **go-chi/cors** | Drop-in. |
| Hot reload (Go) | **air** (air-verse/air) | Watch & rebuild. |
| Database (dev/prod) | **SQLite file on dyno** | One file. WAL mode. Backed up to CF R2 nightly. Migration to Turso/Postgres later if needed. |
| Database (test) | In-memory SQLite | Fast, isolated. |
| Frontend hosting | **Cloudflare Pages** | Free, unlimited bandwidth, no sleep, global CDN. |
| Backend hosting | **Heroku Eco dyno** (GitHub Student credits) | Owner has credits. Cold start ~3–8s acceptable. |
| Heroku buildpack | **timanovsky/subdir-heroku-buildpack** + **heroku/go** | Standard subdir buildpack to deploy from `backend/`. |
| Monorepo strategy | Plain folder split (`frontend/`, `backend/`) | No Turborepo/Nx needed. |
| Backend structure | **Feature folders** | `internal/jemaat/{handler,service,dto}.go` instead of horizontal layers. |

### 2.3 Why these are the right choices

- **Go on Heroku Eco:** Single static binary, fast startup (<1s), low memory. Comfortably under the 512MB Eco limit.
- **SQLite over Turso (initially):** Simpler, faster, free. The dyno's ephemeral filesystem is fine if we ship nightly backups to R2 and accept the loss window. When we outgrow it, we switch to Turso (libSQL is wire-compatible SQLite) or Postgres — schema is portable enough.
- **modernc.org/sqlite over libsql-client-go:** Pure Go, no CGO, well-maintained, works everywhere. Turso's own `go-libsql` needs CGO and ships precompiled libs only for specific arches.
- **sqlc over Ent/GORM:** SQL stays plain & portable; contributors don't need to learn a DSL; no runtime ORM overhead.
- **Custom schema sync over Atlas (for now):** We want rapid iteration without ceremony. When real data exists, we add a proper migration tool. See §4.4.
- **Svelte 5 over Solid/SvelteKit:** SvelteKit is fullstack; we want a pure SPA so the frontend can live on free static hosting independent of the backend. Solid would be fine but Svelte's ecosystem (shadcn-svelte, AI agent familiarity) tips the balance.
- **Single JWT (no refresh tokens):** Hobby app, 1–5 user accounts per church, no need for a refresh lifecycle. A 7-day httpOnly cookie covers the use case.
- **Custom domain from day 1:** Both apps under `*.tatagereja.id` so cookies share `Domain=.tatagereja.id`, `SameSite=Lax`. Avoids Safari/ITP cross-domain cookie pain entirely.

---

## 3. Repository Structure

Single monorepo on GitHub, MIT licensed. Backend uses **feature folders**, not horizontal layers.

```
tatagereja/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── pull_request_template.md
├── .vscode/
│   ├── settings.json
│   └── extensions.json
├── frontend/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── _redirects               # /* /index.html 200
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api/
│   │   │   │   ├── client.ts
│   │   │   │   ├── auth.ts
│   │   │   │   ├── jemaat.ts
│   │   │   │   ├── keluarga.ts
│   │   │   │   ├── pelayan.ts
│   │   │   │   ├── service-types.ts
│   │   │   │   └── kebaktian.ts
│   │   │   ├── components/
│   │   │   │   ├── ui/              # shadcn-svelte primitives
│   │   │   │   └── domain/          # JemaatTable, JadwalEditor, etc.
│   │   │   ├── stores/
│   │   │   │   └── auth.svelte.ts
│   │   │   ├── utils/
│   │   │   │   ├── date.ts          # tz-aware formatting
│   │   │   │   ├── cn.ts
│   │   │   │   └── format.ts
│   │   │   ├── i18n/
│   │   │   │   └── id.ts            # all UI strings (Indonesian)
│   │   │   ├── schemas/             # Zod schemas
│   │   │   │   ├── jemaat.ts
│   │   │   │   └── ...
│   │   │   └── types.ts             # mirrored backend types
│   │   ├── routes/
│   │   │   ├── Login.svelte
│   │   │   ├── Dashboard.svelte
│   │   │   ├── Jemaat.svelte
│   │   │   ├── JemaatDetail.svelte
│   │   │   ├── Keluarga.svelte
│   │   │   ├── Pelayan.svelte
│   │   │   ├── ServiceTypes.svelte
│   │   │   ├── Kebaktian.svelte
│   │   │   ├── JadwalEditor.svelte
│   │   │   └── NotFound.svelte
│   │   ├── App.svelte
│   │   ├── main.ts
│   │   └── app.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.ts
│   ├── svelte.config.js
│   ├── components.json              # shadcn-svelte config
│   ├── .env.example
│   └── .gitignore
├── backend/
│   ├── cmd/
│   │   ├── server/
│   │   │   └── main.go
│   │   └── seed-admin/
│   │       └── main.go              # bootstrap initial admin user
│   ├── internal/
│   │   ├── config/
│   │   │   └── config.go
│   │   ├── db/
│   │   │   ├── schema.sql           # SINGLE SOURCE OF TRUTH
│   │   │   ├── conn.go              # sql.Open + WAL pragmas
│   │   │   ├── sync.go              # dev-mode schema sync (drop+create)
│   │   │   ├── sqlc/                # GENERATED — do not edit
│   │   │   │   ├── db.go
│   │   │   │   ├── models.go
│   │   │   │   └── *.sql.go
│   │   │   └── seed.go              # dev seed data
│   │   ├── auth/
│   │   │   ├── jwt.go
│   │   │   ├── password.go
│   │   │   ├── cookie.go            # cookie set/clear helpers
│   │   │   ├── handler.go
│   │   │   ├── service.go
│   │   │   ├── dto.go
│   │   │   └── queries.sql          # sqlc input for this feature
│   │   ├── jemaat/
│   │   │   ├── handler.go
│   │   │   ├── service.go
│   │   │   ├── dto.go
│   │   │   └── queries.sql
│   │   ├── keluarga/
│   │   │   ├── handler.go
│   │   │   ├── service.go
│   │   │   ├── dto.go
│   │   │   └── queries.sql
│   │   ├── pelayan/
│   │   │   ├── handler.go
│   │   │   ├── service.go
│   │   │   ├── dto.go
│   │   │   └── queries.sql
│   │   ├── servicetypes/
│   │   │   ├── handler.go
│   │   │   ├── service.go
│   │   │   ├── dto.go
│   │   │   └── queries.sql
│   │   ├── kebaktian/
│   │   │   ├── handler.go
│   │   │   ├── service.go
│   │   │   ├── dto.go
│   │   │   └── queries.sql
│   │   ├── jadwal/
│   │   │   ├── handler.go
│   │   │   ├── service.go
│   │   │   ├── dto.go
│   │   │   └── queries.sql
│   │   ├── health/
│   │   │   └── handler.go
│   │   ├── middleware/
│   │   │   ├── auth.go              # JWT verify, sets ctx
│   │   │   ├── logging.go           # redacts Authorization & auth bodies
│   │   │   └── ratelimit.go
│   │   ├── httpx/
│   │   │   ├── response.go          # writeJSON, writeError, error shape
│   │   │   └── pagination.go
│   │   ├── nullx/
│   │   │   └── convert.go           # ptr <-> null.String helpers
│   │   └── router/
│   │       └── router.go
│   ├── tests/
│   │   ├── integration/
│   │   │   ├── jemaat_test.go
│   │   │   ├── jadwal_test.go
│   │   │   └── cross_tenant_test.go # CRITICAL: 404 across churches
│   │   └── testutil/
│   │       └── db.go                # in-memory DB factory
│   ├── scripts/
│   │   └── backup-db.sh
│   ├── sqlc.yaml
│   ├── .air.toml
│   ├── Procfile
│   ├── .profile                     # heroku-go: env setup
│   ├── go.mod
│   ├── go.sum
│   ├── .env.example
│   └── .gitignore
├── scripts/
│   └── dev.sh
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   ├── ADD_FEATURE.md               # recipe for adding a new entity
│   └── CONTRIBUTING.md
├── .editorconfig
├── .gitignore
├── LICENSE                          # MIT
├── Makefile
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── THIRD_PARTY_NOTICES.md           # generated by go-licenses + npm-license-checker
```

---

## 4. Database Design

### 4.1 Source of truth

`backend/internal/db/schema.sql` is the SINGLE SOURCE OF TRUTH:

- Input to **sqlc** (for generating Go types).
- Input to our **dev-mode schema sync** (see §4.4).
- Human-readable documentation of the data model.

NEVER edit the generated `sqlc/` folder by hand. Edit `schema.sql`, regenerate, re-sync.

### 4.2 Multi-tenant scoping rule (CRITICAL)

**EVERY domain table (except `churches` and `users`) MUST have a `church_id` column with `NOT NULL` and `FOREIGN KEY` to `churches(id)`.**

**EVERY query that reads or writes a domain row MUST filter or set `church_id` from the authenticated user's session.** Never trust `church_id` from the request body.

Failure here = data leak between churches = critical security bug.

### 4.3 Time conventions

- **All timestamps stored as UTC ISO 8601 strings** ending in `Z`. Use `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` as the default.
- **`tanggal` (date-only) and `waktu_mulai` (time-only) on `kebaktian` are stored as UTC.** The frontend converts to/from the church's local timezone (read from `churches.timezone`) for display and input.
- **`tanggal_lahir`, `tanggal_baptis`, `tanggal_sidi` are calendar dates (no timezone).** Stored as `YYYY-MM-DD`, treated as wall-clock dates everywhere. (A birthday is a birthday regardless of where you are.)
- `churches.timezone` exists for the frontend's convenience; the backend never converts.

### 4.4 Schema sync (dev) vs migrations (prod-ish)

We do NOT use Atlas or golang-migrate at MVP. Instead, the backend has a `db.Sync()` function called on startup, gated by a config flag:

```
SCHEMA_MODE=recreate   # dev: drop all tables and recreate from schema.sql every boot
SCHEMA_MODE=ensure     # prod-like: CREATE TABLE IF NOT EXISTS only; no destructive changes
SCHEMA_MODE=off        # do nothing; assume schema already matches
```

**Behavior in detail:**

- **`recreate`** — At boot, executes `DROP TABLE IF EXISTS` for every table named in `schema.sql`, then executes the full `schema.sql`. All data is wiped. This is the dev workflow: edit schema, restart, done. Default in `development`.
- **`ensure`** — At boot, executes `schema.sql` as-is. Since every `CREATE TABLE` should be written `CREATE TABLE IF NOT EXISTS`, this is idempotent and non-destructive. New tables get created; existing tables are untouched even if the schema definition has changed. This is a safety net while there's no real data yet.
- **`off`** — At boot, does nothing. Use this once you have real production data and have started managing schema changes manually. **When you hit this point, switch to a real migration tool (Atlas or golang-migrate) and version migrations from then on.**

**Graduation path:** When the first real church onboards, owner does:
1. Take a backup.
2. Add Atlas to the repo (one config file + binary download in `bin/post_compile`).
3. Generate a baseline migration from the current `schema.sql`.
4. Set `SCHEMA_MODE=off` in Heroku config.
5. From now on, schema changes go through `atlas migrate diff` + `atlas migrate apply` in the release phase.

This is one PR's worth of work, deferred until it's actually needed.

### 4.5 Full `schema.sql`

All `CREATE TABLE` statements use `IF NOT EXISTS` for `ensure` mode compatibility.

```sql
-- ============================================================
-- Tata Gereja schema.sql — SQLite dialect
-- Source of truth for sqlc and the dev-mode schema sync.
--
-- All CREATE TABLE statements use IF NOT EXISTS to support
-- both `recreate` and `ensure` schema sync modes.
--
-- Timestamps are UTC ISO 8601 strings.
-- Booleans are INTEGER 0/1 (SQLite has no boolean).
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- Tenancy & auth
-- ============================================================

CREATE TABLE IF NOT EXISTS churches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    timezone      TEXT NOT NULL DEFAULT 'Asia/Jakarta',  -- IANA tz; used by frontend
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor', 'viewer')),
    is_active       INTEGER NOT NULL DEFAULT 1,
    last_login_at   TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_church_id ON users(church_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- Keluarga (family unit) — declared BEFORE jemaat because jemaat FKs it
-- ============================================================

CREATE TABLE IF NOT EXISTS keluarga (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama_keluarga   TEXT NOT NULL,
    alamat          TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_keluarga_church_id ON keluarga(church_id);

-- ============================================================
-- Jemaat (church members)
-- ============================================================

CREATE TABLE IF NOT EXISTS jemaat (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id           INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama_lengkap        TEXT NOT NULL,
    nama_panggilan      TEXT,
    jenis_kelamin       TEXT CHECK (jenis_kelamin IN ('L', 'P') OR jenis_kelamin IS NULL),
    tanggal_lahir       TEXT,                       -- YYYY-MM-DD
    tempat_lahir        TEXT,
    alamat              TEXT,
    nomor_telepon       TEXT,
    email               TEXT,
    status_pernikahan   TEXT CHECK (
                          status_pernikahan IN ('belum_menikah', 'menikah', 'cerai', 'duda', 'janda')
                          OR status_pernikahan IS NULL
                        ),
    tanggal_baptis      TEXT,                       -- YYYY-MM-DD
    tanggal_sidi        TEXT,                       -- YYYY-MM-DD
    keluarga_id         INTEGER REFERENCES keluarga(id) ON DELETE SET NULL,
    catatan             TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_jemaat_church_id ON jemaat(church_id);
CREATE INDEX IF NOT EXISTS idx_jemaat_nama ON jemaat(church_id, nama_lengkap);
CREATE INDEX IF NOT EXISTS idx_jemaat_keluarga_id ON jemaat(keluarga_id);

-- ============================================================
-- Service types (jenis pelayanan) — configurable per church
-- ============================================================

CREATE TABLE IF NOT EXISTS service_types (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    deskripsi       TEXT,
    warna           TEXT,                            -- hex like "#3b82f6"
    urutan          INTEGER NOT NULL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (church_id, nama)
);

CREATE INDEX IF NOT EXISTS idx_service_types_church_id ON service_types(church_id);

-- ============================================================
-- Pelayan (servants) — jemaat who serve
-- ============================================================

CREATE TABLE IF NOT EXISTS pelayan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    jemaat_id       INTEGER NOT NULL REFERENCES jemaat(id) ON DELETE CASCADE,
    catatan         TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (church_id, jemaat_id)
);

CREATE INDEX IF NOT EXISTS idx_pelayan_church_id ON pelayan(church_id);
CREATE INDEX IF NOT EXISTS idx_pelayan_jemaat_id ON pelayan(jemaat_id);

CREATE TABLE IF NOT EXISTS pelayan_service_types (
    pelayan_id          INTEGER NOT NULL REFERENCES pelayan(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    skill_level         TEXT CHECK (
                          skill_level IN ('beginner', 'intermediate', 'advanced')
                          OR skill_level IS NULL
                        ),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (pelayan_id, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_pelayan_st_service_type_id ON pelayan_service_types(service_type_id);

-- ============================================================
-- Kebaktian / Persekutuan
-- ============================================================

CREATE TABLE IF NOT EXISTS kebaktian (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    -- waktu_mulai is a single UTC instant. Frontend converts to church tz for display.
    waktu_mulai     TEXT NOT NULL,                  -- ISO 8601 UTC: 2026-05-18T02:00:00Z
    lokasi          TEXT,
    tema            TEXT,
    pengkhotbah     TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_kebaktian_church_id ON kebaktian(church_id);
CREATE INDEX IF NOT EXISTS idx_kebaktian_waktu ON kebaktian(church_id, waktu_mulai);

-- ============================================================
-- Jadwal pelayanan
-- ============================================================

CREATE TABLE IF NOT EXISTS jadwal_pelayanan (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id           INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    kebaktian_id        INTEGER NOT NULL REFERENCES kebaktian(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
    pelayan_id          INTEGER REFERENCES pelayan(id) ON DELETE SET NULL,
    catatan             TEXT,
    status              TEXT NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN ('scheduled', 'confirmed', 'declined', 'completed')),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    -- One slot per (kebaktian, service_type). Prevents duplicate slots.
    UNIQUE (kebaktian_id, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_jadwal_church_id ON jadwal_pelayanan(church_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_kebaktian_id ON jadwal_pelayanan(kebaktian_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_pelayan_id ON jadwal_pelayanan(pelayan_id);
```

### 4.6 Notes on the schema

- **Combined `waktu_mulai` instead of separate date + time.** A single UTC timestamp removes ambiguity. "Sunday 9 AM Jakarta" is stored as `2026-05-18T02:00:00Z`. The frontend formats with `Intl.DateTimeFormat` using `timeZone: church.timezone`. Date-only fields (birthdays etc.) stay as `YYYY-MM-DD`.
- **`UNIQUE (kebaktian_id, service_type_id)`** in `jadwal_pelayanan` enforces "one slot per role per service." Required for the idempotent bulk-upsert behavior in §8.
- **`ON DELETE CASCADE` everywhere `church_id` points.** Deleting a church wipes its data cleanly.
- **`ON DELETE SET NULL`** for `pelayan_id` in `jadwal_pelayanan`: removing a pelayan empties their slots without destroying historical schedules.
- **No `audit_log`** at MVP. `updated_at` + `is_active` covers what we need.
- **No soft delete on most tables.** Use `is_active` flag where useful (`jemaat`, `pelayan`, `service_types`, `users`).

### 4.7 sqlc query files (per feature folder)

Queries live next to their handlers, e.g. `internal/jemaat/queries.sql`. Example:

```sql
-- internal/jemaat/queries.sql

-- name: GetJemaat :one
SELECT * FROM jemaat
WHERE id = ? AND church_id = ?;

-- name: ListJemaat :many
SELECT * FROM jemaat
WHERE church_id = ? AND is_active = 1
ORDER BY nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CountJemaat :one
SELECT COUNT(*) FROM jemaat
WHERE church_id = ? AND is_active = 1;

-- name: SearchJemaat :many
-- Caller passes the pattern with % already wrapped, e.g. "%budi%".
-- Caller MUST escape % and _ in user input before wrapping.
SELECT * FROM jemaat
WHERE church_id = ?
  AND is_active = 1
  AND (nama_lengkap LIKE ? ESCAPE '\'
       OR nama_panggilan LIKE ? ESCAPE '\'
       OR email LIKE ? ESCAPE '\')
ORDER BY nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CreateJemaat :one
INSERT INTO jemaat (
    church_id, nama_lengkap, nama_panggilan, jenis_kelamin,
    tanggal_lahir, tempat_lahir, alamat, nomor_telepon, email,
    status_pernikahan, tanggal_baptis, tanggal_sidi,
    keluarga_id, catatan
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateJemaat :one
UPDATE jemaat SET
    nama_lengkap = ?, nama_panggilan = ?, jenis_kelamin = ?,
    tanggal_lahir = ?, tempat_lahir = ?, alamat = ?,
    nomor_telepon = ?, email = ?, status_pernikahan = ?,
    tanggal_baptis = ?, tanggal_sidi = ?, keluarga_id = ?,
    catatan = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ? AND church_id = ?
RETURNING *;

-- name: DeactivateJemaat :exec
UPDATE jemaat
SET is_active = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ? AND church_id = ?;
```

**Pattern for every query:** include `church_id` in WHERE clauses. Two-argument lookup (`id` + `church_id`) prevents IDOR. **No exceptions.**

### 4.8 Avoiding N+1 (pelayan list)

`GET /pelayan` needs each pelayan's jemaat name + their service types. Two queries total, assembled in Go:

```sql
-- name: ListPelayanWithJemaat :many
SELECT
    p.id, p.church_id, p.jemaat_id, p.catatan, p.is_active,
    p.created_at, p.updated_at,
    j.nama_lengkap AS jemaat_nama_lengkap,
    j.nama_panggilan AS jemaat_nama_panggilan,
    j.email AS jemaat_email
FROM pelayan p
INNER JOIN jemaat j ON j.id = p.jemaat_id
WHERE p.church_id = ? AND p.is_active = 1
ORDER BY j.nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: ListServiceTypesForPelayanIDs :many
-- Returns all service-type assignments for a set of pelayan IDs.
-- Caller passes the slice; sqlc generates `pelayan_ids []int64` parameter.
SELECT
    pst.pelayan_id,
    pst.service_type_id,
    pst.skill_level,
    st.nama AS service_type_nama,
    st.warna AS service_type_warna
FROM pelayan_service_types pst
INNER JOIN service_types st ON st.id = pst.service_type_id
WHERE pst.pelayan_id IN (sqlc.slice('pelayan_ids'));
```

Service layer:
1. Call `ListPelayanWithJemaat` → get N rows.
2. Collect the IDs.
3. Call `ListServiceTypesForPelayanIDs` → get assignments.
4. Group assignments by `pelayan_id` in Go.
5. Return composed DTOs.

Two queries regardless of N. Good enough.

### 4.9 `sqlc.yaml`

sqlc reads queries from each feature folder and emits Go into a single `internal/db/sqlc` package. (You can split per-feature, but a single package is simpler and avoids cross-package wiring.)

```yaml
version: "2"
sql:
  - engine: "sqlite"
    schema: "internal/db/schema.sql"
    queries:
      - "internal/auth/queries.sql"
      - "internal/jemaat/queries.sql"
      - "internal/keluarga/queries.sql"
      - "internal/pelayan/queries.sql"
      - "internal/servicetypes/queries.sql"
      - "internal/kebaktian/queries.sql"
      - "internal/jadwal/queries.sql"
    gen:
      go:
        package: "sqlc"
        out: "internal/db/sqlc"
        sql_package: "database/sql"
        emit_json_tags: true
        emit_db_tags: true
        emit_prepared_queries: false
        emit_interface: true
        emit_empty_slices: true
        emit_pointers_for_null_types: false  # use sql.Null* + guregu/null overrides
        overrides:
          - db_type: "TEXT"
            nullable: true
            go_type: "gopkg.in/guregu/null.v4.String"
          - db_type: "INTEGER"
            nullable: true
            go_type: "gopkg.in/guregu/null.v4.Int"
```

This produces struct fields like `Email null.String` which marshal to JSON as `"email": "x"` or `"email": null` — exactly what the API wants.

---

## 5. Backend Implementation (Go)

### 5.1 Go module setup

```bash
cd backend
go mod init github.com/<owner>/tatagereja/backend
```

### 5.2 Required dependencies

```go
require (
    github.com/go-chi/chi/v5             v5.x
    github.com/go-chi/cors               v1.x
    github.com/go-chi/httprate           v0.x
    modernc.org/sqlite                   v1.x
    github.com/golang-jwt/jwt/v5         v5.x
    golang.org/x/crypto                  v0.x  // bcrypt
    github.com/go-playground/validator/v10  v10.x
    gopkg.in/guregu/null.v4              v4.x
)
```

### 5.3 `cmd/server/main.go`

```go
package main

import (
    "context"
    "errors"
    "log/slog"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/<owner>/tatagereja/backend/internal/config"
    "github.com/<owner>/tatagereja/backend/internal/db"
    "github.com/<owner>/tatagereja/backend/internal/router"
)

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    slog.SetDefault(logger)

    cfg, err := config.Load()
    if err != nil {
        slog.Error("failed to load config", "err", err)
        os.Exit(1)
    }

    database, err := db.Open(cfg.DatabaseURL)
    if err != nil {
        slog.Error("failed to open db", "err", err)
        os.Exit(1)
    }
    defer database.Close()

    if err := db.Sync(database, cfg.SchemaMode); err != nil {
        slog.Error("failed to sync schema", "err", err, "mode", cfg.SchemaMode)
        os.Exit(1)
    }

    handler := router.New(cfg, database)

    srv := &http.Server{
        Addr:              ":" + cfg.Port,
        Handler:           handler,
        ReadHeaderTimeout: 10 * time.Second,
        ReadTimeout:       30 * time.Second,
        WriteTimeout:      30 * time.Second,
        IdleTimeout:       120 * time.Second,
    }

    go func() {
        slog.Info("server starting", "addr", srv.Addr, "env", cfg.Env)
        if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            slog.Error("server error", "err", err)
            os.Exit(1)
        }
    }()

    stop := make(chan os.Signal, 1)
    signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
    <-stop

    slog.Info("shutting down")
    shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()
    if err := srv.Shutdown(shutdownCtx); err != nil {
        slog.Error("shutdown error", "err", err)
    }
}
```

### 5.4 `internal/config/config.go`

```go
package config

import (
    "errors"
    "os"
    "strings"
)

type SchemaMode string

const (
    SchemaModeRecreate SchemaMode = "recreate"
    SchemaModeEnsure   SchemaMode = "ensure"
    SchemaModeOff      SchemaMode = "off"
)

type Config struct {
    Port               string
    Env                string // "development" | "production"
    DatabaseURL        string
    SchemaMode         SchemaMode
    JWTSecret          []byte
    JWTIssuer          string
    JWTAudience        string
    CookieDomain       string // e.g. ".tatagereja.id"; empty in dev
    CookieSecure       bool   // false in dev
    CORSAllowedOrigins []string
    LogLevel           string
}

func Load() (*Config, error) {
    cfg := &Config{
        Port:         getEnv("PORT", "8080"),
        Env:          getEnv("APP_ENV", "development"),
        DatabaseURL:  os.Getenv("DATABASE_URL"),
        SchemaMode:   SchemaMode(getEnv("SCHEMA_MODE", "recreate")),
        JWTIssuer:    getEnv("JWT_ISSUER", "tatagereja"),
        JWTAudience:  getEnv("JWT_AUDIENCE", "tatagereja-web"),
        CookieDomain: getEnv("COOKIE_DOMAIN", ""),
        LogLevel:     getEnv("LOG_LEVEL", "info"),
    }

    secret := os.Getenv("JWT_SECRET")
    if len(secret) < 32 {
        return nil, errors.New("JWT_SECRET must be at least 32 bytes")
    }
    cfg.JWTSecret = []byte(secret)

    if cfg.DatabaseURL == "" {
        return nil, errors.New("DATABASE_URL is required")
    }

    switch cfg.SchemaMode {
    case SchemaModeRecreate, SchemaModeEnsure, SchemaModeOff:
    default:
        return nil, errors.New("SCHEMA_MODE must be one of: recreate, ensure, off")
    }

    cfg.CookieSecure = cfg.Env == "production"

    origins := getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
    cfg.CORSAllowedOrigins = strings.Split(origins, ",")
    for i := range cfg.CORSAllowedOrigins {
        cfg.CORSAllowedOrigins[i] = strings.TrimSpace(cfg.CORSAllowedOrigins[i])
    }

    return cfg, nil
}

func getEnv(key, fallback string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return fallback
}
```

### 5.5 `internal/db/conn.go`

```go
package db

import (
    "database/sql"
    "fmt"

    _ "modernc.org/sqlite"
)

// Open returns a *sql.DB connected to a SQLite file or :memory:.
//
// Connection pool note: SQLite is single-writer. We use MaxOpenConns(1)
// to serialize all access through one connection. This eliminates
// "database is locked" errors entirely. WAL still gives us concurrent
// readers at the OS level; we just don't expose that to Go.
//
// At our scale (<5 churches, single-digit writes/min), this is the
// boring correct answer. Revisit if we measure contention.
func Open(url string) (*sql.DB, error) {
    db, err := sql.Open("sqlite", url)
    if err != nil {
        return nil, fmt.Errorf("open db: %w", err)
    }

    pragmas := []string{
        "PRAGMA journal_mode = WAL",
        "PRAGMA synchronous = NORMAL",
        "PRAGMA busy_timeout = 5000",
        "PRAGMA foreign_keys = ON",
        "PRAGMA temp_store = MEMORY",
        "PRAGMA cache_size = -2000", // 2MB
    }
    for _, p := range pragmas {
        if _, err := db.Exec(p); err != nil {
            return nil, fmt.Errorf("apply pragma %q: %w", p, err)
        }
    }

    db.SetMaxOpenConns(1)
    db.SetMaxIdleConns(1)
    db.SetConnMaxLifetime(0) // never expire — single long-lived conn

    return db, nil
}
```

### 5.6 `internal/db/sync.go`

```go
package db

import (
    "database/sql"
    _ "embed"
    "fmt"
    "regexp"
    "strings"

    "github.com/<owner>/tatagereja/backend/internal/config"
)

//go:embed schema.sql
var schemaSQL string

// Sync ensures the database schema matches schema.sql according to the mode:
//   - recreate: drop all known tables, then apply schema.sql (destructive; dev only)
//   - ensure:   apply schema.sql as-is (CREATE TABLE IF NOT EXISTS; idempotent)
//   - off:      do nothing
func Sync(db *sql.DB, mode config.SchemaMode) error {
    switch mode {
    case config.SchemaModeOff:
        return nil

    case config.SchemaModeRecreate:
        tables := extractTableNames(schemaSQL)
        // Drop in reverse order to respect FKs (best-effort; FKs are off during DDL anyway).
        if _, err := db.Exec("PRAGMA foreign_keys = OFF"); err != nil {
            return fmt.Errorf("disable fks: %w", err)
        }
        for i := len(tables) - 1; i >= 0; i-- {
            if _, err := db.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s", tables[i])); err != nil {
                return fmt.Errorf("drop %s: %w", tables[i], err)
            }
        }
        if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
            return fmt.Errorf("enable fks: %w", err)
        }
        return applySchema(db)

    case config.SchemaModeEnsure:
        return applySchema(db)

    default:
        return fmt.Errorf("unknown schema mode: %s", mode)
    }
}

func applySchema(db *sql.DB) error {
    // SQLite needs statements executed individually for some pragmas, but
    // database/sql with modernc.org/sqlite handles multi-statement strings fine.
    if _, err := db.Exec(schemaSQL); err != nil {
        return fmt.Errorf("apply schema: %w", err)
    }
    return nil
}

var tableNameRe = regexp.MustCompile(`(?i)CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_][a-z0-9_]*)`)

func extractTableNames(sql string) []string {
    matches := tableNameRe.FindAllStringSubmatch(sql, -1)
    names := make([]string, 0, len(matches))
    seen := map[string]bool{}
    for _, m := range matches {
        n := strings.ToLower(m[1])
        if !seen[n] {
            seen[n] = true
            names = append(names, n)
        }
    }
    return names
}
```

### 5.7 `internal/router/router.go`

```go
package router

import (
    "database/sql"
    "net/http"
    "time"

    "github.com/go-chi/chi/v5"
    chimiddleware "github.com/go-chi/chi/v5/middleware"
    "github.com/go-chi/cors"
    "github.com/go-chi/httprate"

    "github.com/<owner>/tatagereja/backend/internal/auth"
    "github.com/<owner>/tatagereja/backend/internal/config"
    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
    "github.com/<owner>/tatagereja/backend/internal/health"
    "github.com/<owner>/tatagereja/backend/internal/jadwal"
    "github.com/<owner>/tatagereja/backend/internal/jemaat"
    "github.com/<owner>/tatagereja/backend/internal/kebaktian"
    "github.com/<owner>/tatagereja/backend/internal/keluarga"
    appmw "github.com/<owner>/tatagereja/backend/internal/middleware"
    "github.com/<owner>/tatagereja/backend/internal/pelayan"
    "github.com/<owner>/tatagereja/backend/internal/servicetypes"
)

func New(cfg *config.Config, database *sql.DB) http.Handler {
    queries := sqlc.New(database)

    r := chi.NewRouter()
    r.Use(chimiddleware.RequestID)
    r.Use(chimiddleware.RealIP)
    r.Use(appmw.Logging) // redacts auth headers + auth bodies
    r.Use(chimiddleware.Recoverer)
    r.Use(chimiddleware.Timeout(30 * time.Second))

    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   cfg.CORSAllowedOrigins,
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
        AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

    // Public
    r.Get("/health", health.New(database).Handle)

    r.Group(func(r chi.Router) {
        r.Use(httprate.LimitByIP(10, time.Minute))
        ah := auth.NewHandler(cfg, queries, database)
        r.Post("/auth/login", ah.Login)
        r.Post("/auth/logout", ah.Logout)
    })

    // Authenticated
    r.Group(func(r chi.Router) {
        r.Use(appmw.RequireAuth(cfg))

        r.Get("/me", auth.NewHandler(cfg, queries, database).Me)

        jh := jemaat.NewHandler(queries, database)
        r.Route("/jemaat", func(r chi.Router) {
            r.Get("/", jh.List)
            r.Post("/", jh.Create)
            r.Get("/{id}", jh.Get)
            r.Put("/{id}", jh.Update)
            r.Delete("/{id}", jh.Delete)
        })

        kh := keluarga.NewHandler(queries, database)
        r.Route("/keluarga", func(r chi.Router) {
            r.Get("/", kh.List)
            r.Post("/", kh.Create)
            r.Get("/{id}", kh.Get)
            r.Put("/{id}", kh.Update)
            r.Delete("/{id}", kh.Delete)
        })

        ph := pelayan.NewHandler(queries, database)
        r.Route("/pelayan", func(r chi.Router) {
            r.Get("/", ph.List)
            r.Post("/", ph.Create)
            r.Get("/{id}", ph.Get)
            r.Put("/{id}", ph.Update)
            r.Delete("/{id}", ph.Delete)
        })

        sth := servicetypes.NewHandler(queries, database)
        r.Route("/service-types", func(r chi.Router) {
            r.Get("/", sth.List)
            r.Post("/", sth.Create)
            r.Put("/{id}", sth.Update)
            r.Delete("/{id}", sth.Delete)
        })

        kbh := kebaktian.NewHandler(queries, database)
        jdh := jadwal.NewHandler(queries, database)
        r.Route("/kebaktian", func(r chi.Router) {
            r.Get("/", kbh.List)
            r.Post("/", kbh.Create)
            r.Get("/{id}", kbh.Get)
            r.Put("/{id}", kbh.Update)
            r.Delete("/{id}", kbh.Delete)
            r.Get("/{id}/jadwal", jdh.Get)
            r.Put("/{id}/jadwal", jdh.Replace)
        })
    })

    return r
}
```

### 5.8 `internal/middleware/auth.go`

```go
package middleware

import (
    "context"
    "net/http"
    "strings"

    "github.com/<owner>/tatagereja/backend/internal/auth"
    "github.com/<owner>/tatagereja/backend/internal/config"
    "github.com/<owner>/tatagereja/backend/internal/httpx"
)

type ctxKey int

const (
    UserIDKey ctxKey = iota
    ChurchIDKey
    UserRoleKey
)

func RequireAuth(cfg *config.Config) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            tokenStr := extractToken(r)
            if tokenStr == "" {
                httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
                return
            }
            claims, err := auth.ParseToken(tokenStr, cfg.JWTSecret)
            if err != nil {
                httpx.WriteError(w, http.StatusUnauthorized, "invalid token")
                return
            }
            ctx := r.Context()
            ctx = context.WithValue(ctx, UserIDKey, claims.UserID)
            ctx = context.WithValue(ctx, ChurchIDKey, claims.ChurchID)
            ctx = context.WithValue(ctx, UserRoleKey, claims.Role)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}

func extractToken(r *http.Request) string {
    if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
        return strings.TrimPrefix(h, "Bearer ")
    }
    if c, err := r.Cookie("tatagereja_session"); err == nil {
        return c.Value
    }
    return ""
}

func GetChurchID(r *http.Request) int64 {
    v, _ := r.Context().Value(ChurchIDKey).(int64)
    return v
}

func GetUserID(r *http.Request) int64 {
    v, _ := r.Context().Value(UserIDKey).(int64)
    return v
}

func GetUserRole(r *http.Request) string {
    v, _ := r.Context().Value(UserRoleKey).(string)
    return v
}
```

### 5.9 `internal/middleware/logging.go`

```go
package middleware

import (
    "log/slog"
    "net/http"
    "strings"
    "time"

    chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// Logging wraps each request with structured logs. It NEVER logs:
//   - Authorization header (redacted to "Bearer [REDACTED]" if present)
//   - Cookie header
//   - Request bodies for /auth/* (avoid logging passwords)
func Logging(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
        next.ServeHTTP(ww, r)
        slog.Info("http",
            "method", r.Method,
            "path", r.URL.Path,
            "status", ww.Status(),
            "bytes", ww.BytesWritten(),
            "duration_ms", time.Since(start).Milliseconds(),
            "request_id", chimiddleware.GetReqID(r.Context()),
            "auth", redactAuth(r.Header.Get("Authorization")),
        )
    })
}

func redactAuth(h string) string {
    if strings.HasPrefix(h, "Bearer ") {
        return "Bearer [REDACTED]"
    }
    if h == "" {
        return ""
    }
    return "[REDACTED]"
}
```

### 5.10 `internal/auth/jwt.go`

```go
package auth

import (
    "errors"
    "time"

    "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
    UserID   int64  `json:"uid"`
    ChurchID int64  `json:"cid"`
    Role     string `json:"role"`
    jwt.RegisteredClaims
}

// Single token lifetime. No refresh tokens.
const TokenTTL = 7 * 24 * time.Hour

func IssueToken(secret []byte, userID, churchID int64, role string) (string, error) {
    claims := Claims{
        UserID:   userID,
        ChurchID: churchID,
        Role:     role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(TokenTTL)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            NotBefore: jwt.NewNumericDate(time.Now()),
            Issuer:    "tatagereja",
            Audience:  jwt.ClaimStrings{"tatagereja-web"},
        },
    }
    t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return t.SignedString(secret)
}

func ParseToken(tokenStr string, secret []byte) (*Claims, error) {
    claims := &Claims{}
    tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, errors.New("unexpected signing method")
        }
        return secret, nil
    })
    if err != nil {
        return nil, err
    }
    if !tok.Valid {
        return nil, errors.New("invalid token")
    }
    return claims, nil
}
```

### 5.11 `internal/auth/cookie.go`

```go
package auth

import (
    "net/http"
    "time"

    "github.com/<owner>/tatagereja/backend/internal/config"
)

const CookieName = "tatagereja_session"

func SetSessionCookie(w http.ResponseWriter, cfg *config.Config, token string) {
    http.SetCookie(w, &http.Cookie{
        Name:     CookieName,
        Value:    token,
        Path:     "/",
        Domain:   cfg.CookieDomain, // ".tatagereja.id" in prod; empty in dev
        Expires:  time.Now().Add(TokenTTL),
        MaxAge:   int(TokenTTL.Seconds()),
        HttpOnly: true,
        Secure:   cfg.CookieSecure, // true in prod
        SameSite: http.SameSiteLaxMode, // works because frontend + api share parent domain
    })
}

func ClearSessionCookie(w http.ResponseWriter, cfg *config.Config) {
    http.SetCookie(w, &http.Cookie{
        Name:     CookieName,
        Value:    "",
        Path:     "/",
        Domain:   cfg.CookieDomain,
        Expires:  time.Unix(0, 0),
        MaxAge:   -1,
        HttpOnly: true,
        Secure:   cfg.CookieSecure,
        SameSite: http.SameSiteLaxMode,
    })
}
```

### 5.12 `internal/auth/password.go`

```go
package auth

import "golang.org/x/crypto/bcrypt"

const BcryptCost = 12

func HashPassword(plain string) (string, error) {
    b, err := bcrypt.GenerateFromPassword([]byte(plain), BcryptCost)
    if err != nil {
        return "", err
    }
    return string(b), nil
}

func VerifyPassword(hashed, plain string) bool {
    return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(plain)) == nil
}
```

### 5.13 Service layer pattern

Each feature has `handler.go` (HTTP), `service.go` (business logic), `dto.go` (request/response shapes). Example for jemaat:

**`internal/jemaat/dto.go`:**

```go
package jemaat

import "gopkg.in/guregu/null.v4"

type CreateRequest struct {
    NamaLengkap      string      `json:"nama_lengkap" validate:"required,min=1,max=200"`
    NamaPanggilan    null.String `json:"nama_panggilan" validate:"omitempty,max=100"`
    JenisKelamin     null.String `json:"jenis_kelamin" validate:"omitempty,oneof=L P"`
    TanggalLahir     null.String `json:"tanggal_lahir" validate:"omitempty,datetime=2006-01-02"`
    TempatLahir      null.String `json:"tempat_lahir" validate:"omitempty,max=100"`
    Alamat           null.String `json:"alamat" validate:"omitempty,max=500"`
    NomorTelepon     null.String `json:"nomor_telepon" validate:"omitempty,max=30"`
    Email            null.String `json:"email" validate:"omitempty,email,max=200"`
    StatusPernikahan null.String `json:"status_pernikahan" validate:"omitempty,oneof=belum_menikah menikah cerai duda janda"`
    TanggalBaptis    null.String `json:"tanggal_baptis" validate:"omitempty,datetime=2006-01-02"`
    TanggalSidi      null.String `json:"tanggal_sidi" validate:"omitempty,datetime=2006-01-02"`
    KeluargaID       null.Int    `json:"keluarga_id"`
    Catatan          null.String `json:"catatan" validate:"omitempty,max=2000"`
}

type UpdateRequest = CreateRequest
```

**`internal/jemaat/service.go`:**

```go
package jemaat

import (
    "context"
    "database/sql"
    "errors"
    "strings"

    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
)

var ErrNotFound = errors.New("jemaat not found")

type Service struct {
    q sqlc.Querier
}

func NewService(q sqlc.Querier) *Service {
    return &Service{q: q}
}

func (s *Service) Get(ctx context.Context, id, churchID int64) (sqlc.Jemaat, error) {
    row, err := s.q.GetJemaat(ctx, sqlc.GetJemaatParams{ID: id, ChurchID: churchID})
    if errors.Is(err, sql.ErrNoRows) {
        return sqlc.Jemaat{}, ErrNotFound
    }
    return row, err
}

func (s *Service) List(ctx context.Context, churchID, limit, offset int64, query string) ([]sqlc.Jemaat, int64, error) {
    var rows []sqlc.Jemaat
    var err error

    if query == "" {
        rows, err = s.q.ListJemaat(ctx, sqlc.ListJemaatParams{
            ChurchID: churchID, Limit: limit, Offset: offset,
        })
    } else {
        pattern := "%" + escapeLike(query) + "%"
        rows, err = s.q.SearchJemaat(ctx, sqlc.SearchJemaatParams{
            ChurchID:    churchID,
            Lower:       pattern,
            Lower_2:     pattern, // sqlc names duplicate ? params with _N
            Lower_3:     pattern,
            Limit:       limit,
            Offset:      offset,
        })
    }
    if err != nil {
        return nil, 0, err
    }

    count, err := s.q.CountJemaat(ctx, churchID)
    if err != nil {
        return nil, 0, err
    }
    return rows, count, nil
}

func (s *Service) Create(ctx context.Context, churchID int64, req CreateRequest) (sqlc.Jemaat, error) {
    return s.q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
        ChurchID:         churchID,
        NamaLengkap:      req.NamaLengkap,
        NamaPanggilan:    req.NamaPanggilan,
        JenisKelamin:     req.JenisKelamin,
        TanggalLahir:     req.TanggalLahir,
        TempatLahir:      req.TempatLahir,
        Alamat:           req.Alamat,
        NomorTelepon:     req.NomorTelepon,
        Email:            req.Email,
        StatusPernikahan: req.StatusPernikahan,
        TanggalBaptis:    req.TanggalBaptis,
        TanggalSidi:      req.TanggalSidi,
        KeluargaID:       req.KeluargaID,
        Catatan:          req.Catatan,
    })
}

// Update, Deactivate similarly...

// escapeLike escapes %, _, and \ for SQL LIKE with ESCAPE '\'.
func escapeLike(s string) string {
    r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
    return r.Replace(s)
}
```

**`internal/jemaat/handler.go`:**

```go
package jemaat

import (
    "database/sql"
    "encoding/json"
    "errors"
    "net/http"
    "strconv"

    "github.com/go-chi/chi/v5"
    "github.com/go-playground/validator/v10"

    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
    "github.com/<owner>/tatagereja/backend/internal/httpx"
    appmw "github.com/<owner>/tatagereja/backend/internal/middleware"
)

type Handler struct {
    svc      *Service
    validate *validator.Validate
}

func NewHandler(q sqlc.Querier, _ *sql.DB) *Handler {
    return &Handler{svc: NewService(q), validate: validator.New()}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
    churchID := appmw.GetChurchID(r)
    limit, offset := httpx.ParsePagination(r)
    query := r.URL.Query().Get("q")

    rows, total, err := h.svc.List(r.Context(), churchID, limit, offset, query)
    if err != nil {
        httpx.WriteError(w, http.StatusInternalServerError, "failed to list jemaat")
        return
    }
    httpx.WriteJSON(w, http.StatusOK, map[string]any{
        "data":   rows,
        "total":  total,
        "limit":  limit,
        "offset": offset,
    })
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        httpx.WriteError(w, http.StatusBadRequest, "invalid json")
        return
    }
    if err := h.validate.Struct(&req); err != nil {
        httpx.WriteValidationError(w, err)
        return
    }
    row, err := h.svc.Create(r.Context(), appmw.GetChurchID(r), req)
    if err != nil {
        httpx.WriteError(w, http.StatusInternalServerError, "failed to create jemaat")
        return
    }
    httpx.WriteJSON(w, http.StatusCreated, row)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
    id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
    if err != nil {
        httpx.WriteError(w, http.StatusBadRequest, "invalid id")
        return
    }
    row, err := h.svc.Get(r.Context(), id, appmw.GetChurchID(r))
    if errors.Is(err, ErrNotFound) {
        httpx.WriteError(w, http.StatusNotFound, "not found")
        return
    }
    if err != nil {
        httpx.WriteError(w, http.StatusInternalServerError, "db error")
        return
    }
    httpx.WriteJSON(w, http.StatusOK, row)
}

// Update, Delete similarly...
```

### 5.14 Jadwal bulk replace (idempotency)

`PUT /kebaktian/{id}/jadwal` replaces the entire set of slots for that kebaktian.

**Algorithm** (single transaction):
1. Verify kebaktian belongs to caller's church (404 otherwise).
2. Validate every `service_type_id` and `pelayan_id` in the request belongs to the same church (400 otherwise).
3. `DELETE FROM jadwal_pelayanan WHERE kebaktian_id = ? AND church_id = ?`.
4. For each slot in request, `INSERT INTO jadwal_pelayanan (...)`.
5. Commit.

Why delete-then-insert rather than upsert: simpler, single transaction, the `UNIQUE (kebaktian_id, service_type_id)` constraint guarantees correctness, and the operation is naturally idempotent.

```go
// internal/jadwal/service.go (excerpt)
func (s *Service) Replace(ctx context.Context, churchID, kebaktianID int64, slots []SlotRequest) error {
    tx, err := s.db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()
    qtx := s.q.WithTx(tx)

    // Step 1: confirm kebaktian ownership
    if _, err := qtx.GetKebaktian(ctx, sqlc.GetKebaktianParams{
        ID: kebaktianID, ChurchID: churchID,
    }); err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return ErrKebaktianNotFound
        }
        return err
    }

    // Step 2: validate all references belong to the same church
    // (collect IDs, query existence, return 400 if mismatch)
    if err := s.validateSlotReferences(ctx, qtx, churchID, slots); err != nil {
        return err
    }

    // Step 3: wipe existing
    if err := qtx.DeleteJadwalForKebaktian(ctx, sqlc.DeleteJadwalForKebaktianParams{
        KebaktianID: kebaktianID, ChurchID: churchID,
    }); err != nil {
        return err
    }

    // Step 4: insert all
    for _, s := range slots {
        if _, err := qtx.CreateJadwal(ctx, sqlc.CreateJadwalParams{
            ChurchID:      churchID,
            KebaktianID:   kebaktianID,
            ServiceTypeID: s.ServiceTypeID,
            PelayanID:     s.PelayanID,
            Catatan:       s.Catatan,
            Status:        "scheduled",
        }); err != nil {
            return err
        }
    }
    return tx.Commit()
}
```

### 5.15 Health check

```go
// internal/health/handler.go
package health

import (
    "context"
    "database/sql"
    "net/http"
    "time"

    "github.com/<owner>/tatagereja/backend/internal/httpx"
)

type Handler struct{ db *sql.DB }

func New(db *sql.DB) *Handler { return &Handler{db: db} }

func (h *Handler) Handle(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    dbStatus := "ok"
    status := http.StatusOK

    if err := h.db.PingContext(ctx); err != nil {
        dbStatus = "error"
        status = http.StatusServiceUnavailable
    } else {
        var n int
        if err := h.db.QueryRowContext(ctx, "SELECT 1").Scan(&n); err != nil || n != 1 {
            dbStatus = "error"
            status = http.StatusServiceUnavailable
        }
    }

    httpx.WriteJSON(w, status, map[string]any{
        "status":  ternary(status == 200, "ok", "degraded"),
        "db":      dbStatus,
        "version": Version,
    })
}

func ternary(b bool, a, c string) string {
    if b {
        return a
    }
    return c
}

var Version = "dev" // overridden at build time with -ldflags "-X .../health.Version=..."
```

### 5.16 Response helpers

```go
// internal/httpx/response.go
package httpx

import (
    "encoding/json"
    "net/http"

    "github.com/go-playground/validator/v10"
)

type ErrorResponse struct {
    Error  string            `json:"error"`
    Fields map[string]string `json:"fields,omitempty"`
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(v)
}

func WriteError(w http.ResponseWriter, status int, msg string) {
    WriteJSON(w, status, ErrorResponse{Error: msg})
}

func WriteValidationError(w http.ResponseWriter, err error) {
    fields := map[string]string{}
    if ves, ok := err.(validator.ValidationErrors); ok {
        for _, fe := range ves {
            fields[fe.Field()] = fe.Tag()
        }
    }
    WriteJSON(w, http.StatusBadRequest, ErrorResponse{
        Error:  "validation failed",
        Fields: fields,
    })
}
```

```go
// internal/httpx/pagination.go
package httpx

import (
    "net/http"
    "strconv"
)

func ParsePagination(r *http.Request) (limit, offset int64) {
    limit = 50
    offset = 0
    if v := r.URL.Query().Get("limit"); v != "" {
        if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 && n <= 200 {
            limit = n
        }
    }
    if v := r.URL.Query().Get("offset"); v != "" {
        if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
            offset = n
        }
    }
    return
}
```

### 5.17 `Procfile`

```
web: ./bin/server
```

No release phase needed at MVP — schema sync runs in-process on every boot. When we add real migrations, this becomes `release: ./bin/migrate && web: ./bin/server`.

### 5.18 `cmd/seed-admin/main.go`

Bootstrap CLI for creating the first church + admin user. Run locally against either dev or prod DB:

```bash
DATABASE_URL=file:./local.db go run ./cmd/seed-admin \
    --church-slug=demo --church-name="Demo Church" \
    --email=admin@example.com --password=...
```

(Implementation: open DB, ensure schema, INSERT INTO churches if slug not exists, hash password, INSERT INTO users.)

---

## 6. Frontend Implementation (Svelte SPA)

### 6.1 Initialization

```bash
cd frontend
npm create vite@latest . -- --template svelte-ts
npm install
```

### 6.2 Required dependencies

```json
{
  "dependencies": {
    "svelte": "^5.0.0",
    "svelte-spa-router": "^4.0.0",
    "@tanstack/svelte-query": "^5.0.0",
    "zod": "^3.23.0",
    "lucide-svelte": "^0.400.0",
    "date-fns": "^3.0.0",
    "date-fns-tz": "^3.0.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@tailwindcss/forms": "^0.5.0",
    "@types/node": "^20.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "prettier": "^3.0.0",
    "prettier-plugin-svelte": "^3.0.0",
    "prettier-plugin-tailwindcss": "^0.6.0",
    "rollup-plugin-visualizer": "^5.0.0",
    "svelte-check": "^4.0.0",
    "tailwindcss": "^3.4.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

**shadcn-svelte note:** Not an npm install. Use the CLI to copy components into `src/lib/components/ui/`:

```bash
npx shadcn-svelte@latest init
npx shadcn-svelte@latest add button input label table dialog select form sonner
```

### 6.3 `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'node:path';

export default defineConfig({
  plugins: [
    svelte(),
    visualizer({ filename: 'dist/stats.html', gzipSize: true }),
  ],
  resolve: {
    alias: { $lib: path.resolve(__dirname, './src/lib') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
```

### 6.4 `src/lib/api/client.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    let fields: Record<string, string> | undefined;
    try {
      const data = await res.json();
      msg = data.error || msg;
      fields = data.fields;
    } catch {}
    throw new ApiError(res.status, msg, fields);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
```

### 6.5 Auth store with proper boot sequencing

```typescript
// src/lib/stores/auth.svelte.ts
import { apiClient, ApiError } from '$lib/api/client';
import { push } from 'svelte-spa-router';

export type User = {
  id: number;
  email: string;
  display_name: string;
  role: 'admin' | 'editor' | 'viewer';
  church_id: number;
  church: { id: number; name: string; slug: string; timezone: string };
};

class AuthStore {
  user = $state<User | null>(null);
  /** true until first restore() completes — used to gate router & UI */
  bootResolved = $state(false);

  get isAuthenticated() {
    return this.user !== null;
  }

  async login(email: string, password: string) {
    const res = await apiClient.post<{ user: User }>('/auth/login', { email, password });
    this.user = res.user;
    push('/');
  }

  async logout() {
    try { await apiClient.post('/auth/logout', {}); } catch {}
    this.user = null;
    push('/login');
  }

  async restore() {
    try {
      this.user = await apiClient.get<User>('/me');
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) {
        console.error('auth.restore failed', e);
      }
      this.user = null;
    } finally {
      this.bootResolved = true;
    }
  }
}

export const auth = new AuthStore();
```

### 6.6 `src/App.svelte` — boot sequence

```svelte
<script lang="ts">
  import Router from 'svelte-spa-router';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { routes } from '$lib/routes';
  import { auth } from '$lib/stores/auth.svelte';

  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  });

  // Kick off the auth restore immediately; render a splash until it finishes.
  auth.restore();
</script>

<QueryClientProvider client={queryClient}>
  <main class="min-h-screen bg-background text-foreground">
    {#if !auth.bootResolved}
      <div class="flex h-screen items-center justify-center">
        <p class="text-muted-foreground">Memuat…</p>
      </div>
    {:else}
      <Router {routes} />
    {/if}
  </main>
</QueryClientProvider>
```

This eliminates the "bounce to /login on refresh" problem.

### 6.7 Timezone-aware date formatting

```typescript
// src/lib/utils/date.ts
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { auth } from '$lib/stores/auth.svelte';

export function tz(): string {
  return auth.user?.church.timezone ?? 'Asia/Jakarta';
}

/** Format a UTC ISO string in the church's timezone. */
export function formatDateTime(utc: string, fmt = 'EEEE, d MMM yyyy HH:mm'): string {
  return formatInTimeZone(utc, tz(), fmt);
}

/** Parse a local datetime input (e.g. from <input type="datetime-local">) into a UTC ISO string. */
export function localToUTC(local: string): string {
  // local is like "2026-05-18T09:00", interpreted in the church tz.
  const zoned = toZonedTime(local, tz());
  return zoned.toISOString();
}
```

`<input type="datetime-local">` returns a wall-clock string with no timezone; we treat it as church-local and convert to UTC on submit. Display goes the other way.

### 6.8 Form pattern (native + Zod)

```svelte
<!-- src/routes/JemaatCreate.svelte (excerpt) -->
<script lang="ts">
  import { z } from 'zod';
  import { useCreateJemaat } from '$lib/api/jemaat';
  import { ApiError } from '$lib/api/client';

  const schema = z.object({
    nama_lengkap: z.string().min(1, 'Wajib diisi').max(200),
    email: z.string().email('Format email salah').max(200).optional().or(z.literal('')),
    // ... rest
  });

  let form = $state({ nama_lengkap: '', email: '' /* ... */ });
  let errors = $state<Record<string, string>>({});
  let submitting = $state(false);

  const create = useCreateJemaat();

  async function submit() {
    errors = {};
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path[0], i.message])
      );
      return;
    }
    submitting = true;
    try {
      await $create.mutateAsync(parsed.data);
    } catch (e) {
      if (e instanceof ApiError && e.fields) errors = e.fields;
    } finally {
      submitting = false;
    }
  }
</script>

<form on:submit|preventDefault={submit}>
  <!-- inputs bound to `form.*`, errors shown from `errors.*` -->
</form>
```

### 6.9 Other frontend conventions

- All API calls via `apiClient`; no raw `fetch` in components.
- All server state via TanStack Query.
- No `any`. Use `unknown` and narrow.
- Indonesian strings live in `src/lib/i18n/id.ts`. Never inline a user-facing string in a component — always reference from `t.someKey`. This makes future i18n trivial.

### 6.10 Bundle budget

**Target: ≤ 250 KB gzipped for the main bundle.** Vite's `rollup-plugin-visualizer` emits `dist/stats.html` after every build; the `make build` target invokes `scripts/check-bundle-size.js`, which reads the stats and exits non-zero if the main chunk exceeds budget.

---

## 7. Authentication & Authorization

### 7.1 Flow

1. User submits email + password to `POST /auth/login`.
2. Backend verifies bcrypt hash. On success:
   - Issues a JWT (7-day TTL) containing `{user_id, church_id, role}`.
   - Sets `tatagereja_session` cookie: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Domain=.tatagereja.id` (prod), `Path=/`.
   - Returns `{ user, church }` payload.
3. Every authenticated request: `RequireAuth` middleware reads cookie, verifies JWT, sets `user_id`/`church_id`/`role` in request context.
4. When the token expires (7 days), frontend gets 401 → user is redirected to `/login`. No refresh flow.
5. Logout: `POST /auth/logout` clears the cookie.

### 7.2 Why this is enough for MVP

- 1–5 people share one account per church. Re-login weekly is fine.
- No refresh token = no refresh rotation security questions, no token revocation list, no token storage on the server.
- httpOnly cookie = JS can't read it → XSS can't steal it.
- `SameSite=Lax` + shared parent domain = CSRF protection without preflight headache.

### 7.3 Cookie domain mechanics

- **Prod:** Both `app.tatagereja.id` and `api.tatagereja.id` are children of `tatagereja.id`. Setting `Domain=.tatagereja.id` lets both subdomains see the cookie. `SameSite=Lax` is sufficient because they're same-site.
- **Dev:** Frontend on `localhost:5173`, backend on `localhost:8080`. Vite proxy forwards `/api/*` → backend, so from the browser's view everything is `localhost:5173`. Cookie is set without `Domain`, on localhost, with `Secure=false`. No SameSite drama.

### 7.4 Role-based access (MVP-light)

- `admin` — full CRUD within their church.
- `editor` — CRUD on jemaat/keluarga/pelayan/jadwal; cannot manage users or service types.
- `viewer` — read-only.

For MVP, **only `admin` exists** (the seeded user). The middleware supports all three so we're ready when needed:

```go
// internal/middleware/role.go
func RequireRole(roles ...string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            role := GetUserRole(r)
            for _, allowed := range roles {
                if role == allowed {
                    next.ServeHTTP(w, r)
                    return
                }
            }
            httpx.WriteError(w, http.StatusForbidden, "forbidden")
        })
    }
}
```

### 7.5 Initial admin provisioning

Owner runs `cmd/seed-admin` locally against the prod DB to create the first church + admin. See §5.18.

### 7.6 Password reset (POST-MVP)

Deferred. For MVP, owner resets passwords manually via a small CLI tool (`cmd/reset-password`) or direct SQL.

---

## 8. API Contract

### 8.1 Conventions

- Base URL: `https://api.tatagereja.id` (prod), `http://localhost:8080` (dev).
- Content type: `application/json` for everything.
- Auth: httpOnly cookie `tatagereja_session`. `Authorization: Bearer` accepted as fallback.
- Errors: `{ "error": "msg", "fields"?: { "field_name": "tag" } }`.
- Pagination: `?limit=50&offset=0`. Responses: `{ "data": [...], "total": N, "limit": N, "offset": N }`.
- Timestamps: UTC ISO 8601 with `Z` suffix. Dates: `YYYY-MM-DD`.
- IDs: integers.

### 8.2 Endpoints

#### Auth

| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | `/auth/login` | `{ email, password }` | `{ user, church }` + sets cookie | No |
| POST | `/auth/logout` | — | `204` | No (clears cookie) |
| GET | `/me` | — | `{ user, church }` | Yes |

#### Jemaat

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jemaat?limit=&offset=&q=` | List, with optional search `q` (LIKE on nama/panggilan/email) |
| POST | `/jemaat` | Create |
| GET | `/jemaat/{id}` | Detail |
| PUT | `/jemaat/{id}` | Update (full replace) |
| DELETE | `/jemaat/{id}` | Soft delete (`is_active=0`) |

#### Keluarga

| Method | Path | Description |
|--------|------|-------------|
| GET | `/keluarga?limit=&offset=` | List |
| POST | `/keluarga` | Create |
| GET | `/keluarga/{id}` | Detail with member list |
| PUT | `/keluarga/{id}` | Update |
| DELETE | `/keluarga/{id}` | Delete (members' `keluarga_id` → NULL) |

#### Pelayan

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pelayan` | List, each with jemaat info + service types (2 queries, see §4.8) |
| POST | `/pelayan` | Promote a jemaat to pelayan |
| GET | `/pelayan/{id}` | Detail with service types |
| PUT | `/pelayan/{id}` | Update catatan + replace service-types set |
| DELETE | `/pelayan/{id}` | Remove pelayan status (jemaat stays) |

Create body:

```json
{
  "jemaat_id": 42,
  "catatan": "Tersedia setiap Minggu kecuali minggu pertama",
  "service_type_ids": [1, 3, 5]
}
```

#### Service Types

| Method | Path | Description |
|--------|------|-------------|
| GET | `/service-types` | List |
| POST | `/service-types` | Create |
| PUT | `/service-types/{id}` | Update |
| DELETE | `/service-types/{id}` | Delete; returns 409 if referenced by any jadwal_pelayanan row |

#### Kebaktian + Jadwal

| Method | Path | Description |
|--------|------|-------------|
| GET | `/kebaktian?from=&to=` | List in UTC date range. `from` and `to` inclusive |
| POST | `/kebaktian` | Create. `waktu_mulai` is UTC ISO 8601 |
| GET | `/kebaktian/{id}` | Detail |
| PUT | `/kebaktian/{id}` | Update |
| DELETE | `/kebaktian/{id}` | Delete (cascades jadwal) |
| GET | `/kebaktian/{id}/jadwal` | Slots with embedded service_type + pelayan info |
| PUT | `/kebaktian/{id}/jadwal` | **Idempotent replace** of all slots (see §5.14) |

Replace-slots body:

```json
{
  "slots": [
    { "service_type_id": 1, "pelayan_id": 12, "catatan": "" },
    { "service_type_id": 2, "pelayan_id": 8,  "catatan": "" },
    { "service_type_id": 3, "pelayan_id": null, "catatan": "Belum terisi" }
  ]
}
```

Behavior: deletes all current slots for the kebaktian, inserts each provided slot. Each `service_type_id` must appear at most once in the array (enforced by `UNIQUE`).

### 8.3 Error codes

| Status | Meaning |
|--------|---------|
| 400 | Bad request, validation failure (with `fields`), bad JSON |
| 401 | Not authenticated |
| 403 | Forbidden (wrong role) |
| 404 | Not found (also when row belongs to another church — never leak this) |
| 409 | Conflict (unique constraint, FK constraint, dependent rows) |
| 429 | Rate limit |
| 500 | Server error |

---

## 9. Validation Rules

Server-side validation rules, enforced via `validator/v10` tags on DTOs. Frontend mirrors these in Zod schemas.

### 9.1 Auth

| Field | Rules |
|-------|-------|
| `email` | required, valid email, max 200 |
| `password` (login) | required, min 1 (we don't restrict on login — just compare) |

### 9.2 Jemaat

| Field | Rules |
|-------|-------|
| `nama_lengkap` | **required**, 1–200 chars |
| `nama_panggilan` | optional, max 100 |
| `jenis_kelamin` | optional, one of `L`, `P` |
| `tanggal_lahir` | optional, `YYYY-MM-DD`, must be a valid date, not in future |
| `tempat_lahir` | optional, max 100 |
| `alamat` | optional, max 500 |
| `nomor_telepon` | optional, max 30, allow `+`, digits, spaces, `-` |
| `email` | optional, valid email format, max 200 |
| `status_pernikahan` | optional, one of `belum_menikah`, `menikah`, `cerai`, `duda`, `janda` |
| `tanggal_baptis` | optional, `YYYY-MM-DD`, not in future |
| `tanggal_sidi` | optional, `YYYY-MM-DD`, not in future, ≥ `tanggal_baptis` if both set |
| `keluarga_id` | optional, must reference an existing keluarga in same church |
| `catatan` | optional, max 2000 |

### 9.3 Keluarga

| Field | Rules |
|-------|-------|
| `nama_keluarga` | required, 1–200 chars |
| `alamat` | optional, max 500 |
| `catatan` | optional, max 2000 |

### 9.4 Service Types

| Field | Rules |
|-------|-------|
| `nama` | required, 1–100 chars, unique within church |
| `deskripsi` | optional, max 500 |
| `warna` | optional, hex `#RRGGBB` (validated by regex `^#[0-9a-fA-F]{6}$`) |
| `urutan` | optional integer, default 0 |

### 9.5 Pelayan

| Field | Rules |
|-------|-------|
| `jemaat_id` | required, must exist in same church |
| `catatan` | optional, max 2000 |
| `service_type_ids` | array of IDs, each must exist in same church; duplicates rejected |

### 9.6 Kebaktian

| Field | Rules |
|-------|-------|
| `nama` | required, 1–200 chars |
| `waktu_mulai` | required, UTC ISO 8601 (`2026-05-18T02:00:00Z`) |
| `lokasi` | optional, max 200 |
| `tema` | optional, max 300 |
| `pengkhotbah` | optional, max 200 |
| `catatan` | optional, max 2000 |

### 9.7 Jadwal slot

| Field | Rules |
|-------|-------|
| `service_type_id` | required, must exist in same church; unique across all slots in the request |
| `pelayan_id` | optional (null allowed for empty slot); if set, must exist in same church |
| `catatan` | optional, max 500 |

---

## 10. Development Environment

> No devcontainer at this stage. Contributors set up tooling locally (Go 1.23+, Node 20+, `sqlc`, `air`, `golangci-lint`). A devcontainer may be reintroduced later if needed.

### 10.1 `Makefile`

```makefile
.PHONY: help setup dev dev-fe dev-be build test lint clean sqlc seed seed-admin

help:
	@echo "Tata Gereja dev commands:"
	@echo "  make setup        — install deps (run once)"
	@echo "  make dev          — run frontend + backend in parallel"
	@echo "  make dev-fe       — frontend only"
	@echo "  make dev-be       — backend only (with air hot reload)"
	@echo "  make build        — production build"
	@echo "  make test         — run all tests"
	@echo "  make lint         — lint all code"
	@echo "  make sqlc         — regenerate Go DB code from schema + queries"
	@echo "  make seed         — seed dev DB with sample data"
	@echo "  make seed-admin   — interactive admin user creation"

setup:
	cd frontend && npm install
	cd backend && go mod download

dev:
	@trap 'kill 0' EXIT; \
	(cd backend && air) & \
	(cd frontend && npm run dev) & \
	wait

dev-fe:
	cd frontend && npm run dev

dev-be:
	cd backend && air

build:
	cd frontend && npm run build
	cd backend && go build -o bin/server ./cmd/server

test:
	cd backend && go test -race -cover ./...
	cd frontend && npm test -- --run

lint:
	cd backend && golangci-lint run
	cd frontend && npm run lint && npm run check

clean:
	rm -rf frontend/dist backend/bin backend/tmp backend/local.db backend/local.db-*

sqlc:
	cd backend && sqlc generate

seed:
	cd backend && go run ./cmd/seed-admin --dev

seed-admin:
	cd backend && go run ./cmd/seed-admin
```

### 10.2 `backend/.air.toml`

```toml
root = "."
tmp_dir = "tmp"

[build]
  bin = "./tmp/server"
  cmd = "go build -o ./tmp/server ./cmd/server"
  delay = 1000
  exclude_dir = ["tmp", "vendor", "testdata", "bin", "scripts"]
  exclude_regex = ["_test.go"]
  include_ext = ["go", "sql", "yaml"]
  kill_delay = "0s"
  stop_on_error = true
```

### 10.3 Local env

`backend/.env.example`:

```
PORT=8080
APP_ENV=development
DATABASE_URL=file:./local.db?_pragma=foreign_keys(1)
SCHEMA_MODE=recreate
JWT_SECRET=change-me-to-32-bytes-of-random-junk-please-aaaaa
JWT_ISSUER=tatagereja
JWT_AUDIENCE=tatagereja-web
COOKIE_DOMAIN=
CORS_ALLOWED_ORIGINS=http://localhost:5173
LOG_LEVEL=debug
```

`frontend/.env.example`:

```
VITE_API_URL=http://localhost:8080
```

### 10.4 First-run for a contributor

```bash
git clone https://github.com/<owner>/tatagereja
cd tatagereja
# VS Code → "Reopen in Container"
make setup
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
make seed-admin   # creates a dev church + admin
make dev
# http://localhost:5173
```

`schema.sql` is applied on backend startup; no separate migrate step.

---

## 11. Deployment

### 11.1 DNS setup

Domain registered at registrar; nameservers will move to Cloudflare later. Until then, set the records at the registrar's DNS panel.

| Record | Name | Target | Notes |
|--------|------|--------|-------|
| CNAME | `app` | `<project>.pages.dev` | Cloudflare Pages |
| CNAME | `api` | `<heroku-app>.herokudns.com` | Heroku provides exact value after `domains:add` |

Once nameservers move to Cloudflare:
- Add the same records in Cloudflare DNS, proxied (orange cloud) for `app`, **DNS-only (grey cloud) for `api`**. Heroku's SSL won't work behind CF proxy without extra setup, and adding the proxy gives nothing useful for an API.
- Enable Cloudflare's email routing on the apex.

### 11.2 Frontend → Cloudflare Pages

In CF dashboard:
1. Connect GitHub repo.
2. Build:
   - Production branch: `main`
   - Build command: `cd frontend && npm install && npm run build`
   - Output directory: `frontend/dist`
   - Root directory: blank
3. Env vars:
   - `VITE_API_URL` = `https://api.tatagereja.id`
   - `NODE_VERSION` = `20`
4. Custom domain: add `app.tatagereja.id`.

Auto-deploys on every `main` push.

### 11.3 Backend → Heroku Eco

One-time setup:

```bash
heroku login
heroku create tatagereja-api
heroku buildpacks:add -i 1 https://github.com/timanovsky/subdir-heroku-buildpack
heroku buildpacks:add -i 2 heroku/go
heroku config:set PROJECT_PATH=backend

heroku config:set JWT_SECRET="$(openssl rand -base64 32)"
heroku config:set JWT_ISSUER=tatagereja
heroku config:set JWT_AUDIENCE=tatagereja-web
heroku config:set APP_ENV=production
heroku config:set SCHEMA_MODE=ensure
heroku config:set COOKIE_DOMAIN=.tatagereja.id
heroku config:set CORS_ALLOWED_ORIGINS=https://app.tatagereja.id
heroku config:set DATABASE_URL='file:/app/data/tatagereja.db?_pragma=foreign_keys(1)'

heroku domains:add api.tatagereja.id
# Heroku prints the DNS target → add CNAME at your DNS provider
# Wait for ACM cert to issue (~10 min)

git push heroku main
```

Note: Heroku Eco dynos have an **ephemeral filesystem** — the DB file is wiped on every restart and roughly every 24h on the platform's schedule. This is intentional for MVP; nightly backup (§11.5) keeps a recoverable copy. **Once any church has real data, the next step is to either (a) migrate to Turso or (b) attach a real persistent volume.** This is a known limitation of MVP, documented in README, accepted because there are no real users yet.

### 11.4 First-time admin seeding

After first deploy:

```bash
cd backend
DATABASE_URL="..." go run ./cmd/seed-admin \
    --church-slug=demo --church-name="Demo Church" \
    --email=owner@example.com --password="$(openssl rand -base64 24)"
```

Or, since the prod DB is on the dyno, run it via heroku:

```bash
heroku run -a tatagereja-api ./bin/seed-admin -- \
    --church-slug=demo --church-name="Demo Church" \
    --email=owner@example.com --password='...'
```

(Requires `cmd/seed-admin` to be compiled into the slug — add it to `go.work` or ensure the buildpack builds all `cmd/*`.)

### 11.5 Backup strategy

Run a **nightly cron job** (on the owner's machine, a tiny VPS, or a Heroku Scheduler add-on) that dumps the SQLite DB and ships it to Cloudflare R2:

```bash
# scripts/backup-db.sh — invoked by cron at 02:00 WIB (UTC+7) daily
set -euo pipefail
DATE=$(date -u +%Y%m%d)
heroku run -a tatagereja-api --no-tty -- \
    "sqlite3 /app/data/tatagereja.db .dump" > "backup-${DATE}.sql"
aws s3 cp "backup-${DATE}.sql" s3://tatagereja-backups/ \
    --endpoint-url "https://<account>.r2.cloudflarestorage.com"
```

Retain 30 days on R2 (lifecycle rule).

### 11.6 Cold start

Eco dynos sleep after 30 min. Cold start for the Go binary is ~3–8s. **We accept this.** No keep-alive ping. The first user of the morning waits a few seconds.

### 11.7 Logs

- `heroku logs --tail -a tatagereja-api` for structured JSON logs.
- Consider Better Stack free tier later if log retention becomes useful.

---

## 12. Testing Strategy

### 12.1 Backend

**Test DB factory** in `tests/testutil/db.go`:

```go
package testutil

import (
    "database/sql"
    "testing"

    "github.com/<owner>/tatagereja/backend/internal/config"
    "github.com/<owner>/tatagereja/backend/internal/db"
    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
)

// NewTestDB creates an in-memory SQLite DB with schema applied.
func NewTestDB(t *testing.T) (*sql.DB, *sqlc.Queries) {
    t.Helper()
    database, err := db.Open(":memory:")
    if err != nil { t.Fatal(err) }
    if err := db.Sync(database, config.SchemaModeRecreate); err != nil {
        t.Fatal(err)
    }
    t.Cleanup(func() { database.Close() })
    return database, sqlc.New(database)
}

// SeedTwoChurches creates two churches with one admin each. Returns their IDs.
func SeedTwoChurches(t *testing.T, q *sqlc.Queries) (church1, church2 int64) {
    // ... INSERT INTO churches, users
}
```

**Required test categories** for every domain feature:
1. **Happy path** — create, read, update, delete all work.
2. **Cross-tenant isolation** — call X's endpoint as user from church Y. Must return 404. This is non-negotiable; enforce it via a dedicated `cross_tenant_test.go` file that runs as part of `make test`.
3. **Validation** — missing required field, oversized field, malformed date.
4. **Auth** — request without cookie → 401.

Example cross-tenant test:

```go
func TestJemaat_CrossTenantReturns404(t *testing.T) {
    db, q := testutil.NewTestDB(t)
    _, c2 := testutil.SeedTwoChurches(t, q)

    // Create a jemaat in church 1
    j, _ := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
        ChurchID: 1, NamaLengkap: "Budi",
    })

    // Try to read it as church 2
    _, err := q.GetJemaat(ctx, sqlc.GetJemaatParams{
        ID: j.ID, ChurchID: c2,
    })
    if !errors.Is(err, sql.ErrNoRows) {
        t.Fatalf("expected sql.ErrNoRows, got %v", err)
    }
}
```

### 12.2 Frontend

- Vitest for unit tests of date helpers, format utils, Zod schemas.
- Component tests are NOT required at MVP. The cross-tenant tests are on the backend where it matters.

---

## 13. Open Source Housekeeping

### 13.1 LICENSE

MIT. Single file `LICENSE` at repo root.

### 13.2 README.md skeleton

```markdown
# Tata Gereja

> Aplikasi manajemen jemaat & jadwal pelayanan untuk gereja kecil di Indonesia.
> Open source, gratis, ringan, di-host gratis oleh saya.

⚠️ **Proyek hobi — no SLA, no warranty.** Cocok untuk gereja kecil yang okay
dengan risiko hilangnya data. Backup harian, tapi tidak ada jaminan uptime.

## Fitur (v1)

- Data jemaat (nama, kontak, tanggal lahir, baptis, sidi)
- Pengelompokan keluarga
- Daftar pelayan + jenis pelayanan
- Jadwal pelayanan per kebaktian / persekutuan
- Satu akun per gereja, sharing antar pengurus dipersilakan

## Bergabung

Email saya di <email> dengan nama gereja Anda. Akun di-provision manual.

## Self-host

Lihat [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tech stack

- Frontend: Svelte 5 + Vite + Tailwind di Cloudflare Pages
- Backend: Go (chi + sqlc) di Heroku Eco
- Database: SQLite (akan di-upgrade ke Turso saat dibutuhkan)

## Development

```bash
git clone https://github.com/<owner>/tatagereja
cd tatagereja
# VS Code → "Reopen in Container"
make setup
make seed-admin
make dev
```

## License

MIT
```

### 13.3 Other files

- `CONTRIBUTING.md` — setup, branch naming (`feat/`, `fix/`, `docs/`), PR checklist.
- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1.
- `docs/ADD_FEATURE.md` — step-by-step recipe (edit schema → write queries → `make sqlc` → write service → write handler → register route → write tests → frontend types → API hook → page).
- `THIRD_PARTY_NOTICES.md` — generated locally via `go-licenses` and `license-checker` and committed.

### 13.4 `.gitignore` (root)

```
node_modules/
dist/
.env
.env.local
local.db
local.db-*
tmp/
bin/
*.log
.DS_Store
.vscode/launch.json
```

---

## 14. MVP Scope & Phases

### Phase 0 — Foundation (week 1)

- [ ] Monorepo scaffolded
- [ ] `schema.sql` finalized
- [ ] sqlc generation working
- [ ] Dev-mode schema sync working (`SCHEMA_MODE=recreate`)
- [ ] `/health` returns DB status
- [ ] Login → JWT → cookie → `/me` working end-to-end
- [ ] Frontend login page + dashboard skeleton + boot splash
- [ ] Deployable: frontend to CF Pages, backend to Heroku
- [ ] DNS records pointed; cookies cross subdomain

**Done when:** owner logs in at `app.tatagereja.id`, sees empty dashboard.

### Phase 1 — Jemaat + Keluarga CRUD (week 2)

- [ ] Backend: jemaat CRUD + search
- [ ] Backend: keluarga CRUD
- [ ] Frontend: jemaat list with search + pagination
- [ ] Frontend: jemaat create/edit/detail
- [ ] Frontend: keluarga list + assign jemaat to keluarga
- [ ] Cross-tenant tests passing

**Done when:** owner adds 50 dummy jemaat across 10 keluarga and finds them.

### Phase 2 — Pelayan + Service Types (week 3)

- [ ] Backend: service_types CRUD
- [ ] Backend: pelayan CRUD with service-type relationships (2-query N+1-free list)
- [ ] Frontend: service-types admin page
- [ ] Frontend: pelayan list, "promote jemaat to pelayan" flow
- [ ] Frontend: edit pelayan's service types

**Done when:** owner marks 10 jemaat as pelayan with 2–3 service types each.

### Phase 3 — Jadwal Pelayanan (week 4)

- [ ] Backend: kebaktian CRUD
- [ ] Backend: jadwal bulk-replace (idempotent, transactional)
- [ ] Frontend: kebaktian list/calendar
- [ ] Frontend: per-kebaktian schedule editor (service types as rows, pelayan dropdowns)
- [ ] Frontend: per-pelayan "kapan saya bertugas"

**Done when:** owner creates 4 upcoming Sundays with full schedule and views a "this week" summary.

### Phase 4 — Polish & v0.2 ideas

- [ ] Export to Excel/CSV
- [ ] Print-friendly schedule view
- [ ] Password reset
- [ ] Roles enforcement (editor, viewer)
- [ ] Birthday widget on dashboard
- [ ] Recurring kebaktian templates
- [ ] Migration to Turso (when persistence matters)

---

## 15. Non-Negotiable Rules

### 15.1 Multi-tenancy isolation (most important)

1. Every domain table has `church_id NOT NULL`.
2. Every query filters by `church_id` from authenticated session.
3. Never accept `church_id` from request body or URL params.
4. Return 404 (not 403) when an ID exists but belongs to another church.
5. The `tests/integration/cross_tenant_test.go` file is required and must cover every entity.

### 15.2 Security baseline

1. Passwords hashed with bcrypt cost ≥ 12.
2. JWT secret ≥ 32 bytes; env-only.
3. Cookies: `HttpOnly`, `Secure` in prod, `SameSite=Lax`, `Domain=.tatagereja.id`.
4. Rate limit `/auth/login` at 10/min/IP.
5. CORS allowlist explicit; never `*` with credentials.
6. Validate all inputs server-side, regardless of frontend.
7. Parameterized queries only (sqlc enforces).
8. Never log passwords, tokens, or auth-endpoint bodies. `Authorization` header redacted in middleware.
9. HTTPS only in production.

### 15.3 Database portability

1. Stick to SQLite-standard SQL (also works on libSQL/Turso later).
2. `schema.sql` is the single source of truth.
3. No Atlas/golang-migrate at MVP. Schema is auto-applied at boot.

### 15.4 Code quality

1. `go test ./...` passes before merge.
2. `golangci-lint run` passes.
3. `svelte-check` passes.
4. `sqlc generate` produces no diff against committed code.
5. No `panic()` in handlers.
6. `slog` for structured logging.
7. Wrap errors with `fmt.Errorf("context: %w", err)`.

### 15.5 API consistency

1. All responses JSON.
2. All errors `{ "error": "...", "fields"?: {...} }`.
3. Timestamps ISO 8601 UTC with `Z`.
4. List endpoints paginated.
5. POST → created resource. PUT → updated resource. DELETE → 204.

### 15.6 Frontend conventions

1. All API calls via `apiClient`.
2. All server state via TanStack Query.
3. All forms via native + Zod.
4. No `any` in TypeScript.
5. `$state` / `$derived` (Svelte 5 runes) only.
6. All user-facing strings via `src/lib/i18n/id.ts`.

### 15.7 Git hygiene

1. `main` always deployable.
2. Feature branches: `feat/<name>`.
3. Branch protection enabled; PR required.
4. Squash merge.
5. Tag releases: `v0.1.0`, `v0.2.0`, etc.

### 15.8 Privacy & data ownership

1. README declares hobby-project status.
2. Data export endpoint (CSV/JSON dump, admin-only) from MVP.
3. `ON DELETE CASCADE` on `churches` wipes everything for that church.

---

## 16. Out of Scope

- Public self-signup / SaaS billing
- Email sending
- Push notifications
- Mobile native apps
- Real-time websockets
- File uploads (photos)
- i18n beyond Indonesian (but strings live in `i18n/id.ts` so adding another is easy)
- Sermon/financial/attendance management
- Audit log (defer until needed)
- Atlas/golang-migrate (defer until real data)

---

## 17. Glossary

- **Jemaat** — church member.
- **Keluarga** — family unit; groups jemaat into a household.
- **Pelayan** — volunteer servant who performs roles in services.
- **Kebaktian** — Sunday worship service or weekday fellowship event.
- **Persekutuan** — fellowship gathering (a subset of kebaktian semantically).
- **Jadwal Pelayanan** — schedule assigning pelayan to roles in a kebaktian.
- **Sidi** — confirmation (Protestant tradition).
- **Service Type** — role in a service (worship leader, singer, multimedia, usher, etc.).

---

## 18. Implementation Checklist for AI Agent

Complete in order. Each step is independently verifiable.

1. **Monorepo bootstrap** — folders, `git init`, `.gitignore`, `LICENSE`, `README.md`, `Makefile`, `.editorconfig`.
2. **Backend skeleton** — `go.mod`, `cmd/server/main.go` (minimal), `internal/config/`, `internal/router/`, `internal/health/`. `make dev-be` starts on :8080. `/health` returns DB-ok.
3. **Frontend skeleton** — Vite + Svelte 5 + TS + Tailwind. `make dev-fe` starts on :5173; `/api/health` proxied.
4. **Database layer** — write `schema.sql`, `sqlc.yaml`, `internal/db/conn.go`, `internal/db/sync.go`. `make sqlc` works. App boots, schema syncs.
5. **Auth** — JWT, password hashing, cookie helpers, `internal/auth/{handler,service,queries.sql}.go`, `RequireAuth` middleware, `cmd/seed-admin/main.go`.
6. **Frontend auth** — login page, auth store with `bootResolved` splash, `apiClient` with `credentials: 'include'`, protected route guard.
7. **End-to-end smoke** — log in, hit `/me`, see user data. Commit & tag `v0.0.1-skeleton`.
8. **Keluarga CRUD** — backend + frontend.
9. **Jemaat CRUD** — backend + frontend with search.
10. **Cross-tenant test suite** — at least jemaat and keluarga covered.
11. **Service Types CRUD** — backend + frontend admin page.
12. **Pelayan CRUD** — backend + frontend with 2-query N+1-free list.
13. **Kebaktian + Jadwal** — backend bulk-replace + frontend editor.
14. **Polish** — empty states, error toasts, loading skeletons, mobile responsive.
15. **Deploy** — provision Heroku + Cloudflare Pages + DNS, first deploy, seed admin.
16. **Tag `v1.0.0`**.

After each step: `make lint test build` must be green.

---

End of plan.
