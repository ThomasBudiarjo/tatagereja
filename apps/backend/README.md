# TataGereja backend

The backend is a pinned PocketBase executable with repository-owned hooks and migrations. The checksum-verified executable is downloaded into a versioned directory under `.pocketbase/` on first run, while local application data is stored in `pb_data/`. Both directories are intentionally ignored by Git.

The development scripts require Linux, macOS, or Windows with WSL and a POSIX shell.

Run it from the repository root:

```sh
npm run backend
```

PocketBase listens on `http://127.0.0.1:8090` by default. Override the address when needed:

```sh
POCKETBASE_HTTP=0.0.0.0:8090 npm run backend
```

The first run prints a link for creating the initial PocketBase superuser.
