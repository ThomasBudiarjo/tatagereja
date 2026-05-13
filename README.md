# Shepherd

> Aplikasi manajemen jemaat & jadwal pelayanan untuk gereja kecil.
> Free, open source, ringan, hosted gratis.

⚠️ **Hobby project — no SLA, no warranty.** Untuk gereja kecil yang oke dengan risiko data loss.

## Fitur (v1)

- Catat data jemaat (nama, kontak, tanggal lahir, baptis, sidi, dst)
- Catat pelayan + jenis pelayanan yang bisa dilayani
- Atur jadwal pelayanan per kebaktian / persekutuan
- Single account per gereja, sharing welcome

## Tech stack

- Frontend: Svelte 5 + Vite + Tailwind, hosted di Cloudflare Pages
- Backend: Go (chi router) + sqlc + Atlas, hosted di Heroku
- Database: Turso (libSQL/SQLite)

## Development

```bash
git clone https://github.com/<owner>/shepherd
cd shepherd
# Open in VS Code → "Reopen in Container"
make setup
make db-apply
make seed
make dev
```

## License

MIT
