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
src/components/ui/      Design system: primitives, lists, tables, filters, charts, states
src/components/layout/  Shells (sidebar, top bar, bottom tabs, command palette), route guard
src/features/<id>/      One folder per feature or module: module.tsx, i18n.ts, API hooks, screens
src/features/registry.ts      Every module manifest; router and menus are generated from it
src/features/dictionaries.ts  Every feature dictionary
src/lib/i18n/           Typed translations (id, en) and Intl formatting
src/lib/                Axios client, query client, module types, URL state, form helpers
src/stores/             Zustand stores for server selection, sessions and preferences
```

See [docs/ARCHITECTURE-MODULES.md](../../docs/ARCHITECTURE-MODULES.md#interface) for the module
registry, i18n, the component list and the quality bar every screen meets.

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
| `VITE_UI_GALLERY`          | `1` routes the component gallery at `/c/:churchId/ui` in a production build  |
