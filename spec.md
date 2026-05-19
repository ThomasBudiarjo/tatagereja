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
6. [HTMX & Template Implementation](#6-htmx--template-implementation)
7. [Authentication](#7-authentication)
8. [Route Contract](#8-route-contract)
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
- **Multiple users on one shared SQLite Cloud database.** Every domain row is scoped by `user_id`. Data of one user/church MUST NEVER leak to another.
- **No SLA.** Hobby project. Users are informed via README and an in-app disclaimer.
- **Deployed to Heroku Eco Dyno.** Single Go binary serves HTML, CSS, and JS. No separate frontend server.

### 1.4 Non-goals

See [§15 Out of Scope](#15-out-of-scope).

---

## 2. Architecture & Stack

### 2.1 High-level diagram

```
Browser (HTMX)
      │
      │  HTTP — full HTML pages or partial fragments
      ▼
Go HTTP Server (Chi)
  - html/template server-side rendering
  - Session cookie auth
  - sqlc + feature folders
      │
      │  database/sql (sqlitecloud driver)
      ▼
SQLite Cloud
```

No separate frontend server. Go serves HTML pages, static assets, and HTMX fragments — all from one binary on one port.

### 2.2 Stack decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Rendering | **Go `html/template`** + **HTMX 2.x** (CDN) | Server-rendered HTML; HTMX adds interactivity without a JS build step. |
| Styling | **Tailwind CSS** (CDN via `<script src="https://cdn.tailwindcss.com">`) | Same utility-first approach; no npm/build step for CSS. |
| Extra interactivity | Vanilla JS inline where needed (dropdowns, date pickers) | No JS framework. |
| Backend language | **Go 1.23+** | Fast startup, single binary, low memory — ideal for Eco Dyno. |
| Backend router | **chi/v5** | Idiomatic, lightweight, composable middleware. |
| Database | **SQLite Cloud** | Persistent cloud database; survives Eco Dyno sleep cycles and restarts. |
| DB driver | **`github.com/sqlitecloud/sqlitecloud-go`** | Official SQLite Cloud driver for `database/sql`. |
| DB queries | **sqlc** | Type-safe Go from plain SQL. |
| Backend nullable types | **`gopkg.in/guregu/null.v4`** | Clean scan from nullable columns. |
| Backend auth | **DB-backed session token** + **bcrypt** | Opaque token in `sessions` table; cookie carries it. |
| Backend validation | **`go-playground/validator/v10`** | Standard. |
| Hot reload (Go) | **air** | Watch & rebuild. |
| Deployment | **Heroku Eco Dyno** | Single binary, single `Procfile`. |

### 2.3 Why these choices

- **HTMX over SPA:** removes the entire frontend build toolchain (Node, npm, Vite, TypeScript compiler). Go handles routing, auth, rendering, and data — one process, one binary. No CORS needed since everything is same-origin.
- **Tailwind CDN:** zero npm. Acceptable for a hobby project with minimal traffic. Switch to standalone CLI build if bundle size ever matters.
- **SQLite Cloud over local SQLite file:** Heroku Eco Dynos have ephemeral filesystems — a local `.db` file is wiped on every restart. SQLite Cloud persists data externally while keeping the SQLite SQL dialect (sqlc still works unchanged).
- **DB sessions over JWT:** simpler. One opaque token per login. Logout = `DELETE FROM sessions WHERE token=?`.
- **handler + sqlc only:** for CRUD, handlers call sqlc directly. Extract a `service.go` only when a feature has real logic (transactions, cross-entity validation). Jadwal bulk-replace is the first candidate (§5.10).

---

## 3. Repository Structure

```
tatagereja/
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
│   │   ├── templates/               # Go html/template files (embedded)
│   │   │   ├── layout.html          # base layout: <head>, nav, footer
│   │   │   ├── login.html
│   │   │   ├── dashboard.html
│   │   │   ├── jemaat/
│   │   │   │   ├── list.html
│   │   │   │   ├── detail.html
│   │   │   │   └── form.html        # shared create/edit form partial
│   │   │   ├── keluarga/
│   │   │   │   ├── list.html
│   │   │   │   ├── detail.html
│   │   │   │   └── form.html
│   │   │   ├── pelayan/
│   │   │   │   ├── list.html
│   │   │   │   ├── detail.html
│   │   │   │   └── form.html
│   │   │   ├── servicetypes/
│   │   │   │   └── list.html        # inline edit; no separate detail page
│   │   │   └── kebaktian/
│   │   │       ├── list.html
│   │   │       ├── detail.html
│   │   │       ├── form.html
│   │   │       └── jadwal.html      # jadwal editor
│   │   ├── auth/
│   │   │   ├── session.go
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
│   │   │   ├── auth.go
│   │   │   └── logging.go
│   │   ├── httpx/
│   │   │   ├── render.go            # template renderer
│   │   │   ├── flash.go             # cookie-based flash messages
│   │   │   ├── pagination.go
│   │   │   └── validator.go
│   │   └── router/
│   │       └── router.go
│   ├── tests/
│   │   ├── integration/
│   │   │   ├── jemaat_test.go
│   │   │   ├── jadwal_test.go
│   │   │   └── cross_user_test.go   # CRITICAL: 404 across users
│   │   └── testutil/
│   │       └── db.go                # in-memory SQLite factory (uses modernc.org/sqlite)
│   ├── sqlc.yaml
│   ├── .air.toml
│   ├── go.mod
│   ├── go.sum
│   ├── .env.example
│   └── .gitignore
├── Procfile                         # web: ./bin/server
├── .gitignore
├── LICENSE                          # MIT
├── Makefile
└── README.md
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
- **`kebaktian.waktu_mulai` stored as UTC.** The server converts to/from the user's timezone (`users.timezone`) for display (`time.LoadLocation`) and form input parsing.
- **`tanggal_lahir`, `tanggal_baptis`, `tanggal_sidi` are calendar dates.** Stored as `YYYY-MM-DD`.

### 4.4 Schema sync

On startup the server executes `schema.sql` as embedded bytes. All `CREATE TABLE` use `IF NOT EXISTS`:

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

**Schema changes during dev:** edit `schema.sql`, drop & recreate the SQLite Cloud database, restart. When real data exists and altering in place is required, a migration tool is added at that point.

### 4.5 Full `schema.sql`

```sql
-- ============================================================
-- Tata Gereja schema.sql — SQLite dialect
-- Source of truth for sqlc and the boot-time sync.
-- All CREATE TABLE use IF NOT EXISTS (idempotent).
-- Timestamps are UTC ISO 8601 strings. Booleans are INTEGER 0/1.
-- ============================================================

PRAGMA foreign_keys = ON;

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

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

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

CREATE TABLE IF NOT EXISTS kebaktian (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
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
    UNIQUE (kebaktian_id, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_jadwal_user_id ON jadwal_pelayanan(user_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_kebaktian_id ON jadwal_pelayanan(kebaktian_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_pelayan_id ON jadwal_pelayanan(pelayan_id);
```

### 4.6 Notes on the schema

- **`waktu_mulai`** stored as UTC. Server formats with `time.In(loc)` using `user.timezone` for display. `<input type="datetime-local">` value is parsed as user-local time, then converted to UTC before saving.
- **`UNIQUE (kebaktian_id, service_type_id)`** enables the idempotent bulk-replace in §5.10.
- **`ON DELETE CASCADE` everywhere `user_id` points.** Deleting a user wipes their data cleanly.
- **`ON DELETE SET NULL`** for `pelayan_id` in `jadwal_pelayanan`: removing a pelayan empties slots without destroying historical schedules.

### 4.7 sqlc query files (per feature folder)

Queries live next to their handlers, e.g. `internal/jemaat/queries.sql`:

```sql
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
    github.com/go-chi/chi/v5                    v5.x
    github.com/sqlitecloud/sqlitecloud-go        v1.x   // SQLite Cloud driver
    modernc.org/sqlite                           v1.x   // in-memory DB for tests only
    golang.org/x/crypto                          v0.x   // bcrypt
    github.com/go-playground/validator/v10       v10.x
    gopkg.in/guregu/null.v4                      v4.x
)
```

No `go-chi/cors` — Go serves everything from one origin.

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
    "time"
)

type Config struct {
    Port         string
    Env          string // "development" | "production"
    DatabaseURL  string
    SessionTTL   time.Duration
    CookieSecure bool
    LogLevel     string
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
    cfg.SessionTTL = time.Duration(ttlHours) * time.Hour
    cfg.CookieSecure = cfg.Env == "production"

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

    _ "github.com/sqlitecloud/sqlitecloud-go" // registers "sqlitecloud" driver
)

// Open connects to SQLite Cloud. Connection string format:
//   sqlitecloud://apikey@host.sqlite.cloud:8860/database
//
// For local development pointing at a local file (tests use a separate path),
// set DATABASE_URL to a sqlitecloud:// URI from the SQLite Cloud dashboard.
func Open(url string) (*sql.DB, error) {
    db, err := sql.Open("sqlitecloud", url)
    if err != nil {
        return nil, fmt.Errorf("open db: %w", err)
    }

    // foreign_keys must be enabled per connection.
    if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
        return nil, fmt.Errorf("enable foreign keys: %w", err)
    }

    // SQLite Cloud handles concurrency server-side; a small pool is fine.
    db.SetMaxOpenConns(5)
    db.SetMaxIdleConns(2)
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

// Apply executes schema.sql against the database. All CREATE TABLE statements
// use IF NOT EXISTS, so this is idempotent and safe to call on every boot.
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

    "github.com/<owner>/tatagereja/backend/internal/auth"
    "github.com/<owner>/tatagereja/backend/internal/config"
    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
    "github.com/<owner>/tatagereja/backend/internal/health"
    "github.com/<owner>/tatagereja/backend/internal/httpx"
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
    renderer := httpx.NewRenderer()

    r := chi.NewRouter()
    r.Use(chimiddleware.RequestID)
    r.Use(chimiddleware.RealIP)
    r.Use(appmw.Logging)
    r.Use(chimiddleware.Recoverer)
    r.Use(chimiddleware.Timeout(30 * time.Second))

    // Public
    r.Get("/health", health.New(database).Handle)
    ah := auth.NewHandler(cfg, queries, database, renderer)
    r.Get("/login", ah.LoginPage)
    r.Post("/login", ah.Login)
    r.Post("/logout", ah.Logout)

    // Authenticated
    r.Group(func(r chi.Router) {
        r.Use(appmw.RequireAuth(queries))

        r.Get("/", func(w http.ResponseWriter, r *http.Request) {
            http.Redirect(w, r, "/jemaat", http.StatusFound)
        })

        jh := jemaat.NewHandler(queries, database, renderer)
        r.Route("/jemaat", func(r chi.Router) {
            r.Get("/", jh.List)
            r.Get("/new", jh.New)
            r.Post("/", jh.Create)
            r.Get("/{id}", jh.Detail)
            r.Get("/{id}/edit", jh.Edit)
            r.Put("/{id}", jh.Update)
            r.Delete("/{id}", jh.Delete)
        })

        kh := keluarga.NewHandler(queries, database, renderer)
        r.Route("/keluarga", func(r chi.Router) {
            r.Get("/", kh.List)
            r.Get("/new", kh.New)
            r.Post("/", kh.Create)
            r.Get("/{id}", kh.Detail)
            r.Get("/{id}/edit", kh.Edit)
            r.Put("/{id}", kh.Update)
            r.Delete("/{id}", kh.Delete)
        })

        ph := pelayan.NewHandler(queries, database, renderer)
        r.Route("/pelayan", func(r chi.Router) {
            r.Get("/", ph.List)
            r.Get("/new", ph.New)
            r.Post("/", ph.Create)
            r.Get("/{id}", ph.Detail)
            r.Get("/{id}/edit", ph.Edit)
            r.Put("/{id}", ph.Update)
            r.Delete("/{id}", ph.Delete)
        })

        sth := servicetypes.NewHandler(queries, database, renderer)
        r.Route("/service-types", func(r chi.Router) {
            r.Get("/", sth.List)
            r.Post("/", sth.Create)
            r.Get("/{id}/edit", sth.Edit)
            r.Put("/{id}", sth.Update)
            r.Delete("/{id}", sth.Delete)
        })

        kbh := kebaktian.NewHandler(queries, database, renderer)
        jdh := jadwal.NewHandler(queries, database, renderer)
        r.Route("/kebaktian", func(r chi.Router) {
            r.Get("/", kbh.List)
            r.Get("/new", kbh.New)
            r.Post("/", kbh.Create)
            r.Get("/{id}", kbh.Detail)
            r.Get("/{id}/edit", kbh.Edit)
            r.Put("/{id}", kbh.Update)
            r.Delete("/{id}", kbh.Delete)
            r.Get("/{id}/jadwal", jdh.Editor)
            r.Post("/{id}/jadwal", jdh.Save)
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
)

type ctxKey int

const UserIDKey ctxKey = iota
const UserKey ctxKey = iota + 1

func RequireAuth(q sqlc.Querier) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            c, err := r.Cookie(auth.CookieName)
            if err != nil || c.Value == "" {
                http.Redirect(w, r, "/login", http.StatusFound)
                return
            }
            userID, err := auth.LookupSession(r.Context(), q, c.Value)
            if err != nil {
                auth.ClearSessionCookie(w, nil) // clears stale cookie
                http.Redirect(w, r, "/login", http.StatusFound)
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

### 5.9 Sessions, password, cookie

These are unchanged from the original design. See §7 for the auth flow.

```go
// internal/auth/session.go — token generation, CreateSession, LookupSession, DeleteSession
// internal/auth/cookie.go  — SetSessionCookie, ClearSessionCookie
// internal/auth/password.go — HashPassword (bcrypt cost 12), VerifyPassword
```

Required `internal/auth/queries.sql`:

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

### 5.10 Handler convention

Each feature has `handler.go + queries.sql`. The handler parses form values (not JSON), validates with `validator/v10`, calls sqlc, then either redirects (PRG) or re-renders with errors.

```go
// internal/jemaat/handler.go (excerpt)
type Handler struct {
    q        sqlc.Querier
    db       *sql.DB
    r        *httpx.Renderer
    validate *validator.Validate
}

func NewHandler(q sqlc.Querier, db *sql.DB, r *httpx.Renderer) *Handler {
    return &Handler{q: q, db: db, r: r, validate: validator.New()}
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
            UserID: userID, NamaLengkap: pattern, NamaPanggilan: pattern, Email: pattern,
            Limit: limit, Offset: offset,
        })
    }
    if err != nil {
        h.r.Error(w, r, http.StatusInternalServerError, err)
        return
    }
    total, _ := h.q.CountJemaat(r.Context(), userID)
    h.r.Page(w, r, "jemaat/list", map[string]any{
        "Rows":   rows,
        "Total":  total,
        "Limit":  limit,
        "Offset": offset,
        "Query":  query,
        "Flash":  httpx.PopFlash(w, r),
    })
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
    if err := r.ParseForm(); err != nil {
        http.Error(w, "bad request", http.StatusBadRequest)
        return
    }
    req := parseJemaatForm(r)
    if errs := h.validate.Struct(req); errs != nil {
        h.r.Page(w, r, "jemaat/form", map[string]any{
            "Form":   req,
            "Errors": httpx.ValidationErrors(errs),
            "Action": "create",
        })
        return
    }
    if _, err := h.q.CreateJemaat(r.Context(), toCreateParams(appmw.GetUserID(r), req)); err != nil {
        h.r.Error(w, r, http.StatusInternalServerError, err)
        return
    }
    httpx.SetFlash(w, "Jemaat berhasil ditambahkan", "success")
    http.Redirect(w, r, "/jemaat", http.StatusSeeOther)
}
```

**PRG (Post-Redirect-Get)** is the default pattern. On success: set flash cookie, redirect. On validation failure: re-render the form with errors inline (HTTP 422).

### 5.11 Jadwal bulk replace

`POST /kebaktian/{id}/jadwal` replaces the entire set of slots for that kebaktian.

**Algorithm** (single transaction):
1. Verify kebaktian belongs to caller (404 otherwise).
2. Validate every `service_type_id` and `pelayan_id` belongs to the same user.
3. `DELETE FROM jadwal_pelayanan WHERE kebaktian_id = ? AND user_id = ?`.
4. For each slot in the form, `INSERT INTO jadwal_pelayanan (...)`.
5. Commit. Redirect to jadwal editor with success flash.

The jadwal form is a standard HTML `<form>` with one `<select>` per service type. Each select's name encodes the service_type_id (e.g. `pelayan_1`, `pelayan_3`). The handler reads all form values in a loop.

### 5.12 Health check

```go
// internal/health/handler.go
func (h *Handler) Handle(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()
    if err := h.db.PingContext(ctx); err != nil {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusServiceUnavailable)
        fmt.Fprintf(w, `{"status":"degraded","db":"error"}`)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    fmt.Fprintf(w, `{"status":"ok","db":"ok"}`)
}
```

### 5.13 `internal/httpx/` package

```go
// render.go
package httpx

import (
    "embed"
    "html/template"
    "net/http"
)

//go:embed ../../templates
var templateFS embed.FS

type Renderer struct {
    tmpl *template.Template
}

func NewRenderer() *Renderer {
    tmpl := template.Must(
        template.New("").
            Funcs(templateFuncs()).
            ParseFS(templateFS, "templates/**/*.html", "templates/*.html"),
    )
    return &Renderer{tmpl: tmpl}
}

// Page renders a full page using the base layout.
// tmplName is the content template name, e.g. "jemaat/list".
func (r *Renderer) Page(w http.ResponseWriter, req *http.Request, tmplName string, data any) {
    w.Header().Set("Content-Type", "text/html; charset=utf-8")
    if err := r.tmpl.ExecuteTemplate(w, "layout", map[string]any{
        "Content": tmplName,
        "Data":    data,
    }); err != nil {
        http.Error(w, "render error", http.StatusInternalServerError)
    }
}

// Fragment renders just a named template without the base layout.
// Used for HTMX partial responses (hx-get, hx-post with hx-target).
func (r *Renderer) Fragment(w http.ResponseWriter, req *http.Request, tmplName string, data any) {
    w.Header().Set("Content-Type", "text/html; charset=utf-8")
    if err := r.tmpl.ExecuteTemplate(w, tmplName, data); err != nil {
        http.Error(w, "render error", http.StatusInternalServerError)
    }
}

func (r *Renderer) Error(w http.ResponseWriter, req *http.Request, status int, err error) {
    slog.Error("handler error", "err", err, "path", req.URL.Path)
    http.Error(w, http.StatusText(status), status)
}
```

```go
// flash.go
package httpx

import "net/http"

const flashCookieName = "tg_flash"

func SetFlash(w http.ResponseWriter, msg, kind string) {
    http.SetCookie(w, &http.Cookie{
        Name:     flashCookieName,
        Value:    kind + ":" + msg,
        Path:     "/",
        MaxAge:   30,
        HttpOnly: true,
        SameSite: http.SameSiteLaxMode,
    })
}

// PopFlash reads and immediately clears the flash cookie.
// Returns ("", "") if none exists.
func PopFlash(w http.ResponseWriter, r *http.Request) (msg, kind string) {
    c, err := r.Cookie(flashCookieName)
    if err != nil {
        return "", ""
    }
    http.SetCookie(w, &http.Cookie{Name: flashCookieName, MaxAge: -1, Path: "/"})
    parts := strings.SplitN(c.Value, ":", 2)
    if len(parts) != 2 {
        return c.Value, "info"
    }
    return parts[1], parts[0]
}
```

```go
// pagination.go — unchanged from original
// validator.go  — ValidationErrors(err) returns map[string]string
```

### 5.14 `cmd/seed-admin/main.go`

Bootstrap CLI for creating a user (one user = one church account):

```bash
DATABASE_URL=sqlitecloud://... go run ./cmd/seed-admin \
    --email=admin@example.com \
    --password=... \
    --display-name="Pak Budi" \
    --church-name="GKI Demo" \
    --timezone="Asia/Jakarta"
```

Implementation: open DB, apply schema, hash password, `INSERT INTO users`.

---

## 6. HTMX & Template Implementation

### 6.1 Template structure

Templates live in `backend/internal/templates/` and are embedded in the binary at build time via `//go:embed`. Each template file defines named blocks.

```
templates/
├── layout.html          # defines "layout" template: <html>, <head>, nav, slot
├── login.html           # defines "login" template
├── dashboard.html
├── jemaat/
│   ├── list.html        # defines "jemaat/list"
│   ├── detail.html      # defines "jemaat/detail"
│   └── form.html        # defines "jemaat/form" (shared create/edit)
├── keluarga/...
├── pelayan/...
├── servicetypes/
│   └── list.html        # inline row editing via HTMX
└── kebaktian/
    ├── list.html
    ├── detail.html
    ├── form.html
    └── jadwal.html      # service-type rows with pelayan dropdowns
```

### 6.2 Base layout (`layout.html`)

```html
{{define "layout"}}
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tata Gereja</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.4" defer></script>
</head>
<body class="bg-gray-50 text-gray-900">

  <!-- Mobile top bar -->
  <header class="flex items-center justify-between px-4 py-3 bg-white border-b md:hidden">
    <span class="font-semibold">Tata Gereja</span>
    <span class="text-sm text-gray-500">{{.Data.ChurchName}}</span>
  </header>

  <!-- Desktop sidebar + main content -->
  <div class="md:flex md:h-screen">
    <nav class="hidden md:flex md:flex-col md:w-56 md:border-r md:bg-white md:p-4 gap-1">
      <a href="/jemaat" class="nav-link">Jemaat</a>
      <a href="/keluarga" class="nav-link">Keluarga</a>
      <a href="/pelayan" class="nav-link">Pelayan</a>
      <a href="/kebaktian" class="nav-link">Kebaktian</a>
      <a href="/service-types" class="nav-link">Jenis Pelayanan</a>
      <form method="POST" action="/logout" class="mt-auto">
        <button type="submit" class="text-sm text-gray-500 hover:text-red-600">Keluar</button>
      </form>
    </nav>

    <main class="flex-1 overflow-y-auto p-4 md:p-6">
      {{template "flash" .Data}}
      {{template .Data.Content .Data.Data}}
    </main>
  </div>

  <!-- Mobile bottom nav -->
  <nav class="fixed bottom-0 left-0 right-0 flex border-t bg-white md:hidden">
    <a href="/jemaat" class="flex-1 py-3 text-center text-xs">Jemaat</a>
    <a href="/kebaktian" class="flex-1 py-3 text-center text-xs">Kebaktian</a>
    <a href="/pelayan" class="flex-1 py-3 text-center text-xs">Pelayan</a>
    <a href="/service-types" class="flex-1 py-3 text-center text-xs">Lainnya</a>
  </nav>

</body>
</html>
{{end}}

{{define "flash"}}
  {{if .Flash.Msg}}
    <div class="mb-4 rounded px-4 py-2 text-sm
      {{if eq .Flash.Kind "success"}}bg-green-100 text-green-800
      {{else}}bg-red-100 text-red-800{{end}}">
      {{.Flash.Msg}}
    </div>
  {{end}}
{{end}}
```

The `{{template .Data.Content .Data.Data}}` pattern calls the named content template (e.g. `"jemaat/list"`) with the page-specific data struct.

### 6.3 HTMX usage patterns

**Full-page navigation** uses standard `<a>` links and `<form method="POST">`. HTMX is layered on top for specific interactions.

**Inline partial updates** — used sparingly where full-page reload feels clunky:

```html
<!-- Delete row without page reload -->
<button
  hx-delete="/jemaat/{{.ID}}"
  hx-target="#row-{{.ID}}"
  hx-swap="outerHTML"
  hx-confirm="Hapus jemaat ini?"
  class="text-red-500 text-sm">
  Hapus
</button>

<!-- Load inline edit form -->
<button
  hx-get="/service-types/{{.ID}}/edit"
  hx-target="#row-{{.ID}}"
  hx-swap="outerHTML">
  Edit
</button>
```

**Form submission with validation feedback:**

```html
<form
  hx-post="/jemaat"
  hx-target="#form-container"
  hx-swap="outerHTML">
  <!-- form fields -->
</form>
```

On validation failure: server returns HTTP 422 with the re-rendered form (including error messages) as the response body. HTMX swaps it into `#form-container`.

On success: server sets `HX-Redirect` response header and returns 200. HTMX follows the redirect as a full navigation.

```go
// httpx helper for HTMX-aware redirect
func HXRedirect(w http.ResponseWriter, url string) {
    // Works for both HTMX and plain form submissions
    w.Header().Set("HX-Redirect", url)
    w.WriteHeader(http.StatusOK)
}
```

**Detecting HTMX requests:**

```go
func IsHTMX(r *http.Request) bool {
    return r.Header.Get("HX-Request") == "true"
}
```

Handlers that serve both full-page and partial use this to decide whether to wrap in the layout.

### 6.4 Template functions

Register in `httpx.templateFuncs()`:

```go
func templateFuncs() template.FuncMap {
    return template.FuncMap{
        // Format a UTC ISO string in the given IANA timezone
        "formatDateTime": func(utc, tz, layout string) string {
            loc, err := time.LoadLocation(tz)
            if err != nil {
                loc = time.UTC
            }
            t, err := time.Parse(time.RFC3339, utc)
            if err != nil {
                return utc
            }
            return t.In(loc).Format(layout)
        },
        // Format UTC to datetime-local input value in user tz
        "toLocalInput": func(utc, tz string) string {
            loc, _ := time.LoadLocation(tz)
            t, _ := time.Parse(time.RFC3339, utc)
            return t.In(loc).Format("2006-01-02T15:04")
        },
        "add": func(a, b int64) int64 { return a + b },
        "sub": func(a, b int64) int64 { return a - b },
    }
}
```

### 6.5 Timezone-aware input handling

`<input type="datetime-local">` produces a wall-clock string with no timezone info (e.g. `"2026-05-18T09:00"`). The server interprets it as the user's local timezone.

```go
// Parse datetime-local form value → UTC ISO string
func parseLocalDateTime(value, userTZ string) (string, error) {
    loc, err := time.LoadLocation(userTZ)
    if err != nil {
        return "", err
    }
    t, err := time.ParseInLocation("2006-01-02T15:04", value, loc)
    if err != nil {
        return "", err
    }
    return t.UTC().Format(time.RFC3339), nil
}
```

The user's timezone comes from their record in the DB, loaded in the `RequireAuth` middleware and stored in context.

### 6.6 Form validation display

Templates receive an `Errors map[string]string` where keys are field names:

```html
{{define "jemaat/form"}}
<div id="form-container">
  <form hx-post="/jemaat" hx-target="#form-container" hx-swap="outerHTML">
    <div class="mb-4">
      <label class="block text-sm font-medium">Nama Lengkap</label>
      <input type="text" name="nama_lengkap" value="{{.Form.NamaLengkap}}"
             class="mt-1 block w-full rounded border px-3 py-2
                    {{if index .Errors "NamaLengkap"}}border-red-500{{end}}">
      {{if index .Errors "NamaLengkap"}}
        <p class="mt-1 text-xs text-red-600">{{index .Errors "NamaLengkap"}}</p>
      {{end}}
    </div>
    <!-- more fields... -->
    <button type="submit"
            class="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700">
      Simpan
    </button>
  </form>
</div>
{{end}}
```

### 6.7 Mobile-first conventions

Design for phone first; desktop is progressive enhancement. Same breakpoints as before but expressed as Tailwind classes in server-rendered templates.

| Pattern | Mobile (`< md`) | Desktop (`≥ md`) |
|---------|-----------------|------------------|
| Lists | Card stack | `<table>` |
| Forms | Full-screen page | Modal or panel |
| Nav | Bottom nav (fixed) | Left sidebar |
| Delete confirm | `hx-confirm` native browser dialog | Same |

Tap targets: `min-h-11 min-w-11` (44px). Body text: `text-base` (16px).

---

## 7. Authentication

### 7.1 Flow

1. User submits `POST /login` with `email` + `password` (standard form submit).
2. Backend verifies bcrypt hash. On success:
   - `INSERT INTO sessions (token, user_id, expires_at)` with a random opaque token (32 bytes, base64-url).
   - Sets `tatagereja_session` cookie: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/`.
   - Redirects to `/` (PRG).
3. Every authenticated request: `RequireAuth` middleware reads cookie, looks up session, redirects to `/login` if invalid.
4. Logout: `POST /logout` → `DELETE FROM sessions WHERE token = ?` + clear cookie → redirect to `/login`.

### 7.2 Why this is enough for MVP

- One person per account. Re-login weekly is fine.
- No JWT secret to rotate, no refresh tokens — logout is a single DELETE.
- `HttpOnly` cookie → JS can't read it → XSS can't steal it.
- Everything is same-origin (Go serves all pages) — `SameSite=Lax` is sufficient, no CORS needed.

### 7.3 Initial admin provisioning

Owner runs `cmd/seed-admin` against the SQLite Cloud DB to create a user.

### 7.4 Password reset (POST-MVP)

Deferred. For MVP, owner resets passwords via `cmd/reset-password` or direct SQL on SQLite Cloud dashboard.

---

## 8. Route Contract

All routes return **HTML**. There is no JSON API.

### 8.1 Conventions

- All routes served by the Go binary on one port.
- Auth: session cookie. Unauthenticated requests → redirect to `/login`.
- Flash messages: cookie-based, set before redirect, read & cleared on next render.
- Validation failure: HTTP 422, re-render the form with inline errors.
- Success mutation: PRG — set flash cookie, `http.Redirect` (303) or `HX-Redirect`.
- Timestamps displayed in `user.timezone`; dates displayed as-is.

### 8.2 Routes

#### Auth

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/login` | Render login page |
| POST | `/login` | Authenticate → redirect `/` or re-render form with error |
| POST | `/logout` | Delete session, clear cookie → redirect `/login` |

#### Jemaat

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/jemaat` | List page (`?q=` search, `?limit=`, `?offset=`) |
| GET | `/jemaat/new` | New jemaat form page |
| POST | `/jemaat` | Create → redirect `/jemaat` or re-render form |
| GET | `/jemaat/{id}` | Detail page |
| GET | `/jemaat/{id}/edit` | Edit form page |
| PUT | `/jemaat/{id}` | Update → redirect `/jemaat/{id}` or re-render form |
| DELETE | `/jemaat/{id}` | Soft delete → redirect `/jemaat` |

#### Keluarga

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/keluarga` | List |
| GET | `/keluarga/new` | Form |
| POST | `/keluarga` | Create → redirect |
| GET | `/keluarga/{id}` | Detail with member list |
| GET | `/keluarga/{id}/edit` | Edit form |
| PUT | `/keluarga/{id}` | Update → redirect |
| DELETE | `/keluarga/{id}` | Delete → redirect |

#### Pelayan

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/pelayan` | List (each row shows jemaat name + service types) |
| GET | `/pelayan/new` | Form (jemaat dropdown + service-type checkboxes) |
| POST | `/pelayan` | Create → redirect |
| GET | `/pelayan/{id}` | Detail |
| GET | `/pelayan/{id}/edit` | Edit form |
| PUT | `/pelayan/{id}` | Update → redirect |
| DELETE | `/pelayan/{id}` | Remove pelayan → redirect |

#### Service Types

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/service-types` | List with inline add row |
| POST | `/service-types` | Create → redirect (or HTMX fragment append row) |
| GET | `/service-types/{id}/edit` | Inline edit row (HTMX fragment) |
| PUT | `/service-types/{id}` | Update → redirect or HTMX swap row |
| DELETE | `/service-types/{id}` | Delete → redirect; 409 if referenced by jadwal |

#### Kebaktian + Jadwal

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/kebaktian` | List (`?from=`, `?to=` UTC date range) |
| GET | `/kebaktian/new` | Form |
| POST | `/kebaktian` | Create → redirect |
| GET | `/kebaktian/{id}` | Detail |
| GET | `/kebaktian/{id}/edit` | Edit form |
| PUT | `/kebaktian/{id}` | Update → redirect |
| DELETE | `/kebaktian/{id}` | Delete (cascades jadwal) → redirect |
| GET | `/kebaktian/{id}/jadwal` | Jadwal editor page |
| POST | `/kebaktian/{id}/jadwal` | Bulk-replace all slots → redirect back to editor |

### 8.3 Error rendering

| Status | Cause |
|--------|-------|
| 302/303 | PRG redirect after success |
| 422 | Validation failure — re-render form with errors |
| 404 | Not found or belongs to another user |
| 409 | Conflict (unique constraint, dependent rows) — re-render with message |
| 500 | Server error — render error page |

---

## 9. Validation Rules

Server-side only via `validator/v10`. No client-side JS validation.

### 9.1 Auth

| Field | Rules |
|-------|-------|
| `email` | required, valid email, max 200 |
| `password` | required, min 1 |

### 9.2 Jemaat

| Field | Rules |
|-------|-------|
| `nama_lengkap` | **required**, 1–200 chars |
| `nama_panggilan` | optional, max 100 |
| `jenis_kelamin` | optional, one of `L`, `P` |
| `tanggal_lahir` | optional, `YYYY-MM-DD`, valid date, not in future |
| `tempat_lahir` | optional, max 100 |
| `alamat` | optional, max 500 |
| `nomor_telepon` | optional, max 30 |
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
| `service_type_ids` | checkboxes — each must exist for same user |

### 9.6 Kebaktian

| Field | Rules |
|-------|-------|
| `nama` | required, 1–200 chars |
| `waktu_mulai` | required, `datetime-local` format parsed with user timezone |
| `lokasi` | optional, max 200 |
| `tema` | optional, max 300 |
| `pengkhotbah` | optional, max 200 |
| `catatan` | optional, max 2000 |

### 9.7 Jadwal slot

| Field | Rules |
|-------|-------|
| `service_type_id` | implicit from form field name; must exist for same user |
| `pelayan_id` | optional (empty = unassigned slot); if set, must exist for same user |
| `catatan` | optional, max 500 |

---

## 10. Development Environment

> Contributors need: Go 1.23+, `sqlc`, `air`. No Node.js required.

### 10.1 `Makefile`

```makefile
.PHONY: help setup dev build test lint clean sqlc seed-admin

help:
	@echo "Tata Gereja dev commands:"
	@echo "  make setup        — download Go deps (run once)"
	@echo "  make dev          — run backend with air hot reload"
	@echo "  make build        — production build"
	@echo "  make test         — run all tests"
	@echo "  make lint         — lint Go code"
	@echo "  make sqlc         — regenerate Go DB code"
	@echo "  make seed-admin   — create initial user"

setup:
	cd backend && go mod download

dev:
	cd backend && air

build:
	cd backend && go build -o bin/server ./cmd/server

test:
	cd backend && go test -race -cover ./...

lint:
	cd backend && golangci-lint run

clean:
	rm -rf backend/bin backend/tmp

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
  exclude_dir = ["tmp", "vendor", "testdata", "bin"]
  exclude_regex = ["_test.go"]
  include_ext = ["go", "sql", "html"]
  kill_delay = "0s"
  stop_on_error = true
```

`include_ext` includes `html` so air restarts when templates change.

### 10.3 Local env

`backend/.env.example`:

```
PORT=8080
APP_ENV=development
DATABASE_URL=sqlitecloud://apikey@host.sqlite.cloud:8860/tatagereja_dev
SESSION_TTL_HOURS=168
LOG_LEVEL=debug
```

### 10.4 `Procfile` (Heroku)

```
web: ./bin/server
```

### 10.5 First-run for a contributor

```bash
git clone https://github.com/<owner>/tatagereja
cd tatagereja
make setup
cp backend/.env.example backend/.env
# fill in DATABASE_URL with your SQLite Cloud connection string
make seed-admin   # creates the initial user
make dev
# open http://localhost:8080
```

Schema is applied on backend startup; no separate migrate step.

---

## 11. Testing Strategy

### 11.1 Backend

Tests use an **in-memory SQLite** database via `modernc.org/sqlite` — the driver name is `"sqlite"` for `:memory:` URLs. This is separate from the production `"sqlitecloud"` driver. Same SQL dialect; sqlc-generated code works with both.

**Test DB factory** in `tests/testutil/db.go`:

```go
package testutil

import (
    "database/sql"
    "testing"

    _ "modernc.org/sqlite" // registers "sqlite" driver for tests

    "github.com/<owner>/tatagereja/backend/internal/db"
    "github.com/<owner>/tatagereja/backend/internal/db/sqlc"
)

func NewTestDB(t *testing.T) (*sql.DB, *sqlc.Queries) {
    t.Helper()
    database, err := sql.Open("sqlite", ":memory:")
    if err != nil { t.Fatal(err) }
    if _, err := database.Exec("PRAGMA foreign_keys = ON"); err != nil { t.Fatal(err) }
    if err := db.Apply(database); err != nil { t.Fatal(err) }
    t.Cleanup(func() { database.Close() })
    return database, sqlc.New(database)
}

func SeedTwoUsers(t *testing.T, q *sqlc.Queries) (u1, u2 int64) {
    // INSERT INTO users ... returns u1, u2
}
```

**Required test categories** for every domain feature:
1. **Happy path** — create, read, update, delete all work.
2. **Cross-user isolation** — call X's endpoint as user Y. Must return 404.
3. **Validation** — missing required field, oversized field, malformed date.
4. **Auth** — request without session cookie → redirect to `/login`.

Example cross-user test:

```go
func TestJemaat_CrossUserReturns404(t *testing.T) {
    _, q := testutil.NewTestDB(t)
    u1, u2 := testutil.SeedTwoUsers(t, q)

    j, _ := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Budi"})

    _, err := q.GetJemaat(ctx, sqlc.GetJemaatParams{ID: j.ID, UserID: u2})
    if !errors.Is(err, sql.ErrNoRows) {
        t.Fatalf("expected sql.ErrNoRows, got %v", err)
    }
}
```

### 11.2 Template tests (optional at MVP)

Go's `html/template` can be tested by executing templates with test data and asserting output. Not required for MVP.

---

## 12. Open Source Housekeeping

### 12.1 LICENSE

MIT. Single file `LICENSE` at repo root.

### 12.2 `README.md` skeleton

```markdown
# Tata Gereja

> Aplikasi manajemen jemaat & jadwal pelayanan untuk gereja kecil di Indonesia.
> Open source, gratis, ringan. Proyek hobi.

⚠️ **Proyek hobi — no SLA, no warranty.**

## Fitur (v1)

- Data jemaat (nama, kontak, tanggal lahir, baptis, sidi)
- Pengelompokan keluarga
- Daftar pelayan + jenis pelayanan
- Jadwal pelayanan per kebaktian
- Satu akun per gereja (satu user = satu gereja)

## Tech stack

- Backend: Go (chi, html/template, sqlc)
- Frontend: HTMX + Tailwind CSS (CDN)
- Database: SQLite Cloud
- Deployment: Heroku Eco Dyno

## Development

Butuh: Go 1.23+, `sqlc`, `air`. Tidak butuh Node.js.

```bash
git clone https://github.com/<owner>/tatagereja
cd tatagereja
make setup
cp backend/.env.example backend/.env
# isi DATABASE_URL dengan SQLite Cloud connection string
make seed-admin
make dev
# http://localhost:8080
```

## License

MIT
```

### 12.3 `.gitignore` (root)

```
.env
.env.local
tmp/
bin/
*.log
.DS_Store
```

---

## 13. MVP Scope & Phases

### Phase 0 — Foundation

- [ ] Repo scaffolded, `Procfile`, `.gitignore`, `LICENSE`, `README.md`, `Makefile`
- [ ] `schema.sql` finalized, sqlc working
- [ ] Schema applies on boot against SQLite Cloud
- [ ] `/health` returns DB status
- [ ] Login page, session auth, redirect to `/jemaat` on success
- [ ] Base layout template with nav

**Done when:** owner runs `make dev`, logs in, sees empty nav.

### Phase 1 — Jemaat + Keluarga CRUD

- [ ] Backend: jemaat CRUD + search queries
- [ ] Backend: keluarga CRUD queries
- [ ] Templates: jemaat list (search + pagination), form, detail
- [ ] Templates: keluarga list, form, detail with member list
- [ ] Cross-user isolation tests passing

**Done when:** owner adds 50 dummy jemaat across 10 keluarga and finds them.

### Phase 2 — Pelayan + Service Types

- [ ] Backend: service_types CRUD
- [ ] Backend: pelayan CRUD with service-type relationships
- [ ] Templates: service-types list with inline HTMX editing
- [ ] Templates: pelayan list, "tambah pelayan" form (jemaat dropdown + checkboxes)

**Done when:** owner marks 10 jemaat as pelayan with 2–3 service types each.

### Phase 3 — Jadwal Pelayanan

- [ ] Backend: kebaktian CRUD
- [ ] Backend: jadwal bulk-replace (transactional delete-then-insert)
- [ ] Templates: kebaktian list, form
- [ ] Templates: jadwal editor (service-type rows, pelayan dropdowns per slot)

**Done when:** owner creates 4 upcoming Sundays with full schedule.

### Phase 4 — Polish & v0.2 ideas

- [ ] Print-friendly schedule view
- [ ] Export to CSV
- [ ] Birthday widget on dashboard
- [ ] Password reset CLI
- [ ] Recurring kebaktian templates

---

## 14. Non-Negotiable Rules

### 14.1 User-data isolation (most important)

1. Every domain table has `user_id NOT NULL`.
2. Every query filters by `user_id` from the authenticated session.
3. Never accept `user_id` from form values or URL params.
4. Return 404 (not 403) when an ID exists but belongs to another user.
5. `tests/integration/cross_user_test.go` is required and must cover every entity.

### 14.2 Security baseline

1. Passwords hashed with bcrypt cost ≥ 12.
2. Session tokens are 32+ bytes of cryptographic random (`crypto/rand`), opaque, stored in `sessions` table.
3. Cookies: `HttpOnly`, `Secure` in prod, `SameSite=Lax`.
4. Validate all inputs server-side.
5. Parameterized queries only (sqlc enforces).
6. Never log passwords or session tokens.
7. Use `html/template` (not `text/template`) — auto-escapes HTML.

### 14.3 Database

1. Stick to SQLite-standard SQL (compatible with SQLite Cloud).
2. `schema.sql` is the single source of truth.
3. Schema is applied idempotently on every boot.
4. Tests use in-memory `modernc.org/sqlite`; production uses SQLite Cloud.

### 14.4 Code quality

1. `go test ./...` passes before merge.
2. `golangci-lint run` passes.
3. `sqlc generate` produces no diff against committed code.
4. No `panic()` in handlers.
5. `slog` for structured logging.
6. Wrap errors with `fmt.Errorf("context: %w", err)`.

### 14.5 Route & rendering conventions

1. All routes return HTML.
2. Validation failure → HTTP 422, re-render form with `Errors map[string]string`.
3. Successful mutation → PRG (set flash cookie, `http.Redirect` 303).
4. HTMX mutations → `HX-Redirect` header on success; 422 + fragment on failure.
5. Use `html/template`; never concatenate user input into HTML strings.

### 14.6 HTMX conventions

1. Use HTMX for partial updates only where a full-page reload is noticeably jarring.
2. Every page must work with JS disabled (standard `<form>` fallback).
3. `hx-confirm` for destructive actions.
4. Never use `hx-swap="innerHTML"` on `<body>` — use `hx-boost` on `<body>` for SPA-style navigation if desired.

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
- Atlas / golang-migrate (defer until schema changes need versioning)
- Skill levels for pelayan
- Color-coded service types

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

1. **Repo bootstrap** — folders, `git init`, `.gitignore`, `LICENSE`, `README.md`, `Makefile`, `Procfile`.
2. **Backend skeleton** — `go.mod`, `cmd/server/main.go` (minimal), `internal/config/`, `internal/router/`, `internal/health/`. `make dev` starts on :8080. `/health` returns `{"status":"ok"}`.
3. **Database layer** — write `schema.sql`, `sqlc.yaml`, `internal/db/conn.go` (SQLite Cloud), `internal/db/sync.go`. `make sqlc` works. App boots, schema applies against SQLite Cloud.
4. **Auth** — session token + cookie, password hashing, `internal/auth/{handler,session,cookie,password,queries.sql}`, `RequireAuth` middleware (redirect-to-login), `cmd/seed-admin`.
5. **Base template** — `internal/templates/layout.html` with nav, flash, Tailwind CDN, HTMX CDN. `httpx.Renderer` loads and executes templates.
6. **Login page** — `GET /login` renders login form, `POST /login` authenticates → redirect or re-render form.
7. **End-to-end smoke** — `make seed-admin`, log in, see empty dashboard. Commit & tag `v0.0.1-skeleton`.
8. **Keluarga CRUD** — backend queries + handler + templates.
9. **Jemaat CRUD** — backend + templates with search.
10. **Cross-user isolation test suite** — at least jemaat and keluarga covered.
11. **Service Types CRUD** — backend + inline-edit template.
12. **Pelayan CRUD** — backend + templates.
13. **Kebaktian + Jadwal** — backend bulk-replace + jadwal editor template.
14. **Polish** — empty states, flash messages, loading states, mobile responsive.
15. **Heroku deploy** — `make build`, `git push heroku main`, verify `/health`.
16. **Tag `v1.0.0`**.

After each step: `make lint test build` must be green.

---

End of plan.
