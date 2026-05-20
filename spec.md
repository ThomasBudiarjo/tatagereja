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
4. [Database](#4-database)
5. [Backend](#5-backend)
6. [Templates & HTMX](#6-templates--htmx)
7. [Authentication](#7-authentication)
8. [Routes](#8-routes)
9. [Validation Rules](#9-validation-rules)
10. [Development & Deployment](#10-development--deployment)
11. [Testing](#11-testing)
12. [MVP Phases](#12-mvp-phases)
13. [Non-Negotiable Rules](#13-non-negotiable-rules)
14. [Out of Scope](#14-out-of-scope)
15. [Glossary](#15-glossary)

---

## 1. Project Overview

Tata Gereja helps a church manage:

- **Jemaat** — church members.
- **Keluarga** — family unit grouping jemaat.
- **Pelayan** — volunteers who serve, with the service types they can do.
- **Jadwal Pelayanan** — service schedules: assign pelayan to slots per kebaktian.

**Users:** church admins, worship coordinators, pastors. Initial target: small Indonesian Protestant churches. Avoid denomination-specific logic.

**Operational model:**

- **One user per church account.** The user IS the church for MVP. No multi-admin, no self-signup. Owner manually provisions accounts.
- **Multiple users on one shared local SQLite file.** Every domain row is scoped by `user_id`. Data MUST NEVER leak between users.
- **Embedded Litestream** replicates the SQLite file to object storage (S3 in production, local `file://` replica in development). Heroku Eco dynos have ephemeral disks — restore from replica on boot, replicate continuously while running.
- **No SLA.** Hobby project. Disclosed in README and in-app.
- **Deployed to Heroku Eco Dyno.** Single Go binary serves HTML, CSS, JS.

---

## 2. Architecture & Stack

```
Browser (HTMX) ──HTTP── Go HTTP Server (Chi) ──database/sql── local SQLite file
                          │                                    (modernc.org/sqlite)
                          ├── embedded Litestream Store
                          │       └── replicate ──► S3 (prod) / file:// (dev)
                          ├── html/template
                          ├── Session cookie auth
                          └── sqlc-generated queries
```

One binary, one port, same origin. No CORS.

| Layer | Choice |
|-------|--------|
| Backend | Go 1.23+ |
| Router | `chi/v5` |
| Rendering | `html/template` + HTMX 2.x (CDN) |
| Styling | Tailwind CSS (CDN) |
| Database | Local SQLite file (`SQLITE_PATH`) |
| Replication | Embedded `github.com/benbjohnson/litestream` |
| Replica storage | S3 (production), `file://` (development) |
| DB driver | `modernc.org/sqlite` everywhere (prod, tests) |
| DB queries | sqlc |
| Auth | DB-backed opaque session token + bcrypt |
| Validation | Manual (stdlib `strings`, `time`, `net/mail`, `strconv`) |
| Nullable cols | stdlib `database/sql` (`sql.NullString` etc.) |
| Hot reload | `air` |
| Deployment | Heroku Eco Dyno |

**Why these choices:**

- **HTMX over SPA:** zero JS build step. One binary, one process, same origin.
- **Tailwind CDN:** zero npm. Acceptable for hobby-scale traffic.
- **Local SQLite + embedded Litestream:** one file, standard SQL, no hosted DB vendor. Litestream restores from S3 on dyno boot and replicates WAL changes in the background. Pin Litestream to a specific version — its library API is not semver-stable yet.
- **`modernc.org/sqlite` only:** Litestream uses this driver internally; mixing drivers causes lock conflicts on Linux/macOS.
- **DB sessions over JWT:** simpler. Logout = `DELETE FROM sessions WHERE token=?`.
- **Manual validation, stdlib nullable types:** fewer dependencies for ~50 fields total.

---

## 3. Repository Structure

```
tatagereja/
├── backend/
│   ├── cmd/
│   │   ├── server/main.go
│   │   └── seed-admin/main.go
│   ├── internal/
│   │   ├── config/config.go
│   │   ├── db/
│   │   │   ├── schema.sql        # SINGLE SOURCE OF TRUTH
│   │   │   ├── conn.go           # Open SQLite + embedded Litestream
│   │   │   ├── litestream.go     # restore, Store lifecycle, sync helpers
│   │   │   ├── queries/          # one .sql file per entity
│   │   │   │   ├── auth.sql
│   │   │   │   ├── jemaat.sql
│   │   │   │   ├── keluarga.sql
│   │   │   │   ├── pelayan.sql
│   │   │   │   ├── servicetypes.sql
│   │   │   │   ├── kebaktian.sql
│   │   │   │   └── jadwal.sql
│   │   │   └── sqlc/             # GENERATED — do not edit
│   │   ├── auth/auth.go          # password, session, cookie, handlers
│   │   ├── web/
│   │   │   ├── web.go            # renderer, flash, pagination, validation helpers
│   │   │   ├── middleware.go     # logging, RequireAuth
│   │   │   ├── router.go
│   │   │   ├── jemaat.go
│   │   │   ├── keluarga.go
│   │   │   ├── pelayan.go
│   │   │   ├── servicetypes.go
│   │   │   ├── kebaktian.go
│   │   │   └── jadwal.go
│   │   └── templates/            # embedded; layout.html + per-entity folders
│   ├── tests/
│   │   ├── cross_user_test.go    # CRITICAL: 404 across users
│   │   ├── jemaat_test.go
│   │   ├── jadwal_test.go
│   │   └── testutil.go
│   ├── sqlc.yaml
│   ├── .air.toml
│   ├── go.mod
│   ├── go.sum
│   ├── .env.example
│   └── .gitignore
├── Procfile                       # web: ./bin/server
├── .gitignore
├── LICENSE                        # MIT
├── Makefile
└── README.md
```

Handlers live in `internal/web/` as one file per entity. Queries live in `internal/db/queries/`. Extract more structure only when complexity demands it.

---

## 4. Database

### 4.1 Source of truth

`backend/internal/db/schema.sql` is THE source of truth:

- Input to sqlc.
- Input to the boot-time sync (`Apply(db)`).
- Human documentation of the data model.

Never edit `internal/db/sqlc/` by hand. Edit `schema.sql`, run `make sqlc`, restart.

### 4.2 User-data isolation (CRITICAL)

**Every domain table (except `users` and `sessions`) MUST have `user_id NOT NULL REFERENCES users(id) ON DELETE CASCADE`.**

**Every query that reads or writes a domain row MUST filter/set `user_id` from the authenticated session.** Never trust `user_id` from the request body.

Failure = data leak between churches = critical bug. Enforced by `tests/cross_user_test.go`.

### 4.3 Time conventions

- Timestamps: UTC ISO 8601 strings ending in `Z`. Default `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`.
- `kebaktian.waktu_mulai` stored as UTC; server converts to/from `users.timezone` for display and form parsing.
- `tanggal_lahir`, `tanggal_baptis`, `tanggal_sidi` are calendar dates: `YYYY-MM-DD`.

### 4.4 Schema sync

On boot the server executes `schema.sql` as embedded bytes. All `CREATE TABLE` use `IF NOT EXISTS` so it's idempotent.

```go
//go:embed schema.sql
var schemaSQL string

func Apply(db *sql.DB) error {
    _, err := db.Exec(schemaSQL)
    return err
}
```

When real data exists and altering in place is required, add a migration tool at that point.

### 4.5 `schema.sql`

```sql
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

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

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
    jenis_kelamin       TEXT CHECK (jenis_kelamin IN ('L','P') OR jenis_kelamin IS NULL),
    tanggal_lahir       TEXT,
    tempat_lahir        TEXT,
    alamat              TEXT,
    nomor_telepon       TEXT,
    email               TEXT,
    status_pernikahan   TEXT CHECK (
        status_pernikahan IN ('belum_menikah','menikah','cerai','duda','janda')
        OR status_pernikahan IS NULL
    ),
    tanggal_baptis      TEXT,
    tanggal_sidi        TEXT,
    keluarga_id         INTEGER REFERENCES keluarga(id) ON DELETE SET NULL,
    catatan             TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_jemaat_user_id ON jemaat(user_id);
CREATE INDEX IF NOT EXISTS idx_jemaat_nama ON jemaat(user_id, nama_lengkap);

CREATE TABLE IF NOT EXISTS service_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama        TEXT NOT NULL,
    deskripsi   TEXT,
    urutan      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, nama)
);

CREATE TABLE IF NOT EXISTS pelayan (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jemaat_id   INTEGER NOT NULL REFERENCES jemaat(id) ON DELETE CASCADE,
    catatan     TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, jemaat_id)
);

CREATE TABLE IF NOT EXISTS pelayan_service_types (
    pelayan_id      INTEGER NOT NULL REFERENCES pelayan(id) ON DELETE CASCADE,
    service_type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    PRIMARY KEY (pelayan_id, service_type_id)
);

CREATE TABLE IF NOT EXISTS kebaktian (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    waktu_mulai     TEXT NOT NULL,
    lokasi          TEXT,
    tema            TEXT,
    pengkhotbah     TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_kebaktian_waktu ON kebaktian(user_id, waktu_mulai);

CREATE TABLE IF NOT EXISTS jadwal_pelayanan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kebaktian_id    INTEGER NOT NULL REFERENCES kebaktian(id) ON DELETE CASCADE,
    service_type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
    pelayan_id      INTEGER REFERENCES pelayan(id) ON DELETE SET NULL,
    catatan         TEXT,
    confirmed       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (kebaktian_id, service_type_id)
);
```

**Notes:**

- `waktu_mulai` is UTC; format with `time.In(loc)` using `user.timezone`.
- `UNIQUE (kebaktian_id, service_type_id)` enables idempotent jadwal bulk-replace.
- `ON DELETE CASCADE` on every `user_id` makes deleting a user wipe their data cleanly.
- `pelayan_id` in `jadwal_pelayanan` is `SET NULL` so removing a pelayan empties slots without destroying history.

### 4.6 Query pattern

Every query takes `user_id` and filters on it. Example (`internal/db/queries/jemaat.sql`):

```sql
-- name: GetJemaat :one
SELECT * FROM jemaat WHERE id = ? AND user_id = ?;

-- name: ListJemaat :many
SELECT * FROM jemaat
WHERE user_id = ? AND is_active = 1
ORDER BY nama_lengkap ASC LIMIT ? OFFSET ?;

-- name: CreateJemaat :one
INSERT INTO jemaat (
    user_id, nama_lengkap, nama_panggilan, jenis_kelamin,
    tanggal_lahir, tempat_lahir, alamat, nomor_telepon, email,
    status_pernikahan, tanggal_baptis, tanggal_sidi,
    keluarga_id, catatan
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *;

-- name: UpdateJemaat :one
UPDATE jemaat SET
    nama_lengkap=?, nama_panggilan=?, jenis_kelamin=?,
    tanggal_lahir=?, tempat_lahir=?, alamat=?, nomor_telepon=?, email=?,
    status_pernikahan=?, tanggal_baptis=?, tanggal_sidi=?, keluarga_id=?, catatan=?,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id=? AND user_id=? RETURNING *;

-- name: DeactivateJemaat :exec
UPDATE jemaat SET is_active=0,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id=? AND user_id=?;
```

**No exceptions:** two-argument lookup (`id` + `user_id`) on every domain row.

### 4.7 `sqlc.yaml`

```yaml
version: "2"
sql:
  - engine: "sqlite"
    schema: "internal/db/schema.sql"
    queries: "internal/db/queries"
    gen:
      go:
        package: "sqlc"
        out: "internal/db/sqlc"
        sql_package: "database/sql"
        emit_json_tags: true
        emit_interface: false
        emit_empty_slices: true
```

Nullable `TEXT`/`INTEGER` columns map to stdlib `sql.NullString` / `sql.NullInt64`. No third-party null types.

### 4.8 Litestream persistence

**Problem:** Heroku Eco dyno filesystem is ephemeral. Local SQLite alone loses data on restart/redeploy.

**Solution:** Embedded Litestream in the same process as the web server.

**Boot sequence (`internal/db/litestream.go`):**

1. Ensure parent dir of `SQLITE_PATH` exists.
2. If the SQLite file is missing, restore from `LITESTREAM_REPLICA_URL` via `replica.Restore()`. If no backup exists yet (`ErrNoSnapshots` / `ErrTxNotAvailable`), start with an empty file.
3. Create `litestream.DB`, attach replica client from URL, configure compaction levels (L0 + at least L1).
4. `store.Open(ctx)` — starts background monitoring and replication.
5. Open `database/sql` pool against the same path using DSN params for PRAGMAs (not `Exec("PRAGMA ...")` — pool connections need DSN-level settings).
6. `Apply(db)` — idempotent schema sync.

**Shutdown sequence (order matters):**

1. `srv.Shutdown(ctx)`
2. `database.Close()` — drain the app's connection pool
3. `store.Close(ctx)` — final sync and Litestream teardown

**Development:** `LITESTREAM_REPLICA_URL=file://./data/replica` — replica files live beside the DB under `backend/data/` (gitignored).

**Production (Heroku):** `SQLITE_PATH=/tmp/tatagereja.db`, `LITESTREAM_REPLICA_URL=s3://<bucket>/tatagereja`. Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (e.g. `ap-southeast-1`) in Heroku config. Use a dedicated IAM user scoped to one bucket prefix.

**`cmd/seed-admin` on Heroku:** one-off dynos also have ephemeral `/tmp`. The CLI MUST use the same restore → mutate → `SyncAndWait` → close path so writes reach S3 before the dyno exits.

---

## 5. Backend

### 5.1 Module setup

```bash
cd backend
go mod init github.com/<owner>/tatagereja/backend
```

### 5.2 Dependencies

```go
require (
    github.com/benbjohnson/litestream              v0.5.x  // pin exact version
    github.com/go-chi/chi/v5                       v5.x
    modernc.org/sqlite                             v1.x    // prod + tests
    golang.org/x/crypto                            v0.x    // bcrypt
)
```

That's it. No validator, no null-type library, no CORS, no hosted SQLite vendor.

### 5.3 `cmd/server/main.go` (sketch)

```go
func main() {
    slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

    cfg := config.MustLoad()
    database, store, err := db.Open(context.Background(), cfg)
    if err != nil { log.Fatal(err) }
    defer database.Close()
    defer store.Close(context.Background())
    if err := db.Apply(database); err != nil { log.Fatal(err) }

    srv := &http.Server{
        Addr:              ":" + cfg.Port,
        Handler:           web.NewRouter(cfg, database),
        ReadHeaderTimeout: 10 * time.Second,
        ReadTimeout:       30 * time.Second,
        WriteTimeout:      30 * time.Second,
        IdleTimeout:       120 * time.Second,
    }

    go func() { _ = srv.ListenAndServe() }()
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
    <-stop
    ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()
    _ = srv.Shutdown(ctx)
}
```

### 5.4 `internal/config/config.go`

Env vars:

| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | `8080` | |
| `APP_ENV` | `development` | `development` \| `production` |
| `SQLITE_PATH` | `./data/tatagereja.db` | Use `/tmp/tatagereja.db` on Heroku |
| `LITESTREAM_REPLICA_URL` | `file://./data/replica` | Prod: `s3://bucket/tatagereja` |
| `AWS_ACCESS_KEY_ID` | — | Required for S3 replica |
| `AWS_SECRET_ACCESS_KEY` | — | Required for S3 replica |
| `AWS_REGION` | `ap-southeast-1` | |
| `LOG_LEVEL` | `info` | |

Session TTL hardcoded to 7 days. `CookieSecure` is true when `APP_ENV=production`.

### 5.5 `internal/db/conn.go` + `litestream.go`

`Open(ctx, cfg)` returns `(*sql.DB, *litestream.Store, error)`.

```go
package db

import (
    "context"
    "database/sql"
    "errors"
    "fmt"
    "os"
    "path/filepath"
    "time"

    "github.com/benbjohnson/litestream"
    _ "modernc.org/sqlite"
)

func Open(ctx context.Context, cfg *config.Config) (*sql.DB, *litestream.Store, error) {
    path := cfg.SQLitePath
    if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
        return nil, nil, fmt.Errorf("mkdir sqlite dir: %w", err)
    }

    if _, err := os.Stat(path); os.IsNotExist(err) {
        if err := restoreFromReplica(ctx, path, cfg.LitestreamReplicaURL); err != nil &&
            !errors.Is(err, litestream.ErrNoSnapshots) &&
            !errors.Is(err, litestream.ErrTxNotAvailable) {
            return nil, nil, fmt.Errorf("restore from replica: %w", err)
        }
    }

    lsDB := litestream.NewDB(path)
    client, err := litestream.NewReplicaClientFromURL(cfg.LitestreamReplicaURL)
    if err != nil {
        return nil, nil, fmt.Errorf("replica client: %w", err)
    }
    replica := litestream.NewReplicaWithClient(lsDB, client)
    lsDB.Replica = replica

    levels := litestream.CompactionLevels{
        {Level: 0},
        {Level: 1, Interval: 10 * time.Second},
    }
    store := litestream.NewStore([]*litestream.DB{lsDB}, levels)
    if err := store.Open(ctx); err != nil {
        return nil, nil, fmt.Errorf("litestream store open: %w", err)
    }

    dsn := fmt.Sprintf(
        "file:%s?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(wal)",
        path,
    )
    d, err := sql.Open("sqlite", dsn)
    if err != nil {
        _ = store.Close(ctx)
        return nil, nil, err
    }
    d.SetMaxOpenConns(5)
    d.SetMaxIdleConns(2)
    return d, store, nil
}

func restoreFromReplica(ctx context.Context, destPath, replicaURL string) error {
    client, err := litestream.NewReplicaClientFromURL(replicaURL)
    if err != nil { return err }
    replica := litestream.NewReplicaWithClient(nil, client)
    opt := litestream.NewRestoreOptions()
    opt.OutputPath = destPath
    return replica.Restore(ctx, opt)
}
```

`Apply(db)` and the embedded `schema.sql` live in `conn.go` (see §4.4).

`SyncAndClose(ctx, store)` helper for `seed-admin`: call `store.SyncAndWait(ctx)` (via the wrapped `litestream.DB`) before `store.Close`.

### 5.6 `internal/web/router.go`

One `NewRouter(cfg, db)` that wires middleware, public auth routes, and the authenticated group:

```go
func NewRouter(cfg *config.Config, database *sql.DB) http.Handler {
    q := sqlc.New(database)
    rdr := NewRenderer()

    r := chi.NewRouter()
    r.Use(middleware.RequestID, middleware.RealIP, Logging, middleware.Recoverer,
          middleware.Timeout(30*time.Second))

    r.Get("/health", healthHandler(database))
    auth.MountRoutes(r, cfg, q, rdr)  // /login, /logout

    r.Group(func(r chi.Router) {
        r.Use(RequireAuth(q))
        r.Get("/", func(w http.ResponseWriter, r *http.Request) {
            http.Redirect(w, r, "/jemaat", http.StatusFound)
        })
        mountJemaat(r, q, database, rdr)
        mountKeluarga(r, q, database, rdr)
        mountPelayan(r, q, database, rdr)
        mountServiceTypes(r, q, database, rdr)
        mountKebaktian(r, q, database, rdr)
        mountJadwal(r, q, database, rdr)
    })
    return r
}
```

Each `mountX` is a small function in `web/<entity>.go` that registers the routes and holds handler funcs as closures. No constructor ceremony.

### 5.7 `internal/web/middleware.go`

```go
type ctxKey int
const userIDKey ctxKey = 1

func RequireAuth(q *sqlc.Queries) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            c, err := r.Cookie(auth.CookieName)
            if err != nil || c.Value == "" {
                http.Redirect(w, r, "/login", http.StatusFound)
                return
            }
            uid, err := auth.LookupSession(r.Context(), q, c.Value)
            if err != nil {
                auth.ClearCookie(w)
                http.Redirect(w, r, "/login", http.StatusFound)
                return
            }
            next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userIDKey, uid)))
        })
    }
}

func UserID(r *http.Request) int64 {
    v, _ := r.Context().Value(userIDKey).(int64)
    return v
}

// Logging: slog-based request logger middleware.
```

### 5.8 `internal/web/web.go` — renderer + helpers

One file (~200 lines) with:

- `Renderer` wraps `*template.Template`. `Page(w, r, name, data)` renders inside layout; `Fragment(w, r, name, data)` renders bare.
- `NewRenderer()` parses embedded templates and registers funcs (`formatDateTime`, `toLocalInput`, `add`, `sub`).
- `SetFlash(w, msg, kind)` / `PopFlash(w, r)` — cookie-based.
- `ParsePagination(r) (limit, offset int64)`.
- `EscapeLike(s string) string` for safe LIKE patterns.
- `IsHTMX(r) bool` checks `HX-Request` header.
- `HXRedirect(w, url)` sets `HX-Redirect`.
- Form helpers: `formString(r, key)`, `formInt(r, key)`, `formDate(r, key)`, `formTime(r, key, tz)`.
- Validation helpers — small per-type functions:
  ```go
  func required(v, field string, errs map[string]string)
  func maxLen(v string, n int, field string, errs map[string]string)
  func validEmail(v, field string, errs map[string]string)
  func oneOf(v string, allowed []string, field string, errs map[string]string)
  func pastDate(v, field string, errs map[string]string)
  ```
  Handlers build `errs := map[string]string{}`, call helpers, render the form with `errs` if non-empty.

### 5.9 Handler convention

Each `web/<entity>.go` exposes `mountX(r, q, db, rdr)` plus handler funcs. Pattern:

1. `uid := UserID(r)`.
2. Parse form / query params via web helpers.
3. Run validation helpers → `errs`. If non-empty: render form template with `errs`, HTTP 422.
4. Call sqlc with `user_id` in params.
5. On success: `SetFlash`, `http.Redirect(303)`. For HTMX form posts: `HXRedirect`.

### 5.10 Jadwal bulk-replace

`POST /kebaktian/{id}/jadwal` replaces the entire slot set for that kebaktian. Single transaction:

1. Verify kebaktian belongs to user (404 otherwise).
2. Validate each `service_type_id` / `pelayan_id` belongs to user.
3. `DELETE FROM jadwal_pelayanan WHERE kebaktian_id=? AND user_id=?`.
4. Loop: `INSERT INTO jadwal_pelayanan (...)` per slot.
5. Commit. Redirect to editor with success flash.

Form fields named `pelayan_<service_type_id>`. Handler reads them in a loop.

### 5.11 Health

`GET /health`: `db.PingContext` with 2s timeout. Returns `{"status":"ok","db":"ok"}` or 503 with `{"status":"degraded","db":"error"}`.

### 5.12 `cmd/seed-admin/main.go`

CLI to create/reset a user — one user = one church. Used for initial deploy and password resets.

```bash
go run ./cmd/seed-admin \
    --email=admin@example.com --password=... \
    --display-name="Pak Budi" --church-name="GKI Demo" \
    --timezone="Asia/Jakarta"
```

Uses the same env vars as the server (`SQLITE_PATH`, `LITESTREAM_REPLICA_URL`, AWS creds). Behavior: restore if needed → `Apply` schema → bcrypt-hash password → `INSERT` user (or `UPDATE` if email exists — acts as password reset) → `SyncAndWait` → close store so replica is up to date.

---

## 6. Templates & HTMX

### 6.1 Layout

Templates live in `internal/templates/` and are embedded via `//go:embed`.

```
templates/
├── layout.html
├── login.html
├── jemaat/{list,detail,form}.html
├── keluarga/{list,detail,form}.html
├── pelayan/{list,detail,form}.html
├── servicetypes/list.html        # inline edit
└── kebaktian/{list,detail,form,jadwal}.html
```

`layout.html` defines `"layout"` and `"flash"`. The body uses `{{template .Data.Content .Data.Data}}` to render the named content template with page data.

Includes: Tailwind CDN, HTMX 2.x CDN, mobile bottom-nav, desktop sidebar (`md:` breakpoint), logout form.

### 6.2 HTMX patterns

Full-page navigation via `<a>` and `<form method="POST">`. HTMX layered on top for:

- **Delete-in-place**: `hx-delete` + `hx-target="#row-{{.ID}}"` + `hx-swap="outerHTML"` + `hx-confirm`.
- **Inline edit** (service types): GET edit fragment, swap row.
- **Form post with re-render on error**: `hx-post` + `hx-target="#form-container"` + `hx-swap="outerHTML"`. On validation failure server returns 422 + fragment. On success server sets `HX-Redirect`.

Every page must work with JS disabled — HTMX is enhancement, not requirement.

### 6.3 Template funcs

Registered via `template.FuncMap`:

- `formatDateTime(utcISO, tz, layout)` — display UTC in user tz.
- `toLocalInput(utcISO, tz)` — formats `2006-01-02T15:04` for `<input type="datetime-local">`.
- `add`, `sub` for pagination.

### 6.4 Timezone-aware input

`<input type="datetime-local">` yields a wall-clock string. Parse it with `time.ParseInLocation("2006-01-02T15:04", v, loc)` using the user's timezone, then `.UTC().Format(time.RFC3339)` before saving.

### 6.5 Validation display

Templates take `Errors map[string]string` keyed by field name:

```html
<input name="nama_lengkap" value="{{.Form.NamaLengkap}}"
       class="... {{if index .Errors `NamaLengkap`}}border-red-500{{end}}">
{{with index .Errors "NamaLengkap"}}<p class="text-xs text-red-600">{{.}}</p>{{end}}
```

### 6.6 Mobile-first

Design for phone first; desktop is enhancement. Lists are card stacks on mobile, `<table>` on `md+`. Nav is bottom-fixed on mobile, sidebar on `md+`. Tap targets `min-h-11 min-w-11`.

---

## 7. Authentication

### 7.1 Single auth file

`internal/auth/auth.go` (one file, ~200 lines) contains:

- **Password:** `HashPassword(plain) (string, error)` (bcrypt cost 12), `VerifyPassword(hash, plain) bool`.
- **Session token:** `newToken() string` (32 bytes from `crypto/rand`, base64-url).
- **DB ops:** `CreateSession(ctx, q, userID, ttl)`, `LookupSession(ctx, q, token) (userID int64, err error)`, `DeleteSession(ctx, q, token)`.
- **Cookie:** `CookieName = "tatagereja_session"`, `SetCookie(w, token, secure bool)`, `ClearCookie(w)`. `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in prod.
- **HTTP:** `MountRoutes(r chi.Router, cfg, q, rdr)` registers `GET /login`, `POST /login`, `POST /logout`. Handlers are private funcs in this same file.

### 7.2 `internal/db/queries/auth.sql`

```sql
-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = ?;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = ?;

-- name: CreateSession :one
INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?) RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions
WHERE token = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now');

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token = ?;
```

### 7.3 Flow

1. `POST /login` with `email`+`password`. Backend verifies bcrypt. On success: insert session row, set cookie, redirect `/`.
2. `RequireAuth` middleware reads cookie, calls `LookupSession`, redirects to `/login` on failure.
3. `POST /logout`: `DeleteSession`, clear cookie, redirect `/login`.

### 7.4 Why this is enough

One person per account. Weekly re-login is fine. No JWT secret. Logout is one DELETE. `HttpOnly` cookie + same-origin → no XSS token theft, no CORS.

### 7.5 Password reset

Owner re-runs `cmd/seed-admin` against the same email — it upserts. Defer in-app reset UI to post-MVP.

---

## 8. Routes

All routes return HTML. No JSON API.

**Conventions:**

- Unauth → redirect `/login`.
- Validation fail → 422 + re-rendered form with inline errors.
- Mutation success → PRG: set flash cookie, `http.Redirect(303)` (or `HX-Redirect` for HTMX).
- 404 when ID exists but belongs to another user.

### Auth

| Method | Path | Behavior |
|--------|------|----------|
| GET  | `/login`  | Render form |
| POST | `/login`  | Authenticate → redirect `/` or re-render |
| POST | `/logout` | Delete session, clear cookie → `/login` |

### Jemaat

| Method | Path | Behavior |
|--------|------|----------|
| GET    | `/jemaat`              | List (`?q=`, `?limit=`, `?offset=`) |
| GET    | `/jemaat/new`          | Form |
| POST   | `/jemaat`              | Create → redirect |
| GET    | `/jemaat/{id}`         | Detail |
| GET    | `/jemaat/{id}/edit`    | Edit form |
| PUT    | `/jemaat/{id}`         | Update → redirect |
| DELETE | `/jemaat/{id}`         | Soft delete → redirect |

### Keluarga

| Method | Path | Behavior |
|--------|------|----------|
| GET    | `/keluarga`            | List |
| GET    | `/keluarga/new`        | Form |
| POST   | `/keluarga`            | Create → redirect |
| GET    | `/keluarga/{id}`       | Detail + member list |
| GET    | `/keluarga/{id}/edit`  | Edit |
| PUT    | `/keluarga/{id}`       | Update → redirect |
| DELETE | `/keluarga/{id}`       | Delete → redirect |

### Pelayan

| Method | Path | Behavior |
|--------|------|----------|
| GET    | `/pelayan`             | List (jemaat name + service types) |
| GET    | `/pelayan/new`         | Form (jemaat dropdown + service-type checkboxes) |
| POST   | `/pelayan`             | Create → redirect |
| GET    | `/pelayan/{id}`        | Detail |
| GET    | `/pelayan/{id}/edit`   | Edit |
| PUT    | `/pelayan/{id}`        | Update → redirect |
| DELETE | `/pelayan/{id}`        | Remove → redirect |

### Service Types

| Method | Path | Behavior |
|--------|------|----------|
| GET    | `/service-types`           | List with inline add row |
| POST   | `/service-types`           | Create → redirect or HTMX append |
| GET    | `/service-types/{id}/edit` | HTMX inline edit fragment |
| PUT    | `/service-types/{id}`      | Update → redirect or swap row |
| DELETE | `/service-types/{id}`      | Delete (409 if referenced by jadwal) |

### Kebaktian + Jadwal

| Method | Path | Behavior |
|--------|------|----------|
| GET    | `/kebaktian`                 | List (`?from=`, `?to=`) |
| GET    | `/kebaktian/new`             | Form |
| POST   | `/kebaktian`                 | Create → redirect |
| GET    | `/kebaktian/{id}`            | Detail |
| GET    | `/kebaktian/{id}/edit`       | Edit |
| PUT    | `/kebaktian/{id}`            | Update → redirect |
| DELETE | `/kebaktian/{id}`            | Delete (cascades jadwal) → redirect |
| GET    | `/kebaktian/{id}/jadwal`     | Jadwal editor |
| POST   | `/kebaktian/{id}/jadwal`     | Bulk-replace slots → redirect |

### Status codes

| Status | Cause |
|--------|-------|
| 302/303 | PRG redirect after success |
| 422 | Validation failure (re-render form) |
| 404 | Not found OR belongs to another user |
| 409 | Conflict (unique, dependent rows) |
| 500 | Server error |

---

## 9. Validation Rules

Server-side only, hand-written using stdlib (`strings.TrimSpace`, `net/mail.ParseAddress`, `time.Parse`, `strconv`).

### Auth
- `email`: required, parseable as email, ≤200 chars.
- `password`: required.

### Jemaat
- `nama_lengkap`: **required**, 1–200.
- `nama_panggilan`: ≤100.
- `jenis_kelamin`: empty or `L`/`P`.
- `tanggal_lahir`, `tanggal_baptis`, `tanggal_sidi`: empty or valid `YYYY-MM-DD`, not in future.
- `tanggal_sidi` ≥ `tanggal_baptis` if both set.
- `tempat_lahir`: ≤100. `alamat`: ≤500. `nomor_telepon`: ≤30. `email`: empty or valid, ≤200.
- `status_pernikahan`: empty or `belum_menikah|menikah|cerai|duda|janda`.
- `keluarga_id`: optional; must reference caller's keluarga.
- `catatan`: ≤2000.

### Keluarga
- `nama_keluarga`: required, 1–200. `alamat`: ≤500. `catatan`: ≤2000.

### Service Types
- `nama`: required, 1–100, unique per user. `deskripsi`: ≤500. `urutan`: int, default 0.

### Pelayan
- `jemaat_id`: required, must belong to caller.
- `catatan`: ≤2000.
- `service_type_ids[]`: each must belong to caller.

### Kebaktian
- `nama`: required, 1–200.
- `waktu_mulai`: required `datetime-local`, parsed in user tz.
- `lokasi`: ≤200. `tema`: ≤300. `pengkhotbah`: ≤200. `catatan`: ≤2000.

### Jadwal slot
- `service_type_id`: from form field name; must belong to caller.
- `pelayan_id`: optional; if set must belong to caller.
- `catatan`: ≤500.

---

## 10. Development & Deployment

Contributors need: Go 1.23+, `sqlc`, `air`. No Node.

### Makefile

```makefile
.PHONY: help setup dev build test lint sqlc seed-admin clean
help:
	@echo "setup | dev | build | test | lint | sqlc | seed-admin | clean"
setup:       ; cd backend && go mod download
dev:         ; cd backend && air
build:       ; cd backend && go build -o bin/server ./cmd/server
test:        ; cd backend && go test -race -cover ./...
lint:        ; cd backend && golangci-lint run
sqlc:        ; cd backend && sqlc generate
seed-admin:  ; cd backend && go run ./cmd/seed-admin
clean:       ; rm -rf backend/bin backend/tmp
```

### `.air.toml`

```toml
root = "."
tmp_dir = "tmp"
[build]
  bin = "./tmp/server"
  cmd = "go build -o ./tmp/server ./cmd/server"
  delay = 1000
  exclude_dir = ["tmp", "vendor", "bin"]
  exclude_regex = ["_test.go"]
  include_ext = ["go", "html"]
  stop_on_error = true
```

### `.env.example`

```
PORT=8080
APP_ENV=development
SQLITE_PATH=./data/tatagereja.db
LITESTREAM_REPLICA_URL=file://./data/replica
LOG_LEVEL=debug
# For S3 replica (production):
# LITESTREAM_REPLICA_URL=s3://your-bucket/tatagereja
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_REGION=ap-southeast-1
```

### `Procfile`

```
web: bin/server
```

### First-run for contributors

```bash
git clone https://github.com/<owner>/tatagereja
cd tatagereja
make setup
cp backend/.env.example backend/.env
# defaults use local file replica under backend/data/ — no cloud setup needed
make seed-admin
make dev
# open http://localhost:8080
```

Add `backend/data/` to `.gitignore` (SQLite file + local Litestream replica).

### Heroku deploy

`git push heroku <branch>:main` (root `go.mod` + `// +heroku install` build `bin/server`). Set Heroku config:

```
APP_ENV=production
SQLITE_PATH=/tmp/tatagereja.db
LITESTREAM_REPLICA_URL=s3://<bucket>/tatagereja
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-southeast-1
```

Schema applies on boot — no separate migrate step. On first deploy the S3 prefix is empty; the app creates a fresh DB and Litestream begins replicating. Run `heroku run bin/seed-admin -- --email=... --password=... --display-name=... --church-name=...` once to create the admin user (uses restore/sync path so the user persists across dyno restarts).

---

## 11. Testing

Tests use **in-memory SQLite** via `modernc.org/sqlite` (`:memory:`). Same driver and SQL dialect as production; sqlc code works unchanged. Tests skip Litestream — no replication needed.

`tests/testutil.go`:

```go
func NewTestDB(t *testing.T) (*sql.DB, *sqlc.Queries) {
    t.Helper()
    d, err := sql.Open("sqlite", ":memory:")
    if err != nil { t.Fatal(err) }
    if _, err := d.Exec("PRAGMA foreign_keys = ON"); err != nil { t.Fatal(err) }
    if err := db.Apply(d); err != nil { t.Fatal(err) }
    t.Cleanup(func() { d.Close() })
    return d, sqlc.New(d)
}

func SeedTwoUsers(t *testing.T, q *sqlc.Queries) (u1, u2 int64) { /* ... */ }
```

**Required test categories per entity:**

1. Happy-path CRUD.
2. **Cross-user isolation** (`tests/cross_user_test.go`) — call X's row as user Y, expect `sql.ErrNoRows` / 404.
3. Validation: missing required, oversized, malformed.
4. Auth: no cookie → redirect `/login`.

Example:

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

---

## 12. MVP Phases

**Phase 0 — Foundation**
Repo scaffold, `Procfile`, `LICENSE`, `Makefile`, `schema.sql`, sqlc working, embedded Litestream (file replica for dev), schema applies on boot, `/health`, login page + session auth, base layout. Done when owner runs `make dev`, logs in, sees empty nav, and restarting the server preserves data via the local replica.

**Phase 1 — Jemaat + Keluarga CRUD**
Backend queries + handlers, templates (list/form/detail), search + pagination, cross-user isolation tests. Done when owner adds 50 jemaat across 10 keluarga.

**Phase 2 — Pelayan + Service Types**
Service-types CRUD with inline HTMX editing, pelayan CRUD with jemaat dropdown + service-type checkboxes. Done when owner marks 10 jemaat as pelayan.

**Phase 3 — Jadwal Pelayanan**
Kebaktian CRUD, jadwal bulk-replace transaction, jadwal editor template. Done when owner schedules 4 upcoming Sundays.

**Phase 4 — Polish & later ideas**
Print-friendly schedule, CSV export, birthday widget, recurring kebaktian. Defer until requested.

---

## 13. Non-Negotiable Rules

### User-data isolation (most important)
1. Every domain table has `user_id NOT NULL`.
2. Every query filters by `user_id` from session.
3. Never accept `user_id` from form or URL.
4. Return 404 (not 403) when an ID exists but belongs to another user.
5. `tests/cross_user_test.go` is required and covers every entity.

### Security
1. bcrypt cost ≥ 12.
2. Session tokens: 32+ bytes from `crypto/rand`, opaque, stored in `sessions`.
3. Cookies: `HttpOnly`, `Secure` in prod, `SameSite=Lax`.
4. Validate all inputs server-side.
5. Parameterized queries only (sqlc enforces).
6. Never log passwords or tokens.
7. Use `html/template` (auto-escapes).

### Database
1. SQLite-standard SQL only.
2. `schema.sql` is the single source of truth.
3. Schema applied idempotently on every boot.
4. Production uses `modernc.org/sqlite` + embedded Litestream; tests use in-memory `modernc.org/sqlite` without Litestream.
5. PRAGMAs via DSN params, not `Exec("PRAGMA ...")` on the pool.
6. Shutdown order: HTTP server → `database.Close()` → `store.Close()`.

### Code quality
1. `go test ./...` green before merge.
2. `golangci-lint run` green.
3. `sqlc generate` produces no diff against committed code.
4. No `panic()` in handlers.
5. `slog` for logging.
6. Wrap errors with `fmt.Errorf("context: %w", err)`.

### Routes & rendering
1. All routes return HTML.
2. Validation fail → 422 + re-rendered form with `Errors map[string]string`.
3. Success mutation → PRG (flash cookie + 303), or `HX-Redirect` for HTMX.
4. Never concatenate user input into HTML strings.

### HTMX
1. Use it only where full-page reload feels jarring.
2. Every page works with JS disabled (standard `<form>` fallback).
3. `hx-confirm` for destructive actions.

### Git
1. `main` always runnable.
2. Feature branches: `feat/<name>`. Squash merge.

### Privacy
1. README declares hobby-project status.
2. `ON DELETE CASCADE` on `users` wipes everything for that user.

---

## 14. Out of Scope

- Public self-signup / SaaS billing
- Multi-user per account (roles, permissions)
- Email sending, push notifications
- Native mobile apps, websockets
- File uploads (photos)
- i18n beyond inline Indonesian strings
- Sermon / financial / attendance management
- Audit log
- Migration tool (defer until schema versioning needed)
- Skill levels for pelayan, color-coded service types

---

## 15. Glossary

- **Jemaat** — church member.
- **Keluarga** — family unit; groups jemaat.
- **Pelayan** — volunteer who performs roles in services.
- **Kebaktian** — Sunday worship or weekday fellowship.
- **Jadwal Pelayanan** — schedule assigning pelayan to roles in a kebaktian.
- **Sidi** — confirmation (Protestant tradition).
- **Service Type** — role in a service (worship leader, singer, multimedia, usher).

---

End of plan.
