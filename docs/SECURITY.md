# Security

This document describes how TataGereja protects a church's data: who may see and change what
(threat model, permission model, data classification, abuse limits), what to do when something
goes wrong (incident response), how to run a server safely (self-hosting checklist), and how it
authenticates people, keeps sessions, stores secrets and resists guessing. The API is the only
security boundary; everything below is enforced on the server. The permission catalog and the
module contract are in [PLAN.md](../PLAN.md#security-model) and
[ARCHITECTURE-MODULES.md](./ARCHITECTURE-MODULES.md).

## Threat model

**What is protected.** Personal data of the jemaat (contact details, birthdays, national ID
numbers, medical notes, family links), pastoral care (counselling notes, visits, prayer
requests shared with pastors only), giving and church finance, the church register, children's
check-in (custody alerts, authorised pick-ups, security codes), and the accounts themselves
(passwords, sessions, two-step secrets).

**Who might attack.** Someone on the internet without an account; a person with an account in
another church on the same server; a member of the church reading more than their role allows
(curiosity is the most likely case: a member looking up a neighbour's giving or a pastoral
note); a group leader or volunteer reaching beyond their scope; an administrator trying to
raise their own permissions or remove a pastor; a stolen session or password; a buggy or
abusive script flooding the server; and someone with a copy of the database or a backup.

| Threat                                              | Defence                                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Reading another church's rows by id (IDOR)          | Every church row carries `church_id`; ids in a request are loaded inside the church and answer `404` otherwise                               |
| A member calling routes the interface hides         | Guards on every route, row rules in the handler; the generated matrix test calls every route as every kind of caller                         |
| Learning a route's schema or a row's existence      | Session, membership and route permission are checked before the body, query and parameters are validated (`401`/`403`, never `422` first)    |
| Over-broad answers (a field the caller may not see) | Field rules on the server: privacy choices, private details, confidential care, giving, check-in codes, audit redaction                      |
| Oracles (searching by a hidden phone number)        | Searches and filters on a hidden field match only people who show it, for callers who could not see it                                       |
| Leaders reaching beyond their groups                | Leader scope is per group: attendance, rosters and members only of the groups they lead                                                      |
| Privilege escalation                                | `canGrant` anti-escalation on roles, base roles, suspensions, removals and reset links; owner untouchable                                    |
| Stolen sessions, CSRF, XSS, guessing                | See [Sessions](#sessions) to [Headers](#headers): httpOnly cookies, CSRF tokens, rotating refresh tokens, lockout, strict CSP, Trusted Types |
| Floods and notification loops                       | Body limits per kind of route, per-account limits on writes, exports and searches, repeated notices collapsed                                |
| A copied database or backup                         | Confidential columns encrypted (AES-256-GCM); tokens stored as hashes; backups and exports leave credentials out                             |

Out of scope: a compromised server or operating system (an attacker with the process and the key
reads everything), and a church owner who abuses their own church's data (the audit log records
what they do).

## Permission model

A request passes these layers, in this order:

1. **Session** (`auth` and `church` macros, `transform` hook): a valid cookie (with CSRF token
   for writes) or bearer token, else `401`.
2. **Admission**, still before validation: the caller is an active member of `:churchId`
   (`404` unknown church, `403` non-member, `403 MEMBERSHIP_SUSPENDED`), the church's 2FA policy
   holds, the module is on (`403 MODULE_DISABLED`), and the route's guard permission is held
   (`403 FORBIDDEN`). The guard is recorded on the route (`detail['x-church-guard']`), so the
   tests read it.
3. **Validation** of body, query and parameters (`422`).
4. **Row rules** in the handler, with the shared `can.*` and module rules: leader scope, own
   data, confidentiality, caregivers, segregation of duties, anti-escalation.
5. **Field rules** when serialising: directory privacy (`applyPersonPrivacy`, `withPrivacy`),
   private details, confidential care, giving, check-in codes, audit redaction.

Rules decided in this pass:

- **Group leaders** see a person's attendance history (lists, totals, timeline) only for sessions
  of the groups they lead (`personAttendanceScope`); church-wide services and other groups stay
  hidden, and adding someone to their group does not widen it. Leaders add members who asked to
  join or who are already in the directory (`canAddGroupMember`); every add and removal is on the
  audit log, marked when made as a leader.
- **Care and the directory.** A new visitor from the follow-up board is a new person and needs
  `people.create`; changing their membership status when they join needs `people.edit`. Without
  them the care team picks someone already in the directory, and the status change becomes a
  suggestion: the follow-up shows it, holders of `people.edit` are notified
  (`care.status_suggested`) and apply it (`POST /care/follow-ups/:id/apply-status`).
- **Audit viewers.** `audit.view` shows who did what and when. Finance entries also need
  `finance.view` (or `finance.manage`), pastoral care entries the care team (`care.view`,
  `care.manage` or `care.confidential`); otherwise the entry's summary, params and values are
  replaced (`redacted: 'finance' | 'care'`), in the list, the detail, the CSV export and the
  security overview, and a search never matches their hidden text.
- **Member actions.** The member list sends each member's effective permissions, so the row
  actions apply the same anti-escalation rule as the API (an administrator is not offered to
  suspend or remove a Pendeta holding `care.confidential`).

Audit entries carry an action key (`member.roles_update`), params (`{ member, added, removed }`,
`{ name }`, `{ person, status }`) and the English summary; the viewer builds the headline in the
reader's language from the key and params. Role changes name the members they affect.

## Data classification

| Class        | Data                                                                                                                             | At rest                                           | Who sees it                                                                                                               | Audit log                                                   | Exports and backups                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Secret       | Password hashes, session, refresh, reset, invitation and feed token hashes, TOTP secrets, recovery codes                         | Hashed (argon2id, SHA-256); TOTP secret encrypted | Nobody; never serialised                                                                                                  | Always `[redacted]`                                         | Never included                                                       |
| Credential   | Check-in security codes                                                                                                          | Plain (short, read aloud)                         | The guardian and `checkin.manage`                                                                                         | Redacted                                                    | Left out                                                             |
| Confidential | Pastoral care descriptions, notes and visit summaries; check-in alerts and pick-up notes; national ID, medical and private notes | AES-256-GCM (`encryptedText`)                     | Care: caregivers, the care team (confidential: `care.confidential`). Private details: `people.private.view` or the person | Values redacted; care entries redacted for non-care viewers | Backup (owner) in plain text; personal export only own non-care rows |
| Financial    | Gifts, donors, offerings, expenses, budgets, ledger                                                                              | Plain, integer minor units                        | Finance permissions; each person their own giving                                                                         | Redacted without `finance.view`                             | Backup; personal export of own giving                                |
| Personal     | Phone, email, address, birthday                                                                                                  | Plain (searchable)                                | Everyone in the directory unless the person hides it; hidden: `people.private.view` or the person                         | Plain                                                       | Directory export follows privacy; backup in full                     |
| Scoped       | Attendance history, absence alerts, rosters, group join requests                                                                 | Plain                                             | `attendance.view`, the person, leaders for their groups                                                                   | Plain                                                       | Backup                                                               |
| Directory    | Names, households, areas, groups, membership status                                                                              | Plain                                             | Members with `people.view` (every member by default)                                                                      | Plain                                                       | Backup, directory export                                             |

When an account is deleted, its sessions, memberships, roles, 2FA, sign-in history,
notifications and preferences go with it; content others rely on (events, announcements, rows
that cannot be orphaned) passes to the church owner; the person record stays in the directory,
unlinked. Account-level audit entries keep what happened and when, not the name, email,
address or browser. Church audit entries stay with the church's records.

## Abuse limits

- **Body size by kind of route** (`lib/abuse.ts`): 32 KB for sign-in, registration and codes;
  1 MB for long documents (Warta Jemaat, liturgies, songs, registry entries, pastoral notes);
  256 KB for everything else; imports up to `MAX_BODY_KB`. Larger bodies answer
  `413 PAYLOAD_TOO_LARGE`.
- **Per account** (`account.*` limiters), on top of the route-specific limits: 1,200 writes per
  10 minutes (a demo church is seeded with about 800), 120 exports and reports per 15 minutes
  (CSV exports, rosters, giving statements, reports, backups), 900 searches per 5 minutes.
  `429 RATE_LIMITED` says how many seconds to wait.
- **Route-specific** limits stay stricter: sign-in, two-step codes, reset links, invitations,
  check-out codes, prayer requests, join requests, audit export, backups.
- **Notifications** are not repeated: an identical unread notice (type, item, title and body)
  sent in the last 10 minutes is skipped, so toggling something back and forth cannot flood an
  inbox. Mandatory security notices are always sent.

## Incident response

1. **Contain.** Suspend the member involved (`Settings → Members`), or have the person use
   _Sign out everywhere_; an owner or administrator can make a password reset link for a member
   who lost access. Turn off a module that is being misused. If the `ENCRYPTION_KEY` or a backup
   leaked, rotate the key (see [Rotating the key](#rotating-the-key)). Session tokens do not
   depend on that key: if tokens may have leaked, end the sessions (each person can sign out
   everywhere; an operator can delete the rows of the `sessions` table, and everyone signs in
   again).
2. **Investigate.** The audit log (filter by person, module, action, item or dates; export CSV),
   each account's sign-in history, the security overview (members without two-step
   verification, recent entries) and the server log (`LOG_REQUESTS=true`; paths are logged
   without tokens). Look for bursts of `401`, `403` and `429`.
3. **Recover.** Restore the database from a backup together with the key that encrypted it;
   correct or void registry and finance entries rather than deleting them.
4. **Notify.** Tell the church leadership and the people affected. Indonesia's Personal Data
   Protection Law (UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi) requires written
   notice to the people affected and to the authority within 3 × 24 hours of a failure to
   protect personal data; check the rules that apply to your church.
5. **Learn.** Add a test for what went wrong (the generated matrix makes most access bugs a
   one-line canary), and report vulnerabilities in TataGereja itself privately to the
   maintainers rather than in a public issue.

## Self-hosting checklist

- [ ] **HTTPS only.** Put the container behind a reverse proxy that terminates TLS, redirect
      HTTP, and set `APP_URL` to the `https://` address (cookies get the `__Host-` prefix and HSTS
      is sent only over HTTPS).
- [ ] **`TRUST_PROXY`** set to the number of proxies in front of the API (usually `1`), so rate
      limits and sign-in history use the real client address; `0` when nothing is in front.
- [ ] **`ENCRYPTION_KEY`** set from `openssl rand -base64 32` and kept in a secret store, not in
      the repository; or keep the generated `.tatagereja.key` with mode 0600.
- [ ] **Backups**: the SQLite file (with `-wal`) taken with the server stopped or with
      `sqlite3 .backup`, copied off the machine, encrypted, kept with (but stored apart from) the
      encryption key, and a restore tested. The owner's church backup download is an extra copy,
      not a replacement.
- [ ] **`REGISTRATION_MODE=invite_only`** unless the server is meant for public sign-up; enable
      Turnstile for public registration.
- [ ] **`CORS_ORIGINS`** set to the origins that may call the API from a browser when the app
      is not served by the same server.
- [ ] **`MAX_BODY_KB`** left at 2048 or lower; the per-route limits apply below it.
- [ ] **Accounts**: the owner turns on two-step verification and sets the church's 2FA policy
      for managers; give roles the fewest permissions that do the job and review the members
      list and the audit log regularly.
- [ ] **Updates**: rebuild the image when TataGereja releases a fix; migrations run on start.
- [ ] **Logs and monitoring**: keep request logs (no tokens are logged) and watch for spikes of
      `401`, `403`, `413` and `429`.

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
become script (DOM XSS). The app never writes HTML; its only policy, `tatagereja-turnstile`,
lets exactly the Turnstile script URL through. The directive is left out when this server has
Turnstile configured, because Cloudflare's script is not known to keep to Trusted Types. (A
copy of the app served by a server without Turnstile that registers on another server with
Turnstile still enforces it; if that widget fails, serve the app from that server.)

A Playwright run of the built app under this policy (every route as the owner and as a member,
sign in, invitations, reset links, two-step setup, sessions, sign-out) reports no policy or
Trusted Types violations.

## Tests

`apps/api/tests/security-matrix.test.ts` is the permission and data-scope matrix: generated from
the router, it calls every route as nobody, another church's owner, a suspended member, a plain
member, a group leader, each suggested role, the administrator, the owner and a custom role
holding exactly the route's guard permission, checks the status codes, and searches every answer
for canaries planted in the church (a hidden phone, email, address and birthday, private
details, confidential and normal care text, a large gift, attendance in a group the leader does
not lead, a check-in security code, secret field names), including searches, filters and
downloads that could act as oracles. `security-routes.test.ts` walks every write as anonymous,
member and another church's owner on real rows. `security-scope.test.ts` (leader scope, leader
adds, audit redaction, member row actions, role-change params), `security-privacy.test.ts`
(privacy on every surface, exports and backups, account deletion) and
`security-abuse.test.ts` (body limits, account limits, notification repeats) cover the
authorization pass.

`apps/api/tests/sec-auth-sessions.test.ts` (cookie sessions and CSRF, bearer refresh rotation and
reuse detection, idle and absolute expiry, sign out everywhere, uniform sign-in answers and
timing, per-address limits, headers) and `apps/api/tests/sec-auth-secrets.test.ts` (key parsing,
encryption round trip, tampering, the startup migration, key rotation, invitation hashing and
regeneration, password rules and rehashing, admin reset links and recovery-code reset).
`data-model.test.ts` checks that every encrypted column holds only ciphertext.
