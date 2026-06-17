# Frontend Architecture

## Conclusion

The frontend should be a React SPA built with Vite+. The app will be served by the Go backend as embedded static files in production, while local development can use the Vite dev server with an API proxy to the Go server.

## Stack

```text
React
Vite+
TypeScript
tsgo
Oxlint
Oxfmt
TanStack Router
TanStack Query
Tailwind CSS v4
shadcn/ui
Valibot
React Hook Form
native fetch
Vitest
React Testing Library
lucide-react
Sonner
```

## Build Tooling

Use Vite+ as the frontend toolchain.

Vite+ should provide:

- Vite for development and bundling.
- TypeScript support.
- `tsgo` for fast type checking.
- Oxlint for linting.
- Oxfmt for formatting.

The project should avoid ESLint and Prettier unless there is a strong need later. Oxlint and Oxfmt are the default lint and format tools.

## Routing

Use TanStack Router for SPA routing.

Requirements:

- Typed route definitions.
- Layout routes for shared app chrome.
- Protected routes for authenticated pages.
- Route-level code splitting.
- Not-found route.
- Redirect unauthenticated users to login.

Route-level code splitting should be the default for pages and larger feature areas. Keep shared layout, auth state, common UI, and global providers in the base bundle.

## Server State

Use TanStack Query for server state.

Use it for:

- `/api/me`
- list/detail queries
- create, update, delete mutations
- cache invalidation after mutations
- retry and stale-time behavior
- loading and error states

TanStack Query works well with session-based auth. The query and mutation functions only need to call the API client. Auth is handled by cookies.

On logout:

1. Call `POST /api/auth/logout`.
2. Clear the TanStack Query cache.
3. Redirect to the login route.

## HTTP Client

Use native `fetch` with a small typed API wrapper. Axios is not needed.

The app uses server-side session cookies, so every API request should include credentials:

```ts
await fetch("/api/me", {
  credentials: "include",
})
```

The API wrapper should handle:

- `credentials: "include"` by default.
- JSON request and response handling.
- `401 Unauthorized` responses.
- Valibot response parsing.
- CSRF header injection for create, update, and delete requests.

In production, the Go backend serves both the SPA and `/api/*` from the same domain, so cookies are same-origin. In development, use a Vite proxy to forward `/api/*` requests to the Go backend and keep the browser behavior close to production.

## Validation

Use Valibot for runtime validation.

Use it for:

- API response parsing.
- Form validation schemas.
- Shared client-side input validation.

Pair Valibot with React Hook Form for forms.

Recommended form stack:

```text
React Hook Form
@hookform/resolvers
Valibot
```

Frontend validation is for user experience. The Go backend must still validate every request.

## Styling and UI

Use Tailwind CSS v4 for styling and shadcn/ui for reusable components.

Use shadcn/ui for:

- buttons
- inputs
- forms
- dialogs
- dropdowns
- navigation elements
- cards
- tables
- alerts

Use `lucide-react` for icons because it matches the shadcn/ui ecosystem well.

Use `sonner` for toast notifications.

## Auth UI

The frontend auth flow should support email/password sessions.

Initial routes:

```text
/login
/register
/
```

The app should load the current user from `/api/me` through TanStack Query. Protected routes should depend on that query result.

Authenticated create, update, and delete requests must include CSRF protection. Session cookies should stay `HttpOnly`, so the frontend must not read or store the session token directly.

## Caching

Vite should emit hashed assets for long-term caching.

Expected production cache behavior:

```text
/assets/*      public, max-age=31536000, immutable
/index.html    no-cache
/api/*         no-store
```

TanStack Query handles API response caching in the browser. Cloudflare should not publicly cache authenticated API responses.

## Testing

Use Vitest and React Testing Library for frontend tests.

Test priorities:

- auth form validation
- API client behavior
- route guards
- important components
- mutation success and error states

Add Playwright later for end-to-end tests when the main user flows are stable.

## Commands

The frontend should be wired into the root Taskfile:

```text
task fe
task fe:build
task fe:lint
task fe:test
task build
task test
task lint
task verify
```

These commands should call the Vite+ scripts inside the frontend package.
