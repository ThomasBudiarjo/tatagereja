# TataGereja Plan

## Vision

TataGereja is an open-source church management application. A hosted backend is available by default,
while churches that want data sovereignty can run the same backend on their own server.

## Technology

The product started as an Expo application on PocketBase. It is now a mobile-first single-page web app
with a purpose-built API, which keeps one codebase for phones, tablets and desktop, and lets the server
enforce every permission rule rather than expressing them as collection rules.

- **Frontend:** React, Vite, TypeScript, Tailwind CSS v4, Radix UI primitives, TanStack Query, Zustand,
  React Hook Form, Axios, Zod
- **Backend:** Bun, Elysia, Drizzle ORM, SQLite, Zod
- **Shared:** one package of Zod schemas, types and permission functions imported by both sides
- **Repository:** a Bun workspace monorepo

```text
tatagereja/
├── packages/shared/   Schemas, types, permission matrix
├── apps/api/          Elysia server, database schema, migrations, tests
├── apps/web/          React single-page app
├── deploy/            Docker Compose for self-hosting
└── README.md
```

## Account model

There is a single kind of account. After registering, a person can create a church and become its owner,
or join one through an invitation link or QR code.

```text
User ── Church membership ── Church
                │
                └── role: owner, administrator, or member
```

A user can belong to several churches with a different role in each. Group leadership is a scoped
assignment on top of the church role rather than a fourth role.

## Server selection

The app offers the hosted server or a self-hosted address. It calls `GET /api/meta` to confirm the
address is a TataGereja server, and stores sessions per server so signing in to one does not affect
another.

## Registration modes

`REGISTRATION_MODE` accepts `public`, `invite_only` or `disabled`. Recommended defaults are `public` for
the hosted service and `invite_only` for self-hosted servers. A self-hosted server can stay reachable for
its members without accepting public sign-ups. The mode is enforced by the API, not hidden in the interface.

## Bot protection

Cloudflare Turnstile can be enabled with `TURNSTILE_ENABLED`, `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY`. The site key reaches the browser through `GET /api/meta`, the app renders the
challenge, and the API verifies the token before creating the account. The secret key never leaves the
server. Turnstile protects registration only.

Sign-in is protected in layers, all on the server:

- **Rate limits** per client address and per email address
- **Progressive lockout** per account: the first five failures cost nothing, then each further failure
  doubles the wait (one minute, two, four, …) up to an hour. A locked account is refused before the
  password is checked, so the lock cannot be used to test guesses, and its owner is notified the first
  time it locks
- **Two-step sign-in** (TOTP, RFC 6238) for accounts that turned it on: the password answers with a
  short-lived challenge, and the session is created only after a valid authenticator or recovery code.
  Secrets are encrypted at rest and a code cannot be replayed inside its window
- **Sign-in history** of successes, failures and lockouts that each person can review, next to their
  active sessions

A church owner can require two-step sign-in for every member who holds a management permission.

## Invitations

An administrator creates an invitation with a role, an optional label, an optional expiry and an optional
usage limit. It is shared as a link or QR code that opens `/join/<token>`. The recipient registers or logs
in, the server validates the invitation, and the membership is created inside one transaction with the
usage counter. Invitations can be revoked at any time.

## Permissions

Permissions live in one shared catalog, one file per module (`packages/shared/src/permissions/`). The
API checks them before every write and every read of sensitive data, and the interface uses the same
functions to hide actions people cannot take. Hidden buttons are a usability choice, never the security
boundary.

### Roles

- **Owner:** the church creator; holds every permission, including deleting the church, transferring
  ownership, the security policy and the church backup
- **Administrator:** holds every permission except the owner-only ones and confidential pastoral care,
  which must be granted explicitly
- **Member:** viewing the directory, groups, events, announcements, services and facilities, booking
  requests and prayer requests, plus their own data
- **Custom roles:** church-defined sets of permissions added on top of the base role. Pendeta, Majelis /
  Penatua, Bendahara, Sekretaris, Koordinator Pelayanan and Guru Sekolah Minggu are suggested for every
  church and can be edited freely
- **Group leader:** a scoped assignment for specific groups

Effective permissions are the base role's permissions plus those of every assigned custom role. Nobody
can grant, remove or edit a permission they do not hold, the owner's roles are never edited, and nobody
can remove their own ability to manage roles. Members can be suspended, which blocks the church without
deleting anything.

### Matrix (base roles)

| Feature                                | Member       | Assigned group leader  | Administrator | Owner |
| -------------------------------------- | ------------ | ---------------------- | ------------- | ----- |
| View church, directory, groups, events | Yes          | Yes                    | Yes           | Yes   |
| Edit church                            | No           | No                     | Yes           | Yes   |
| Delete church, transfer ownership      | No           | No                     | No            | Yes   |
| Manage members and roles               | No           | No                     | Yes           | Yes   |
| Create invitations                     | No           | No                     | Yes           | Yes   |
| Manage people                          | Own profile  | Assigned group members | Yes           | Yes   |
| Private person details                 | Own          | No                     | Yes           | Yes   |
| Manage groups                          | No           | Assigned groups        | Yes           | Yes   |
| Assign group leaders                   | No           | No                     | Yes           | Yes   |
| Manage events                          | No           | Assigned groups        | Yes           | Yes   |
| Record and view attendance             | Own history  | Assigned groups        | Yes           | Yes   |
| Publish announcements                  | No           | Assigned groups        | Yes           | Yes   |
| Audit log, module settings             | No           | No                     | Yes           | Yes   |
| Confidential pastoral care             | No           | No                     | When granted  | Yes   |
| Worship services, facilities, bookings | View, book   | View, book             | Yes           | Yes   |
| Prayer requests                        | Submit       | Submit                 | Yes           | Yes   |
| Finance                                | Own giving   | Own giving             | Yes           | Yes   |
| Church registry                        | Own records  | Own records            | Yes           | Yes   |
| Kids check-in                          | Own children | Own children           | Yes           | Yes   |
| Security policy, church backup         | No           | No                     | No            | Yes   |

### Audit log and notifications

Sensitive changes (church profile, deletion and ownership, member roles and status, custom roles,
invitations, private person details, person deletion, module settings) are written to an audit log in
the same transaction as the change, with sensitive values redacted. In-app notifications are created
per recipient, respect each person's preferences, and only reach active members of the church.

## Modules

Each module owns its permissions, tables, API routers, screens and dictionaries; optional modules can be
switched off per church, and their routes then answer `403 MODULE_DISABLED`.

- **Church (core):** profile, logo and brand colour, members and suspension, custom roles, invitations,
  module switches, audit log, ownership transfer, deletion
- **Administration and security:** two-step sign-in, recovery codes, sign-in history, sessions, data
  export and account deletion; the church security overview, the 2FA policy and the owner's backup
- **People and groups:** directory with search and filters, profiles with family and timeline, private
  details in a separate table, privacy settings, households, areas (Wilayah/Sektor) with coordinators,
  tags, custom fields, import/export, duplicate merging, groups (Komisi) with leaders and join requests.
  A person needs no login account (children and visitors)
- **Communication and events:** announcements with scheduling, pinning, audiences and read tracking;
  events with recurring series, registration and RSVP; the church calendar with private iCal feeds;
  the weekly Warta Jemaat; in-app notifications in the reader's language
- **Attendance and reports:** the home dashboard, attendance sheets or headcounts, absence alerts,
  personal history, and reports on membership, demographics, attendance, visitors, volunteers and giving
- **Worship (optional):** service types and services, the liturgy (Liturgi) with printing, a song
  library, serving teams and positions, Jadwal Pelayanan with blockout dates, each person's schedule
- **Pastoral care (optional):** care cases with caregivers, notes and confidentiality, Perkunjungan,
  prayer requests with moderation, visitor follow-up, tasks and diakonia aid
- **Church registry (optional):** the numbered register (buku induk) of Baptis, Sidi, Pemberkatan
  Nikah, Penyerahan Anak, Atestasi masuk/keluar and Kedukaan, with corrections, voiding, certificates
  and the membership changes a record implies
- **Finance (optional):** a ledger with funds, accounts and categories; offerings counted by two
  counters and verified by a third person; Persembahan and Perpuluhan with receipts; expense requests
  with approval; budgets (RAPB); campaigns and pledges; closed periods; reports and giving statements.
  Amounts are integer minor units of the church currency (IDR by default)
- **Facilities and inventory (optional):** rooms and resources, bookings with conflict detection and
  approval, inventory with labels, loans and maintenance
- **Kids check-in (optional):** Sekolah Minggu classes and teachers, check-in sessions and stations,
  labels with a security code that check-out requires, allergy, medical and custody alerts, authorised
  pick-ups, and the attendance a closed session records

## Data model

```text
core            users sessions churches church_memberships invitations people
                person_private_details groups group_members group_leaders event_series events
                event_participants attendance_sessions attendance_records announcements
access          church_roles membership_roles
audit           audit_logs
notifications   notifications notification_preferences
admin-security  user_two_factor user_recovery_codes two_factor_challenges login_events
people          households household_members areas area_coordinators person_areas person_tags
                person_tag_assignments custom_field_definitions custom_field_values
                person_privacy_settings group_join_requests
comms           announcement_audience_roles announcement_reads event_registrations
                calendar_feed_tokens bulletins
insights        dashboard_preferences absence_alerts
worship         service_types worship_services liturgy_items songs serving_teams serving_positions
                serving_team_members serving_member_positions roster_assignments volunteer_blockouts
care            care_cases care_case_caregivers care_notes care_visits care_visit_visitors
                prayer_requests prayer_request_prayers visitor_follow_ups care_tasks diakonia_aid
records         registry_records registry_record_people
finance         finance_funds finance_accounts finance_categories finance_periods finance_entries
                offering_batches offering_batch_lines finance_campaigns finance_pledges
                finance_contributions expense_requests finance_budgets finance_transfers
facilities      facility_resources facility_bookings facility_booking_exceptions inventory_assets
                asset_loans asset_maintenance
checkin         checkin_classes checkin_class_teachers checkin_sessions checkin_child_profiles
                checkin_child_alerts checkin_authorized_pickups checkins
```

Private person details live in their own table so the API can serve a profile without them. Every
church-owned row carries its `church_id`, and deletions cascade from the church down; account security
tables cascade from `users` instead. Ledger entries and registry records are voided or corrected, never
deleted.

## Interface

Navigation on phones is a bottom bar of `Beranda · Jemaat · Kegiatan · Pelayanan · Menu` (Home,
People, Events, Ministry, Menu): Pelayanan gathers groups, worship, care and the registry, and Menu
lists every module the person may open. Wider screens get a sidebar in three sections (Utama,
Pelayanan, Administrasi) and a command palette (Ctrl K). Items for modules that are switched off or
that the person cannot view are left out, and opening such a page directly shows a "no access" state.

The interface is in Indonesian and English, with dates, numbers and money in the active locale. The
design uses warm neutral surfaces with one brand colour, large touch targets, restrained shadows, and
light and dark themes. Church settings live under Settings for the people who may change them; other
management actions appear next to the data they affect for the people allowed to use them.

## Delivered

1. Registration, login, sessions and password management
2. Hosted or self-hosted server selection
3. Church creation, profile, members, roles, ownership transfer and deletion
4. Invitations with links, QR codes, expiry, usage limits and revocation
5. People directory, profiles and private details
6. Groups with assigned leaders and members
7. Events with participants and RSVP
8. Attendance sessions and personal history
9. Announcements with drafts
10. Owner, administrator, member and scoped group-leader permissions, enforced by the API
11. Docker packaging for self-hosting
12. Granular permission catalog, custom roles with suggested templates, anti-escalation rules
13. Member suspension, audit log, in-app notifications, per-church module toggles
14. Security headers, request size limits and reusable rate limiting
15. Two-step sign-in with recovery codes, progressive account lockout, sign-in history, data export and
    account deletion, the church 2FA policy, security overview and owner backup
16. Households, areas, tags, custom fields, privacy settings, import/export, merging and group join
    requests
17. Announcements with audiences and scheduling, recurring events with registration, the church
    calendar with iCal feeds, Warta Jemaat and localized notifications
18. Home dashboard, attendance headcounts and absence alerts, church reports
19. Worship services, liturgy, songs, serving teams and rosters
20. Pastoral care, visitation, prayer requests, visitor follow-up, tasks and diakonia
21. The church registry with numbering, corrections, certificates and membership effects
22. Finance: ledger, offerings, giving, expenses, budgets, campaigns, periods and reports
23. Facilities, bookings, inventory, loans and maintenance
24. Sekolah Minggu check-in with security codes, labels, alerts and authorised pick-ups
25. A demo church seeded through the public API

## In progress

Polish found by walking through the demo church on phones and desktops: consistent layouts at 360px,
deep links between modules (a profile opens that person's cases, giving and records), and the
remaining empty, loading and error states. New modules follow the contract in
[docs/ARCHITECTURE-MODULES.md](./docs/ARCHITECTURE-MODULES.md).

## Not in this release

Push notifications, chat and offline synchronisation. Google OAuth is a natural next addition: the
account model already separates people from login accounts, so it only needs to respect the
registration mode.
