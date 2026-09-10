# @tatagereja/api

The TataGereja backend: an [Elysia](https://elysiajs.com) server on Bun with SQLite storage through
Drizzle ORM, validated end to end with the Zod schemas from `@tatagereja/shared`.

```sh
bun run dev     # watch mode on http://127.0.0.1:3000
bun run test    # integration tests against an in-memory database
bun run typecheck
```

## Layout

```text
src/config.ts        Environment parsing and validation
src/app.ts           Application factory: CORS, error mapping, modules, optional SPA hosting
src/db/              Drizzle schema and the SQLite connection (migrations run at startup)
src/plugins/auth.ts  `auth` and `church` route macros: session lookup and church access
src/modules/         One file per feature area, each owning its routes
src/services/        Query helpers shared by modules
src/lib/             Passwords, tokens, rate limiting, Turnstile, time helpers
tests/               Integration tests driven through `app.handle()`
```

## Authentication

Passwords are hashed with Argon2id. A session token is a 32-byte random value returned to the client;
only its SHA-256 hash is stored. Tokens expire after `SESSION_TTL_DAYS` and changing a password revokes
every other session.

## Permissions

Every church-scoped route resolves the caller's access (role plus the groups they lead) and checks it
against the shared permission matrix in `@tatagereja/shared`, so the API and the interface always agree
on who may do what.

## Rate limits

Login is limited per IP and email, registration and invitation lookups per IP. Limits are in-memory and
suit a single-process deployment; put a reverse proxy in front for stricter control.
