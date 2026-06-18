# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the tatagereja foundation — a single pure-Go process that serves an embedded Vite+ React SPA and a JSON API with SQLite-backed email/password auth.

**Architecture:** One Go process boots config → SQLite (WAL) → migrations → idempotent seeds → replicator (no-op) → HTTP, with graceful shutdown. `sqlc` generates typed queries; a `Store` wrapper notifies replication after committed mutations. Auth uses Argon2id + SQLite sessions with an HMAC-signed cookie; CSRF is Go 1.25 `net/http.CrossOriginProtection`. The React app is built by Vite+ and embedded via `embed.FS`.

**Tech Stack:** Go 1.25 (`CGO_ENABLED=0`), `modernc.org/sqlite`, `github.com/go-chi/chi/v5`, `sqlc`, `golang.org/x/crypto/argon2`, `net/http.CrossOriginProtection`; Vite+ (`vite-plus` alpha) + React + TypeScript + Tailwind v4 + TanStack Router/Query + Valibot + React Hook Form + shadcn/ui + sonner.

## Global Constraints

- Pure Go only: every backend build and test runs with `CGO_ENABLED=0`. No cgo deps.
- SQLite driver is `modernc.org/sqlite` (pure Go).
- SQLite pragmas on every connection: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`.
- Every mutating DB operation notifies `replicator.NotifyWrite()` after a successful commit; read-only ops never notify.
- CSRF is `net/http.CrossOriginProtection`. No `/api/csrf`, no `X-CSRF-Token`, no token plumbing.
- Session cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production; value is the session id HMAC-signed with `SESSION_SECRET`.
- `SESSION_SECRET` must be ≥32 bytes; required outside `APP_ENV=development`.
- Uniform auth errors: invalid email / wrong password / missing user all return the same generic message.
- API + health responses set `Cache-Control: no-store`.
- Litestream and Turnstile are no-op stubs behind real interfaces in this milestone.
- Module path: `github.com/thomasbudiarjo/tatagereja`.
- Frontend package manager: npm. Vite+ driven through `package.json` scripts (`vp dev/build/lint/check/test/fmt`).

---

## Phase A — Backend skeleton

### Task 1: Go module + config

**Files:**
- Create: `go.mod` (via `go mod init github.com/thomasbudiarjo/tatagereja`)
- Create: `internal/config/config.go`
- Test: `internal/config/config_test.go`

**Interfaces:**
- Produces: `type Config struct { AppEnv string; Port string; DatabasePath string; SessionSecret []byte; R2 R2Config; Litestream LitestreamConfig; TurnstileSecret string }`, `func Load() (Config, error)`, `func (c Config) IsProduction() bool`, `func (c Config) IsDevelopment() bool`.
- `Load` reads env: `APP_ENV` (default `development`), `PORT` (default `8080`), `DATABASE_PATH` (default `./data/app.db`), `SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, and the R2/Litestream vars (read into structs, not validated yet). Outside development, `SESSION_SECRET` is required and must be ≥32 bytes; in development a fixed dev default is used if unset.

- [ ] **Step 1: Write failing tests**

```go
package config

import "testing"

func TestLoadDefaultsInDevelopment(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("SESSION_SECRET", "")
	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.Port != "8080" || c.DatabasePath != "./data/app.db" {
		t.Fatalf("unexpected defaults: %+v", c)
	}
	if len(c.SessionSecret) < 32 {
		t.Fatalf("dev session secret should be padded to >=32 bytes")
	}
	if !c.IsDevelopment() {
		t.Fatal("expected development")
	}
}

func TestLoadRequiresSessionSecretInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SESSION_SECRET", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for missing SESSION_SECRET in production")
	}
}

func TestLoadRejectsShortSecretInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SESSION_SECRET", "tooshort")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for short SESSION_SECRET")
	}
}
```

- [ ] **Step 2: Run, verify fail** — `CGO_ENABLED=0 go test ./internal/config/...` → FAIL (package/func undefined).

- [ ] **Step 3: Implement `config.go`**

```go
package config

import (
	"errors"
	"os"
)

type R2Config struct {
	AccessKeyID, SecretAccessKey, Bucket, Endpoint, ReplicaPath string
}

type LitestreamConfig struct {
	SyncInterval, CUDDebounce string
}

type Config struct {
	AppEnv          string
	Port            string
	DatabasePath    string
	SessionSecret   []byte
	R2              R2Config
	Litestream      LitestreamConfig
	TurnstileSecret string
}

func (c Config) IsProduction() bool  { return c.AppEnv == "production" }
func (c Config) IsDevelopment() bool { return c.AppEnv == "development" || c.AppEnv == "" }

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func Load() (Config, error) {
	c := Config{
		AppEnv:          env("APP_ENV", "development"),
		Port:            env("PORT", "8080"),
		DatabasePath:    env("DATABASE_PATH", "./data/app.db"),
		TurnstileSecret: os.Getenv("TURNSTILE_SECRET_KEY"),
		R2: R2Config{
			AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
			SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
			Bucket:          os.Getenv("R2_BUCKET"),
			Endpoint:        os.Getenv("R2_ENDPOINT"),
			ReplicaPath:     os.Getenv("R2_REPLICA_PATH"),
		},
		Litestream: LitestreamConfig{
			SyncInterval: env("LITESTREAM_SYNC_INTERVAL", "10m"),
			CUDDebounce:  env("LITESTREAM_CUD_DEBOUNCE", "3s"),
		},
	}

	secret := os.Getenv("SESSION_SECRET")
	if c.IsDevelopment() {
		if secret == "" {
			secret = "dev-insecure-session-secret-change-me-please"
		}
	} else {
		if secret == "" {
			return Config{}, errors.New("SESSION_SECRET is required outside development")
		}
		if len(secret) < 32 {
			return Config{}, errors.New("SESSION_SECRET must be at least 32 bytes")
		}
	}
	c.SessionSecret = []byte(secret)
	return c, nil
}
```

- [ ] **Step 4: Run, verify pass** — `CGO_ENABLED=0 go test ./internal/config/...` → PASS.
- [ ] **Step 5: Commit** — `git add go.mod internal/config && git commit -m "feat(config): load and validate environment configuration"`

---

### Task 2: HTTP server skeleton + middleware + graceful shutdown

**Files:**
- Create: `internal/http/server.go` (router builder), `internal/http/middleware/middleware.go` (custom middleware), `internal/http/respond.go` (JSON helpers)
- Create: `cmd/server/main.go`
- Test: `internal/http/server_test.go`

**Interfaces:**
- Produces: `type Deps struct { Config config.Config; ... }` (extended in later tasks); `func NewRouter(deps Deps) http.Handler`. `respond.JSON(w, status, v)`, `respond.Error(w, status, msg)`.
- `NewRouter` mounts chi middleware (RequestID, Recoverer, Timeout 30s), a `SecurityHeaders` middleware, and under `/api` a `NoStore` + `Content-Type` group. `/healthz` returns `{"status":"ok"}` with `no-store`.
- Produces middleware: `middleware.SecurityHeaders(isProd bool)`, `middleware.NoStore`, `middleware.MaxBytes(n int64)`, `middleware.RequireJSON`.

- [ ] **Step 1: Failing test** — `server_test.go`: GET `/healthz` returns 200, body contains `"ok"`, header `Cache-Control: no-store`; unknown `/api/nope` returns 404.

```go
package http_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	apphttp "github.com/thomasbudiarjo/tatagereja/internal/http"
)

func TestHealthz(t *testing.T) {
	srv := httptest.NewServer(apphttp.NewRouter(apphttp.Deps{}))
	defer srv.Close()
	res, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("status=%d", res.StatusCode)
	}
	if cc := res.Header.Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("cache-control=%q", cc)
	}
}

func TestUnknownAPIRoute404(t *testing.T) {
	srv := httptest.NewServer(apphttp.NewRouter(apphttp.Deps{}))
	defer srv.Close()
	res, _ := http.Get(srv.URL + "/api/nope")
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status=%d", res.StatusCode)
	}
	_ = strings.TrimSpace("")
}
```

- [ ] **Step 2: Run, verify fail** — package undefined.
- [ ] **Step 3: Implement** `respond.go`, `middleware/middleware.go`, `server.go`.

`respond.go`:
```go
package http

import (
	"encoding/json"
	"net/http"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
```

`middleware/middleware.go` (SecurityHeaders, NoStore, MaxBytes, RequireJSON) — set `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: ...`, a CSP, and `Strict-Transport-Security` only when `isProd`. `NoStore` sets `Cache-Control: no-store`. `MaxBytes` wraps `r.Body` with `http.MaxBytesReader`. `RequireJSON` rejects non-`application/json` bodies on unsafe methods with 415.

`server.go`: build chi router, mount chi middleware + `SecurityHeaders`, define `/healthz`, and an `/api` subrouter with `NoStore`; unmatched `/api/*` → 404 JSON. `Deps` struct holds `config.Config` (and later DB/auth deps).

`cmd/server/main.go`: load config, build router, `http.Server`, listen, and graceful shutdown on `SIGTERM`/`SIGINT` (independent shutdown context, `server.Shutdown`, then close hooks). Log startup line.

- [ ] **Step 4: Run, verify pass** — `CGO_ENABLED=0 go test ./internal/http/...`.
- [ ] **Step 5: `go build`** — `CGO_ENABLED=0 go build ./...` succeeds.
- [ ] **Step 6: Commit** — `git commit -m "feat(http): server skeleton, middleware, graceful shutdown"`

---

### Task 3: Embedded frontend serving with build-tag fallback

**Files:**
- Create: `internal/frontend/embed_prod.go` (`//go:build !devfrontend`), `internal/frontend/embed_dev.go` (`//go:build devfrontend`), `internal/frontend/serve.go`
- Create: `internal/frontend/dist/.gitkeep` and a placeholder `internal/frontend/dist/index.html` so `embed` compiles before the real build.
- Test: `internal/frontend/serve_test.go`

**Interfaces:**
- Produces: `func Handler() http.Handler` — serves embedded `dist`, hashed assets directly, SPA fallback to `index.html`. Never serves under `/api`. `func Available() bool`.
- `embed_prod.go` declares `//go:embed all:dist` `var distFS embed.FS`. `embed_dev.go` provides an empty FS for builds that don't ship assets.

- [ ] **Step 1: Failing test** — request `/` returns the placeholder index html (200); request `/assets/x.js` for a present file returns it.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the embed FS + `Handler()` (use `fs.Sub(distFS, "dist")`, `http.FileServerFS`, with a fallback that serves `index.html` for non-asset, non-API paths that 404).
- [ ] **Step 4: Mount in `server.go`** — `r.Handle("/*", frontend.Handler())` as the last route (after `/api` + `/healthz`).
- [ ] **Step 5: Run, verify pass + `go build ./...`.**
- [ ] **Step 6: Commit** — `git commit -m "feat(frontend): embedded SPA serving with SPA fallback"`

---

## Phase B — Database layer

### Task 4: SQLite connection with WAL pragmas

**Files:**
- Create: `internal/db/db.go`
- Test: `internal/db/db_test.go`

**Interfaces:**
- Produces: `func Open(path string) (*sql.DB, error)` — registers/uses `modernc.org/sqlite`, applies pragmas via DSN and `PRAGMA` statements, sets `SetMaxOpenConns(1)` for the single-writer model. `func Ping(db *sql.DB) error`.

- [ ] **Step 1: Failing test** — open a temp-file DB, assert `PRAGMA journal_mode` returns `wal`, `PRAGMA foreign_keys` returns `1`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `Open` using DSN `file:<path>?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=synchronous(NORMAL)` with driver name `sqlite`; create parent dir if missing.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: `go get modernc.org/sqlite` then commit** — `git commit -m "feat(db): pure-Go SQLite connection with WAL pragmas"`

---

### Task 5: Migrator + initial schema

**Files:**
- Create: `internal/db/migrate.go`, `internal/db/migrations/0001_init.sql`, `internal/db/migrations/embed.go`
- Test: `internal/db/migrate_test.go`

**Interfaces:**
- Produces: `func Migrate(db *sql.DB) (changed bool, err error)`. Reads `*.sql` from embedded `migrations/`, sorted by filename; each unapplied file runs in a transaction; applied names recorded in `schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`. `changed` is true if any migration ran.

`0001_init.sql`:
```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE pelayanan_types (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL
);
```

- [ ] **Step 1: Failing test** — fresh DB: `Migrate` returns `changed=true`; tables exist; second `Migrate` returns `changed=false`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `embed.go` (`//go:embed migrations/*.sql` `var migrationsFS embed.FS`) and `Migrate`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(db): embedded migrator and initial schema"`

---

### Task 6: Idempotent seeder

**Files:**
- Create: `internal/db/seed.go`, `internal/db/seeds/0001_pelayanan_types.sql`, add `//go:embed seeds/*.sql` to `embed.go`
- Test: `internal/db/seed_test.go`

**Interfaces:**
- Produces: `func Seed(db *sql.DB) (changed bool, err error)` — runs each `seeds/*.sql` (sorted); `changed` reflects total `RowsAffected > 0`.

`seeds/0001_pelayanan_types.sql`:
```sql
INSERT INTO pelayanan_types (code, name) VALUES
    ('ibadah_umum', 'Ibadah Umum'),
    ('pemuda', 'Pemuda')
ON CONFLICT (code) DO UPDATE SET name = excluded.name;
```

- [ ] **Step 1: Failing test** — after `Migrate`, first `Seed` inserts rows (`changed=true`); rows count == 2; second `Seed` is idempotent (no error, row count still 2).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `Seed`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(db): idempotent SQL seeds"`

---

### Task 7: sqlc queries + Store wrapper

**Files:**
- Create: `sqlc.yaml`, `internal/db/queries/users.sql`, `internal/db/queries/sessions.sql`
- Generate: `internal/db/gen/*` (package `gen`)
- Create: `internal/db/store.go`
- Test: `internal/db/store_test.go`

**Interfaces:**
- `sqlc.yaml`: engine sqlite, queries `internal/db/queries`, schema `internal/db/migrations`, out `internal/db/gen`, package `gen`, `emit_interface: true`.
- Queries (named): `CreateUser`, `GetUserByEmail`, `GetUserByID`, `CreateSession`, `GetSession`, `DeleteSession`, `DeleteExpiredSessions`, `RotateSessionID` (or delete+create), `GetUserBySessionID`.
- Produces: `type Notifier interface { NotifyWrite() }`; `type Store struct { *gen.Queries; db *sql.DB; repl Notifier }`; `func NewStore(db *sql.DB, repl Notifier) *Store`; `func (s *Store) Tx(ctx, fn func(*gen.Queries) error) error` — runs fn in a tx, commits, then `repl.NotifyWrite()`. Read helpers call `gen.Queries` directly (no notify).

- [ ] **Step 1: Write `sqlc.yaml` + query files.**
- [ ] **Step 2: Generate** — `go run github.com/sqlc-dev/sqlc/cmd/sqlc generate` (pinned via `go.mod` tool or `go run`). Verify `internal/db/gen` created.
- [ ] **Step 3: Failing test** — `store_test.go`: a fake `Notifier` counts calls; `Tx` that creates a user increments the counter once; a read query does not.
- [ ] **Step 4: Implement `store.go`.**
- [ ] **Step 5: Run, verify pass** — `CGO_ENABLED=0 go test ./internal/db/...`.
- [ ] **Step 6: Commit** — `git commit -m "feat(db): sqlc queries and replication-aware Store"`

---

## Phase C — Replicator stub

### Task 8: Replicator interface + no-op impl + boot wiring

**Files:**
- Create: `internal/litestream/replicator.go`, `internal/litestream/noop.go`
- Modify: `cmd/server/main.go` (full boot lifecycle)
- Test: `internal/litestream/noop_test.go`

**Interfaces:**
- Produces: `type Replicator interface { Start(ctx context.Context) error; NotifyWrite(); Flush(ctx context.Context) error; Close(ctx context.Context) error }`; `func NewNoop(logger *slog.Logger) Replicator`. Noop methods log at debug and return nil; `NotifyWrite` is safe to call concurrently.
- `main.go` boot order: load config → `db.Open` → `db.Migrate` (changed1) → `db.Seed` (changed2) → `repl.Start` → if `changed1||changed2` then `repl.NotifyWrite()`+`repl.Flush(ctx)` → build router with `Store`/auth deps → serve. Shutdown: `server.Shutdown` → `repl.Flush` → `repl.Close` → `db.Close`.

- [ ] **Step 1: Failing test** — `NewNoop` methods return nil; `NotifyWrite` doesn't panic from 100 goroutines.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement interface + noop.**
- [ ] **Step 4: Wire boot lifecycle in `main.go`.**
- [ ] **Step 5: Run tests + `go build ./...`; manual `CGO_ENABLED=0 go run ./cmd/server` boots and `/healthz` responds.**
- [ ] **Step 6: Commit** — `git commit -m "feat(litestream): no-op replicator and full boot lifecycle"`

---

## Phase D — Auth

### Task 9: Argon2id password hashing

**Files:**
- Create: `internal/auth/password.go`
- Test: `internal/auth/password_test.go`

**Interfaces:**
- Produces: `func HashPassword(plain string) (string, error)` (PHC-encoded `$argon2id$v=19$m=...,t=...,p=...$salt$hash`), `func VerifyPassword(encoded, plain string) (bool, error)`. Params: m=64MB, t=3, p=2 (tune in comment), 16-byte salt, 32-byte key.

- [ ] **Step 1: Failing test** — hash then verify true; wrong password verifies false; two hashes of same password differ (random salt); malformed encoded string errors.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** with `golang.org/x/crypto/argon2` + `crypto/rand` + `encoding/base64` + `crypto/subtle.ConstantTimeCompare`.
- [ ] **Step 4: Run, verify pass** — `go get golang.org/x/crypto/argon2`.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): argon2id password hashing"`

---

### Task 10: Session cookie signing + store helpers

**Files:**
- Create: `internal/auth/cookie.go` (HMAC sign/verify), `internal/auth/session.go` (session lifecycle over Store)
- Test: `internal/auth/cookie_test.go`, `internal/auth/session_test.go`

**Interfaces:**
- Produces: `func SignValue(secret []byte, value string) string` (`value.base64(hmac)`), `func VerifyValue(secret []byte, signed string) (string, bool)`. `func NewSessionID() string` (32 random bytes, base64url). Cookie constants: name `tg_session`, `cookieOpts(isProd)`.
- Session helpers on a sessions service backed by `*db.Store`: `Create(ctx, userID) (id string, err)`, `UserForID(ctx, id) (gen.User, error)`, `Delete(ctx, id) error`, `Rotate(ctx, oldID, userID) (newID string, err)`. Default TTL 30 days.

- [ ] **Step 1: Failing tests** — `SignValue`/`VerifyValue` roundtrip; tampered signature rejected; wrong secret rejected. `NewSessionID` returns distinct values.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `cookie.go`.**
- [ ] **Step 4: Failing tests for session lifecycle** (use temp DB + Store): create→fetch user; rotate changes id and old id no longer resolves; expired session not returned.
- [ ] **Step 5: Implement `session.go`.**
- [ ] **Step 6: Run, verify pass.**
- [ ] **Step 7: Commit** — `git commit -m "feat(auth): signed session cookies and session lifecycle"`

---

### Task 11: Auth service (register/login/logout/me)

**Files:**
- Create: `internal/auth/service.go`, `internal/auth/errors.go`
- Test: `internal/auth/service_test.go`

**Interfaces:**
- Produces: `var ErrInvalidCredentials = errors.New("invalid email or password")`, `var ErrEmailTaken = errors.New("email already registered")`. `type Service struct { store *db.Store; ... }`; `func NewService(store *db.Store) *Service`; `func (s *Service) Register(ctx, email, password string) (gen.User, sessionID string, err error)` (normalizes email, checks uniqueness, hashes, creates user+session in one `store.Tx`), `func (s *Service) Login(ctx, email, password string) (gen.User, sessionID string, err error)` (uniform `ErrInvalidCredentials`; rotate handled by handler), `func (s *Service) Logout(ctx, sessionID string) error`, `func (s *Service) Me(ctx, sessionID string) (gen.User, error)`.

- [ ] **Step 1: Failing tests** — register creates user + session (Notifier called); duplicate email → `ErrEmailTaken`; login wrong password → `ErrInvalidCredentials`; login missing user → same `ErrInvalidCredentials`; `Me` returns user for valid session, error for unknown.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement service.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): register/login/logout/me service"`

---

### Task 12: Auth HTTP handlers + session middleware

**Files:**
- Create: `internal/http/auth_handlers.go`, `internal/http/middleware/session.go`
- Modify: `internal/http/server.go` (mount routes, extend `Deps`)
- Test: `internal/http/auth_handlers_test.go`

**Interfaces:**
- `Deps` gains `Auth *auth.Service`, `Sessions *auth.SessionService`, `IsProd bool`, `Secret []byte`.
- Handlers: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`. Register/login set a signed session cookie and rotate on login. `/api/me` reads cookie → verify signature → session lookup → user JSON or 401. Request bodies validated; `turnstileToken` accepted but unused. Uniform error responses.
- `middleware.Session(secret, sessions)` populates request context with the current user (or none); a `RequireUser` helper returns 401 when absent.

- [ ] **Step 1: Failing tests (httptest, with same-origin headers)** — register returns 201 + sets `tg_session` cookie; `/api/me` with that cookie returns the user; `/api/me` without cookie returns 401; login with wrong password returns 401 + uniform error; logout clears the cookie.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement handlers + session middleware; mount in `server.go`.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(http): auth handlers and session middleware"`

---

### Task 13: CrossOriginProtection + auth throttle

**Files:**
- Create: `internal/http/middleware/csrf.go` (CrossOriginProtection builder), `internal/http/middleware/throttle.go`
- Modify: `internal/http/server.go`
- Test: `internal/http/middleware/csrf_test.go`, `internal/http/middleware/throttle_test.go`

**Interfaces:**
- Produces: `func CrossOrigin(trustedOrigins []string) func(http.Handler) http.Handler` — wraps `http.NewCrossOriginProtection()`, adds trusted origins, sets a JSON-403 deny handler. Applied to the `/api` subrouter.
- Produces: `func AuthThrottle(max int, window time.Duration) func(http.Handler) http.Handler` — in-memory per-key (IP + normalized email if present) counter; returns 429 JSON when exceeded. Applied to `/api/auth/*`.

- [ ] **Step 1: Failing tests** — a `POST /api/auth/login` with `Sec-Fetch-Site: cross-site` → 403 JSON; with `Sec-Fetch-Site: same-origin` → passes to handler; safe `GET` always passes. Throttle: N+1 rapid requests from same IP → 429.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement both; wire into `server.go`.**
- [ ] **Step 4: Run, verify pass** — `CGO_ENABLED=0 go test ./...`.
- [ ] **Step 5: Commit** — `git commit -m "feat(http): cross-origin protection and auth throttling"`

---

## Phase E — Frontend (Vite+)

### Task 14: Scaffold Vite+ React app

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/styles.css` (Tailwind v4), `frontend/.gitignore`
- Add dev dep: `vite-plus`, `react`, `react-dom`, `typescript`, `tailwindcss`, `@tailwindcss/vite`

**Interfaces:**
- `package.json` scripts: `"dev":"vp dev"`, `"build":"vp build"`, `"lint":"vp lint"`, `"typecheck":"vp check"`, `"test":"vp test"`, `"format":"vp fmt"`. Output dir set to `../internal/frontend/dist` so the Go embed picks up the build.
- `vite.config.ts` from `defineConfig` (`vite-plus`), React plugin, `@tailwindcss/vite`, `build.outDir: "../internal/frontend/dist"`, `build.emptyOutDir: true`, and `server.proxy["/api"]` + `["/healthz"]` → `http://localhost:8080`.

- [ ] **Step 1: Install Vite+** — `cd frontend && npm install -D vite-plus` (and React/TS/Tailwind deps). If `vp` subcommands fail under alpha, capture output and report before proceeding.
- [ ] **Step 2: Write config + minimal `main.tsx` rendering "tatagereja".**
- [ ] **Step 3: Verify** — `npx vp build` produces `internal/frontend/dist/index.html`; `npx vp check` passes.
- [ ] **Step 4: Commit** — `git commit -m "feat(frontend): scaffold Vite+ React app"`

---

### Task 15: Typed API client + Valibot schemas

**Files:**
- Create: `frontend/src/lib/api.ts`, `frontend/src/lib/schemas.ts`
- Test: `frontend/src/lib/api.test.ts`

**Interfaces:**
- Produces: `apiFetch<T>(path, { method, body, schema })` — `credentials: "include"`, sets JSON content-type for bodies, throws `ApiError` on non-2xx (with `status`), throws `UnauthorizedError` on 401, parses success with a Valibot `schema`. `export const UserSchema = v.object({ id: v.string(), email: v.string() })`.

- [ ] **Step 1: Failing tests (Vitest)** — mock `fetch`: success parses + returns typed data; 401 throws `UnauthorizedError`; non-JSON/invalid shape throws; request includes `credentials: "include"`.
- [ ] **Step 2: Run, verify fail** — `npx vp test`.
- [ ] **Step 3: Implement `api.ts` + `schemas.ts`.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(frontend): typed fetch API client with Valibot parsing"`

---

### Task 16: Query + Router providers, useMe

**Files:**
- Create: `frontend/src/lib/queries.ts` (`useMe`), `frontend/src/app/router.tsx`, `frontend/src/app/root.tsx`, update `main.tsx`
- Add deps: `@tanstack/react-router`, `@tanstack/react-query`

**Interfaces:**
- Produces: `useMe()` (TanStack Query around `apiFetch("/api/me", { schema: UserSchema })`, `retry:false`), `useLogin()/useRegister()/useLogout()` mutations that invalidate `["me"]` and (logout) clear the cache. Router with routes `/`, `/login`, `/register`, not-found; a protected layout that redirects to `/login` when `useMe` errors/empty.

- [ ] **Step 1: Implement providers + router + query hooks** (no separate test; covered by route-guard test in Task 17).
- [ ] **Step 2: Verify** — `npx vp check` + `npx vp build` succeed.
- [ ] **Step 3: Commit** — `git commit -m "feat(frontend): TanStack Query/Router providers and auth hooks"`

---

### Task 17: Auth pages + route guard + UI

**Files:**
- Create: `frontend/src/routes/login.tsx`, `frontend/src/routes/register.tsx`, `frontend/src/routes/home.tsx`, shadcn base (`button`, `input`, `label`, `card`), `frontend/src/lib/utils.ts`, sonner `<Toaster/>`
- Add deps: `react-hook-form`, `@hookform/resolvers`, `lucide-react`, `sonner`, shadcn primitives (`class-variance-authority`, `clsx`, `tailwind-merge`)
- Test: `frontend/src/routes/login.test.tsx`, `frontend/src/app/guard.test.tsx`

**Interfaces:**
- Login/Register forms use RHF + Valibot resolver (`LoginSchema`, `RegisterSchema` in `schemas.ts`: email format, password ≥8). Submit calls the mutation; errors show a `sonner` toast. Register omits Turnstile (dev). Home shows the user email + logout button. Guard redirects unauthenticated users to `/login`.

- [ ] **Step 1: Failing tests (RTL)** — login form shows validation error on empty submit; guard renders `/login` when `useMe` returns 401 (mock api).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement pages + shadcn primitives + guard.**
- [ ] **Step 4: Run, verify pass** — `npx vp test` + `npx vp check`.
- [ ] **Step 5: Commit** — `git commit -m "feat(frontend): login/register/home pages with route guard"`

---

## Phase F — Integration

### Task 18: Taskfile updates

**Files:**
- Modify: `Taskfile.yml`

**Changes:**
- Add `fe:typecheck` (`npm run typecheck`) and `fe:format` (`npm run format`).
- Add top-level `typecheck` → deps `fe:typecheck`.
- Redefine `verify` to run, in order: `fe:lint`, `fe:typecheck`, `fe:test`, `be:vet`, `be:test`.
- Set `CGO_ENABLED=0` (env) on `be:build`, `be:test`, `be:vet`, `be`.

- [ ] **Step 1: Edit Taskfile.**
- [ ] **Step 2: Verify** — `task typecheck` and `task be:vet` run.
- [ ] **Step 3: Commit** — `git commit -m "build: wire fe:typecheck/format, typecheck, verify, CGO_ENABLED=0"`

---

### Task 19: End-to-end smoke + verify gate

**Files:** none (verification task)

- [ ] **Step 1: Build frontend** — `task fe:build` → assets land in `internal/frontend/dist`.
- [ ] **Step 2: Build backend with embedded assets** — `CGO_ENABLED=0 task be:build`.
- [ ] **Step 3: Run server** — `./bin/server`, then `curl -s localhost:8080/healthz` returns ok and `curl -s localhost:8080/` returns the SPA index.
- [ ] **Step 4: Manual auth round-trip** — `curl` register (with `Sec-Fetch-Site: same-origin`, `Content-Type: application/json`) → 201 + Set-Cookie; `/api/me` with the cookie → user; cross-site register → 403.
- [ ] **Step 5: Run full gate** — `task verify` passes (fe lint/typecheck/test + be vet/test).
- [ ] **Step 6: Commit** any fixes — `git commit -m "test: end-to-end foundation smoke passes"`

---

## Self-review notes

- **Spec coverage:** boot lifecycle (T8), config (T1), SQLite/WAL (T4), migrations (T5), seeds (T6), sqlc + Store/notify (T7), replicator stub (T8), argon2 (T9), sessions + signed cookie (T10), auth service + uniform errors (T11), handlers + /api/me (T12), CrossOriginProtection + throttle (T13), security headers/no-store/body-limit/RequireJSON (T2), embed serving (T3), Vite+ app + API client + router/query + auth pages (T14–17), Taskfile (T18), e2e (T19). Turnstile + Litestream intentionally stubbed (T8, T12).
- **Driver compatibility:** if `modernc.org/sqlite` ON/OFF pragma casing matters, use `_pragma=foreign_keys(1)` form.
- **Vite+ alpha risk:** Task 14 stops and reports if `vp` subcommands misbehave rather than guessing.
