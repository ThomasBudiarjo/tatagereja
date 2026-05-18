# Contributing to Tata Gereja

Thanks for your interest. This is a hobby project — keep changes small and friendly.

## Local setup

1. Install Go 1.23+, Node 20+, and `make`.
2. Install the two Go tools used in dev:
   ```bash
   go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
   go install github.com/air-verse/air@latest
   ```
3. From repo root:
   ```bash
   make setup
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   make seed-admin
   make dev
   ```

## Branch naming

- `feat/<name>` — new feature
- `fix/<name>` — bugfix
- `docs/<name>` — docs only
- `chore/<name>` — tooling / chore

## PR checklist

- [ ] `make lint test build` is green.
- [ ] `sqlc generate` produces no diff against committed code.
- [ ] If you touched a domain entity, the cross-user isolation test still passes.
- [ ] No `any` in new TypeScript.
- [ ] All new queries filter by `user_id`.

## Adding a new entity

See `docs/ADD_FEATURE.md`.
