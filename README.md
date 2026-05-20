# Tata Gereja

Open-source church management web app for small Indonesian Protestant churches. Hobby project — no SLA.

**Features:** jemaat (members), keluarga (families), pelayan (volunteers), kebaktian scheduling, jadwal pelayanan.

## Stack

- Go + Chi + HTMX + Tailwind CDN
- SQLite (`modernc.org/sqlite`) with embedded [Litestream](https://litestream.io) replication
- sqlc for type-safe queries

## Quick start

```bash
make setup
cp backend/.env.example backend/.env
make seed-admin   # default: admin@example.com / changeme
make dev
# http://localhost:8080
```

Override seed credentials:

```bash
cd backend && go run ./cmd/seed-admin \
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

Deploy: `make build && git push heroku main`. Run `heroku run make seed-admin` once after first deploy.

## Commands

| Command | Description |
|---------|-------------|
| `make dev` | Hot reload with air |
| `make build` | Build server binary |
| `make test` | Run tests |
| `make sqlc` | Regenerate sqlc code |

## License

MIT — see [LICENSE](LICENSE).
