# Architecture

## High-level

```
Svelte 5 SPA  ──HTTPS/JSON──►  Go API (Chi)  ──libSQL──►  Turso/SQLite
(Cloudflare Pages)              (Heroku Eco)               (Turso free)
```

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Svelte 5 + Vite + Tailwind CSS |
| Backend | Go 1.23+ with chi/v5 |
| Database | SQLite/libSQL (Turso in prod, local file in dev) |
| DB queries | sqlc (type-safe Go from SQL) |
| Migrations | Atlas |
| Auth | JWT (golang-jwt) + bcrypt |

## Repository

```
shepherd/
├── frontend/    Svelte 5 SPA
├── backend/     Go API
├── docs/        Documentation
└── scripts/     Dev utilities
```

## Multi-tenancy

Each church has its own `church_id`. Every domain table includes a `church_id` column with `NOT NULL` and foreign key to `churches(id)`. All queries filter by `church_id` from the authenticated user's JWT — never from request body.

## Data flow

1. User logs in → backend issues JWT as httpOnly cookie
2. Frontend sends cookie on every request (credentials: 'include')
3. Middleware validates JWT, extracts `user_id`, `church_id`, `role` into context
4. Handlers use context values to scope queries to the correct church
5. Frontend uses TanStack Query for caching and optimistic updates
