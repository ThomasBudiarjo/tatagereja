# Security: sessions, credentials and secrets

This document describes how TataGereja authenticates people, keeps sessions, stores secrets and
resists guessing. The permission model (who may do what in a church) is in
[PLAN.md](../PLAN.md#security-model) and [ARCHITECTURE-MODULES.md](./ARCHITECTURE-MODULES.md).
The API is the only security boundary; everything below is enforced on the server.

## Sessions

One row in `sessions` per signed-in device. Its id never changes; the credential the client
presents is rotated. Every session ends `SESSION_TTL_DAYS` (default 30) after sign-in, whatever
happens (absolute lifetime), or after `SESSION_IDLE_DAYS` (default 7) without use (idle
timeout). Each request checks both.

The app talks either to the server that serves it or to another (self-hosted) server the person
chose, so there are two transports. The client asks for one with `transport` on
`POST /auth/register`, `/auth/login` and `/auth/login/two-factor`; API clients that do not ask
get `bearer`.

### Cookie sessions (the app on the server's own origin)

```text
POST /api/auth/login { email, password, transport: "cookie" }
  → Set-Cookie: __Host-tg_session=<token>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=…
  → { user, transport: "cookie", token: null, refreshToken: null, csrfToken, sessionExpiresAt }
```

- The session token lives only in the cookie: `HttpOnly`, so no script (and no XSS) can read it,
  and `SameSite=Strict`, so other sites cannot make the browser send it. Over HTTPS the cookie
  has the `__Host-` prefix (Secure, host-only, `Path=/`) and a plain `tg_session` cookie is
  ignored, so a cookie planted over HTTP or from a sibling domain is never read. Plain
  `tg_session` is used only over HTTP (local development).
- **CSRF defence.** Every cookie-authenticated `POST`, `PUT`, `PATCH` and `DELETE` must:
  1. not come from another site: `Sec-Fetch-Site` must be `same-origin` (or `none`) when sent,
     and `Origin`, when sent, must be this server or `APP_URL` (the development server proxies
     the API under its own origin);
  2. carry the CSRF token in the `X-CSRF-Token` header. The token is an HMAC of the cookie token
     (nothing stored), returned by sign-in and by `GET /api/auth/session`; only same-origin
     script can read those answers, and the custom header cannot be sent cross-origin without a
     CORS preflight, which the API does not allow for it.

  A failed check answers `403 CSRF_FAILED`; the app refetches the token once and retries.

- Signing in with a cookie session is refused for cross-site requests too (no login CSRF), and a
  new cookie sign-in deletes the session the browser already presented (no session fixation). A
  bearer sign-in leaves the cookie alone: it may come from any page, including one on a sibling
  sub-domain whose requests still carry the SameSite cookie, and must not sign the browser out.
- A cookie token is never accepted as a bearer token and the other way round.

### Bearer sessions (another origin, scripts)

```text
POST /api/auth/login { email, password }               → { token, expiresAt, refreshToken, … }
GET  /api/…   Authorization: Bearer <token>             (valid ACCESS_TOKEN_TTL_MINUTES, default 15)
POST /api/auth/refresh { refreshToken }                 → a new token and a new refresh token
```

- The access token is short-lived and the app keeps it **in memory only**. Only the refresh
  token is persisted (so a reload stays signed in); it is single use.
- **Rotation with reuse detection.** Each refresh replaces both tokens; the previous refresh
  token is remembered in `session_refresh_tokens`. Presenting one again means a copy exists: the
  whole session (the token family) is deleted, `401 SESSION_REVOKED` is answered, and the
  account gets a sign-in history entry (`refresh_reuse`), an audit entry and a notification.
- The app refreshes once at a time across tabs (Web Locks), and tabs share new access tokens
  over a `BroadcastChannel`, so normal use never presents a rotated token.

### Rotation, revocation and sign-out

| Event                                     | Effect                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Sign-in, completing two-step verification | A new session; a cookie session the browser presented is deleted             |
| Password change                           | Every other session ends; this one gets new credentials (`session` in reply) |
| Password change or reset                  | Unused reset links and two-step sign-ins waiting for their code are voided   |
| Turning two-step verification on or off   | Every other session ends; this one gets new credentials                      |
| Password reset (admin link or recovery)   | Every session of the account ends                                            |
| `POST /auth/logout`                       | This session ends; the cookie is cleared                                     |
| `POST /auth/logout/everywhere`            | Every session of the account ends ("sign out everywhere")                    |
| `DELETE /auth/sessions`, `/sessions/:id`  | Other sessions, or one of them, end                                          |

`GET /auth/sessions` lists each device with its browser and system (from the user agent),
address, transport, last use and when it ends if left unused. Sessions that ended without being
presented again are deleted at startup, at each sign-in of the account and before the list is
read, so they never show as signed in.

On sign-out the app forgets the stored session, the credentials in memory, the whole TanStack
Query cache and the remembered church, in every open tab. When the server ends a session
(expired, revoked, password changed elsewhere) the next answer is `401` and the app does the same.

Version 1 of the app kept long-lived bearer tokens in `localStorage`; those sessions are deleted
at startup and the stored copies are discarded, so everyone signs in once after upgrading.

## Passwords

- **argon2id** through `Bun.password`, 64 MiB and three passes (`DEFAULT_PASSWORD_HASHING`,
  RFC 9106's second recommendation). A hash made with other parameters is replaced the next time
  the person signs in, so the cost can be raised at any time.
- New passwords (registration, change, reset) are refused when they are among the 10,000 most
  common passwords bundled with the API (`lib/common-passwords.txt`, plus common Indonesian
  ones), also with digits or symbols added at the end (`jakarta2024!`), or when they are the
  person's email address or name. Minimum 8, maximum 128 characters (512 bytes); longer
  passwords are refused before hashing.

## Two-step verification

TOTP (RFC 6238) with a 30-second step and one step of drift; a code cannot be replayed inside its
window. Ten recovery codes from a CSPRNG (unambiguous alphabet), stored as SHA-256 hashes and
consumed on use. The sign-in challenge is a random token stored as a hash, valid five minutes and
for five attempts. Attempts are limited per address (30 per 15 minutes) and count towards the
account lockout; failures are in the sign-in history.

## Account recovery (there is no email)

- **Administrator link.** An owner or administrator with `members.manage` opens a member and
  chooses _Password reset link_, after confirming they checked who is asking. The link
  (`/reset-password/<token>`) works for 30 minutes and once; only its hash is stored, a newer
  link voids the older one, and it is audited and notified to the account. It cannot be made for
  the owner, for oneself, for someone who holds permissions the administrator lacks, or for an
  account that also belongs to a church where the administrator could not do the same (no
  takeover across churches). For an account with two-step verification the link also needs a
  code from it (or a recovery code); two-step verification stays on.
- **Recovery code.** Someone with two-step verification resets the password with their email, an
  unused recovery code and a new password (`POST /auth/password-reset/recovery`). An unknown
  address, an account without two-step verification, a wrong code and a locked account all get
  the same answer, and the new password is checked against the email only (refusing the
  account's name would reveal it exists). A valid code works while the account is locked, so
  someone guessing its password cannot keep its owner out; wrong codes still count towards the
  lockout and the per-address limit applies.

Both ways end every session of the account and clear its lockout.

## Enumeration and brute force

- Sign-in answers `401 Invalid email or password` for an unknown address and for a wrong
  password, and spends one argon2id verification in every case (also when the account is
  locked), so the answer takes the same time.
- **Progressive lockout** per account: five free failures, then each failure doubles the wait
  (1, 2, 4 … 60 minutes). Unknown addresses lock in exactly the same way, so `ACCOUNT_LOCKED`
  does not reveal that an account exists.
- **Rate limits**: sign-in per address and email (10 per 15 minutes) and per address (100 per 15
  minutes, generous for a church wifi), registration per address, refresh and password reset per
  address, the second step per address, password re-entry per account, invitation and iCal
  tokens and check-out codes as before.
- Registration cannot stay silent about a taken address without email, so it answers `409` with
  a message that points to signing in without spelling out that the account exists.

## Secrets at rest

### Field encryption

Confidential columns are declared with `encryptedText(table, column)`
(`apps/api/src/db/encrypted.ts`) and encrypted with **AES-256-GCM** on every write and decrypted on
every read by Drizzle:

| Table                        | Columns                                         |
| ---------------------------- | ----------------------------------------------- |
| `user_two_factor`            | `secret_encrypted` (TOTP secret)                |
| `person_private_details`     | `national_id`, `medical_notes`, `private_notes` |
| `care_cases`                 | `description`                                   |
| `care_notes`                 | `body`                                          |
| `care_visits`                | `summary`                                       |
| `checkin_child_alerts`       | `description` (allergy, medical, custody)       |
| `checkin_authorized_pickups` | `notes`                                         |

A stored value is `enc1:<key id>:<base64url(iv ‖ tag ‖ ciphertext)>` with a random 96-bit IV, and
the column name is authenticated as additional data, so a value copied into another column does
not decrypt. Searchable fields (names, phone numbers, registry numbers) are not encrypted; an
encrypted column is never filtered or sorted on. Backups and personal data exports contain the
plain values for the people allowed to download them.

### The key

- `ENCRYPTION_KEY`: 32 random bytes in base64 or hex (`openssl rand -base64 32`), optionally with
  an id (`2026a:<base64>`); without an id, the id is a short fingerprint of the key. An invalid
  key stops the server with a clear message.
- Without `ENCRYPTION_KEY` the server creates `.tatagereja.key` (mode 0600) next to the database
  and warns at startup. In-memory databases (tests) use a key that lives as long as the process.
- Keep the key with your backups: a database restored without it cannot be read. The server
  refuses to start when stored values need a key it does not have.

### Startup migration

At every start, before answering anything, the server (idempotently, touching only rows that need
it): encrypts confidential values still in plain text, re-encrypts two-step secrets from the
earlier `v1:` format (with `TWO_FACTOR_ENCRYPTION_KEY` or `.tatagereja-2fa.key`), replaces plain
invitation tokens with their hash, and deletes bearer sessions from before refresh tokens.

### Rotating the key

1. Create a new key and set it as `ENCRYPTION_KEY`; move the old one into
   `ENCRYPTION_PREVIOUS_KEYS` (comma-separated). Restart: old values are read with the old key,
   new ones are written with the new key.
2. Run `bun run db:rotate-key` with the same environment: every value is re-encrypted with the
   new key in one transaction.
3. Remove the old key from `ENCRYPTION_PREVIOUS_KEYS` and restart.

### Tokens

Every bearer-style token is random (CSPRNG, 192–256 bits) and stored only as a SHA-256 hash:
session tokens, refresh tokens, two-step challenges, recovery codes, password reset links, iCal
feed tokens and invitation links. Invitation and reset links are therefore shown **once**, when
made; an invitation can get a new link (_Make a new link_), which stops the old link and its QR
code at once. Paths that carry a token are logged without it, both API routes and the app pages
the links open (`/join/<token>`, `/reset-password/<token>`). Kids check-in security codes are
short on purpose (read aloud at pick-up); check-out is limited per session and per operator.

## Headers

Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Resource-Policy: same-origin`, `Origin-Agent-Cluster`, a restrictive
`Permissions-Policy` (camera for the page itself only) and, over HTTPS,
`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

The app's Content Security Policy allows scripts only from the server itself (and Cloudflare
Turnstile): no inline script, no `eval` (`script-src-attr 'none'`, `object-src 'none'`,
`base-uri 'none'`, `frame-ancestors 'none'`, `upgrade-insecure-requests` over HTTPS). Styles may be
inline because UI libraries set them; `connect-src` stays open because the app may talk to any
server the person chooses. `public/csp-setup.js` (an external script) switches zod to its
`jitless` mode before the app loads, so validation never probes for `eval`. API answers get
`default-src 'none'; sandbox` and `Cache-Control: no-store`.

**Trusted Types** (`require-trusted-types-for 'script'`): the browser refuses plain strings in
DOM sinks that can run code (`innerHTML`, `script.src`, …), so a string that reaches one cannot
become script (DOM XSS). The app never writes HTML; its two policies let exactly one URL each
through: `tatagereja-turnstile` the Turnstile script, `tatagereja-service-worker` the app's
`/sw.js` (`serviceWorker.register` is a script URL sink). The directive is left out when this server has
Turnstile configured, because Cloudflare's script is not known to keep to Trusted Types. (A
copy of the app served by a server without Turnstile that registers on another server with
Turnstile still enforces it; if that widget fails, serve the app from that server.)

A Playwright run of the built app under this policy (every route as the owner and as a member,
sign in, invitations, reset links, two-step setup, sessions, sign-out) reports no policy or
Trusted Types violations.

## Offline copies

The service worker (`apps/web/service-worker.js`, see [PERFORMANCE.md](./PERFORMANCE.md#web-app))
keeps the app's code for offline use, and a short fallback of API answers. API answers are
otherwise `no-store`, so browsers never keep member data; the fallback is bounded on purpose:

- Only reads (`GET`) of the server the app is served from. Requests to other servers (bearer
  sessions) never pass through the worker's cache.
- Only for the account the page announced (`account` message, from the stored session). With no
  announced account nothing is stored or served. The worker writes the announced account down
  (`tg-meta`), because a browser stops an idle worker and its memory with it. The cache is named
  after the account (`tg-api:<user id>`), and announcing another account deletes every other
  one, so one device never holds two accounts' answers. A copy that finishes writing after the
  account changed is deleted with the rest.
- Only an allow-list of screens people open most (church, directory, households, areas, groups,
  events, calendar, announcements, Warta Jemaat, worship, attendance, facilities, inventory,
  notifications, the dashboard), and never anything under care, the church register, finance,
  check-in (children's alerts and pick-up notes), security, the audit log, members,
  invitations, exports or backups, nor any sign-in or account route, whatever the path.
- Never an answer carrying a person's private details (national ID, medical and private notes):
  the server encrypts them at rest, and they do not land unencrypted in a phone's storage.
- Answered only when the network fails, at most a day old, at most 80 answers.
- Signing out (here or in another tab), a session the server ended, and switching account delete
  them all, and the worker's note of the account, from the page (`clearOfflineData`),
  independent of the worker.

## Tests

`apps/api/tests/sec-auth-sessions.test.ts` (cookie sessions and CSRF, bearer refresh rotation and
reuse detection, idle and absolute expiry, sign out everywhere, uniform sign-in answers and
timing, per-address limits, headers) and `apps/api/tests/sec-auth-secrets.test.ts` (key parsing,
encryption round trip, tampering, the startup migration, key rotation, invitation hashing and
regeneration, password rules and rehashing, admin reset links and recovery-code reset).
`data-model.test.ts` checks that every encrypted column holds only ciphertext.
