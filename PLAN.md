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
server. Turnstile protects registration only; login is protected by per-IP and per-email rate limits.

## Invitations

An administrator creates an invitation with a role, an optional label, an optional expiry and an optional
usage limit. It is shared as a link or QR code that opens `/join/<token>`. The recipient registers or logs
in, the server validates the invitation, and the membership is created inside one transaction with the
usage counter. Invitations can be revoked at any time.

## Permissions

Permissions live in one shared module. The API checks them before every write, and the interface uses the
same functions to hide actions people cannot take. Hidden buttons are a usability choice, never the
security boundary.

### Roles

- **Owner:** the church creator; can do everything and transfer ownership
- **Administrator:** can manage the church but cannot transfer ownership or delete it
- **Member:** regular access; can manage their own linked profile
- **Group leader:** a scoped assignment for specific groups

### Matrix

| Feature                                | Member      | Assigned group leader  | Administrator | Owner |
| -------------------------------------- | ----------- | ---------------------- | ------------- | ----- |
| View church, directory, groups, events | Yes         | Yes                    | Yes           | Yes   |
| Edit church                            | No          | No                     | Yes           | Yes   |
| Delete church, transfer ownership      | No          | No                     | No            | Yes   |
| Manage members and roles               | No          | No                     | Yes           | Yes   |
| Create invitations                     | No          | No                     | Yes           | Yes   |
| Manage people                          | Own profile | Assigned group members | Yes           | Yes   |
| Private person details                 | Own         | No                     | Yes           | Yes   |
| Manage groups                          | No          | Assigned groups        | Yes           | Yes   |
| Assign group leaders                   | No          | No                     | Yes           | Yes   |
| Manage events                          | No          | Assigned groups        | Yes           | Yes   |
| Record and view attendance             | Own history | Assigned groups        | Yes           | Yes   |
| Publish announcements                  | No          | Assigned groups        | Yes           | Yes   |

## Modules

- **Church:** profile, logo and brand colour, member management, ownership transfer, deletion
- **People:** directory with search and filters, profiles, private details stored in a separate table,
  optional link to a login account (children and visitors need no account)
- **Groups:** ministries and small groups, assigned leaders, membership
- **Events:** church-wide and group events, participants, RSVP
- **Attendance:** sessions created from an event or standalone, present/absent/excused marking, personal
  history; members see only their own
- **Announcements:** drafts and published posts, church-wide or for one group
- **Invitations:** links and QR codes with expiry, usage limits and revocation

## Data model

```text
users              sessions           churches          church_memberships
invitations        people             person_private_details
groups             group_members      group_leaders
events             event_participants
attendance_sessions attendance_records
announcements
```

Private person details live in their own table so the API can serve a profile without them. Every
church-owned row carries its `church_id`, and deletions cascade from the church down.

## Interface

Navigation is `Home · People · Events · Groups · More` on phones, and a sidebar on wider screens. The
design uses warm neutral surfaces with one brand colour, large touch targets, restrained shadows, and
light and dark themes. There is no separate administrator area: management actions appear next to the
data they affect for the people allowed to use them.

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

## Not in this release

Push notifications, chat, donations and accounting, counselling records, a configurable permission
builder, and offline synchronisation. Google OAuth is a natural next addition: the account model already
separates people from login accounts, so it only needs to respect the registration mode.
