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

## Quick start (dev)

Requirements: **Go 1.23+**, **Node 20+**, GNU `make`.

```bash
git clone https://github.com/<owner>/tatagereja
cd tatagereja
make setup           # install deps + sqlc/air tools
make seed-admin      # interactive: create the initial user
make dev             # runs backend (:8787) + frontend (:5173) in parallel
# open http://localhost:5173
```

The schema is applied on backend startup; there is no separate migration step.
To wipe the dev DB: `rm backend/local.db && make dev`.

## Make targets

```
make help            # list commands
make setup           # install everything (run once)
make dev             # frontend + backend (parallel)
make dev-fe          # frontend only
make dev-be          # backend only (air hot reload)
make build           # production build
make test            # backend + frontend tests
make lint            # lint all code
make sqlc            # regenerate Go DB code from queries.sql
make seed-admin      # create initial user (interactive prompts)
make clean           # remove build artifacts and local DB
```

## License

MIT
