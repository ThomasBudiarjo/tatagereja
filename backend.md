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
5. Start Litestream replication.
6. Start the HTTP server.
7. On `SIGTERM`, stop accepting requests, flush Litestream, close SQLite, and exit.

## Suggested Go Layout

```text
cmd/server/main.go
internal/config
internal/http
internal/http/middleware
internal/auth
internal/db
internal/db/migrations
internal/litestream
internal/frontend
internal/domain
```

### `cmd/server`

Process entrypoint. It wires config, database, Litestream, routes, static frontend serving, and graceful shutdown.

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
```

### `internal/db`

Owns SQLite connection setup and migrations.

Recommended SQLite settings:

```text
journal_mode=WAL
foreign_keys=ON
busy_timeout=5000
synchronous=NORMAL
```

Use repository or store types for database access. All create, update, and delete operations should notify the replication debouncer after a successful transaction commit.

### `internal/litestream`

Wraps the Litestream package and exposes a small app-facing API:

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
4. In production, fail startup if restore fails.
5. In development, allow creating a fresh database.

This avoids accidentally booting production with an empty SQLite database after a dyno restart.

## Replication Strategy

Litestream should run inside the main Go app as goroutines, not as a separate Heroku process.

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

1. Cancel the root application context.
2. Stop accepting new HTTP requests.
3. Give in-flight requests a short deadline to finish.
4. Flush pending debounced replication.
5. Run one final Litestream sync with a strict timeout.
6. Close the SQLite connection.
7. Exit.

This ensures writes that happen shortly before a Heroku daily dyno restart are replicated to R2 whenever possible.

## Auth

Use simple email/password authentication with server-side sessions.

Recommended behavior:

- Store users in SQLite.
- Hash passwords with Argon2id or bcrypt.
- Store sessions in SQLite.
- Use secure, HTTP-only, same-site cookies.
- Rotate session IDs after login.
- Expire sessions server-side.
- Require CSRF protection for browser-based CUD requests.

Session cookie settings in production:

```text
HttpOnly=true
Secure=true
SameSite=Lax
Path=/
```

## HTTP API

Use normal server-rendered static frontend plus JSON API routes:

```text
GET  /healthz
GET  /api/me
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/register
```

All authenticated CUD API handlers should:

1. Validate input.
2. Start a transaction.
3. Apply the mutation.
4. Commit the transaction.
5. Call `replicator.NotifyWrite()`.
6. Return the response.

Only notify Litestream after commit succeeds.

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
- Add a startup log that states whether the DB was restored or reused locally.
- Add replication logs for periodic sync, CUD debounce sync, and SIGTERM final sync.
