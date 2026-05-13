# Contributing

## Setup

```bash
git clone https://github.com/<owner>/shepherd
cd shepherd
make setup
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
make db-apply
make seed
make dev
```

Or open in VS Code → "Reopen in Container".

## Workflow

- Branch: `feat/<name>`, `fix/<name>`, `docs/<name>`
- PR required for main
- Squash merge

## Before submitting

- [ ] `make lint` passes
- [ ] `make test` passes
- [ ] `make sqlc` regenerated and committed (if schema/queries changed)
- [ ] `make build` succeeds
