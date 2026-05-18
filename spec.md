# Tata Gereja — Church Management Web App: Implementation Plan

> **Audience:** AI coding agent implementing this project from scratch.
> **Goal:** Deliver a working open-source church management web app for small Indonesian Protestant churches. Hobby project.
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
7. [Authentication](#7-authentication)
8. [API Contract](#8-api-contract)
9. [Validation Rules](#9-validation-rules)
10. [Development Environment](#10-development-environment)
11. [Testing Strategy](#11-testing-strategy)
12. [Open Source Housekeeping](#12-open-source-housekeeping)
13. [MVP Scope & Phases](#13-mvp-scope--phases)
14. [Non-Negotiable Rules](#14-non-negotiable-rules)
15. [Out of Scope](#15-out-of-scope)
16. [Glossary](#16-glossary)
17. [Implementation Checklist](#17-implementation-checklist-for-ai-agent)

---

## 1. Project Overview

### 1.1 What it is

Tata Gereja helps a church manage:

- **Jemaat** — church members: name, contact, address, birthday, family relations, baptism/confirmation.
- **Keluarga** — family unit grouping jemaat.
- **Pelayan** — volunteers who serve, and which service types they can do.
- **Jadwal Pelayanan** — service schedules: assign pelayan to slots (worship leader, singer, musician, multimedia, usher, etc.) for each kebaktian.

### 1.2 Who it is for

- **Direct users:** church admins, worship coordinators, pastors.
- **End beneficiary:** Indonesian Protestant churches (initial target). Avoid hard-coding denomination-specific logic.

### 1.3 Operational model

- **One user per church account.** The user IS the church for MVP. No multi-admin per church, no self-signup. The owner manually provisions accounts.
- **Multiple users on one shared SQLite file.** Every domain row is scoped by `user_id`. Data of one user/church MUST NEVER leak to another.
- **No SLA.** Hobby project. Users are informed via README and an in-app disclaimer.
- **Local dev only at MVP.** Deployment, hosting, and self-hosting docs are deferred.

### 1.4 Non-goals

See [§15 Out of Scope](#15-out-of-scope).

---

## 2. Architecture & Stack

### 2.1 High-level diagram

```
┌─────────────────────────────┐    HTTP/JSON     ┌──────────────────────────────┐
│  Svelte 5 SPA               │ ───────────────► │  Go API (Chi router)         │
│  Vite dev server :5173      │                  │  :8080                       │
│  Static build → dist/       │ ◄─────────────── │  - sqlc + feature folders    │
└─────────────────────────────┘                  │  - DB-backed sessions        │
                                                  └──────────────┬────────────────┘
                                                                 ▼
                                                  ┌──────────────────────────────┐
                                                  │  SQLite (local file)         │
                                                  │  WAL, single-writer pool     │
                                                  └──────────────────────────────┘
```

### 2.2 Stack decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend framework | **Svelte 5** + Vite + TypeScript | Lightweight, small bundle, pure SPA. |
| Frontend routing | **svelte-spa-router** | Simple hash-based SPA routing, no SSR. |
| Frontend styling | **Tailwind CSS** + **shadcn-svelte** (CLI-copied), **mobile-first** | Fast styling, accessible primitives. Breakpoints layer up from phone; see §6.10. |
| Frontend mobile patterns | **`vaul-svelte`** drawer + shadcn `Sheet` | Bottom-sheet forms on mobile, side sheet for filters; dialog reserved for desktop. |
| Frontend data fetching | **TanStack Query (Svelte)** | Caching, retries, invalidation. |
| Frontend state | Svelte 5 runes (`$state`, `$derived`) | Built-in. |
| Frontend forms | Native form handling + **Zod** on submit | One fewer dep than Felte. |
| Backend language | **Go 1.23+** | Fast startup, single binary, low memory. |
| Backend router | **chi/v5** | Idiomatic, lightweight, composable middleware. |
| Backend DB driver | **modernc.org/sqlite** | Pure Go, no CGO. |
| Backend nullable types | **gopkg.in/guregu/null.v4** | Clean JSON marshaling. |
| Backend DB queries | **sqlc** | Type-safe Go from plain SQL. |
| Backend schema management | **Embedded `schema.sql` + idempotent boot** (§4.4) | One mode: `CREATE TABLE IF NOT EXISTS`. |
| Backend auth | **DB-backed session token** + **bcrypt** | Opaque token in `sessions` table; cookie carries it. No JWT. |
| Backend validation | **go-playground/validator/v10** | Standard. |
| Backend CORS | **go-chi/cors** | Drop-in. |
| Hot reload (Go) | **air** (air-verse/air) | Watch & rebuild. |
| Database | **SQLite file** | One file, WAL mode. |
| Monorepo strategy | Plain folder split (`frontend/`, `backend/`) | No Turborepo/Nx needed. |
| Backend structure | **Feature folders, handler + sqlc only** | Add `service.go` later when logic emerges (§5.10). |

### 2.3 Why these choices

- **Go + SQLite:** single binary, single file, trivial to develop and back up.
- **modernc.org/sqlite over libsql-client-go:** pure Go, no CGO, fewer toolchain headaches.
- **sqlc over Ent/GORM:** SQL stays plain & portable; no runtime ORM overhead.
- **DB sessions over JWT:** simpler. One opaque token per login, stored in a `sessions` table. Logout = `DELETE FROM sessions WHERE token=?`. No JWT-secret rotation, no refresh flow, no claim-shape bikeshedding.
- **Svelte 5 over SvelteKit:** pure SPA decouples frontend from backend lifecycle and avoids SSR complexity.
- **handler + sqlc only:** for CRUD, handlers call sqlc directly. Extract a `service.go` only when a feature has real logic (transactions, cross-entity validation). Jadwal bulk-replace is the first candidate (§5.10).

---

## 3. Repository Structure

```
tatagereja/
├── frontend/
│   ├── public/
│   │   └── favicon.svg
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
│   │   │   ├── schemas/             # Zod schemas
│   │   │   │   └── jemaat.ts
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
│   │       └── main.go              # bootstrap initial user
│   ├── internal/
│   │   ├── config/
│   │   │   └── config.go
│   │   ├── db/
│   │   │   ├── schema.sql           # SINGLE SOURCE OF TRUTH
│   │   │   ├── conn.go
│   │   │   ├── sync.go              # apply schema.sql on boot (idempotent)
│   │   │   └── sqlc/                # GENERATED — do not edit
│   │   │       ├── db.go
│   │   │       ├── models.go
│   │   │       └── *.sql.go
│   │   ├── auth/
│   │   │   ├── session.go           # create/lookup/delete DB session tokens
│   │   │   ├── cookie.go
│   │   │   ├── password.go
│   │   │   ├── handler.go
│   │   │   └── queries.sql
│   │   ├── jemaat/
│   │   │   ├── handler.go
│   │   │   └── queries.sql
│   │   ├── keluarga/
│   │   │   ├── handler.go
│   │   │   └── queries.sql
│   │   ├── pelayan/
│   │   │   ├── handler.go
│   │   │   └── queries.sql
│   │   ├── servicetypes/
│   │   │   ├── handler.go
│   │   │   └── queries.sql
│   │   ├── kebaktian/
│   │   │   ├── handler.go
│   │   │   └── queries.sql
│   │   ├── jadwal/
│   │   │   ├── handler.go
│   │   │   └── queries.sql
│   │   ├── health/
│   │   │   └── handler.go
│   │   ├── middleware/
│   │   │   ├── auth.go              # session lookup, sets ctx
│   │   │   └── logging.go
│   │   ├── httpx/
│   │   │   ├── response.go
│   │   │   └── pagination.go
│   │   └── router/
│   │       └── router.go
│   ├── tests/
│   │   ├── integration/
│   │   │   ├── jemaat_test.go
│   │   │   ├── jadwal_test.go
│   │   │   └── cross_user_test.go   # CRITICAL: 404 across users
│   │   └── testutil/
│   │       └── db.go                # in-memory DB factory
│   ├── sqlc.yaml
│   ├── .air.toml
│   ├── go.mod
│   ├── go.sum
│   ├── .env.example
│   └── .gitignore
├── docs/
│   └── ADD_FEATURE.md               # recipe for adding a new entity
├── .editorconfig
├── .gitignore
├── LICENSE                          # MIT
├── Makefile
├── README.md
└── CONTRIBUTING.md
```

> **Note on `service.go`:** feature folders contain `handler.go + queries.sql` only. When a feature grows beyond pure CRUD (transactions, cross-entity validation, side effects), extract a `service.go`. **Jadwal** is the first candidate — see §5.10.

---

## 4. Database Design

### 4.1 Source of truth

`backend/internal/db/schema.sql` is the SINGLE SOURCE OF TRUTH:

- Input to **sqlc** (for generating Go types).
- Input to the **idempotent boot sync** (§4.4).
- Human-readable documentation of the data model.

NEVER edit the generated `sqlc/` folder by hand. Edit `schema.sql`, regenerate, restart.

### 4.2 User-data isolation (CRITICAL)

**EVERY domain table (except `users` and `sessions`) MUST have a `user_id` column with `NOT NULL` and `FOREIGN KEY` to `users(id) ON DELETE CASCADE`.**

**EVERY query that reads or writes a domain row MUST filter or set `user_id` from the authenticated session.** Never trust `user_id` from the request body.

Failure here = data leak between users = critical security bug. `tests/integration/cross_user_test.go` enforces this; see §11.

### 4.3 Time conventions

- **All timestamps stored as UTC ISO 8601 strings** ending in `Z`. Default `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`.
- **`kebaktian.waktu_mulai` stored as UTC.** The frontend converts to/from the user's timezone (`users.timezone`) for display and input.
- **`tanggal_lahir`, `tanggal_baptis`, `tanggal_sidi` are calendar dates.** Stored as `YYYY-MM-DD`. A birthday is a birthday regardless of where you are.

### 4.4 Schema sync

One mode. On startup the server executes `schema.sql` as embedded bytes. All `CREATE TABLE` use `IF NOT EXISTS`, so the call is idempotent:

```go
//go:embed schema.sql
var schemaSQL string

func Apply(db *sql.DB) error {
    if _, err := db.Exec(schemaSQL); err != nil {
        return fmt.Errorf("apply schema: %w", err)
    }
    return nil
}
```

**Destructive schema changes during dev:** `rm local.db && make dev`. There is no `recreate`/`off` mode. When real data exists and altering the schema in place is required, a migration tool is added at that point.

### 4.5 Full `schema.sql`

```sql
-- ============================================================
-- Tata Gereja schema.sql — SQLite dialect
-- Source of truth for sqlc and the boot-time sync.
-- All CREATE TABLE use IF NOT EXISTS (idempotent).
-- Timestamps are UTC ISO 8601 strings. Booleans are INTEGER 0/1.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- Users: each user IS one church account.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    church_name     TEXT NOT NULL,
    timezone        TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- Sessions: opaque token → user. Cookie carries the token.
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================
-- Keluarga (family unit) — declared BEFORE jemaat (jemaat FKs it)
-- ============================================================

CREATE TABLE IF NOT EXISTS keluarga (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama_keluarga   TEXT NOT NULL,
    alamat          TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_keluarga_user_id ON keluarga(user_id);

-- ============================================================
-- Jemaat (church members)
-- ============================================================

CREATE TABLE IF NOT EXISTS jemaat (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_jemaat_user_id ON jemaat(user_id);
CREATE INDEX IF NOT EXISTS idx_jemaat_nama ON jemaat(user_id, nama_lengkap);
CREATE INDEX IF NOT EXISTS idx_jemaat_keluarga_id ON jemaat(keluarga_id);

-- ============================================================
-- Service types (configurable per user)
-- ============================================================

CREATE TABLE IF NOT EXISTS service_types (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    deskripsi       TEXT,
    urutan          INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, nama)
);

CREATE INDEX IF NOT EXISTS idx_service_types_user_id ON service_types(user_id);

-- ============================================================
-- Pelayan (servants) — jemaat who serve
-- ============================================================

CREATE TABLE IF NOT EXISTS pelayan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jemaat_id       INTEGER NOT NULL REFERENCES jemaat(id) ON DELETE CASCADE,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, jemaat_id)
);

CREATE INDEX IF NOT EXISTS idx_pelayan_user_id ON pelayan(user_id);
CREATE INDEX IF NOT EXISTS idx_pelayan_jemaat_id ON pelayan(jemaat_id);

CREATE TABLE IF NOT EXISTS pelayan_service_types (
    pelayan_id          INTEGER NOT NULL REFERENCES pelayan(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (pelayan_id, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_pelayan_st_service_type_id ON pelayan_service_types(service_type_id);

-- ============================================================
-- Kebaktian / Persekutuan
-- ============================================================

CREATE TABLE IF NOT EXISTS kebaktian (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    -- waktu_mulai is a single UTC instant. Frontend converts to user tz for display.
    waktu_mulai     TEXT NOT NULL,                  -- ISO 8601 UTC: 2026-05-18T02:00:00Z
    lokasi          TEXT,
    tema            TEXT,
    pengkhotbah     TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_kebaktian_user_id ON kebaktian(user_id);
CREATE INDEX IF NOT EXISTS idx_kebaktian_waktu ON kebaktian(user_id, waktu_mulai);

-- ============================================================
-- Jadwal pelayanan
-- ============================================================

CREATE TABLE IF NOT EXISTS jadwal_pelayanan (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kebaktian_id        INTEGER NOT NULL REFERENCES kebaktian(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
    pelayan_id          INTEGER REFERENCES pelayan(id) ON DELETE SET NULL,
    catatan             TEXT,
    confirmed           INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    -- One slot per (kebaktian, service_type). Enables idempotent bulk-replace.
    UNIQUE (kebaktian_id, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_jadwal_user_id ON jadwal_pelayanan(user_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_kebaktian_id ON jadwal_pelayanan(kebaktian_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_pelayan_id ON jadwal_pelayanan(pelayan_id);
```

### 4.6 Notes on the schema

- **Combined `waktu_mulai`** (single UTC timestamp) removes wall-clock ambiguity. "Sunday 9 AM Jakarta" → `2026-05-18T02:00:00Z`. Frontend formats with `Intl.DateTimeFormat` using `timeZone: user.timezone`.
- **`UNIQUE (kebaktian_id, service_type_id)`** enables the idempotent bulk-replace in §5.10.
- **`ON DELETE CASCADE` everywhere `user_id` points.** Deleting a user wipes their data cleanly.
- **`ON DELETE SET NULL`** for `pelayan_id` in `jadwal_pelayanan`: removing a pelayan empties their slots without destroying historical schedules.
- **No audit log** at MVP. `updated_at` + `is_active` covers what's needed.
- **No soft delete on most tables.** Only `jemaat.is_active` (members can leave/return).

### 4.7 sqlc query files (per feature folder)

Queries live next to their handlers, e.g. `internal/jemaat/queries.sql`:

```sql
-- internal/jemaat/queries.sql

-- name: GetJemaat :one
SELECT * FROM jemaat
WHERE id = ? AND user_id = ?;

-- name: ListJemaat :many
SELECT * FROM jemaat
WHERE user_id = ? AND is_active = 1
ORDER BY nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CountJemaat :one
SELECT COUNT(*) FROM jemaat
WHERE user_id = ? AND is_active = 1;

-- name: SearchJemaat :many
-- Caller passes pattern with % wrapped, e.g. "%budi%".
-- Caller MUST escape % and _ in user input before wrapping.
SELECT * FROM jemaat
WHERE user_id = ?
  AND is_active = 1
  AND (nama_lengkap LIKE ? ESCAPE '\'
       OR nama_panggilan LIKE ? ESCAPE '\'
       OR email LIKE ? ESCAPE '\')
ORDER BY nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CreateJemaat :one
INSERT INTO jemaat (
    user_id, nama_lengkap, nama_panggilan, jenis_kelamin,
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
WHERE id = ? AND user_id = ?
RETURNING *;

-- name: DeactivateJemaat :exec
UPDATE jemaat
SET is_active = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ? AND user_id = ?;
```

**Pattern for every query:** include `user_id` in WHERE clauses. Two-argument lookup (`id` + `user_id`) prevents IDOR. **No exceptions.**

### 4.8 `sqlc.yaml`

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
        emit_pointers_for_null_types: false
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
    modernc.org/sqlite                   v1.x
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

    if err := db.Apply(database); err != nil {
        slog.Error("failed to apply schema", "err", err)
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
    "time"
)

type Config struct {
    Port               string
    Env                string // "development" | "production"
    DatabaseURL        string
    SessionTTL         time.Duration
    CookieSecure       bool
    CORSAllowedOrigins []string
    LogLevel           string
}

func Load() (*Config, error) {
    cfg := &Config{
        Port:        getEnv("PORT", "8080"),
        Env:         getEnv("APP_ENV", "development"),
        DatabaseURL: os.Getenv("DATABASE_URL"),
        LogLevel:    getEnv("LOG_LEVEL", "info"),
    }

    if cfg.DatabaseURL == "" {
        return nil, errors.New("DATABASE_URL is required")
    }

    ttlHours := 24 * 7
    if v := os.Getenv("SESSION_TTL_HOURS"); v != "" {
        // parse, fall back to default on error — kept simple
    }
    cfg.SessionTTL = time.Duration(ttlHours) * time.Hour
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

// SQLite is single-writer. MaxOpenConns(1) serializes all access through
// one connection, eliminating "database is locked" errors entirely.
// At our scale (single-digit writes/min), this is the boring correct answer.
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
        "PRAGMA cache_size = -2000",
    }
    for _, p := range pragmas {
        if _, err := db.Exec(p); err != nil {
            return nil, fmt.Errorf("apply pragma %q: %w", p, err)
        }
    }

    db.SetMaxOpenConns(1)
    db.SetMaxIdleConns(1)
    db.SetConnMaxLifetime(0)

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
)

//go:embed schema.sql
var schemaSQL string

// Apply executes schema.sql. All CREATE TABLE statements use IF NOT EXISTS,
// so this is idempotent and safe to call on every boot.
func Apply(db *sql.DB) error {
    if _, err := db.Exec(schemaSQL); err != nil {
        return fmt.Errorf("apply schema: %w", err)
    }
    return nil
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
    r.Use(appmw.Logging)
    r.Use(chimiddleware.Recoverer)
    r.Use(chimiddleware.Timeout(30 * time.Second))

    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   cfg.CORSAllowedOrigins,
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
        AllowedHeaders:   []string{"Accept", "Content-Type"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

    // Public
    r.Get("/health", health.New(database).Handle)

    ah := auth.NewHandler(cfg, queries, database)
    r.Post("/auth/login", ah.Login)
    r.Post("/auth/logout", ah.Logout)

    // Authenticated
    r.Group(func(r chi.Router) {
        r.Use(appmw.RequireAuth(queries))

        r.Get("/me", ah.Me)

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

    "github.com/<owner>/tatagereja/backend/internal/auth"
    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
    "github.com/<owner>/tatagereja/backend/internal/httpx"
)

type ctxKey int

const UserIDKey ctxKey = iota

// RequireAuth reads the session cookie, looks up the session in DB,
// and sets the user_id in the request context.
func RequireAuth(q sqlc.Querier) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            c, err := r.Cookie(auth.CookieName)
            if err != nil || c.Value == "" {
                httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
                return
            }
            userID, err := auth.LookupSession(r.Context(), q, c.Value)
            if err != nil {
                httpx.WriteError(w, http.StatusUnauthorized, "invalid session")
                return
            }
            ctx := context.WithValue(r.Context(), UserIDKey, userID)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}

func GetUserID(r *http.Request) int64 {
    v, _ := r.Context().Value(UserIDKey).(int64)
    return v
}
```

### 5.9 `internal/middleware/logging.go`

```go
package middleware

import (
    "log/slog"
    "net/http"
    "time"

    chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// Logging emits one structured log line per request.
// Cookies are httpOnly so they never appear in logs.
// Auth endpoint bodies are not logged (passwords).
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
        )
    })
}
```

### 5.10 Sessions, password, cookie

```go
// internal/auth/session.go
package auth

import (
    "context"
    "crypto/rand"
    "database/sql"
    "encoding/base64"
    "errors"
    "time"

    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
)

var ErrInvalidSession = errors.New("invalid session")

func newToken() (string, error) {
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return base64.RawURLEncoding.EncodeToString(b), nil
}

func CreateSession(ctx context.Context, q sqlc.Querier, userID int64, ttl time.Duration) (string, error) {
    token, err := newToken()
    if err != nil {
        return "", err
    }
    expires := time.Now().UTC().Add(ttl).Format("2006-01-02T15:04:05.000Z")
    if _, err := q.CreateSession(ctx, sqlc.CreateSessionParams{
        Token:     token,
        UserID:    userID,
        ExpiresAt: expires,
    }); err != nil {
        return "", err
    }
    return token, nil
}

func LookupSession(ctx context.Context, q sqlc.Querier, token string) (int64, error) {
    s, err := q.GetSession(ctx, token)
    if errors.Is(err, sql.ErrNoRows) {
        return 0, ErrInvalidSession
    }
    if err != nil {
        return 0, err
    }
    if expired(s.ExpiresAt) {
        _ = q.DeleteSession(ctx, token)
        return 0, ErrInvalidSession
    }
    return s.UserID, nil
}

func DeleteSession(ctx context.Context, q sqlc.Querier, token string) error {
    return q.DeleteSession(ctx, token)
}

func expired(iso string) bool {
    t, err := time.Parse("2006-01-02T15:04:05.000Z", iso)
    if err != nil {
        return true
    }
    return time.Now().UTC().After(t)
}
```

```go
// internal/auth/cookie.go
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
        Expires:  time.Now().Add(cfg.SessionTTL),
        MaxAge:   int(cfg.SessionTTL.Seconds()),
        HttpOnly: true,
        Secure:   cfg.CookieSecure,
        SameSite: http.SameSiteLaxMode,
    })
}

func ClearSessionCookie(w http.ResponseWriter, cfg *config.Config) {
    http.SetCookie(w, &http.Cookie{
        Name:     CookieName,
        Value:    "",
        Path:     "/",
        Expires:  time.Unix(0, 0),
        MaxAge:   -1,
        HttpOnly: true,
        Secure:   cfg.CookieSecure,
        SameSite: http.SameSiteLaxMode,
    })
}
```

```go
// internal/auth/password.go
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

Required sqlc queries in `internal/auth/queries.sql`:

```sql
-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = ?;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = ?;

-- name: CreateSession :one
INSERT INTO sessions (token, user_id, expires_at)
VALUES (?, ?, ?)
RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions WHERE token = ?;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token = ?;
```

### 5.11 Handler convention (handler + sqlc)

Each feature has `handler.go + queries.sql` only. The handler decodes JSON, validates with `validator/v10`, calls sqlc directly, writes JSON.

```go
// internal/jemaat/handler.go (excerpt)
package jemaat

import (
    "database/sql"
    "encoding/json"
    "errors"
    "net/http"
    "strconv"
    "strings"

    "github.com/go-chi/chi/v5"
    "github.com/go-playground/validator/v10"
    "gopkg.in/guregu/null.v4"

    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
    "github.com/<owner>/tatagereja/backend/internal/httpx"
    appmw "github.com/<owner>/tatagereja/backend/internal/middleware"
)

type createRequest struct {
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

type Handler struct {
    q        sqlc.Querier
    validate *validator.Validate
}

func NewHandler(q sqlc.Querier, _ *sql.DB) *Handler {
    return &Handler{q: q, validate: validator.New()}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
    userID := appmw.GetUserID(r)
    limit, offset := httpx.ParsePagination(r)
    query := r.URL.Query().Get("q")

    var rows []sqlc.Jemaat
    var err error
    if query == "" {
        rows, err = h.q.ListJemaat(r.Context(), sqlc.ListJemaatParams{
            UserID: userID, Limit: limit, Offset: offset,
        })
    } else {
        pattern := "%" + escapeLike(query) + "%"
        rows, err = h.q.SearchJemaat(r.Context(), sqlc.SearchJemaatParams{
            UserID: userID, Lower: pattern, Lower_2: pattern, Lower_3: pattern,
            Limit: limit, Offset: offset,
        })
    }
    if err != nil {
        httpx.WriteError(w, http.StatusInternalServerError, "failed to list jemaat")
        return
    }
    total, err := h.q.CountJemaat(r.Context(), userID)
    if err != nil {
        httpx.WriteError(w, http.StatusInternalServerError, "failed to count jemaat")
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
    var req createRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        httpx.WriteError(w, http.StatusBadRequest, "invalid json")
        return
    }
    if err := h.validate.Struct(&req); err != nil {
        httpx.WriteValidationError(w, err)
        return
    }
    row, err := h.q.CreateJemaat(r.Context(), sqlc.CreateJemaatParams{
        UserID:           appmw.GetUserID(r),
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
    row, err := h.q.GetJemaat(r.Context(), sqlc.GetJemaatParams{
        ID: id, UserID: appmw.GetUserID(r),
    })
    if errors.Is(err, sql.ErrNoRows) {
        httpx.WriteError(w, http.StatusNotFound, "not found")
        return
    }
    if err != nil {
        httpx.WriteError(w, http.StatusInternalServerError, "db error")
        return
    }
    httpx.WriteJSON(w, http.StatusOK, row)
}

// Update, Delete similarly.

func escapeLike(s string) string {
    r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
    return r.Replace(s)
}
```

> **When to add `service.go`:** when a handler grows beyond ~40 lines, needs a transaction, or coordinates more than one entity. Move the logic into `service.go` and let `handler.go` shrink back to "decode → call service → encode." **Jadwal bulk-replace** (§5.12) is the first feature where this is justified; do it inline at first if you like, extract when it grows.

### 5.12 Jadwal bulk replace (idempotency)

`PUT /kebaktian/{id}/jadwal` replaces the entire set of slots for that kebaktian.

**Algorithm** (single transaction):
1. Verify kebaktian belongs to caller (404 otherwise).
2. Validate every `service_type_id` and `pelayan_id` in the request belongs to the same user (400 otherwise).
3. `DELETE FROM jadwal_pelayanan WHERE kebaktian_id = ? AND user_id = ?`.
4. For each slot in the request, `INSERT INTO jadwal_pelayanan (...)`.
5. Commit.

Why delete-then-insert rather than upsert: simpler, single transaction, the `UNIQUE (kebaktian_id, service_type_id)` constraint guarantees correctness, and the operation is naturally idempotent.

```go
// internal/jadwal/handler.go (excerpt)
func (h *Handler) Replace(w http.ResponseWriter, r *http.Request) {
    userID := appmw.GetUserID(r)
    kebaktianID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
    if err != nil {
        httpx.WriteError(w, http.StatusBadRequest, "invalid id")
        return
    }

    var req replaceRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        httpx.WriteError(w, http.StatusBadRequest, "invalid json")
        return
    }
    if err := h.validate.Struct(&req); err != nil {
        httpx.WriteValidationError(w, err)
        return
    }

    tx, err := h.db.BeginTx(r.Context(), nil)
    if err != nil {
        httpx.WriteError(w, http.StatusInternalServerError, "tx begin")
        return
    }
    defer tx.Rollback()
    qtx := h.q.WithTx(tx)

    if _, err := qtx.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{
        ID: kebaktianID, UserID: userID,
    }); err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            httpx.WriteError(w, http.StatusNotFound, "not found")
            return
        }
        httpx.WriteError(w, http.StatusInternalServerError, "db error")
        return
    }

    if err := validateSlotRefs(r.Context(), qtx, userID, req.Slots); err != nil {
        httpx.WriteError(w, http.StatusBadRequest, err.Error())
        return
    }

    if err := qtx.DeleteJadwalForKebaktian(r.Context(), sqlc.DeleteJadwalForKebaktianParams{
        KebaktianID: kebaktianID, UserID: userID,
    }); err != nil {
        httpx.WriteError(w, http.StatusInternalServerError, "delete failed")
        return
    }

    for _, s := range req.Slots {
        if _, err := qtx.CreateJadwal(r.Context(), sqlc.CreateJadwalParams{
            UserID:        userID,
            KebaktianID:   kebaktianID,
            ServiceTypeID: s.ServiceTypeID,
            PelayanID:     s.PelayanID,
            Catatan:       s.Catatan,
        }); err != nil {
            httpx.WriteError(w, http.StatusInternalServerError, "insert failed")
            return
        }
    }
    if err := tx.Commit(); err != nil {
        httpx.WriteError(w, http.StatusInternalServerError, "commit failed")
        return
    }
    w.WriteHeader(http.StatusNoContent)
}
```

### 5.13 Health check

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
    }
    httpx.WriteJSON(w, status, map[string]any{
        "status": map[bool]string{true: "ok", false: "degraded"}[status == 200],
        "db":     dbStatus,
    })
}
```

### 5.14 Response helpers

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

### 5.15 `cmd/seed-admin/main.go`

Bootstrap CLI for creating a user (one user = one church account):

```bash
DATABASE_URL=file:./local.db go run ./cmd/seed-admin \
    --email=admin@example.com \
    --password=... \
    --display-name="Pak Budi" \
    --church-name="GKI Demo" \
    --timezone="Asia/Jakarta"
```

Implementation: open DB, apply schema, hash password, INSERT INTO users.

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
    "tailwind-merge": "^2.0.0",
    "vaul-svelte": "^0.3.0"
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

**shadcn-svelte:** not an npm install. Use the CLI to copy components:

```bash
npx shadcn-svelte@latest init
npx shadcn-svelte@latest add button input label table dialog sheet drawer select form sonner card dropdown-menu
```

### 6.3 `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte()],
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
  build: { target: 'es2022', sourcemap: true },
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

### 6.5 Auth store

```typescript
// src/lib/stores/auth.svelte.ts
import { apiClient, ApiError } from '$lib/api/client';
import { push } from 'svelte-spa-router';

export type User = {
  id: number;
  email: string;
  display_name: string;
  church_name: string;
  timezone: string;
};

class AuthStore {
  user = $state<User | null>(null);
  /** true after first restore() completes — used to gate router & UI */
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
      const me = await apiClient.get<{ user: User }>('/me');
      this.user = me.user;
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
  return auth.user?.timezone ?? 'Asia/Jakarta';
}

/** Format a UTC ISO string in the user's timezone. */
export function formatDateTime(utc: string, fmt = 'EEEE, d MMM yyyy HH:mm'): string {
  return formatInTimeZone(utc, tz(), fmt);
}

/** Parse a local datetime input into a UTC ISO string. */
export function localToUTC(local: string): string {
  const zoned = toZonedTime(local, tz());
  return zoned.toISOString();
}
```

`<input type="datetime-local">` returns a wall-clock string with no timezone; treat it as user-local and convert to UTC on submit. Display goes the other way.

### 6.8 Form pattern (native + Zod)

```svelte
<script lang="ts">
  import { z } from 'zod';
  import { useCreateJemaat } from '$lib/api/jemaat';
  import { ApiError } from '$lib/api/client';

  const schema = z.object({
    nama_lengkap: z.string().min(1, 'Wajib diisi').max(200),
    email: z.string().email('Format email salah').max(200).optional().or(z.literal('')),
  });

  let form = $state({ nama_lengkap: '', email: '' });
  let errors = $state<Record<string, string>>({});
  let submitting = $state(false);

  const create = useCreateJemaat();

  async function submit() {
    errors = {};
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      errors = Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message]));
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
  <!-- inputs bound to form.*, errors shown from errors.* -->
</form>
```

### 6.9 Other frontend conventions

- All API calls via `apiClient`; no raw `fetch` in components.
- All server state via TanStack Query.
- No `any`. Use `unknown` and narrow.
- User-facing Indonesian strings live inline in components for MVP. Extract to an i18n file only when (and if) a second language is added.

### 6.10 Mobile-first design conventions

The app is designed for a phone first; desktop is a progressive enhancement.

**Breakpoints (Tailwind defaults, used as layer-up only):**

| Prefix | Width   | Used for |
|--------|---------|----------|
| (none) | < 640px | Default. All base styles target this. |
| `sm:`  | ≥ 640px | Large phone / small tablet adjustments. |
| `md:`  | ≥ 768px | Tablet. Sidebar appears, tables replace card lists. |
| `lg:`  | ≥ 1024px| Desktop. Multi-column layouts. |

Rule: never write a desktop style without a breakpoint prefix. Base classes describe the phone.

**App chrome:**

- **`< md`:** top bar with hamburger + page title; **bottom nav** with 4–5 primary destinations (Dashboard, Jemaat, Kebaktian, Jadwal, More). Hamburger opens a left `Sheet`.
- **`≥ md`:** persistent left sidebar, no bottom nav.

**Layout patterns:**

- **Lists:** card list on `< md` (one card per row, key fields stacked), `Table` on `≥ md`. Don't horizontally scroll a desktop table on mobile — it loses context.
- **Create / edit forms:** `vaul-svelte` bottom `Drawer` on `< md`, shadcn `Dialog` on `≥ md`. Same form component, different container.
- **Filters / detail panels:** shadcn `Sheet` from the right edge on all sizes; full-height on mobile, fixed-width on desktop.
- **Destructive confirmations:** `Drawer` on mobile (thumb-reachable), `AlertDialog` on desktop.

**Touch & input:**

- Tap targets: `min-h-11 min-w-11` (44px) for any actionable element.
- Body text: `text-base` (16px) on mobile to prevent iOS zoom-on-focus for inputs.
- Inputs: set proper `inputmode` and `autocomplete` (`inputmode="email"`, `autocomplete="tel"`, etc.). Use `type="date"` / `type="datetime-local"` — native pickers beat any custom widget on mobile.
- Sticky form actions: primary submit pinned to bottom of `Drawer` with `safe-area-inset-bottom` padding.

**Performance:**

- No heavy desktop-only components loaded on mobile. If a component (e.g., a rich `JadwalEditor` grid) is desktop-shaped, dynamic-import it behind an `md:` breakpoint guard, and render a simpler mobile editor below `md`.

---

## 7. Authentication

### 7.1 Flow

1. User submits email + password to `POST /auth/login`.
2. Backend verifies bcrypt hash. On success:
   - `INSERT INTO sessions (token, user_id, expires_at)` with a random opaque token (32 bytes, base64-url).
   - Sets `tatagereja_session` cookie: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/`.
   - Returns `{ user }` payload.
3. Every authenticated request: `RequireAuth` middleware reads cookie, looks up session, sets `user_id` in request context.
4. When the session expires, the user is redirected to `/login`. No refresh flow.
5. Logout: `POST /auth/logout` → `DELETE FROM sessions WHERE token = ?` + clear cookie.

### 7.2 Why this is enough for MVP

- One person per account. Re-login weekly is fine.
- No JWT secret to rotate, no refresh tokens, no token revocation list — logout is a single DELETE.
- httpOnly cookie = JS can't read it → XSS can't steal it.
- Same-origin in dev (via Vite proxy) and single-domain in prod — `SameSite=Lax` is sufficient.

### 7.3 Initial admin provisioning

Owner runs `cmd/seed-admin` against the local DB to create a user — see §5.15.

### 7.4 Password reset (POST-MVP)

Deferred. For MVP, owner resets passwords manually via a small CLI tool (`cmd/reset-password`) or direct SQL.

---

## 8. API Contract

### 8.1 Conventions

- Base URL: `http://localhost:8080` (dev).
- Content type: `application/json` for everything.
- Auth: httpOnly cookie `tatagereja_session`. No `Authorization: Bearer` fallback.
- Errors: `{ "error": "msg", "fields"?: { "field_name": "tag" } }`.
- Pagination: `?limit=50&offset=0`. Responses: `{ "data": [...], "total": N, "limit": N, "offset": N }`.
- Timestamps: UTC ISO 8601 with `Z` suffix. Dates: `YYYY-MM-DD`.
- IDs: integers.

### 8.2 Endpoints

#### Auth

| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | `/auth/login` | `{ email, password }` | `{ user }` + sets cookie | No |
| POST | `/auth/logout` | — | `204` | No (clears cookie) |
| GET | `/me` | — | `{ user }` | Yes |

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
| GET | `/pelayan` | List, each with jemaat info + service types |
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
| DELETE | `/service-types/{id}` | Delete; returns 409 if referenced by any jadwal row |

#### Kebaktian + Jadwal

| Method | Path | Description |
|--------|------|-------------|
| GET | `/kebaktian?from=&to=` | List in UTC date range, inclusive |
| POST | `/kebaktian` | Create. `waktu_mulai` is UTC ISO 8601 |
| GET | `/kebaktian/{id}` | Detail |
| PUT | `/kebaktian/{id}` | Update |
| DELETE | `/kebaktian/{id}` | Delete (cascades jadwal) |
| GET | `/kebaktian/{id}/jadwal` | Slots with embedded service_type + pelayan info |
| PUT | `/kebaktian/{id}/jadwal` | **Idempotent replace** of all slots (§5.12) |

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

Each `service_type_id` must appear at most once in the array (enforced by `UNIQUE`).

### 8.3 Error codes

| Status | Meaning |
|--------|---------|
| 400 | Bad request, validation failure (with `fields`), bad JSON |
| 401 | Not authenticated |
| 404 | Not found (also when row belongs to another user — never leak this) |
| 409 | Conflict (unique constraint, FK constraint, dependent rows) |
| 500 | Server error |

---

## 9. Validation Rules

Server-side validation via `validator/v10` tags on request structs. Frontend mirrors with Zod.

### 9.1 Auth

| Field | Rules |
|-------|-------|
| `email` | required, valid email, max 200 |
| `password` (login) | required, min 1 (no restriction on login — just compare) |

### 9.2 Jemaat

| Field | Rules |
|-------|-------|
| `nama_lengkap` | **required**, 1–200 chars |
| `nama_panggilan` | optional, max 100 |
| `jenis_kelamin` | optional, one of `L`, `P` |
| `tanggal_lahir` | optional, `YYYY-MM-DD`, valid date, not in future |
| `tempat_lahir` | optional, max 100 |
| `alamat` | optional, max 500 |
| `nomor_telepon` | optional, max 30; allow `+`, digits, spaces, `-` |
| `email` | optional, valid email format, max 200 |
| `status_pernikahan` | optional, one of `belum_menikah`, `menikah`, `cerai`, `duda`, `janda` |
| `tanggal_baptis` | optional, `YYYY-MM-DD`, not in future |
| `tanggal_sidi` | optional, `YYYY-MM-DD`, not in future, ≥ `tanggal_baptis` if both set |
| `keluarga_id` | optional, must reference existing keluarga of same user |
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
| `nama` | required, 1–100 chars, unique per user |
| `deskripsi` | optional, max 500 |
| `urutan` | optional integer, default 0 |

### 9.5 Pelayan

| Field | Rules |
|-------|-------|
| `jemaat_id` | required, must exist for same user |
| `catatan` | optional, max 2000 |
| `service_type_ids` | array of IDs, each must exist for same user; duplicates rejected |

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
| `service_type_id` | required, must exist for same user; unique across slots in the request |
| `pelayan_id` | optional (null = empty slot); if set, must exist for same user |
| `catatan` | optional, max 500 |

---

## 10. Development Environment

> Contributors set up tooling locally: Go 1.23+, Node 20+, `sqlc`, `air`.

### 10.1 `Makefile`

```makefile
.PHONY: help setup dev dev-fe dev-be build test lint clean sqlc seed-admin

help:
	@echo "Tata Gereja dev commands:"
	@echo "  make setup        — install deps (run once)"
	@echo "  make dev          — run frontend + backend in parallel"
	@echo "  make dev-fe       — frontend only"
	@echo "  make dev-be       — backend only (with air hot reload)"
	@echo "  make build        — production build"
	@echo "  make test         — run all tests"
	@echo "  make lint         — lint all code"
	@echo "  make sqlc         — regenerate Go DB code"
	@echo "  make seed-admin   — interactive user creation"

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
  include_ext = ["go", "sql"]
  kill_delay = "0s"
  stop_on_error = true
```

### 10.3 Local env

`backend/.env.example`:

```
PORT=8080
APP_ENV=development
DATABASE_URL=file:./local.db?_pragma=foreign_keys(1)
SESSION_TTL_HOURS=168
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
make setup
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
make seed-admin   # creates the initial user
make dev
# http://localhost:5173
```

`schema.sql` is applied on backend startup; no separate migrate step. To wipe the dev DB: `rm backend/local.db && make dev`.

---

## 11. Testing Strategy

### 11.1 Backend

**Test DB factory** in `tests/testutil/db.go`:

```go
package testutil

import (
    "database/sql"
    "testing"

    "github.com/<owner>/tatagereja/backend/internal/db"
    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
)

// NewTestDB creates an in-memory SQLite DB with schema applied.
func NewTestDB(t *testing.T) (*sql.DB, *sqlc.Queries) {
    t.Helper()
    database, err := db.Open(":memory:")
    if err != nil { t.Fatal(err) }
    if err := db.Apply(database); err != nil { t.Fatal(err) }
    t.Cleanup(func() { database.Close() })
    return database, sqlc.New(database)
}

// SeedTwoUsers creates two users for isolation tests. Returns their IDs.
func SeedTwoUsers(t *testing.T, q *sqlc.Queries) (u1, u2 int64) {
    // ... INSERT INTO users
}
```

**Required test categories** for every domain feature:
1. **Happy path** — create, read, update, delete all work.
2. **Cross-user isolation** — call X's endpoint as user Y. Must return 404. Enforced via `tests/integration/cross_user_test.go`.
3. **Validation** — missing required field, oversized field, malformed date.
4. **Auth** — request without cookie → 401.

Example cross-user test:

```go
func TestJemaat_CrossUserReturns404(t *testing.T) {
    _, q := testutil.NewTestDB(t)
    u1, u2 := testutil.SeedTwoUsers(t, q)

    // Create a jemaat owned by u1
    j, _ := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
        UserID: u1, NamaLengkap: "Budi",
    })

    // Try to read it as u2
    _, err := q.GetJemaat(ctx, sqlc.GetJemaatParams{
        ID: j.ID, UserID: u2,
    })
    if !errors.Is(err, sql.ErrNoRows) {
        t.Fatalf("expected sql.ErrNoRows, got %v", err)
    }
}
```

### 11.2 Frontend

- Vitest for unit tests of date helpers, format utils, Zod schemas.
- Component tests are NOT required at MVP. Cross-user tests live on the backend where it matters.

---

## 12. Open Source Housekeeping

### 12.1 LICENSE

MIT. Single file `LICENSE` at repo root.

### 12.2 README.md skeleton

```markdown
# Tata Gereja

> Aplikasi manajemen jemaat & jadwal pelayanan untuk gereja kecil di Indonesia.
> Open source, gratis, ringan. Proyek hobi.

⚠️ **Proyek hobi — no SLA, no warranty.** MVP berjalan secara lokal saja;
self-hosting docs akan menyusul.

## Fitur (v1)

- Data jemaat (nama, kontak, tanggal lahir, baptis, sidi)
- Pengelompokan keluarga
- Daftar pelayan + jenis pelayanan
- Jadwal pelayanan per kebaktian
- Satu akun per gereja (satu user = satu gereja)

## Tech stack

- Frontend: Svelte 5 + Vite + Tailwind
- Backend: Go (chi + sqlc), DB-backed sessions
- Database: SQLite (file lokal)

## Convention: handler + sqlc

Setiap fitur backend hanya punya dua file: `handler.go` dan `queries.sql`.
Service layer (`service.go`) ditambahkan **belakangan**, hanya saat handler
butuh logika lintas-entitas atau transaksi yang nontrivial. **Jadwal
bulk-replace** adalah kandidat pertama. Lihat `docs/ADD_FEATURE.md`.

## Development

```bash
git clone https://github.com/<owner>/tatagereja
cd tatagereja
make setup
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
make seed-admin
make dev
# http://localhost:5173
```

To wipe the dev DB: `rm backend/local.db && make dev`.

## License

MIT
```

### 12.3 Other files

- `CONTRIBUTING.md` — local setup, branch naming (`feat/`, `fix/`, `docs/`), PR checklist.
- `docs/ADD_FEATURE.md` — recipe: edit schema → write queries → `make sqlc` → write handler → register route → write tests → frontend types → API hook → page.

### 12.4 `.gitignore` (root)

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
```

---

## 13. MVP Scope & Phases

### Phase 0 — Foundation

- [ ] Monorepo scaffolded
- [ ] `schema.sql` finalized
- [ ] sqlc generation working
- [ ] Schema applies on boot
- [ ] `/health` returns DB status
- [ ] Login → DB session → cookie → `/me` working end-to-end
- [ ] Frontend login page + dashboard skeleton + boot splash

**Done when:** owner runs `make dev`, logs in locally, sees an empty dashboard.

### Phase 1 — Jemaat + Keluarga CRUD

- [ ] Backend: jemaat CRUD + search
- [ ] Backend: keluarga CRUD
- [ ] Frontend: jemaat list with search + pagination
- [ ] Frontend: jemaat create/edit/detail
- [ ] Frontend: keluarga list + assign jemaat to keluarga
- [ ] Cross-user isolation tests passing

**Done when:** owner adds 50 dummy jemaat across 10 keluarga and finds them.

### Phase 2 — Pelayan + Service Types

- [ ] Backend: service_types CRUD
- [ ] Backend: pelayan CRUD with service-type relationships
- [ ] Frontend: service-types admin page
- [ ] Frontend: pelayan list, "promote jemaat to pelayan" flow
- [ ] Frontend: edit pelayan's service types

**Done when:** owner marks 10 jemaat as pelayan with 2–3 service types each.

### Phase 3 — Jadwal Pelayanan

- [ ] Backend: kebaktian CRUD
- [ ] Backend: jadwal bulk-replace (idempotent, transactional)
- [ ] Frontend: kebaktian list/calendar
- [ ] Frontend: per-kebaktian schedule editor (service types as rows, pelayan dropdowns)
- [ ] Frontend: per-pelayan "kapan saya bertugas"

**Done when:** owner creates 4 upcoming Sundays with full schedule and views a "this week" summary.

### Phase 4 — Polish & v0.2 ideas

- [ ] Export to Excel/CSV
- [ ] Print-friendly schedule view
- [ ] Password reset CLI
- [ ] Birthday widget on dashboard
- [ ] Recurring kebaktian templates

---

## 14. Non-Negotiable Rules

### 14.1 User-data isolation (most important)

1. Every domain table has `user_id NOT NULL`.
2. Every query filters by `user_id` from the authenticated session.
3. Never accept `user_id` from request body or URL params.
4. Return 404 (not 403) when an ID exists but belongs to another user.
5. `tests/integration/cross_user_test.go` is required and must cover every entity.

### 14.2 Security baseline

1. Passwords hashed with bcrypt cost ≥ 12.
2. Session tokens are 32+ bytes of cryptographic random (`crypto/rand`), opaque, stored in the `sessions` table.
3. Cookies: `HttpOnly`, `Secure` in prod, `SameSite=Lax`.
4. CORS allowlist explicit; never `*` with credentials.
5. Validate all inputs server-side, regardless of frontend.
6. Parameterized queries only (sqlc enforces).
7. Never log passwords, tokens, or auth-endpoint bodies.

### 14.3 Database portability

1. Stick to SQLite-standard SQL.
2. `schema.sql` is the single source of truth.
3. Schema is applied idempotently on every boot.

### 14.4 Code quality

1. `go test ./...` passes before merge.
2. `golangci-lint run` passes.
3. `svelte-check` passes.
4. `sqlc generate` produces no diff against committed code.
5. No `panic()` in handlers.
6. `slog` for structured logging.
7. Wrap errors with `fmt.Errorf("context: %w", err)`.

### 14.5 API consistency

1. All responses JSON.
2. All errors `{ "error": "...", "fields"?: {...} }`.
3. Timestamps ISO 8601 UTC with `Z`.
4. List endpoints paginated.
5. POST → created resource. PUT → updated resource. DELETE → 204.

### 14.6 Frontend conventions

1. All API calls via `apiClient`.
2. All server state via TanStack Query.
3. All forms via native + Zod.
4. No `any` in TypeScript.
5. `$state` / `$derived` (Svelte 5 runes) only.

### 14.7 Git hygiene

1. `main` always runnable locally.
2. Feature branches: `feat/<name>`.
3. PR required for non-trivial changes.
4. Squash merge.

### 14.8 Privacy & data ownership

1. README declares hobby-project status.
2. `ON DELETE CASCADE` on `users` wipes everything for that user.

---

## 15. Out of Scope

- Deployment, hosting, self-hosting guides (deferred entirely)
- Public self-signup / SaaS billing
- Multi-user per account (multi-admin, roles, permissions)
- Email sending
- Push notifications
- Mobile native apps
- Real-time websockets
- File uploads (photos)
- i18n beyond inline Indonesian strings
- Sermon / financial / attendance management
- Audit log
- Atlas / golang-migrate (defer until real data and schema changes need versioning)
- Skill levels for pelayan
- Color-coded service types
- Bundle size CI checks

---

## 16. Glossary

- **Jemaat** — church member.
- **Keluarga** — family unit; groups jemaat into a household.
- **Pelayan** — volunteer who performs roles in services.
- **Kebaktian** — Sunday worship service or weekday fellowship event.
- **Persekutuan** — fellowship gathering (a subset of kebaktian semantically).
- **Jadwal Pelayanan** — schedule assigning pelayan to roles in a kebaktian.
- **Sidi** — confirmation (Protestant tradition).
- **Service Type** — role in a service (worship leader, singer, multimedia, usher, etc.).

---

## 17. Implementation Checklist for AI Agent

Complete in order. Each step is independently verifiable.

1. **Monorepo bootstrap** — folders, `git init`, `.gitignore`, `LICENSE`, `README.md`, `Makefile`, `.editorconfig`.
2. **Backend skeleton** — `go.mod`, `cmd/server/main.go` (minimal), `internal/config/`, `internal/router/`, `internal/health/`. `make dev-be` starts on :8080. `/health` returns DB-ok.
3. **Frontend skeleton** — Vite + Svelte 5 + TS + Tailwind. `make dev-fe` starts on :5173; `/api/health` proxied.
4. **Database layer** — write `schema.sql`, `sqlc.yaml`, `internal/db/conn.go`, `internal/db/sync.go`. `make sqlc` works. App boots, schema applies.
5. **Auth** — session token + cookie, password hashing, `internal/auth/{handler,session,cookie,password,queries.sql}.go`, `RequireAuth` middleware, `cmd/seed-admin/main.go`.
6. **Frontend auth** — login page, auth store with `bootResolved` splash, `apiClient` with `credentials: 'include'`, protected route guard.
7. **End-to-end smoke** — log in, hit `/me`, see user data. Commit & tag `v0.0.1-skeleton`.
8. **Keluarga CRUD** — backend + frontend.
9. **Jemaat CRUD** — backend + frontend with search.
10. **Cross-user isolation test suite** — at least jemaat and keluarga covered.
11. **Service Types CRUD** — backend + frontend admin page.
12. **Pelayan CRUD** — backend + frontend.
13. **Kebaktian + Jadwal** — backend bulk-replace + frontend editor.
14. **Polish** — empty states, error toasts, loading skeletons, mobile responsive.
15. **Tag `v1.0.0`**.

After each step: `make lint test build` must be green.

---

End of plan.
