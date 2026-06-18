# Backend Architecture

## Deployment Target

The app is designed as a small single-dyno Heroku Eco deployment.

- Run exactly one `web` dyno.
- Use a single Go process for HTTP serving, SQLite access, and Litestream replication.
- Treat the dyno filesystem as ephemeral.
- Restore SQLite from Cloudflare R2 on boot if the local database file is missing.
- Flush replication on shutdown after Heroku sends `SIGTERM`.

This architecture is not meant for horizontal multi-dyno writes. If the app needs multiple web dynos later, move the database to Postgres or introduce a single-writer service.

## Runtime Shape

```text
Cloudflare
  -> Heroku router
    -> Go web process
      -> Embedded React static assets
      -> HTTP API
      -> SQLite database
      -> Litestream replication goroutines
      -> Cloudflare R2 backup bucket
```

The Go server owns the full backend lifecycle:

1. Load configuration from environment variables.
2. Restore the SQLite database from R2 if needed.
3. Open SQLite in WAL mode.
4. Run database migrations.
5. Run idempotent SQL seeds for reference data.
6. Start Litestream replication.
7. If migrations or seeds changed the database, flush Litestream once before serving traffic.
8. Start the HTTP server.
9. On `SIGTERM`, stop accepting requests, let in-flight requests finish briefly, flush Litestream, close SQLite, and exit.

## Suggested Go Layout

```text
cmd/server/main.go
internal/config
internal/http
internal/http/middleware
internal/http/router
internal/auth
internal/db
internal/db/migrations
internal/db/queries
internal/db/seeds
internal/litestream
internal/frontend
internal/domain
```

### `cmd/server`

Process entrypoint. It wires config, database, Litestream, chi routes, static frontend serving, and graceful shutdown.

### `internal/config`

Reads environment variables and validates required production configuration.

Expected config:

```text
APP_ENV
PORT
DATABASE_PATH
SESSION_SECRET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_ENDPOINT
R2_REPLICA_PATH
LITESTREAM_SYNC_INTERVAL
LITESTREAM_CUD_DEBOUNCE
TURNSTILE_SECRET_KEY
```

Seed reference data should live in SQL files, not environment variables. There is no admin seed for now.

`TURNSTILE_SECRET_KEY` is required outside development while public registration is enabled. In development, Turnstile verification should be disabled.

### `internal/db`

Owns SQLite connection setup, migrations, seeds, sqlc query generation, and data access.

Recommended SQLite settings:

```text
journal_mode=WAL
foreign_keys=ON
busy_timeout=5000
synchronous=NORMAL
```

Use `sqlc` instead of an ORM. Keep SQL explicit in checked-in query files, then let `sqlc` generate typed Go methods on top of `database/sql`.

This gives the project:

- Parameterized queries by default.
- Compile-time checked result and argument types.
- Explicit transactions.
- Easy repository or store wrappers for calling `replicator.NotifyWrite()` after committed mutations.
- No runtime ORM behavior hiding SQLite details.

Every operation that mutates SQLite must notify the replication debouncer after a successful transaction commit. Read-only operations must not notify replication.

Mutating operations include user registration, password changes, session creation, session deletion, expired-session cleanup, seed data, and domain create, update, or delete actions.

Seeds should be simple SQL files for static reference data, such as pelayanan type values. Seed SQL must be idempotent so it can run on every boot after migrations:

```sql
INSERT INTO pelayanan_types (code, name)
VALUES ('example', 'Example')
ON CONFLICT (code) DO UPDATE SET name = excluded.name;
```

### `internal/litestream`

Wraps the Litestream package as a Go library and exposes a small app-facing API:

```go
type Replicator interface {
    Start(ctx context.Context) error
    NotifyWrite()
    Flush(ctx context.Context) error
    Close(ctx context.Context) error
}
```

Responsibilities:

- Restore from Cloudflare R2 before SQLite opens when the database file is missing.
- Start continuous WAL replication in background goroutines.
- Run a periodic sync every `10m`.
- Run debounced sync after CUD actions.
- Run a final best-effort sync during graceful shutdown.

## Database Boot Strategy

On startup:

1. Check whether `DATABASE_PATH` exists.
2. If it exists, open it normally.
3. If it does not exist, restore it from Cloudflare R2 using Litestream.
4. If restore succeeds, continue with the restored database.
5. If restore fails because no replica exists yet, create a fresh database file.
6. If restore fails for any other reason in production, fail startup.
7. Open SQLite, enable WAL settings, and run migrations.
8. Always run idempotent SQL seeds after migrations, whether the database was restored, reused locally, or newly created.
9. Track whether migrations or seeds changed the database.
10. Start Litestream replication.
11. If migrations or seeds changed the database, call `replicator.NotifyWrite()` and `replicator.Flush(ctx)` once before accepting traffic.
12. Start the HTTP server.

This fits Heroku's ephemeral filesystem: every boot first tries to restore from R2, but the first deploy can still create a valid fresh database with the required reference seeds when no backup exists yet.

## Replication Strategy

Litestream should run inside the main Go app as goroutines through the Litestream Go library, not as a separate Heroku process.

Replication modes:

1. Continuous WAL replication while the app is running.
2. Periodic safety sync every `10 minutes`.
3. Debounced sync after CUD actions.
4. Final sync on `SIGTERM`.

The CUD debounce should coalesce bursts of writes. A reasonable default is:

```text
debounce delay: 2s to 5s
max wait: 30s
shutdown flush timeout: 20s to 25s
```

The shutdown flush must be deadline-bound because Heroku can forcefully terminate the dyno after the graceful shutdown window.

### Flush Replication

Flush replication means forcing the replication layer to upload all committed SQLite changes that are still pending locally.

It does not mutate application data. It only makes sure local SQLite WAL changes that already committed are copied to Cloudflare R2 before the process exits.

There are two related operations:

1. Flush the debouncer.
2. Sync Litestream.

The debouncer flush handles app-level write notifications. If several create, update, or delete actions happen close together, `NotifyWrite()` should schedule only one delayed sync. During shutdown, the app must skip the remaining delay and run that pending sync immediately.

Litestream sync handles storage-level replication. It should copy the latest SQLite WAL generations and snapshots needed for restore into R2.

Expected `Flush(ctx)` behavior:

1. Stop accepting new write notifications.
2. If a debounced CUD sync is pending, cancel its timer.
3. Wait for any in-progress CUD sync to finish, within the provided context deadline.
4. Trigger one final Litestream sync.
5. Return success only if pending committed WAL data has been handed to Litestream and the final sync completed.
6. Return the context error if the shutdown deadline expires first.

`Flush(ctx)` should be safe to call multiple times. If there is no pending write, it should still run a final lightweight Litestream sync during shutdown.

Recommended timeouts:

```text
normal CUD debounce: 2s to 5s
periodic sync: 10m
SIGTERM HTTP shutdown: 5s to 10s
SIGTERM replication flush: 20s to 25s
```

The app should log whether the shutdown flush completed, timed out, or failed. If it fails, the process should still exit before Heroku force-kills the dyno.

## Graceful Shutdown

The Go process should listen for `SIGTERM` and `SIGINT`.

Shutdown order:

1. Receive `SIGTERM` or `SIGINT` and create a shutdown deadline context that is independent from the main app context.
2. Stop accepting new HTTP requests.
3. Give in-flight requests a short deadline to finish.
4. Cancel background application work after HTTP draining completes or times out.
5. Flush pending debounced replication.
6. Run one final Litestream sync with a strict timeout.
7. Close the SQLite connection.
8. Exit.

This ensures writes that happen shortly before a Heroku daily dyno restart are replicated to R2 whenever possible.

## Auth

Use simple email/password authentication with server-side sessions.

Recommended behavior:

- Store users in SQLite.
- Hash passwords with Argon2id.
- Store sessions in SQLite.
- Use secure, HTTP-only, same-site cookies.
- Rotate session IDs after login.
- Expire sessions server-side.
- Require CSRF protection for browser-based CUD requests.
- Allow public registration for now without email verification.
- Require Cloudflare Turnstile for registration outside development.

Session cookie settings in production:

```text
HttpOnly=true
Secure=true
SameSite=Lax
Path=/
```

Password hashes should store their Argon2id parameters with the encoded hash. Tune memory, iterations, and parallelism to the Heroku dyno size, with verification targeting roughly `100ms` to `250ms`.

### CSRF Protection

CSRF protection should use a server-managed `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The frontend must not read this cookie directly.

Recommended flow:

1. The frontend calls `GET /api/csrf` before unsafe requests if it has no in-memory token.
2. The backend creates or validates the signed CSRF secret in the `HttpOnly` cookie.
3. The backend returns an ephemeral masked CSRF token in JSON.
4. The frontend sends that token in `X-CSRF-Token` for `POST`, `PUT`, `PATCH`, and `DELETE`.
5. The backend validates the header token against the cookie secret and rejects invalid requests.

Rotate the CSRF secret after login and clear it on logout. Also validate `Origin` or `Referer` for unsafe browser requests.

### Registration Bot Protection

Public signup should use Cloudflare Turnstile instead of email verification for the initial version.

Registration flow:

1. The frontend renders Turnstile on `/register` outside development.
2. The frontend sends `turnstileToken` in the register request body.
3. The backend validates CSRF and request JSON.
4. Outside development, the backend requires `turnstileToken`.
5. The backend verifies the token with Cloudflare's `siteverify` endpoint before password hashing or opening a write transaction.
6. If verification succeeds, the backend creates the user and session in one transaction.
7. After commit succeeds, call `replicator.NotifyWrite()`.

Turnstile server validation requirements:

- Verify tokens server-side with `TURNSTILE_SECRET_KEY`; never trust the frontend token by itself.
- Use Cloudflare's `https://challenges.cloudflare.com/turnstile/v0/siteverify` endpoint.
- Send the token as the `response` value and include the best available client IP as `remoteip` when reliable.
- Treat tokens as single-use and short-lived.
- Fail closed outside development if Cloudflare verification fails, times out, or returns `success=false`.
- Use a short outbound HTTP timeout.
- Do not store Turnstile tokens and do not log tokens or Cloudflare secrets.

Turnstile verification itself does not mutate SQLite, so it must not call `replicator.NotifyWrite()`. Only the successful registration transaction should notify replication.

## HTTP API

Use normal server-rendered static frontend plus JSON API routes:

```text
GET  /healthz
GET  /api/csrf
GET  /api/me
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/register
```

Register request body:

```json
{
  "email": "user@example.com",
  "password": "correct horse battery staple",
  "turnstileToken": "token-from-widget"
}
```

`turnstileToken` is required outside development and omitted in development.

Use `github.com/go-chi/chi/v5` for routing. Use chi middleware for request IDs, panic recovery, timeouts, compression where appropriate, and no-cache behavior on API responses. Add app-specific middleware for sessions, auth, CSRF, security headers, request size limits, and auth throttling.

All API handlers that mutate SQLite should:

1. Validate input.
2. Start a transaction.
3. Apply the mutation.
4. Commit the transaction.
5. Call `replicator.NotifyWrite()`.
6. Return the response.

Only notify Litestream after commit succeeds.

All unsafe browser API handlers should validate CSRF, including login, logout, register, and authenticated create, update, or delete endpoints.

## Security

Security requirements:

- Require `SESSION_SECRET` to be at least 32 random bytes, loaded from environment configuration.
- Set session cookies with `HttpOnly`, `Secure` in production, `SameSite=Lax`, and `Path=/`.
- Rotate session IDs after login and privilege changes.
- Store only password hashes, never plaintext passwords.
- Use uniform auth errors for invalid email, invalid password, inactive user, and missing user.
- Rate-limit login, register, and other auth-sensitive endpoints by IP and normalized email.
- Require Turnstile on register outside development, but keep rate limiting because Turnstile is not a full abuse-control system.
- Add a global request body size limit for JSON handlers.
- Enforce `Content-Type: application/json` for JSON request bodies.
- Return `Cache-Control: no-store` on API and health responses.
- Add security headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security` in production.
- Trust proxy headers only from expected Heroku or Cloudflare paths.
- Do not log session IDs, CSRF tokens, passwords, password hashes, R2 secrets, or raw auth headers.
- Periodically delete expired sessions with a mutating cleanup job that calls `replicator.NotifyWrite()` after commit.

## Embedded React Frontend

Build the React app with Vite and embed the generated `dist` files into the Go binary using `embed.FS`.

Serving behavior:

- Serve hashed assets directly from the embedded filesystem.
- Serve `index.html` as the SPA fallback.
- Do not let frontend fallback intercept `/api/*` routes.
- Return `404` for unknown API routes.

## Cloudflare Caching

Cloudflare should cache only public static assets.

Recommended cache behavior:

```text
/assets/*      Cache-Control: public, max-age=31536000, immutable
/index.html    Cache-Control: no-cache
/api/*         Cache-Control: no-store
/healthz       Cache-Control: no-store
```

Never publicly cache authenticated API responses.

## Operational Notes

- Heroku Eco dynos can sleep and restart, so restore-on-boot is mandatory.
- Heroku sends `SIGTERM` before shutdown, so the app must flush replication during graceful shutdown.
- Keep one web dyno to avoid split-brain SQLite writes.
- Keep R2 credentials in Heroku config vars.
- Add a startup log that states whether the DB was restored, reused locally, or created fresh, and whether migrations or seeds changed it.
- Add replication logs for periodic sync, CUD debounce sync, and SIGTERM final sync.
