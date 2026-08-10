# TataGereja Plan

## Vision

TataGereja is an open-source church management mobile application. A free hosted backend will be available by default, while churches that want data sovereignty can run the same backend on their own server.

## Agreed Technology

- **Mobile:** React Native with Expo and TypeScript
- **Backend:** PocketBase
- **Repository:** Monorepo
- **Initial platform:** Android, distributed through Google Play
- **Notifications:** Not included for now
- **Bot protection:** Optional Cloudflare Turnstile for public registration

Planned repository structure:

```text
tatagereja/
├── apps/
│   ├── mobile/       # Expo React Native application
│   └── backend/      # PocketBase configuration, hooks, and migrations
├── deploy/           # Self-hosting and Docker files
├── docs/
└── README.md
```

## Account Model

There is only one type of user account. After registering, a user can:

1. **Create a church** and automatically become its owner.
2. **Join a church** using a QR code or invitation link.

A user is connected to a church through a membership with a role, rather than being permanently classified as a church or regular account.

```text
User ── Church membership ── Church
                │
                └── role: owner, administrator, or member
```

This allows a user to belong to more than one church and have a different role in each church.

## Server Selection

The mobile app will support both the official hosted service and self-hosted servers.

```text
Welcome to TataGereja

[ Continue with TataGereja Cloud ]
[ Use another server ]
```

Choosing **Use another server** lets the user enter a base URL, similar to selecting a Mastodon server:

```text
https://church.example.com
```

The app checks that the URL points to a compatible TataGereja backend before showing its login and registration options. Authentication is stored separately for each server.

## Registration Modes

The backend supports three registration modes:

- `public` — anyone can create an account
- `invite_only` — registration requires a valid invitation
- `disabled` — only an administrator can create users

Recommended defaults:

- **TataGereja Cloud:** `public`
- **Self-hosted server:** `invite_only`

A self-hosted backend can remain publicly accessible for mobile users without allowing public registration. Registration restrictions must be enforced by the backend, not only hidden in the mobile interface.

Example self-hosted configuration:

```env
REGISTRATION_MODE=invite_only
```

## Bot Protection

PocketBase remains responsible for authentication. Clerk will not be used because it would add a hosted dependency and make self-hosted authentication behave differently.

Cloudflare Turnstile can be enabled through server configuration:

```env
REGISTRATION_MODE=public
TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
```

Recommended defaults:

- **TataGereja Cloud:** Turnstile enabled
- **Invite-only self-hosted server:** Turnstile disabled
- **Self-hosted server with public registration:** The owner can configure and enable Turnstile

When enabled, the React Native app displays the Turnstile challenge in a WebView and sends the resulting token to the backend. The backend verifies the token before creating the PocketBase user. The secret key must never be sent to the mobile app.

Turnstile protects new account creation only, not normal login. Registration restrictions, Turnstile verification, and basic rate limits must all be enforced by the backend so they cannot be bypassed by calling PocketBase directly.

## Invitations

An administrator can invite someone using either:

- A QR code
- An invitation link

An invitation identifies the backend, church, and temporary invitation token. The intended flow is:

```text
Open link or scan QR code
          ↓
App connects to the correct server
          ↓
User registers or logs in
          ↓
Server validates the invitation
          ↓
User joins the church
```

Invitation tokens should expire and should only be usable according to limits selected by the administrator.

## Authentication

Email and password authentication will be supported. PocketBase also supports Google OAuth, which can be added as an optional login method.

- The official hosted service uses its own Google OAuth configuration.
- Self-hosters who want Google login configure their own Google OAuth credentials.
- OAuth registration must follow the server's registration mode and must not bypass invitation requirements.

## Permissions and Data Access

PocketBase uses collection API rules rather than PostgreSQL-style row-level security. These rules will provide record-level protection for normal CRUD operations. Backend hooks or custom endpoints will protect important workflows such as creating churches, joining through invitations, and changing roles.

Every church-owned record must belong to a church. Access is allowed only when the authenticated user has an active membership in that same church.

Permissions must always be enforced by the backend. The mobile app can hide unavailable actions for usability, but hidden buttons are not a security boundary.

### Church-Wide Roles

- **Owner:** The church creator. Can manage everything and transfer ownership.
- **Administrator:** Can manage the church but cannot transfer ownership.
- **Member:** Has regular member access and can manage their own profile.

Group leadership is a scoped assignment rather than a church-wide role. A leader can manage only the groups, events, announcements, and attendance assigned to them.

```text
Church role: owner | administrator | member
Group assignment: leader of a specific group
```

Custom roles and a configurable permission builder are not part of the initial release.

### Permission Matrix

| Feature | Member | Assigned group leader | Administrator | Owner |
| --- | --- | --- | --- | --- |
| View church | Yes | Yes | Yes | Yes |
| Edit church | No | No | Yes | Yes |
| Transfer ownership | No | No | No | Yes |
| View directory | Yes | Yes | Yes | Yes |
| Manage people | Own profile | Assigned group members | Yes | Yes |
| Manage groups | No | Assigned groups | Yes | Yes |
| Manage events | No | Assigned groups | Yes | Yes |
| Record attendance | No | Assigned groups | Yes | Yes |
| Publish announcements | No | Assigned groups | Yes | Yes |
| Create invitations | No | No | Yes | Yes |

## MVP Modules

### Church

- Church profile, logo, and basic information
- Registration settings
- Administrator management
- Ownership transfer

### People

- Member directory and profiles
- Contact information and membership status
- Optional connection between a person and a login account

People and user accounts remain separate because some people, such as children, may not have an account. Sensitive information must be stored separately from normal directory information because PocketBase rules protect whole records rather than individual fields.

### Groups and Ministries

- Create groups
- Assign group leaders
- Add people to groups
- View and manage group members

### Events

- Church-wide and group events
- Event details and schedules
- Event participants

### Attendance

- Create attendance sessions from events
- Mark people present or absent
- View previous attendance

Members cannot view everyone else's attendance. Assigned group leaders can manage attendance only for their groups.

### Announcements

- Church-wide and group announcements
- Draft and published states
- Group leaders publish only to assigned groups

### Invitations

- QR codes and invitation links
- Expiration and usage limits
- Invitation revocation

## Initial PocketBase Collections

```text
users
churches
church_memberships
people
person_private_details
groups
group_members
group_leaders
events
attendance_sessions
attendance_records
announcements
invitations
```

Collections may be adjusted during implementation, but the separation between users, people, memberships, and private person details should remain.

## UI Design System

The mobile application will use:

- **Expo Router** for navigation
- **HeroUI Native** for accessible UI components
- **Uniwind** for component styling and design tokens
- **React Native Reanimated** for purposeful motion

HeroUI Native is chosen for its polished mobile components, Expo-first setup, accessibility, and flexible styling. TataGereja will not use HeroUI's default appearance as its product identity. The app will define its own colors, typography, spacing, radius, shadows, and motion tokens, then use HeroUI as the component foundation.

The visual direction will use:

- A polished, modern, and bespoke interface
- Warm neutral backgrounds with one primary brand color
- Strong, editorial page headings
- Clear typography and large touch targets
- Consistent spacing, soft surfaces, and restrained shadows
- Purposeful animations for transitions, sheets, and success states
- Light and dark themes
- Optional church logo and brand color customization later

Product-specific components such as member cards, event rows, attendance sheets, and church headers will be designed for TataGereja rather than assembled directly from default HeroUI examples.

Initial member navigation:

```text
Home | People | Events | Profile
```

The app will not have a separate administrator interface. Management actions appear in the relevant screens only when the current user has permission. For example, an administrator sees an **Add person** action in the People screen while a member sees only the directory.

## Initial MVP

The first useful release will focus on:

1. User registration and login
2. Hosted or self-hosted server selection
3. Church creation
4. Church invitations and joining
5. People directory
6. Groups or ministries
7. Events
8. Attendance
9. Announcements
10. Owner, administrator, member, and scoped group-leader permissions

Not planned for the initial release:

- Push notifications
- Chat
- Donations or accounting
- Counseling records
- Complex permission configuration
- Offline synchronization

## Initial Implementation Order

1. Set up the Expo mobile app and PocketBase backend in the monorepo.
2. Set up HeroUI Native, Uniwind, TataGereja design tokens, and base navigation.
3. Add server selection and backend compatibility checking.
4. Add authentication, optional Turnstile protection, and persistent per-server sessions.
5. Add churches, memberships, registration modes, and collection access rules.
6. Add church creation, invitations, QR codes, and invite links.
7. Build People, Groups, Events, Attendance, and Announcements.
8. Package the backend for simple self-hosting with Docker.
