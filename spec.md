# Shepherd — Church Management Web App: Implementation Plan

> **Audience:** AI coding agent implementing this project from scratch.
> **Goal:** Deliver a working open-source single-tenant church management web app, hosted by the project owner for free use by a small number of churches.
> **Status:** Greenfield — no existing code.

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
9. [Development Environment](#9-development-environment)
10. [Deployment](#10-deployment)
11. [CI/CD](#11-cicd)
12. [Open Source Housekeeping](#12-open-source-housekeeping)
13. [MVP Scope & Phases](#13-mvp-scope--phases)
14. [Non-Negotiable Rules](#14-non-negotiable-rules)

---

## 1. Project Overview

### 1.1 What it is

Shepherd is a web application that helps a single church manage:

- **Jemaat** (church members): name, contact, address, birthday, family relations, baptism/confirmation status.
- **Pelayan** (servants/volunteers): which members serve, what types of service they can do, their availability.
- **Jadwal Pelayanan** (service schedules): assign servants to weekly worship services or fellowship meetings, with role slots (worship leader, singer, musician, multimedia operator, usher, etc.).

### 1.2 Who it is for

- **Direct users:** Church administrators, worship coordinators, pastors. Typically 1–5 people per church share a single account.
- **End beneficiary:** Indonesian Protestant churches (initial target), but design should not hard-code denomination-specific logic.

### 1.3 Operational model

- **Single-tenant logically per account, multi-tenant technically.** One owner-hosted deployment serves multiple churches. Each church gets its own `church_id` scope. Data of one church MUST NEVER leak to another. The application is NOT a SaaS product with self-signup at MVP — the owner manually provisions church accounts.
- **Hosting:** Owner pays nothing or near-zero (Heroku Eco dyno via GitHub Student Pack + Cloudflare Pages free + Turso free tier).
- **No SLA.** Hobby project. Users must be informed via README and in-app disclaimer.

### 1.4 Non-goals (explicitly out of scope)

- Public self-signup. New churches added manually by the host.
- Billing / payments.
- Mobile native apps. Mobile web responsive is enough.
- Real-time collaborative editing.
- Push notifications, SMS, WhatsApp integration.
- Sermon management, financial bookkeeping, attendance tracking by individual. (May come later.)
- Multi-language UI at MVP. Indonesian only initially, but design should allow i18n later (use a translation helper from day 1, not hardcoded strings).

---

## 2. Architecture & Stack

### 2.1 High-level diagram

```
┌─────────────────────────────┐       HTTPS/JSON      ┌──────────────────────────────┐
│  Svelte 5 SPA               │ ────────────────────► │  Go API (Chi router)          │
│  - Vite build → static      │                       │  - Heroku Eco dyno            │
│  - Hosted on Cloudflare     │  ◄────────────────── │  - JWT auth                   │
│    Pages (free, no sleep)   │                       │  - sqlc-generated DB layer    │
└─────────────────────────────┘                       └──────────────┬────────────────┘
                                                                      │ libSQL/SQLite
                                                                      ▼
                                                       ┌──────────────────────────────┐
                                                       │  Turso (libSQL/SQLite)        │
                                                       │  - 500 DB / 5GB free tier     │
                                                       │  - No pause, no sleep         │
                                                       └──────────────────────────────┘
```

### 2.2 Stack decisions (final)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend framework | **Svelte 5** + Vite | Lightweight, reactive, small bundle. Pure SPA → static hosting. |
| Frontend routing | **svelte-spa-router** | Simple hash-based routing for SPA. No SSR needed. |
| Frontend styling | **Tailwind CSS** + **shadcn-svelte** | Fast styling, accessible components, no design from scratch. |
| Frontend data fetching | **TanStack Query (Svelte)** | Caching, optimistic updates, retries. |
| Frontend state | Svelte 5 runes (`$state`, `$derived`) | Built-in; no Redux/Zustand. |
| Frontend forms | **Felte** or native form handling | Felte integrates well with validation. |
| Frontend validation | **Zod** | Share schemas conceptually with backend (types not literally shared, but mirrored). |
| Backend language | **Go 1.23+** | Fast cold start, single binary, low memory. Perfect for Heroku Eco. |
| Backend router | **chi/v5** | Idiomatic, lightweight, composable middleware. |
| Backend DB driver | **libsql-client-go** | Works with Turso, local SQLite file, in-memory. |
| Backend DB queries | **sqlc** | Type-safe Go from plain SQL. Portable, performant, easy for contributors. |
| Backend migrations | **Atlas** (ariga.io/atlas) | Declarative schema-as-code in SQL. Auto diff & versioned migrations. |
| Backend auth | **golang-jwt/jwt v5** + **bcrypt** | Standard, no vendor. |
| Backend validation | **go-playground/validator v10** | De facto standard. |
| Backend rate limit | **go-chi/httprate** | Drop-in middleware. |
| Backend CORS | **go-chi/cors** | Drop-in middleware. |
| Hot reload (Go) | **air** (air-verse/air) | Watch & rebuild. |
| Database (prod) | **Turso** | No sleep, free tier, SQLite dialect → portable. |
| Database (dev) | **Local SQLite file** | Zero config, identical dialect. |
| Database (test) | **In-memory SQLite** | Fast, isolated. |
| Frontend hosting | **Cloudflare Pages** | Free, unlimited bandwidth, no sleep, fast global CDN. |
| Backend hosting | **Heroku Eco dyno** (GitHub Student) | Owner already has credits. Cold start ~5–10s acceptable. |
| Monorepo strategy | Plain folder split (`frontend/`, `backend/`) | No Turborepo/Nx needed. |

### 2.3 Why these are the right choices (rationale recap)

- **Go on Heroku Eco:** Single static binary, fast startup (<1s), low memory. Survives the 512MB Eco limit easily.
- **Turso over Postgres:** Free tier with no sleep, SQLite dialect → identical local dev experience, and a clean migration path to Cloudflare D1 *if* the backend ever moves to Workers. Direct D1 from Go is NOT supported, so the swap-to-D1 story is best-effort, not promised.
- **sqlc over Ent/GORM:** SQL stays plain & portable; contributors don't need to learn a DSL; no runtime ORM overhead.
- **Atlas over golang-migrate:** Schema-as-code declarative model means a single `schema.sql` file is the source of truth; Atlas auto-diffs and generates migrations. Versioned migrations also supported when needed.
- **Svelte 5 over SvelteKit:** SvelteKit is a fullstack framework; here we explicitly want a pure SPA so the frontend can live on free static hosting independent of the backend.

---

## 3. Repository Structure

Single monorepo on GitHub, MIT licensed.

```
shepherd/
├── .devcontainer/
│   ├── devcontainer.json
│   └── Dockerfile
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                       # lint + test on every PR
│   │   ├── frontend-deploy.yml          # deploy frontend on main (if CF Pages not git-integrated)
│   │   └── backend-deploy.yml           # deploy backend to Heroku on main
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── pull_request_template.md
├── .vscode/
│   ├── settings.json
│   └── extensions.json
├── frontend/
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api/                     # API client + types
│   │   │   ├── components/
│   │   │   │   ├── ui/                  # shadcn-svelte primitives
│   │   │   │   └── domain/              # JemaatCard, PelayanList, etc.
│   │   │   ├── stores/                  # auth store, etc.
│   │   │   ├── utils/
│   │   │   └── i18n/                    # translation helpers
│   │   ├── routes/                      # page-level components
│   │   │   ├── Login.svelte
│   │   │   ├── Dashboard.svelte
│   │   │   ├── Jemaat.svelte
│   │   │   ├── Pelayan.svelte
│   │   │   └── Jadwal.svelte
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
│   ├── .env.example
│   └── .gitignore
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go                  # entry point
│   ├── internal/
│   │   ├── config/
│   │   │   └── config.go                # env var loading
│   │   ├── db/
│   │   │   ├── schema.sql               # SINGLE SOURCE OF TRUTH for schema
│   │   │   ├── queries/                 # sqlc input files
│   │   │   │   ├── auth.sql
│   │   │   │   ├── churches.sql
│   │   │   │   ├── jemaat.sql
│   │   │   │   ├── pelayan.sql
│   │   │   │   ├── service_types.sql
│   │   │   │   └── jadwal.sql
│   │   │   ├── sqlc/                    # sqlc-GENERATED — do not edit by hand
│   │   │   │   ├── db.go
│   │   │   │   ├── models.go
│   │   │   │   ├── auth.sql.go
│   │   │   │   ├── churches.sql.go
│   │   │   │   ├── jemaat.sql.go
│   │   │   │   ├── pelayan.sql.go
│   │   │   │   ├── service_types.sql.go
│   │   │   │   └── jadwal.sql.go
│   │   │   ├── conn.go                  # sql.Open wrapper (driver switching)
│   │   │   └── seed.go                  # dev seed data
│   │   ├── handlers/
│   │   │   ├── auth.go
│   │   │   ├── jemaat.go
│   │   │   ├── pelayan.go
│   │   │   ├── service_types.go
│   │   │   ├── jadwal.go
│   │   │   └── health.go
│   │   ├── middleware/
│   │   │   ├── auth.go                  # JWT verification, sets user in context
│   │   │   ├── church_scope.go          # extracts church_id from user
│   │   │   ├── cors.go
│   │   │   ├── logging.go
│   │   │   └── ratelimit.go
│   │   ├── models/                      # API DTOs (request/response shapes)
│   │   │   ├── auth.go
│   │   │   ├── jemaat.go
│   │   │   └── ...
│   │   ├── services/                    # business logic (optional layer)
│   │   │   ├── jemaat_service.go
│   │   │   └── jadwal_service.go
│   │   ├── auth/
│   │   │   ├── jwt.go                   # token issue + parse
│   │   │   └── password.go              # bcrypt wrapper
│   │   └── router/
│   │       └── router.go                # chi setup, route registration
│   ├── migrations/                      # Atlas-GENERATED versioned migrations
│   │   ├── 20260513120000_init.sql
│   │   └── atlas.sum
│   ├── scripts/
│   │   ├── seed-admin.go                # bootstrap initial admin user
│   │   └── backup-db.sh                 # dump Turso to local file
│   ├── tests/
│   │   ├── integration/
│   │   │   └── jemaat_test.go
│   │   └── testutil/
│   │       └── db.go
│   ├── atlas.hcl                        # Atlas configuration
│   ├── sqlc.yaml                        # sqlc configuration
│   ├── .air.toml                        # air hot reload config
│   ├── Procfile                         # Heroku: web + release phase
│   ├── go.mod
│   ├── go.sum
│   ├── .env.example
│   └── .gitignore
├── scripts/
│   ├── dev.sh                           # parallel run of frontend + backend
│   └── reset-db.sh
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── CONTRIBUTING.md
├── .editorconfig
├── .gitignore
├── LICENSE                              # MIT
├── Makefile                             # primary developer interface
├── README.md
├── CONTRIBUTING.md
└── CODE_OF_CONDUCT.md
```

---

## 4. Database Design

### 4.1 Source of truth

`backend/internal/db/schema.sql` is the SINGLE SOURCE OF TRUTH. It is:

- The input to **sqlc** (for generating Go types).
- The input to **Atlas** (for generating migrations & applying schema).
- Human-readable documentation of the data model.

NEVER edit the generated `sqlc/` folder by hand. Edit `schema.sql`, regenerate, regenerate migrations.

### 4.2 Multi-tenant scoping rule (CRITICAL)

**EVERY domain table (except `churches` and `users`) MUST have a `church_id` column with `NOT NULL` and a `FOREIGN KEY` to `churches(id)`.**

**EVERY query that reads or writes a domain row MUST filter or set `church_id = ?` using the value derived from the authenticated user's session.** Never trust `church_id` from the request body.

Failure to follow this rule = data leak between churches = critical security bug.

### 4.3 Full `schema.sql`

```sql
-- ============================================================
-- Shepherd schema.sql — SQLite / libSQL dialect
-- Source of truth for sqlc and Atlas.
-- ============================================================

-- Enable foreign keys (SQLite default is off, libSQL/Turso enforces by default).
PRAGMA foreign_keys = ON;

-- ============================================================
-- Tenancy & auth
-- ============================================================

CREATE TABLE churches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,            -- e.g. "gki-diponegoro"
    timezone      TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor', 'viewer')),
    is_active       INTEGER NOT NULL DEFAULT 1,    -- boolean: 0/1
    last_login_at   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_church_id ON users(church_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- Jemaat (church members)
-- ============================================================

CREATE TABLE jemaat (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id           INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama_lengkap        TEXT NOT NULL,
    nama_panggilan      TEXT,
    jenis_kelamin       TEXT CHECK (jenis_kelamin IN ('L', 'P') OR jenis_kelamin IS NULL),
    tanggal_lahir       TEXT,                       -- ISO 8601 date: YYYY-MM-DD
    tempat_lahir        TEXT,
    alamat              TEXT,
    nomor_telepon       TEXT,
    email               TEXT,
    status_pernikahan   TEXT CHECK (
                          status_pernikahan IN ('belum_menikah', 'menikah', 'cerai', 'duda', 'janda')
                          OR status_pernikahan IS NULL
                        ),
    tanggal_baptis      TEXT,
    tanggal_sidi        TEXT,
    keluarga_id         INTEGER REFERENCES keluarga(id) ON DELETE SET NULL,
    catatan             TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jemaat_church_id ON jemaat(church_id);
CREATE INDEX idx_jemaat_nama ON jemaat(church_id, nama_lengkap);
CREATE INDEX idx_jemaat_keluarga_id ON jemaat(keluarga_id);

-- ============================================================
-- Keluarga (family unit) — optional grouping of jemaat
-- ============================================================

CREATE TABLE keluarga (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama_keluarga   TEXT NOT NULL,                  -- e.g. "Keluarga Budi Santoso"
    alamat          TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_keluarga_church_id ON keluarga(church_id);

-- ============================================================
-- Service types (jenis pelayanan) — configurable per church
-- ============================================================

CREATE TABLE service_types (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,                  -- e.g. "Worship Leader", "Singer", "Multimedia"
    deskripsi       TEXT,
    warna           TEXT,                            -- hex color for UI, e.g. "#3b82f6"
    urutan          INTEGER NOT NULL DEFAULT 0,     -- display order
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (church_id, nama)
);

CREATE INDEX idx_service_types_church_id ON service_types(church_id);

-- ============================================================
-- Pelayan (servants) — jemaat who serve
-- A pelayan record links a jemaat to one or more service types.
-- ============================================================

CREATE TABLE pelayan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    jemaat_id       INTEGER NOT NULL REFERENCES jemaat(id) ON DELETE CASCADE,
    catatan         TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (church_id, jemaat_id)
);

CREATE INDEX idx_pelayan_church_id ON pelayan(church_id);
CREATE INDEX idx_pelayan_jemaat_id ON pelayan(jemaat_id);

-- Join table: which service types a pelayan can do
CREATE TABLE pelayan_service_types (
    pelayan_id          INTEGER NOT NULL REFERENCES pelayan(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    skill_level         TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced') OR skill_level IS NULL),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (pelayan_id, service_type_id)
);

CREATE INDEX idx_pelayan_st_service_type_id ON pelayan_service_types(service_type_id);

-- ============================================================
-- Kebaktian / Persekutuan (service / fellowship events)
-- ============================================================

CREATE TABLE kebaktian (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,                  -- e.g. "Kebaktian Minggu Pagi"
    tanggal         TEXT NOT NULL,                  -- ISO 8601: YYYY-MM-DD
    waktu_mulai     TEXT NOT NULL,                  -- ISO 8601 time: HH:MM
    lokasi          TEXT,
    tema            TEXT,
    pengkhotbah     TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_kebaktian_church_id ON kebaktian(church_id);
CREATE INDEX idx_kebaktian_tanggal ON kebaktian(church_id, tanggal);

-- ============================================================
-- Jadwal pelayanan (assignment of pelayan to service types per kebaktian)
-- ============================================================

CREATE TABLE jadwal_pelayanan (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id           INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    kebaktian_id        INTEGER NOT NULL REFERENCES kebaktian(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
    pelayan_id          INTEGER REFERENCES pelayan(id) ON DELETE SET NULL,  -- nullable: slot dapat kosong
    catatan             TEXT,
    status              TEXT NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN ('scheduled', 'confirmed', 'declined', 'completed')),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jadwal_church_id ON jadwal_pelayanan(church_id);
CREATE INDEX idx_jadwal_kebaktian_id ON jadwal_pelayanan(kebaktian_id);
CREATE INDEX idx_jadwal_pelayan_id ON jadwal_pelayanan(pelayan_id);

-- ============================================================
-- Audit log (lightweight, optional but recommended)
-- ============================================================

CREATE TABLE audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,                  -- e.g. "jemaat.create", "pelayan.delete"
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER,
    payload_json    TEXT,                            -- JSON snapshot if needed
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_church_id ON audit_log(church_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);
```

### 4.4 Notes on the schema

- **Timestamps as TEXT (ISO 8601).** SQLite has no native datetime type; storing as ISO 8601 strings keeps things human-readable and portable. Use `datetime('now')` for defaults. Go side uses `time.Time` with custom marshalers if needed.
- **Booleans as INTEGER 0/1.** SQLite has no boolean. sqlc will generate `int64`; map to `bool` in service layer or DTOs.
- **`ON DELETE CASCADE` everywhere church_id points.** Deleting a church wipes its data cleanly. Helps with GDPR-style requests.
- **`ON DELETE SET NULL` for `pelayan_id` in `jadwal_pelayanan`.** Removing a pelayan should not delete historical schedule rows; the slot becomes unfilled instead.
- **No soft delete at MVP.** Use `is_active` flag on `jemaat`, `pelayan`, `users` to "deactivate". Real delete only when needed.

### 4.5 sqlc query files

Each domain gets its own `.sql` file in `backend/internal/db/queries/`. Example for `jemaat.sql`:

```sql
-- name: GetJemaatByID :one
SELECT * FROM jemaat
WHERE id = ? AND church_id = ?;

-- name: ListJemaatByChurch :many
SELECT * FROM jemaat
WHERE church_id = ? AND is_active = 1
ORDER BY nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CountJemaatByChurch :one
SELECT COUNT(*) FROM jemaat
WHERE church_id = ? AND is_active = 1;

-- name: SearchJemaat :many
SELECT * FROM jemaat
WHERE church_id = ?
  AND is_active = 1
  AND (nama_lengkap LIKE ? OR nama_panggilan LIKE ? OR email LIKE ?)
ORDER BY nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CreateJemaat :one
INSERT INTO jemaat (
    church_id, nama_lengkap, nama_panggilan, jenis_kelamin,
    tanggal_lahir, tempat_lahir, alamat, nomor_telepon, email,
    status_pernikahan, tanggal_baptis, tanggal_sidi,
    keluarga_id, catatan
) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
)
RETURNING *;

-- name: UpdateJemaat :one
UPDATE jemaat SET
    nama_lengkap = ?,
    nama_panggilan = ?,
    jenis_kelamin = ?,
    tanggal_lahir = ?,
    tempat_lahir = ?,
    alamat = ?,
    nomor_telepon = ?,
    email = ?,
    status_pernikahan = ?,
    tanggal_baptis = ?,
    tanggal_sidi = ?,
    keluarga_id = ?,
    catatan = ?,
    updated_at = datetime('now')
WHERE id = ? AND church_id = ?
RETURNING *;

-- name: DeactivateJemaat :exec
UPDATE jemaat SET is_active = 0, updated_at = datetime('now')
WHERE id = ? AND church_id = ?;

-- name: DeleteJemaat :exec
DELETE FROM jemaat WHERE id = ? AND church_id = ?;
```

**Pattern for every query:** include `church_id` filter in WHERE clauses. Two-argument lookup (`id` + `church_id`) prevents IDOR vulnerabilities. The agent implementing this MUST follow this pattern without exception.

### 4.6 `sqlc.yaml`

```yaml
version: "2"
sql:
  - engine: "sqlite"
    queries: "internal/db/queries"
    schema: "internal/db/schema.sql"
    gen:
      go:
        package: "sqlc"
        out: "internal/db/sqlc"
        sql_package: "database/sql"
        emit_json_tags: true
        emit_db_tags: true
        emit_prepared_queries: false
        emit_interface: true
        emit_exact_table_names: false
        emit_empty_slices: true
        emit_pointers_for_null_types: true
```

### 4.7 `atlas.hcl`

```hcl
env "local" {
  src = "file://internal/db/schema.sql"
  dev = "sqlite://dev?mode=memory"
  url = "sqlite://local.db"
  migration {
    dir = "file://migrations"
  }
  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}

env "prod" {
  src = "file://internal/db/schema.sql"
  dev = "sqlite://dev?mode=memory"
  url = getenv("DATABASE_URL")
  migration {
    dir = "file://migrations"
  }
}
```

### 4.8 Migration workflow

**During early development (before any production users):**

```bash
# Edit schema.sql
make db-apply       # runs: atlas schema apply --env local --auto-approve
make sqlc           # regenerate Go types
```

This is destructive: Atlas computes the diff between `schema.sql` and the live DB and applies it directly. Fine when no real data exists.

**Once production has real data:**

```bash
make db-diff name=add_audit_log   # creates a versioned migration file
make db-migrate                    # applies pending migrations
make sqlc
```

The `release` phase in Heroku's `Procfile` runs migrations automatically on every deploy:

```
release: ./bin/atlas migrate apply --env prod
web: ./bin/server
```

(Atlas binary needs to be present in the slug — see Deployment section.)


---

## 5. Backend Implementation (Go)

### 5.1 Go module setup

```bash
cd backend
go mod init github.com/<owner>/shepherd/backend
```

### 5.2 Required dependencies

```go
// go.mod (illustrative — use latest stable when implementing)
require (
    github.com/go-chi/chi/v5             v5.x
    github.com/go-chi/cors               v1.x
    github.com/go-chi/httprate           v0.x
    github.com/tursodatabase/libsql-client-go  v0.x
    github.com/golang-jwt/jwt/v5         v5.x
    golang.org/x/crypto                  v0.x  // bcrypt
    github.com/go-playground/validator/v10  v10.x
    github.com/joho/godotenv             v1.x
    github.com/google/uuid               v1.x
)
```

### 5.3 `cmd/server/main.go` outline

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

    "github.com/<owner>/shepherd/backend/internal/config"
    "github.com/<owner>/shepherd/backend/internal/db"
    "github.com/<owner>/shepherd/backend/internal/router"
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

    if err := database.Ping(); err != nil {
        slog.Error("failed to ping db", "err", err)
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

    // Graceful shutdown
    go func() {
        slog.Info("server starting", "addr", srv.Addr)
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

type Config struct {
    Port            string
    Env             string   // "development" | "production"
    DatabaseURL     string   // libsql://... or file:./local.db
    JWTSecret       []byte
    JWTIssuer       string
    JWTAudience     string
    CORSAllowedOrigins []string
    LogLevel        string
}

func Load() (*Config, error) {
    cfg := &Config{
        Port:        getEnv("PORT", "8080"),
        Env:         getEnv("APP_ENV", "development"),
        DatabaseURL: os.Getenv("DATABASE_URL"),
        JWTIssuer:   getEnv("JWT_ISSUER", "shepherd"),
        JWTAudience: getEnv("JWT_AUDIENCE", "shepherd-web"),
        LogLevel:    getEnv("LOG_LEVEL", "info"),
    }

    secret := os.Getenv("JWT_SECRET")
    if len(secret) < 32 {
        return nil, errors.New("JWT_SECRET must be at least 32 bytes")
    }
    cfg.JWTSecret = []byte(secret)

    if cfg.DatabaseURL == "" {
        return nil, errors.New("DATABASE_URL is required")
    }

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
    "strings"

    _ "github.com/tursodatabase/libsql-client-go/libsql"
    // For local dev with pure SQLite file you can also import:
    // _ "modernc.org/sqlite"
)

// Open returns a *sql.DB connected to either Turso (libsql://...) or
// a local SQLite file (file:...) or in-memory (:memory:).
func Open(url string) (*sql.DB, error) {
    driver := "libsql"
    // libsql driver supports both remote and local sqlite via file: prefix.

    db, err := sql.Open(driver, url)
    if err != nil {
        return nil, fmt.Errorf("open db: %w", err)
    }

    // Conservative pool settings — SQLite/libSQL doesn't love huge concurrency.
    db.SetMaxOpenConns(10)
    db.SetMaxIdleConns(5)

    // Enable foreign keys for local SQLite (libsql server enforces by default).
    if strings.HasPrefix(url, "file:") || strings.HasPrefix(url, ":memory:") {
        if _, err := db.Exec("PRAGMA foreign_keys = ON;"); err != nil {
            return nil, fmt.Errorf("enable fk: %w", err)
        }
    }

    return db, nil
}
```

### 5.6 `internal/router/router.go`

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

    "github.com/<owner>/shepherd/backend/internal/config"
    "github.com/<owner>/shepherd/backend/internal/db/sqlc"
    "github.com/<owner>/shepherd/backend/internal/handlers"
    appmw "github.com/<owner>/shepherd/backend/internal/middleware"
)

func New(cfg *config.Config, database *sql.DB) http.Handler {
    queries := sqlc.New(database)

    r := chi.NewRouter()

    r.Use(chimiddleware.RequestID)
    r.Use(chimiddleware.RealIP)
    r.Use(appmw.Logging)
    r.Use(chimiddleware.Recoverer)
    r.Use(chimiddleware.Timeout(30 * time.Second))

    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   cfg.CORSAllowedOrigins,
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
        AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
        ExposedHeaders:   []string{"Link"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

    // Public routes
    r.Get("/health", handlers.Health)

    r.Group(func(r chi.Router) {
        r.Use(httprate.LimitByIP(10, time.Minute)) // 10/min per IP for auth
        h := handlers.NewAuthHandler(cfg, queries)
        r.Post("/auth/login", h.Login)
        r.Post("/auth/refresh", h.Refresh)
        r.Post("/auth/logout", h.Logout)
    })

    // Authenticated routes
    r.Group(func(r chi.Router) {
        r.Use(appmw.RequireAuth(cfg))
        r.Use(appmw.ChurchScope) // ensures church_id in context

        r.Get("/me", handlers.NewAuthHandler(cfg, queries).Me)

        // Jemaat
        jh := handlers.NewJemaatHandler(queries)
        r.Route("/jemaat", func(r chi.Router) {
            r.Get("/", jh.List)
            r.Post("/", jh.Create)
            r.Get("/{id}", jh.Get)
            r.Put("/{id}", jh.Update)
            r.Delete("/{id}", jh.Delete)
        })

        // Pelayan
        ph := handlers.NewPelayanHandler(queries)
        r.Route("/pelayan", func(r chi.Router) {
            r.Get("/", ph.List)
            r.Post("/", ph.Create)
            r.Get("/{id}", ph.Get)
            r.Put("/{id}", ph.Update)
            r.Delete("/{id}", ph.Delete)
        })

        // Service types
        sth := handlers.NewServiceTypeHandler(queries)
        r.Route("/service-types", func(r chi.Router) {
            r.Get("/", sth.List)
            r.Post("/", sth.Create)
            r.Put("/{id}", sth.Update)
            r.Delete("/{id}", sth.Delete)
        })

        // Kebaktian + Jadwal
        kh := handlers.NewKebaktianHandler(queries)
        r.Route("/kebaktian", func(r chi.Router) {
            r.Get("/", kh.List)
            r.Post("/", kh.Create)
            r.Get("/{id}", kh.Get)
            r.Put("/{id}", kh.Update)
            r.Delete("/{id}", kh.Delete)
            r.Get("/{id}/jadwal", kh.GetJadwal)
            r.Put("/{id}/jadwal", kh.UpdateJadwal)
        })
    })

    return r
}
```

### 5.7 `internal/middleware/auth.go`

```go
package middleware

import (
    "context"
    "net/http"
    "strings"

    "github.com/<owner>/shepherd/backend/internal/auth"
    "github.com/<owner>/shepherd/backend/internal/config"
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
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
            }

            claims, err := auth.ParseToken(tokenStr, cfg.JWTSecret)
            if err != nil {
                http.Error(w, "invalid token", http.StatusUnauthorized)
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
    // Priority 1: Authorization header
    h := r.Header.Get("Authorization")
    if strings.HasPrefix(h, "Bearer ") {
        return strings.TrimPrefix(h, "Bearer ")
    }
    // Priority 2: httpOnly cookie
    c, err := r.Cookie("shepherd_session")
    if err == nil {
        return c.Value
    }
    return ""
}

// ChurchScope is currently a passthrough but reserved for future
// validation (e.g. cross-check user.is_active in DB).
func ChurchScope(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if _, ok := r.Context().Value(ChurchIDKey).(int64); !ok {
            http.Error(w, "missing church scope", http.StatusForbidden)
            return
        }
        next.ServeHTTP(w, r)
    })
}

// GetChurchID is a helper for handlers.
func GetChurchID(r *http.Request) int64 {
    v, _ := r.Context().Value(ChurchIDKey).(int64)
    return v
}

func GetUserID(r *http.Request) int64 {
    v, _ := r.Context().Value(UserIDKey).(int64)
    return v
}
```

### 5.8 `internal/auth/jwt.go`

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

const (
    AccessTokenTTL  = 15 * time.Minute
    RefreshTokenTTL = 7 * 24 * time.Hour
)

func IssueAccessToken(secret []byte, userID, churchID int64, role string) (string, error) {
    claims := Claims{
        UserID:   userID,
        ChurchID: churchID,
        Role:     role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(AccessTokenTTL)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            NotBefore: jwt.NewNumericDate(time.Now()),
            Issuer:    "shepherd",
            Audience:  jwt.ClaimStrings{"shepherd-web"},
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

### 5.9 `internal/auth/password.go`

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

### 5.10 Handler pattern (example: jemaat)

`internal/handlers/jemaat.go`:

```go
package handlers

import (
    "encoding/json"
    "errors"
    "net/http"
    "strconv"

    "github.com/go-chi/chi/v5"
    "github.com/go-playground/validator/v10"

    "github.com/<owner>/shepherd/backend/internal/db/sqlc"
    appmw "github.com/<owner>/shepherd/backend/internal/middleware"
    "github.com/<owner>/shepherd/backend/internal/models"
)

type JemaatHandler struct {
    q        sqlc.Querier
    validate *validator.Validate
}

func NewJemaatHandler(q sqlc.Querier) *JemaatHandler {
    return &JemaatHandler{q: q, validate: validator.New()}
}

func (h *JemaatHandler) List(w http.ResponseWriter, r *http.Request) {
    churchID := appmw.GetChurchID(r)
    limit, offset := parsePagination(r)

    rows, err := h.q.ListJemaatByChurch(r.Context(), sqlc.ListJemaatByChurchParams{
        ChurchID: churchID,
        Limit:    limit,
        Offset:   offset,
    })
    if err != nil {
        writeError(w, http.StatusInternalServerError, "failed to list jemaat")
        return
    }

    count, _ := h.q.CountJemaatByChurch(r.Context(), churchID)

    writeJSON(w, http.StatusOK, map[string]any{
        "data":   rows,
        "total":  count,
        "limit":  limit,
        "offset": offset,
    })
}

func (h *JemaatHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req models.CreateJemaatRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, "invalid json")
        return
    }
    if err := h.validate.Struct(&req); err != nil {
        writeError(w, http.StatusBadRequest, err.Error())
        return
    }

    churchID := appmw.GetChurchID(r)
    row, err := h.q.CreateJemaat(r.Context(), sqlc.CreateJemaatParams{
        ChurchID:     churchID,
        NamaLengkap:  req.NamaLengkap,
        // ... map all fields
    })
    if err != nil {
        writeError(w, http.StatusInternalServerError, "failed to create jemaat")
        return
    }
    writeJSON(w, http.StatusCreated, row)
}

func (h *JemaatHandler) Get(w http.ResponseWriter, r *http.Request) {
    id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
    if err != nil {
        writeError(w, http.StatusBadRequest, "invalid id")
        return
    }
    churchID := appmw.GetChurchID(r)

    row, err := h.q.GetJemaatByID(r.Context(), sqlc.GetJemaatByIDParams{
        ID:       id,
        ChurchID: churchID,
    })
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            writeError(w, http.StatusNotFound, "not found")
            return
        }
        writeError(w, http.StatusInternalServerError, "db error")
        return
    }
    writeJSON(w, http.StatusOK, row)
}

// Update, Delete similarly...
```

**Critical patterns repeated:**

1. Always extract `church_id` from middleware context, never from request body.
2. Always pass `church_id` to sqlc-generated functions.
3. Return 404 if the row exists but belongs to another church (the WHERE clause makes them indistinguishable, which is correct).

### 5.11 Helper functions

`internal/handlers/helpers.go`:

```go
package handlers

import (
    "encoding/json"
    "net/http"
    "strconv"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
    writeJSON(w, status, map[string]string{"error": msg})
}

func parsePagination(r *http.Request) (limit, offset int64) {
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

### 5.12 `Procfile`

```
release: ./bin/atlas migrate apply --env prod
web: ./bin/server
```

The release phase runs migrations before the new web dyno is promoted. If migration fails, deploy aborts and traffic stays on the old release.

### 5.13 Heroku Go buildpack notes

- Go buildpack reads `go.mod` to determine the Go version.
- `cmd/server/main.go` is auto-detected as the entry point (binary will be named `server`).
- Atlas binary must be downloaded during build. Add a `bin/post_compile` script under `backend/`:

```bash
#!/usr/bin/env bash
set -euo pipefail
curl -sSf https://atlasgo.sh -o atlas-install.sh
sh atlas-install.sh --community
mv $(which atlas) bin/atlas
chmod +x bin/atlas
```

Heroku Go buildpack runs `bin/post_compile` automatically if present.


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
    "felte": "^1.2.0",
    "@felte/validator-zod": "^1.0.0",
    "lucide-svelte": "^0.400.0",
    "date-fns": "^3.0.0",
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
    "svelte-check": "^4.0.0",
    "tailwindcss": "^3.4.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

### 6.3 `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
```

### 6.4 `tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts,js}'],
  theme: {
    extend: {
      colors: {
        // shadcn-svelte design tokens
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        // ...
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
```

### 6.5 `src/main.ts`

```typescript
import './app.css';
import App from './App.svelte';
import { mount } from 'svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
```

### 6.6 `src/App.svelte`

```svelte
<script lang="ts">
  import Router from 'svelte-spa-router';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { routes } from '$lib/routes';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.svelte';

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
      },
    },
  });

  onMount(() => {
    auth.restore();
  });
</script>

<QueryClientProvider client={queryClient}>
  <main class="min-h-screen bg-background text-foreground">
    <Router {routes} />
  </main>
</QueryClientProvider>
```

### 6.7 `src/lib/routes.ts`

```typescript
import { wrap } from 'svelte-spa-router/wrap';
import Login from '../routes/Login.svelte';
import Dashboard from '../routes/Dashboard.svelte';
import Jemaat from '../routes/Jemaat.svelte';
import JemaatDetail from '../routes/JemaatDetail.svelte';
import Pelayan from '../routes/Pelayan.svelte';
import Jadwal from '../routes/Jadwal.svelte';
import NotFound from '../routes/NotFound.svelte';
import { auth } from './stores/auth.svelte';

const requireAuth = (Component: any) =>
  wrap({
    component: Component,
    conditions: [() => auth.isAuthenticated],
  });

export const routes = {
  '/': requireAuth(Dashboard),
  '/login': Login,
  '/jemaat': requireAuth(Jemaat),
  '/jemaat/:id': requireAuth(JemaatDetail),
  '/pelayan': requireAuth(Pelayan),
  '/jadwal': requireAuth(Jadwal),
  '*': NotFound,
};
```

### 6.8 `src/lib/stores/auth.svelte.ts`

```typescript
import { apiClient } from '$lib/api/client';
import { push } from 'svelte-spa-router';

type User = {
  id: number;
  email: string;
  display_name: string;
  role: 'admin' | 'editor' | 'viewer';
  church_id: number;
};

class AuthStore {
  user = $state<User | null>(null);
  isLoading = $state(false);

  get isAuthenticated() {
    return this.user !== null;
  }

  async login(email: string, password: string) {
    this.isLoading = true;
    try {
      const res = await apiClient.post<{ user: User }>('/auth/login', { email, password });
      this.user = res.user;
      push('/');
    } finally {
      this.isLoading = false;
    }
  }

  async logout() {
    await apiClient.post('/auth/logout', {});
    this.user = null;
    push('/login');
  }

  async restore() {
    // Called on app boot. Tries /me with existing cookie.
    try {
      const res = await apiClient.get<User>('/me');
      this.user = res;
    } catch {
      this.user = null;
    }
  }
}

export const auth = new AuthStore();
```

### 6.9 `src/lib/api/client.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '/api';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // send cookies
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {}
    throw new ApiError(res.status, msg);
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

export { ApiError };
```

### 6.10 TanStack Query hook example: `src/lib/api/jemaat.ts`

```typescript
import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
import { apiClient } from './client';
import type { Jemaat, CreateJemaatRequest } from '$lib/types';

export function useJemaatList(limit = 50, offset = 0) {
  return createQuery({
    queryKey: ['jemaat', { limit, offset }],
    queryFn: () => apiClient.get<{ data: Jemaat[]; total: number }>(
      `/jemaat?limit=${limit}&offset=${offset}`,
    ),
  });
}

export function useCreateJemaat() {
  const qc = useQueryClient();
  return createMutation({
    mutationFn: (data: CreateJemaatRequest) => apiClient.post<Jemaat>('/jemaat', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jemaat'] }),
  });
}
```

### 6.11 Page component example: `src/routes/Jemaat.svelte`

```svelte
<script lang="ts">
  import { useJemaatList } from '$lib/api/jemaat';
  import JemaatTable from '$lib/components/domain/JemaatTable.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  const query = useJemaatList();
</script>

<div class="container mx-auto p-6">
  <header class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl font-semibold">Daftar Jemaat</h1>
    <Button href="#/jemaat/new">+ Tambah Jemaat</Button>
  </header>

  {#if $query.isLoading}
    <p>Loading…</p>
  {:else if $query.isError}
    <p class="text-red-600">Gagal memuat: {$query.error.message}</p>
  {:else if $query.data}
    <JemaatTable items={$query.data.data} />
    <p class="mt-4 text-sm text-muted-foreground">
      Total: {$query.data.total} jemaat
    </p>
  {/if}
</div>
```

### 6.12 Environment variables (frontend)

`frontend/.env.example`:

```
VITE_API_URL=http://localhost:8080
```

In production (Cloudflare Pages), set `VITE_API_URL` to the Heroku backend URL via the Pages dashboard.

### 6.13 Build output

`npm run build` produces `frontend/dist/`. Cloudflare Pages serves this directly.

`_redirects` file at `frontend/public/_redirects` for SPA routing:

```
/*    /index.html   200
```

This makes deep links (e.g. `/jemaat/123`) work — Cloudflare serves `index.html` for any path, and svelte-spa-router takes over.

---

## 7. Authentication & Authorization

### 7.1 Flow

1. User submits email + password to `POST /auth/login`.
2. Backend verifies with bcrypt; if valid, issues:
   - **Access JWT** (15 min) — short-lived, contains `user_id`, `church_id`, `role`.
   - **Refresh JWT** (7 days) — stored as httpOnly cookie.
3. Access token is **also** set as httpOnly cookie named `shepherd_session` with `SameSite=None; Secure; HttpOnly`.
4. Every authenticated request: middleware reads cookie, verifies JWT, sets context.
5. When access token expires, frontend calls `POST /auth/refresh`; backend reads refresh cookie, issues new access token.
6. Logout: `POST /auth/logout` clears both cookies.

### 7.2 Cookie settings (CRITICAL for cross-domain SPA + API)

Because frontend is at `*.pages.dev` and backend at `*.herokuapp.com`:

```go
http.SetCookie(w, &http.Cookie{
    Name:     "shepherd_session",
    Value:    token,
    Path:     "/",
    Domain:   "", // leave blank for backend's own domain
    MaxAge:   int(auth.AccessTokenTTL.Seconds()),
    HttpOnly: true,
    Secure:   true,            // HTTPS only — Heroku gives HTTPS
    SameSite: http.SameSiteNoneMode, // required for cross-domain
})
```

Frontend MUST use `credentials: 'include'` in fetch calls (already in `client.ts`).

CORS config MUST have `AllowCredentials: true` and `AllowedOrigins` must NOT be `*` (browsers reject credentials with wildcard origin) — explicitly list `https://shepherd.pages.dev` (or whatever the production frontend URL is).

### 7.3 Role-based access (MVP-light)

- `admin` — full CRUD on everything within their church.
- `editor` — CRUD on jemaat/pelayan/jadwal, no user management.
- `viewer` — read-only.

For MVP, only `admin` exists. The check is on the middleware level:

```go
func RequireRole(roles ...string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            role, _ := r.Context().Value(UserRoleKey).(string)
            for _, allowed := range roles {
                if role == allowed {
                    next.ServeHTTP(w, r)
                    return
                }
            }
            http.Error(w, "forbidden", http.StatusForbidden)
        })
    }
}
```

### 7.4 Initial admin provisioning

Owner runs `scripts/seed-admin.go` locally pointed at production DB:

```bash
DATABASE_URL=libsql://... go run scripts/seed-admin.go \
    --church-slug=gki-diponegoro \
    --church-name="GKI Diponegoro" \
    --email=admin@example.com \
    --password=...
```

This script:
1. Creates a row in `churches` if not exists.
2. Creates a row in `users` with `role='admin'` and bcrypted password.
3. Prints success.

### 7.5 Password reset (POST-MVP)

Defer to v0.2. For MVP, owner resets passwords manually by running a CLI tool against the DB.


---

## 8. API Contract

### 8.1 Conventions

- Base URL: `https://<backend-host>/`
- Content type: `application/json`
- Authentication: httpOnly cookie `shepherd_session` (or `Authorization: Bearer <token>` as fallback).
- Errors: `{"error": "human readable message"}` with appropriate 4xx/5xx status.
- Pagination: `?limit=50&offset=0`. Responses include `{ "data": [...], "total": N, "limit": N, "offset": N }`.
- Timestamps: ISO 8601 strings (`"2026-05-13T08:30:00Z"`).
- IDs: integers.

### 8.2 Endpoints

#### Auth

| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | `/auth/login` | `{ email, password }` | `{ user }` + sets cookies | No |
| POST | `/auth/refresh` | — | `{}` + refreshes cookies | Refresh cookie |
| POST | `/auth/logout` | — | `204` | No (clears cookies) |
| GET | `/me` | — | `{ user }` | Yes |

#### Jemaat

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jemaat?limit=&offset=&q=` | List with optional search query `q` |
| POST | `/jemaat` | Create |
| GET | `/jemaat/{id}` | Detail |
| PUT | `/jemaat/{id}` | Update full |
| DELETE | `/jemaat/{id}` | Soft delete (sets `is_active=0`) |

Create body:

```json
{
  "nama_lengkap": "Budi Santoso",
  "nama_panggilan": "Budi",
  "jenis_kelamin": "L",
  "tanggal_lahir": "1980-03-15",
  "tempat_lahir": "Semarang",
  "alamat": "Jl. Mawar 1",
  "nomor_telepon": "+628123456789",
  "email": "budi@example.com",
  "status_pernikahan": "menikah",
  "tanggal_baptis": "1995-06-20",
  "tanggal_sidi": "1998-08-15",
  "keluarga_id": null,
  "catatan": ""
}
```

#### Pelayan

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pelayan` | List with embedded jemaat data |
| POST | `/pelayan` | Add a jemaat as pelayan |
| GET | `/pelayan/{id}` | Detail with service types |
| PUT | `/pelayan/{id}` | Update (e.g. catatan, service types) |
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
| DELETE | `/service-types/{id}` | Delete (fails if referenced by jadwal — return 409) |

#### Kebaktian + Jadwal

| Method | Path | Description |
|--------|------|-------------|
| GET | `/kebaktian?from=&to=` | List in date range |
| POST | `/kebaktian` | Create |
| GET | `/kebaktian/{id}` | Detail |
| PUT | `/kebaktian/{id}` | Update |
| DELETE | `/kebaktian/{id}` | Delete (cascades jadwal) |
| GET | `/kebaktian/{id}/jadwal` | Get all slots for a kebaktian |
| PUT | `/kebaktian/{id}/jadwal` | Bulk upsert slots |

Bulk upsert body for jadwal:

```json
{
  "slots": [
    { "service_type_id": 1, "pelayan_id": 12, "catatan": "" },
    { "service_type_id": 2, "pelayan_id": 8,  "catatan": "" },
    { "service_type_id": 3, "pelayan_id": null, "catatan": "Belum terisi" }
  ]
}
```

### 8.3 Error codes

| Status | Meaning |
|--------|---------|
| 400 | Bad request (invalid JSON, validation failure) |
| 401 | Not authenticated |
| 403 | Forbidden (wrong role or church mismatch) |
| 404 | Not found (also used when row belongs to another church — never leak that) |
| 409 | Conflict (e.g. unique constraint, FK constraint) |
| 422 | Semantically invalid (rare) |
| 429 | Rate limit |
| 500 | Server error |

---

## 9. Development Environment

### 9.1 Devcontainer

`.devcontainer/devcontainer.json`:

```json
{
  "name": "Shepherd Dev",
  "build": { "dockerfile": "Dockerfile" },
  "features": {
    "ghcr.io/devcontainers/features/common-utils:2": {
      "installZsh": true,
      "configureZshAsDefaultShell": true
    },
    "ghcr.io/devcontainers/features/git:1": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "golang.go",
        "svelte.svelte-vscode",
        "bradlc.vscode-tailwindcss",
        "esbenp.prettier-vscode",
        "dbaeumer.vscode-eslint",
        "ariga.atlas-hcl",
        "redhat.vscode-yaml",
        "yzhang.markdown-all-in-one"
      ],
      "settings": {
        "go.useLanguageServer": true,
        "go.lintTool": "golangci-lint",
        "editor.formatOnSave": true,
        "[go]": { "editor.defaultFormatter": "golang.go" },
        "[svelte]": { "editor.defaultFormatter": "svelte.svelte-vscode" },
        "[typescript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
      }
    }
  },
  "forwardPorts": [5173, 8080],
  "portsAttributes": {
    "5173": { "label": "Frontend (Vite)", "onAutoForward": "openPreview" },
    "8080": { "label": "Backend (Go)" }
  },
  "postCreateCommand": "make setup",
  "remoteUser": "vscode"
}
```

`.devcontainer/Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/devcontainers/go:1-1.23-bookworm

ARG NODE_VERSION=20

# Node
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# Turso CLI
RUN curl -sSfL https://get.tur.so/install.sh | bash \
    && mv /root/.turso/turso /usr/local/bin/turso || true

# Atlas
RUN curl -sSf https://atlasgo.sh | sh -s -- --community

# sqlc
RUN go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

# air (hot reload)
RUN go install github.com/air-verse/air@latest

# golangci-lint
RUN curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh \
    | sh -s -- -b $(go env GOPATH)/bin v1.61.0

ENV PATH="/root/go/bin:${PATH}"
```

### 9.2 `Makefile` (root)

```makefile
.PHONY: help setup dev dev-fe dev-be build test lint clean db-apply db-diff db-migrate sqlc seed

help:
	@echo "Shepherd dev commands:"
	@echo "  make setup        — install deps (run once)"
	@echo "  make dev          — run frontend + backend in parallel"
	@echo "  make dev-fe       — frontend only"
	@echo "  make dev-be       — backend only (with air hot reload)"
	@echo "  make build        — production build for both"
	@echo "  make test         — run all tests"
	@echo "  make lint         — lint all code"
	@echo "  make db-apply     — apply schema.sql to local dev DB (destructive)"
	@echo "  make db-diff name=desc — generate a versioned migration"
	@echo "  make db-migrate   — apply pending migrations"
	@echo "  make sqlc         — regenerate Go DB code from queries"
	@echo "  make seed         — seed dev DB with sample data"

setup:
	cd frontend && npm install
	cd backend && go mod download

dev:
	@echo "Starting frontend (5173) and backend (8080)..."
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
	cd backend && go test ./...
	cd frontend && npm test -- --run

lint:
	cd backend && golangci-lint run
	cd frontend && npm run lint

clean:
	rm -rf frontend/dist backend/bin backend/tmp

# --- Database ---

db-apply:
	cd backend && atlas schema apply --env local --auto-approve

db-diff:
	@test -n "$(name)" || (echo "Usage: make db-diff name=description"; exit 1)
	cd backend && atlas migrate diff $(name) --env local

db-migrate:
	cd backend && atlas migrate apply --env local

sqlc:
	cd backend && sqlc generate

seed:
	cd backend && go run scripts/seed-dev.go
```

### 9.3 `backend/.air.toml`

```toml
root = "."
testdata_dir = "testdata"
tmp_dir = "tmp"

[build]
  args_bin = []
  bin = "./tmp/server"
  cmd = "go build -o ./tmp/server ./cmd/server"
  delay = 1000
  exclude_dir = ["assets", "tmp", "vendor", "testdata", "bin"]
  exclude_file = []
  exclude_regex = ["_test.go"]
  exclude_unchanged = false
  follow_symlink = false
  full_bin = ""
  include_dir = []
  include_ext = ["go", "sql", "yaml", "html"]
  kill_delay = "0s"
  log = "build-errors.log"
  send_interrupt = false
  stop_on_error = true

[color]
  app = ""
  build = "yellow"
  main = "magenta"
  runner = "green"
  watcher = "cyan"

[log]
  time = true

[misc]
  clean_on_exit = false
```

### 9.4 Local dev `.env` files

`backend/.env.example`:

```
PORT=8080
APP_ENV=development
DATABASE_URL=file:./local.db
JWT_SECRET=change-me-to-32-bytes-of-randomness-please
JWT_ISSUER=shepherd
JWT_AUDIENCE=shepherd-web
CORS_ALLOWED_ORIGINS=http://localhost:5173
LOG_LEVEL=debug
```

`frontend/.env.example`:

```
VITE_API_URL=http://localhost:8080
```

Developer copies `.env.example` → `.env` (gitignored) and edits secrets.

### 9.5 First-run workflow for a contributor

```bash
git clone https://github.com/<owner>/shepherd
cd shepherd
# Open in VS Code → "Reopen in Container" → wait for build
make setup
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
make db-apply
make seed
make dev
# Open http://localhost:5173
```

---

## 10. Deployment

### 10.1 Frontend → Cloudflare Pages

Setup once via Cloudflare dashboard:

1. Connect GitHub repo.
2. Build settings:
   - Production branch: `main`
   - Build command: `cd frontend && npm install && npm run build`
   - Build output directory: `frontend/dist`
   - Root directory: leave blank (CF resolves from repo root)
3. Environment variables:
   - `VITE_API_URL` = `https://<heroku-app>.herokuapp.com`
   - `NODE_VERSION` = `20`
4. Custom domain (optional): point CNAME from `shepherd.yourdomain.com` to `<project>.pages.dev`.

Cloudflare Pages auto-deploys on every push to `main`.

### 10.2 Backend → Heroku Eco

Initial setup (run once on owner's machine):

```bash
heroku login
heroku create shepherd-api --buildpack https://github.com/lstoll/heroku-buildpack-monorepo
heroku buildpacks:add heroku/go

# Tell monorepo buildpack which subdirectory contains the app
heroku config:set APP_BASE=backend

# App-level env vars
heroku config:set JWT_SECRET="$(openssl rand -base64 32)"
heroku config:set JWT_ISSUER=shepherd
heroku config:set JWT_AUDIENCE=shepherd-web
heroku config:set APP_ENV=production
heroku config:set CORS_ALLOWED_ORIGINS=https://shepherd.pages.dev

# Turso provisioning (one-time)
turso auth signup
turso db create shepherd-prod
turso db show --url shepherd-prod
turso db tokens create shepherd-prod
heroku config:set DATABASE_URL="libsql://shepherd-prod-<org>.turso.io?authToken=<token>"

# Push to deploy
git push heroku main
```

The `release` phase in `Procfile` runs `atlas migrate apply --env prod` before the new web dyno is promoted. If migration fails, deploy aborts.

### 10.3 First-time admin seeding (production)

After first deploy, owner runs locally with prod DB URL to create the first church + admin user:

```bash
cd backend
DATABASE_URL="libsql://shepherd-prod-...turso.io?authToken=..." \
    go run scripts/seed-admin.go \
    --church-slug=demo \
    --church-name="Demo Church" \
    --email=owner@example.com \
    --password="$(openssl rand -base64 24)"
```

Save the printed credentials securely.

### 10.4 Eco dyno cold start considerations

Eco dynos sleep after 30 min of inactivity. Cold start for a Go binary is ~3–8 seconds. To mitigate:

- **Option A** — accept the cold start. UX is degraded for the first request after inactivity.
- **Option B** — GitHub Actions cron pings `/health` every 25 minutes during business hours (gereja jam aktif). Add `.github/workflows/keep-alive.yml`:

```yaml
name: keep-alive
on:
  schedule:
    - cron: '*/25 6-22 * * *'  # every 25 min, 6 AM – 10 PM UTC
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS https://shepherd-api.herokuapp.com/health
```

This consumes minimal Eco dyno hours but keeps it warm during typical usage windows.

### 10.5 Backup strategy

Turso has no automatic backups on free tier. Mitigate with:

**Weekly GitHub Action** dumping the DB to a private repo:

```yaml
name: db-backup
on:
  schedule:
    - cron: '0 3 * * 0'  # weekly, Sunday 3 AM UTC
  workflow_dispatch:
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Turso CLI
        run: curl -sSfL https://get.tur.so/install.sh | bash
      - name: Dump database
        env:
          TURSO_API_TOKEN: ${{ secrets.TURSO_API_TOKEN }}
        run: |
          turso db shell shepherd-prod ".dump" > backup-$(date +%Y%m%d).sql
      - uses: actions/upload-artifact@v4
        with:
          name: db-backup
          path: backup-*.sql
          retention-days: 90
```

Optionally push to a private backup repo or S3-compatible bucket.

### 10.6 Logs & monitoring

- **Heroku logs:** `heroku logs --tail -a shepherd-api`. Structured JSON via slog.
- **Optional:** Add Better Stack (free tier) or Logtail Heroku addon for log aggregation.
- **Healthcheck:** `/health` returns `{"status":"ok","db":"ok"}` after pinging DB.


---

## 11. CI/CD

### 11.1 `.github/workflows/ci.yml`

Runs on every PR and push to main. Lints and tests both apps.

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.23' }
      - name: Install sqlc
        run: go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
      - name: Verify sqlc is up to date
        run: |
          sqlc generate
          git diff --exit-code || (echo "Run 'make sqlc' and commit" && exit 1)
      - name: golangci-lint
        uses: golangci/golangci-lint-action@v6
        with:
          version: v1.61
          working-directory: backend
      - name: Test
        run: go test -race -cover ./...

  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npm run check     # svelte-check
      - run: npm test -- --run
      - run: npm run build
```

### 11.2 `.github/workflows/backend-deploy.yml`

Deploys to Heroku on push to main, if backend files changed.

```yaml
name: Deploy backend
on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/backend-deploy.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []  # CI runs separately; we don't gate to keep dependency simple
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Deploy to Heroku
        uses: akhileshns/heroku-deploy@v3.13.15
        with:
          heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
          heroku_app_name: shepherd-api
          heroku_email: ${{ secrets.HEROKU_EMAIL }}
          usedocker: false
          buildpack: "https://github.com/lstoll/heroku-buildpack-monorepo"
```

Note: Cloudflare Pages handles frontend deployment via its native GitHub integration — no workflow needed.

### 11.3 Secrets required in GitHub repo

- `HEROKU_API_KEY` — from `heroku auth:token`
- `HEROKU_EMAIL`
- `TURSO_API_TOKEN` — for backup workflow

---

## 12. Open Source Housekeeping

### 12.1 LICENSE

MIT. Single file `LICENSE` at repo root.

### 12.2 README.md skeleton

```markdown
# Shepherd

> Aplikasi manajemen jemaat & jadwal pelayanan untuk gereja kecil.
> Free, open source, ringan, hosted gratis di server saya.

⚠️ **Hobby project — no SLA, no warranty.** Untuk gereja kecil yang oke dengan risiko data loss.

## Fitur (v1)

- Catat data jemaat (nama, kontak, tanggal lahir, baptis, sidi, dst)
- Catat pelayan + jenis pelayanan yang bisa dilayani
- Atur jadwal pelayanan per kebaktian / persekutuan
- Single account per gereja, sharing welcome

## Mau gabung?

Email saya di <email> dengan nama gereja. Saya akan provision akun manual.

## Self-host

Lihat [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tech stack

- Frontend: Svelte 5 + Vite + Tailwind, hosted di Cloudflare Pages
- Backend: Go (chi router) + sqlc + Atlas, hosted di Heroku
- Database: Turso (libSQL/SQLite)

## Development

```bash
git clone https://github.com/<owner>/shepherd
cd shepherd
# Open in VS Code → "Reopen in Container"
make setup
make db-apply
make seed
make dev
```

## License

MIT
```

### 12.3 CONTRIBUTING.md

- How to set up dev env (point to devcontainer)
- Branch naming: `feat/`, `fix/`, `docs/`
- Commit style: conventional commits encouraged but not enforced
- PR checklist: tests pass, sqlc regenerated, no schema drift
- Code review expectations

### 12.4 CODE_OF_CONDUCT.md

Adopt Contributor Covenant v2.1.

### 12.5 Issue & PR templates

Standard GitHub templates in `.github/`.

### 12.6 `.gitignore` highlights

Root:
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

## 13. MVP Scope & Phases

### 13.1 Phase 0 — Foundation (week 1)

- [ ] Monorepo scaffolded with the structure above
- [ ] Devcontainer working — `make dev` runs both apps
- [ ] `schema.sql` finalized
- [ ] sqlc generation working
- [ ] Atlas applying schema to local SQLite
- [ ] Health endpoint live
- [ ] Login + JWT issue + `/me` working end-to-end
- [ ] Frontend login page, dashboard skeleton
- [ ] CI green
- [ ] Deployable: frontend to CF Pages, backend to Heroku

**Definition of done:** owner can deploy, log in, see empty dashboard.

### 13.2 Phase 1 — Jemaat CRUD (week 2)

- [ ] Backend: full CRUD endpoints for jemaat
- [ ] Frontend: list page with table, search, pagination
- [ ] Frontend: create/edit modal or page
- [ ] Frontend: detail view
- [ ] Soft delete + filter inactive

**Definition of done:** owner can add 50 dummy jemaat and find them.

### 13.3 Phase 2 — Pelayan + Service Types (week 3)

- [ ] Backend: service_types CRUD
- [ ] Backend: pelayan CRUD with service_type relationships
- [ ] Frontend: service types management page (small, admin-only)
- [ ] Frontend: pelayan list, "promote jemaat to pelayan" flow
- [ ] Frontend: edit which service types a pelayan can do

**Definition of done:** owner can mark 10 jemaat as pelayan with 2–3 service types each.

### 13.4 Phase 3 — Jadwal Pelayanan (week 4)

- [ ] Backend: kebaktian CRUD
- [ ] Backend: jadwal bulk upsert per kebaktian
- [ ] Frontend: calendar / list view of upcoming kebaktian
- [ ] Frontend: per-kebaktian schedule editor (table with service types as rows, assign pelayan via dropdown)
- [ ] Frontend: per-pelayan view "kapan saya bertugas"

**Definition of done:** owner can create 4 upcoming Sunday services with full schedule and view a "this week" summary.

### 13.5 Phase 4 — Polish & v0.2 ideas (week 5+)

- [ ] Export to Excel (jemaat list, jadwal mingguan)
- [ ] Print-friendly schedule view
- [ ] Audit log viewer (admin only)
- [ ] Password reset flow with email
- [ ] Roles enforcement (editor, viewer)
- [ ] Family management (keluarga grouping)
- [ ] Birthday reminders / dashboard widget
- [ ] Recurring kebaktian templates ("setiap Minggu jam 9 pagi")

---

## 14. Non-Negotiable Rules

These rules apply to the entire codebase. The implementing agent MUST enforce them at every step.

### 14.1 Multi-tenancy isolation (most important)

1. **Every domain table has `church_id NOT NULL`.**
2. **Every query filters by `church_id` from authenticated session.**
3. **Never accept `church_id` from request body or URL params.** Always derive from JWT claims via middleware.
4. **Return 404 (not 403) when an ID exists but belongs to another church.** Don't leak existence.

### 14.2 Security baseline

1. Passwords hashed with bcrypt cost ≥ 12.
2. JWT secret ≥ 32 bytes. Stored only in env vars, never in code.
3. Cookies: `HttpOnly`, `Secure`, `SameSite=None` (cross-domain SPA), short-lived access tokens.
4. Rate limit `/auth/login` at 10/min/IP.
5. CORS allowlist explicit — no `*` with credentials.
6. Validate all inputs server-side regardless of frontend validation.
7. Use parameterized queries everywhere (sqlc enforces this).
8. Never log passwords, tokens, or full request bodies of auth endpoints.
9. HTTPS only in production (Heroku & Cloudflare both enforce by default).

### 14.3 Database portability

1. Stick to SQLite-standard SQL. No Turso-specific extensions in business queries.
2. No reliance on `RETURNING` for ID retrieval if avoidable — prefer `LastInsertId()`. (Most modern SQLite supports `RETURNING`, but D1 historically did not.)
3. Schema lives in one file: `schema.sql`. No migrations-as-code in Go.
4. Migration files generated by Atlas, committed to repo.

### 14.4 Code quality

1. `go test ./...` must pass before merge.
2. `golangci-lint run` must pass with project config.
3. `svelte-check` must pass.
4. `sqlc generate` must produce no diff (committed code reflects current schema).
5. No `panic()` in handlers — always return errors.
6. Use `slog` for structured logging. Never `fmt.Println` in production paths.
7. Wrap errors with `fmt.Errorf("context: %w", err)` for traceability.

### 14.5 API consistency

1. All responses JSON.
2. All errors have `{"error": "..."}` shape.
3. Timestamps always ISO 8601 strings in JSON.
4. List endpoints always paginated.
5. POST returns the created resource. PUT returns the updated resource. DELETE returns 204.

### 14.6 Frontend conventions

1. All API calls go through `apiClient` — no raw fetch in components.
2. All async server state via TanStack Query — no manual loading states.
3. All forms via Felte + Zod schema.
4. No `any` in TypeScript. Use `unknown` and narrow.
5. Use `$state` and `$derived` (Svelte 5 runes) — no legacy stores unless necessary.

### 14.7 Git hygiene

1. `main` is always deployable.
2. Feature branches: `feat/<short-name>`.
3. PR required for any changes to `main` (enable branch protection).
4. Squash merge to keep history clean.
5. Tag releases: `v0.1.0`, `v0.2.0`, etc.

### 14.8 Privacy & data ownership

1. README clearly states this is a hobby project, no SLA, no warranty.
2. Provide data export from day 1 (CSV / JSON dump endpoint, admin-only).
3. Audit log captures who-did-what-when on data mutations.
4. Honor delete requests fully — `ON DELETE CASCADE` on `churches` wipes everything.

---

## 15. Out of Scope (do NOT implement at MVP)

- Public signup / multi-tenancy SaaS billing
- Email sending (use cases that need it: deferred to v0.2)
- Push notifications
- Mobile native apps
- Real-time websocket features
- File uploads (jemaat photos etc.) — needs object storage, defer
- i18n beyond Indonesian (but write strings via a helper to enable later)
- Complex permission system beyond admin/editor/viewer

---

## 16. Glossary

- **Jemaat** — church member.
- **Pelayan** — volunteer servant who performs roles in services.
- **Kebaktian** — Sunday worship service or weekday fellowship event.
- **Persekutuan** — fellowship gathering (subset of kebaktian).
- **Jadwal Pelayanan** — schedule assigning pelayan to roles in a kebaktian.
- **Sidi** — confirmation (Protestant tradition).
- **Service Type** — role in a service (worship leader, singer, multimedia, usher, etc.).

---

## 17. Implementation checklist for AI agent

When you begin implementation, complete these in order. Each step is independently verifiable.

1. **Monorepo bootstrap** — create folder structure, init git, write `.gitignore`, `LICENSE`, `README.md`, `Makefile`, `.editorconfig`.
2. **Devcontainer** — `.devcontainer/` files, verify it builds in Codespaces or local Docker.
3. **Backend skeleton** — `go.mod`, `cmd/server/main.go` (minimal "hello"), `internal/config/`, `internal/router/`, `internal/handlers/health.go`. Confirm `make dev-be` starts on :8080.
4. **Frontend skeleton** — Vite + Svelte 5 + TypeScript + Tailwind. Confirm `make dev-fe` starts on :5173 and proxies `/api/health` to backend.
5. **Database layer** — write `schema.sql`, `sqlc.yaml`, `atlas.hcl`. Run `make db-apply` and `make sqlc`. Verify generated code compiles.
6. **Auth** — implement JWT helpers, password hashing, login/refresh/logout handlers, RequireAuth middleware. Write `scripts/seed-admin.go`.
7. **Frontend auth** — login page, auth store, apiClient with credentials, protected route guard.
8. **End-to-end smoke** — log in from frontend, hit `/me`, see user data. Commit & tag `v0.0.1-skeleton`.
9. **Jemaat CRUD** — backend handlers + queries + tests, frontend list/create/edit/delete pages. Commit & tag `v0.1.0-jemaat`.
10. **Service Types CRUD** — backend + frontend admin page.
11. **Pelayan CRUD** — backend + frontend with service_types relationships.
12. **Kebaktian + Jadwal** — backend bulk upsert + frontend schedule editor.
13. **Polish** — empty states, error toasts, loading skeletons, mobile responsive check.
14. **Deploy** — provision Heroku + Cloudflare Pages + Turso, run first deploy, seed admin.
15. **Tag `v1.0.0`** when feature-complete and deployed.

After each step:
- Run `make lint test build` and ensure green.
- Open a PR even if you're solo — the diff review catches errors.
- Update `docs/` as features land.

---

End of plan.
