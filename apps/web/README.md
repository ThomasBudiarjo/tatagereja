# @tatagereja/web

The TataGereja single-page app: React with Vite, Tailwind CSS v4 and Radix UI primitives, designed for
phones first and widening into a sidebar layout on larger screens.

```sh
bun run dev        # http://localhost:5173, proxying /api to http://127.0.0.1:3000
bun run build      # typecheck and build into dist/
bun run typecheck
```

## Layout

```text
src/components/ui/      Button, input, dialog, list and other primitives
src/components/layout/  App shells, church context, page scaffolding, theme
src/features/           One folder per feature: API hooks plus screens
src/lib/                Axios client, query client, formatting, form helpers
src/stores/             Zustand stores for server selection, sessions and preferences
```

## Data flow

Axios points at the selected server and attaches the stored token. Every response is parsed with the
shared Zod schema before it reaches a component, so a mismatch fails loudly instead of rendering
undefined values. TanStack Query owns caching and invalidation, keyed per church. Forms use React Hook
Form with the same schemas, and server-side validation errors are mapped back onto their fields.

## Servers and sessions

Zustand stores the chosen server and one session per server, persisted in `localStorage`. Signing in to
a self-hosted server does not disturb a session on another one.

## Environment

| Variable                   | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `VITE_DEFAULT_SERVER_URL`  | Hosted server offered on the welcome screen (defaults to the current origin) |
| `VITE_DEFAULT_SERVER_NAME` | Its display name (defaults to "TataGereja Cloud")                            |
| `VITE_DEV_API_PROXY`       | Where the dev server proxies `/api` (defaults to `http://127.0.0.1:3000`)    |
