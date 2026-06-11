# TataGereja

A free, simple church management app — "a church Google Sheet, but cleaner, safer, and easier to use."

Single Go binary serving an embedded SolidJS dashboard, backed by SQLite with Litestream replication to S3-compatible object storage. Designed for Heroku Eco dynos. See [PRD.md](PRD.md) for the full product spec.

## Features (MVP)

- **Members (Jemaat)** — full CRUD with search and status filters
- **Families (Keluarga)** — family units, head of family, member relationships
- **Services (Ibadah)** — schedule with types, times, locations
- **Service Roles (Pelayanan)** — assign volunteers (preacher, worship leader, …)
- **Attendance (Kehadiran)** — member checklist plus walk-in guests per service
- **Reports (Laporan)** — dashboard stats, birthdays, attendance, CSV export
- **Multi-tenant** — many churches in one deployment; every query is scoped by `church_id`
- **Auth** — email + password, HTTP-only session cookies, owner/admin roles

## Stack

| Layer | Choice |
|---|---|
| Backend | Go, [chi](https://github.com/go-chi/chi), [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) (pure Go, no CGO) |
| Backup | [Litestream](https://litestream.io) embedded as a Go library |
| Frontend | SolidJS + Vite + Tailwind CSS, embedded via `go:embed` |
| Deploy | Heroku Eco (Node buildpack → Go buildpack), Cloudflare in front |

## Local development

```bash
# 1. Build the frontend (output is embedded into the Go binary)
cd web && npm install && npm run build && cd ..

# 2. Run the server
go run ./cmd/server
# → http://localhost:8080  (register your church on the login page)
```

For frontend iteration with hot reload, run both:

```bash
go run ./cmd/server          # API on :8080
cd web && npm run dev        # Vite on :5173, proxies /api → :8080
```

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `DATABASE_PATH` | `/tmp/tatagereja.db` | SQLite file location |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS (production) |
| `REPLICA_BUCKET` | _(empty = backup disabled)_ | S3/R2 bucket for Litestream |
| `REPLICA_PATH` | `tatagereja` | Key prefix inside the bucket |
| `REPLICA_ENDPOINT` | _(empty)_ | S3 endpoint (e.g. R2: `https://<account>.r2.cloudflarestorage.com`) |
| `REPLICA_REGION` | `auto` | Bucket region |
| `REPLICA_ACCESS_KEY_ID` / `REPLICA_SECRET_ACCESS_KEY` | _(empty)_ | Credentials (falls back to AWS SDK env chain) |
| `REPLICA_FORCE_PATH_STYLE` | `false` | Path-style addressing for some S3 providers |
| `BACKUP_SYNC_INTERVAL` | `10m` | Periodic replication interval |
| `BACKUP_DEBOUNCE` | `5s` | Sync delay after a write (bursts coalesce) |

## Backup behavior (Heroku's ephemeral filesystem)

On startup the app restores the newest Litestream generation from object
storage if no local database exists, then runs migrations. After any
successful write request, a debounced sync pushes changes within ~5 seconds;
a periodic sync runs every 10 minutes; SIGTERM forces a final sync before
shutdown. **Run exactly one web dyno** — SQLite cannot be shared across dynos.

## Heroku deployment

```bash
heroku buildpacks:add heroku/nodejs   # builds web/dist first
heroku buildpacks:add heroku/go       # compiles + embeds the frontend
heroku config:set COOKIE_SECURE=true DATABASE_PATH=/tmp/tatagereja.db \
  REPLICA_BUCKET=... REPLICA_ENDPOINT=... \
  REPLICA_ACCESS_KEY_ID=... REPLICA_SECRET_ACCESS_KEY=...
git push heroku main
```

The `Procfile` runs `bin/server`. Health check: `GET /api/health` returns `OK`.

## Repository layout

```
cmd/server/        main: startup sequence (restore → migrate → serve → replicate)
internal/app/      router, middleware, SPA serving with cache headers
internal/auth/     sessions, login/register, tenant-scoping middleware
internal/{member,family,service,attendance,report,church}/   module handlers
internal/backup/   Litestream restore + debounced/periodic/SIGTERM sync
internal/db/       SQLite open (WAL) + migration runner
migrations/        embedded SQL migrations
web/               SolidJS app (vite build → web/dist, embedded via go:embed)
```
