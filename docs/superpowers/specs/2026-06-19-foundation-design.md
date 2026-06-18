# Foundation Design — tatagereja

Date: 2026-06-19
Status: Approved (design)

## Goal

Build the project foundation: a walking skeleton + database layer + full email/password
auth, end to end. The single Go process serves the embedded React SPA and a JSON API.

In scope:

- Project structure, Go module, Vite+ React app, Taskfile wired.
- Full boot lifecycle (config → DB → migrations → seeds → replication hook → HTTP) and
  graceful shutdown.
- SQLite (WAL) via `sqlc`, migrations, idempotent seeds, a store wrapper.
- Email/password sessions, CSRF protection, `/api/me`, login/logout/register.
- Embedded SPA serving with dev proxy.

Deferred (wired as no-op stubs behind real interfaces, swapped in later):

- Litestream replication (R2 restore/replicate/flush).
- Cloudflare Turnstile verification.

## Key decisions

- **Pure Go, no cgo.** Everything builds with `CGO_ENABLED=0` so the Heroku Go buildpack
  works without native toolchain setup.
- **SQLite driver: `modernc.org/sqlite`** (pure Go). No cgo, trivial Heroku builds, easy
  cross-compile. Compatible with the Litestream library later, which operates at the
  WAL-file level rather than through the SQL driver.
- **Sessions: small hand-rolled package in `internal/auth`.** SQLite-stored sessions, ID
  rotation after login, uniform auth errors. Custom impl matches the prescriptive spec and
  stays pure Go. (Rejected: `alexedwards/scs` — adds opinions we'd fight.)
- **CSRF: Go 1.25 `net/http.CrossOriginProtection`** instead of the docs' masked-token flow.
  `Sec-Fetch-Site` (all browsers since 2023) with an Origin-vs-Host fallback, combined with
  `SameSite=Lax` cookies, covers CSRF with no `/api/csrf` endpoint, no signed secret cookie,
  and no client-side token plumbing. `AddTrustedOrigin` registers the production origin;
  `SetDenyHandler` returns a JSON 403. This intentionally deviates from the token flow in
  `backend.md`/`frontend.md`, which predate Go 1.25.
- **Frontend toolchain: Vite+ (`vite-plus`) alpha.** Real and on npm at `0.2.1`; exposes the
  `vp` CLI, wraps the existing package manager, single `vite.config.ts`. Added as a local
  dev dependency and driven through `package.json` scripts. Alpha risk is accepted; report
  if any `vp` subcommand misbehaves.
- **Migrations: tiny custom runner** over `embed.FS` with a `schema_migrations` table,
  returning `changed bool` (needed for the boot "flush once if migrations/seeds changed"
  step). (Rejected: goose/golang-migrate — heavier than needed and the `changed` signal is
  awkward to extract.)

## Architecture

Single Go process:

```
Cloudflare -> Heroku router -> Go web process
  -> embedded React static assets (embed.FS)
  -> JSON API (/api/*)
  -> SQLite (WAL)
  -> Replicator interface (no-op now; Litestream later)
```

### Boot lifecycle (`cmd/server/main.go`)

1. Load + validate config from env.
2. (Litestream restore-from-R2 — no-op stub now; just checks DB file existence.)
3. Open SQLite with `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`,
   `synchronous=NORMAL`.
4. Run migrations; track whether anything changed.
5. Run idempotent seeds; track whether anything changed.
6. Start replicator (no-op `Start`).
7. If migrations or seeds changed the DB, call `NotifyWrite()` then `Flush(ctx)` once.
8. Start the HTTP server.
9. On `SIGTERM`/`SIGINT`: create an independent shutdown-deadline context, stop accepting
   requests, give in-flight requests a short deadline, cancel background work, flush
   replication, close SQLite, exit. Log whether flush completed/timed out/failed.

## Directory layout

```
cmd/server/main.go            wiring + graceful shutdown
internal/config/              env load + validation
internal/db/                  conn + WAL pragmas, migrator, seeder, Store wrapper
internal/db/migrations/*.sql  embedded, ordered, tracked
internal/db/queries/*.sql     sqlc source
internal/db/gen/              sqlc-generated typed queries (package gen)
internal/db/seeds/*.sql       idempotent reference data
internal/auth/                argon2id hashing, session store + cookie signing, service
internal/http/                router, handlers
internal/http/middleware/     request ID, recover, timeout, body limit, no-store,
                              security headers, CrossOriginProtection, session, throttle
internal/litestream/          Replicator interface + noop impl
internal/frontend/            embed.FS SPA serving (build-tag fallback)
internal/domain/              shared domain types (minimal for now)
frontend/                     Vite+ React app
sqlc.yaml                     sqlc config
Taskfile.yml                  existing; extended
```

## Data layer (`internal/db`)

- `sqlc` generates typed methods over `database/sql` into `internal/db/gen` (package `gen`).
- A hand-written `Store` wraps `gen.Queries` plus the `*sql.DB`. Mutating methods run inside
  a transaction, commit, then call `replicator.NotifyWrite()`. Read-only methods never
  notify. This is the single place that ties commits to replication.
- Custom migrator: reads ordered `*.sql` from embedded `migrations/`, applies unapplied ones
  in a transaction each, records them in `schema_migrations(version, applied_at)`, returns
  `changed bool`.
- Seeder: executes each idempotent `seeds/*.sql` on every boot after migrations; returns
  `changed bool` based on rows affected.

### Foundation schema

`migrations/0001_init.sql`:

- `users(id TEXT PK, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  created_at, updated_at)` — email stored normalized (lowercased/trimmed).
- `sessions(id TEXT PK, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at, expires_at)`.
- `schema_migrations(version TEXT PK, applied_at)`.

`seeds/0001_pelayanan_types.sql` (exercises the idempotent seed path, the doc's own example):

```sql
INSERT INTO pelayanan_types (code, name) VALUES
  ('example', 'Example')
ON CONFLICT (code) DO UPDATE SET name = excluded.name;
```

(The `pelayanan_types` table is created in the init migration.)

## Auth (`internal/auth`)

- **Password hashing**: Argon2id via `golang.org/x/crypto/argon2`. Parameters encoded in the
  stored hash string; tuned for ~100–250ms verification on an Eco dyno.
- **Sessions**: opaque random session IDs stored in SQLite. The cookie value is the session
  ID, HMAC-signed with `SESSION_SECRET` so tampered cookies are rejected before any DB
  lookup. Cookie is `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`. Session ID
  is rotated after login. Server-side expiry. Logout deletes the session row.
- **CSRF**: `net/http.CrossOriginProtection` middleware (Go 1.25) wrapping the API router.
  Safe methods (GET/HEAD/OPTIONS) always pass; unsafe cross-origin browser requests are
  rejected via `Sec-Fetch-Site`, with an Origin-vs-Host fallback. The production origin is
  added with `AddTrustedOrigin`; the deny handler returns a JSON 403. No tokens, no
  `/api/csrf` endpoint, no client-side token handling. `SameSite=Lax` session cookies are
  the complementary layer.
- **Uniform auth errors**: invalid email, invalid password, inactive/missing user all return
  the same generic error to avoid enumeration.

## HTTP API (`internal/http`)

Routes (foundation set):

```
GET  /healthz                 no-store; liveness
GET  /api/me                   current user from session, or 401
POST /api/auth/login           rotates session id on success
POST /api/auth/logout          deletes session, clears cookie
POST /api/auth/register        creates user + session in one tx
```

Middleware (chi, `github.com/go-chi/chi/v5`): request ID, panic recovery, timeout, request
body-size limit, `Cache-Control: no-store` on API + health, security headers
(`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `Strict-Transport-Security` in production), `net/http.CrossOriginProtection`
(rejects unsafe cross-origin requests), session loading, and per-IP + normalized-email
throttling on auth endpoints. JSON handlers enforce `Content-Type: application/json`.

Register flow (foundation): validate JSON → **(Turnstile verify: no-op stub; dev disables it
anyway)** → hash password → create user + session in one transaction → commit →
`replicator.NotifyWrite()` → respond. `turnstileToken` is accepted in the body but not yet
verified. Cross-origin protection is enforced by middleware, not in the handler.

## Frontend (`frontend/`, Vite+)

- `vite-plus` local dev dependency. `package.json` scripts map to the `vp` CLI:
  `dev`→`vp dev`, `build`→`vp build`, `lint`→`vp lint`, `typecheck`→`vp check`,
  `test`→`vp test`, `format`→`vp fmt`. Single `vite.config.ts` via `defineConfig` from
  `vite-plus`. Package manager: npm (matches the existing Taskfile `npm run …` targets).
- Stack: React + TypeScript, Tailwind CSS v4, shadcn/ui base components, TanStack Router
  (typed routes, route-level code splitting, protected routes), TanStack Query (`/api/me`,
  mutations, cache invalidation), Valibot, React Hook Form + `@hookform/resolvers`,
  `lucide-react`, `sonner`.
- **Typed API client** (native `fetch`): `credentials: "include"` by default, JSON
  request/response, handles `401`, parses responses with Valibot. No CSRF token handling —
  same-origin requests pass `CrossOriginProtection` automatically (browser sends
  `Sec-Fetch-Site: same-origin`).
- Routes: `/login`, `/register`, `/` with a protected-route guard derived from the `/api/me`
  query; unauthenticated users redirect to `/login`. Not-found route.
- Dev server proxies `/api/*` to the Go backend. Turnstile widget is **omitted in dev** and
  `turnstileToken` is omitted from the register body (the foundation runs dev-mode only).

## Embedded serving (`internal/frontend`)

- `embed.FS` over the built `frontend/dist`. Serve hashed assets directly; `index.html` as
  SPA fallback. Never let the fallback intercept `/api/*`; unknown API routes return `404`.
- A build tag / fallback `embed` target lets the Go module build before the frontend `dist`
  exists (so `task be:build` works on a clean checkout).

## Config (`internal/config`)

Reads + validates env. Foundation-relevant: `APP_ENV`, `PORT`, `DATABASE_PATH`,
`SESSION_SECRET` (≥32 bytes, required outside dev; used to HMAC-sign the session cookie).
R2 / Litestream / Turnstile vars are
read and held but not yet acted on (deferred). Turnstile verification disabled in dev.

## Taskfile changes

Extend the existing `Taskfile.yml`:

- Add `fe:typecheck` (`npm run typecheck`) and `fe:format` (`npm run format`).
- Add top-level `typecheck` → `fe:typecheck`.
- Redefine `verify` to run: `fe:lint` + `fe:typecheck` + `fe:test` + `be:vet` + `be:test`
  (per `frontend.md`), instead of the current `lint`/`test`/`build`.
- Ensure backend tasks set `CGO_ENABLED=0`.

## Testing

- **Go**: argon2 hash/verify roundtrip + param parsing; session create/rotate/expire/delete +
  cookie-signature verification; `CrossOriginProtection` wiring (cross-site unsafe request →
  JSON 403; same-origin / safe methods allowed); config validation (missing/short
  `SESSION_SECRET`); migrator + seeder idempotency against a temp SQLite file; httptest
  handler tests for login/register/logout/me incl. uniform auth errors.
- **Frontend (Vitest + RTL)**: API client (credentials, 401, Valibot parse); auth form
  validation; protected-route guard behavior.

## Out of scope (later cycles)

Litestream R2 restore/replicate/flush implementation; Turnstile server verification;
production deployment config (Procfile, Heroku, Cloudflare cache rules); Playwright e2e;
domain features beyond the seed example.
