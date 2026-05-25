# Tata Gereja

Open-source church management web app for small Indonesian Protestant churches. Hobby project — no SLA.

**Features:** jemaat (members), keluarga (families), pelayan (volunteers), kebaktian scheduling, jadwal pelayanan.

## Stack

- Go + Chi JSON API (`/api/*`)
- SolidJS SPA (Vite + TanStack Query + Tailwind CSS 4), built into the Go binary via `go:embed` and served from the site root
- SQLite (`modernc.org/sqlite`) with embedded [Litestream](https://litestream.io) replication
- sqlc for type-safe queries
- Cookie sessions; hashed SPA assets are immutable/edge-cacheable (Cloudflare), API responses are `no-store`

## Quick start

```bash
make setup
cp .env.example .env
make seed-admin   # default: admin@example.com / changeme

# Terminal 1 — Go API:
make dev          # http://localhost:8080
# Terminal 2 — SPA dev server with HMR (proxies /api to :8080):
make spa-dev      # http://localhost:5173
```

For a production-like single binary that serves the embedded SPA, run `make build && ./bin/server` and open http://localhost:8080.

Override seed credentials:

```bash
go run ./cmd/seed-admin \
  --email=you@church.org --password=secret \
  --display-name="Pak Budi" --church-name="GKI Demo"
```

## Production (Heroku + Cloudflare R2)

Local SQLite lives on ephemeral disk; Litestream replicates to S3-compatible storage.

```bash
APP_ENV=production
SQLITE_PATH=/tmp/tatagereja.db
LITESTREAM_REPLICA_URL=s3://your-bucket/tatagereja
AWS_ACCESS_KEY_ID=<r2 access key>
AWS_SECRET_ACCESS_KEY=<r2 secret>
AWS_REGION=auto
AWS_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
```

Deploy: `git push heroku main` (Heroku builds `./cmd/server` and `./cmd/seed-admin` per the `+heroku install` directive in `go.mod`). After first deploy:

```bash
heroku run bin/seed-admin -- --email=admin@example.com --password=changeme \
  --display-name=Admin --church-name="GKI Demo"
```

## Commands

| Command | Description |
|---------|-------------|
| `make dev` | Go API hot reload with air |
| `make spa-dev` | SolidJS SPA dev server (Vite, HMR) |
| `make spa` | Build the SPA into `internal/spa/dist` |
| `make build` | Build the SPA + server binary |
| `make test` | Run tests |
| `make sqlc` | Regenerate sqlc code |

The built SPA (`internal/spa/dist`) is committed so the Heroku Go buildpack deploys it unchanged. Run `make spa` after changing frontend code and commit the result (or wire a Node build step in CI).

## License

MIT — see [LICENSE](LICENSE).
