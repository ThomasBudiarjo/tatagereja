# Module architecture

TataGereja is split into feature modules. Each module owns its permissions, notification types,
schemas, tables, API routers and screens, and only edits its own files. This document is the
contract every module follows. Read it together with `README.md`, `PLAN.md`, and the existing
code (`apps/api/src/modules/announcements.ts` is the reference router,
`apps/web/src/features/*` the reference screens).

The API is the security boundary. Every write, and every read of sensitive data, is checked on
the server with the shared permission functions. The interface uses the same functions only to
hide actions people cannot take.

## Modules

| Id               | Optional | Area                                                                 |
| ---------------- | -------- | -------------------------------------------------------------------- |
| `core`           | no       | Church profile, member accounts, roles, invitations, settings, audit |
| `admin-security` | no       | Account security, 2FA, login history, security policy, data export   |
| `people`         | no       | Directory, households, areas (wilayah/sektor), groups and komisi     |
| `comms`          | no       | Announcements, events, calendar, notifications, Warta Jemaat         |
| `insights`       | no       | Home dashboard, attendance, reports                                  |
| `worship`        | yes      | Ibadah, liturgi, songs, serving teams, jadwal pelayanan              |
| `care`           | yes      | Pelayanan pastoral, perkunjungan, pokok doa, follow-up, diakonia     |
| `records`        | yes      | Catatan gerejawi: baptis, sidi, pemberkatan nikah, atestasi          |
| `finance`        | yes      | Keuangan: persembahan, perpuluhan, pengeluaran, RAPB, reports        |
| `facilities`     | yes      | Sarana, peminjaman ruangan, inventaris                               |
| `checkin`        | yes      | Check-in Sekolah Minggu                                              |

Module metadata (labels in Indonesian and English, `optional`) lives in
`packages/shared/src/modules.ts`. Optional modules can be switched off per church by anyone with
`settings.manage` (`GET`/`PATCH /api/churches/:churchId/modules`). A switched-off module's routes
answer `403 MODULE_DISABLED`, and its menus and widgets disappear (`church.enabledModules`).

### Files each module owns

Every module already has an empty file or folder in each layer, wired into the shared indexes,
so no module needs to edit a shared index:

| Layer                      | File (replace `<id>` with the module id)              |
| -------------------------- | ----------------------------------------------------- |
| Permissions                | `packages/shared/src/permissions/catalog/<id>.ts`     |
| Notification types         | `packages/shared/src/notifications/catalog/<id>.ts`   |
| Zod schemas, enums, labels | `packages/shared/src/schemas/<id>.ts`                 |
| Tables                     | `apps/api/src/db/schema/<id>.ts`                      |
| API routers                | `apps/api/src/modules/<id>/` (register in `index.ts`) |
| Integration tests          | `apps/api/tests/<id>*.test.ts`                        |

Existing files are owned by the module whose area they cover:

| Module           | Existing files it may change                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin-security` | `modules/auth.ts`, `modules/roles.ts`, `modules/audit.ts`, `modules/churches.ts`, `services/security-policy.ts`                                                                                          |
| `people`         | `modules/people.ts`, `modules/groups.ts`, `schemas/person.ts`, `schemas/group.ts`                                                                                                                        |
| `comms`          | `modules/announcements.ts`, `modules/events.ts`, `modules/notifications.ts`, `services/announcements.ts`, `services/events.ts`, `schemas/announcement.ts`, `schemas/event.ts`, `schemas/notification.ts` |
| `insights`       | `modules/dashboard.ts`, `modules/attendance.ts`, `services/attendance.ts`, `schemas/dashboard.ts`, `schemas/attendance.ts`                                                                               |

Everything else (`plugins/auth.ts`, `services/audit.ts`, `services/notifications.ts`,
`services/modules.ts`, `services/access.ts`, `app.ts`, `serializers.ts`, `constants.ts`, the
permission and notification indexes) is shared foundation. Do not change it; if you need
something new there, put a helper in your own folder instead. Put new serializers in your module
folder (`modules/<id>/serializers.ts`) rather than in `serializers.ts`.

## Permissions

### Layout

```text
packages/shared/src/permissions/
├── types.ts            PermissionInput, definePermissions, ROLE_TEMPLATE_KEYS
├── catalog/
│   ├── core.ts         church.*, members.*, roles.manage, invitations.manage, settings.manage, audit.view
│   ├── admin-security.ts, people.ts, comms.ts, insights.ts, worship.ts, care.ts,
│   ├── records.ts, finance.ts, facilities.ts, checkin.ts
│   └── index.ts        PERMISSION_DEFINITIONS, PERMISSIONS, Permission, PERMISSION_GROUPS
├── roles.ts            BASE_ROLE_PERMISSIONS, ROLE_TEMPLATES, templatePermissions, effectivePermissions
└── access.ts           AccessLike, has, hasAny, canGrant, can.*, manageableGroupIds
```

### Adding a permission

Add an entry to your module's catalog file. The key, its labels and descriptions, and its
defaults all live in that one entry; the `Permission` union, the base roles, the role templates
and the permission matrix in the interface pick it up automatically.

```ts
// packages/shared/src/permissions/catalog/finance.ts
export const FINANCE_PERMISSIONS = definePermissions('finance', [
  {
    key: 'finance.budget.manage',
    label: { en: 'Manage budgets', id: 'Kelola anggaran' },
    description: {
      en: 'Create the yearly budget (RAPB) and adjust it.',
      id: 'Menyusun dan mengubah Rencana Anggaran Pendapatan dan Belanja (RAPB).',
    },
    sensitive: true, // personal, financial or security data: the UI warns before granting
    templates: ['treasurer'], // suggested roles that start with it
  },
  // ...
] as const);
```

| Field           | Meaning                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `key`           | `<area>.<action>`, lower case. Never rename or remove a shipped key.                                   |
| `label`         | Short name in `id` and `en`. Use the Indonesian church terms (Jemaat, Majelis, ...).                   |
| `description`   | One sentence in `id` and `en`, shown in the role editor.                                               |
| `sensitive`     | Grants access to personal, financial or security data.                                                 |
| `memberDefault` | Every active member holds it (viewing and own-data actions such as `prayer.submit`).                   |
| `adminExcluded` | Administrators do not get it automatically (used for `care.confidential`).                             |
| `ownerOnly`     | Only the owner holds it; it can never be in a custom role.                                             |
| `templates`     | Suggested roles (`pastor`, `elder`, `treasurer`, `secretary`, `ministry_coordinator`, `kids_teacher`). |

### How access is computed

- **Base roles.** `owner` holds every permission. `administrator` holds every permission except
  `ownerOnly` ones (`church.delete`, `church.transfer`, `security.manage`, `backup.export`) and
  `adminExcluded` ones (`care.confidential`). `member` holds the `memberDefault` ones.
- **Custom roles** (`church_roles`) are church-defined sets of permissions assigned to members
  (`membership_roles`). Six suggested roles are seeded into every church: Pendeta, Majelis /
  Penatua, Bendahara, Sekretaris, Koordinator Pelayanan, Guru Sekolah Minggu. They are ordinary
  editable roles. Existing churches get them on first use (`seedRoleTemplates`, idempotent).
- **Effective permissions** = base role ∪ assigned custom roles (`effectivePermissions`).
  Unknown and owner-only keys stored in a custom role are ignored.
- **Group leaders** are a scoped assignment (`access.leaderGroupIds`), not a permission. A leader
  manages their own groups, their events, attendance and announcements, and the basic profiles of
  the groups' members. Scoped rules check both: `has(access, 'events.manage') || isLeaderOf(...)`.
- **Own data.** A member always acts on their own records (their profile, giving, registry
  records, children, schedule) without a permission. Compare `access.personId` / `access.userId`.

The caller's access arrives on every church route as `access`:

```ts
type Access = {
  userId: string;
  role: 'owner' | 'administrator' | 'member';
  leaderGroupIds: string[];
  personId: string | null; // the caller's own person record in this church
  permissions: Permission[]; // effective permissions
  roleIds: string[]; // assigned custom role ids
};
```

### Checking permissions

Use `has(access, 'finance.view')` for single permissions and add a named rule to `can` only when a
rule combines permissions, scopes or ownership. Module rules belong in the module's own shared
file, next to its schemas, so the API and the interface share them:

```ts
// packages/shared/src/schemas/finance.ts
export const canApproveExpense = (access: AccessLike, expense: { requestedBy: string }) =>
  has(access, 'finance.approve') && expense.requestedBy !== access.userId;
```

Never decide with `access.role` or `isAdmin()`; they describe the base role only.

### Anti-escalation

`canGrant(access, permissions)` is true only when the caller holds every permission and none is
owner-only. The roles API enforces it for creating, editing (old ∪ new permissions), deleting,
assigning and unassigning roles, returns `403 ESCALATION_DENIED` otherwise, refuses to edit the
owner's roles, and returns `409 LOCKOUT_PREVENTED` when a change would remove the caller's own
`roles.manage`. Making someone an administrator, or inviting one, needs every administrator
permission (`canGrantBaseRole`). Nobody changes the base role of, suspends or removes a member
who holds permissions they lack (`MembershipTarget.permissions`), so an administrator cannot
remove a pastor who holds `care.confidential`; the owner can.

## Notification types

Declare every notification your module sends in
`packages/shared/src/notifications/catalog/<id>.ts`. Types appear on the preferences screen
automatically.

```ts
export const WORSHIP_NOTIFICATION_TYPES = defineNotificationTypes('worship', [
  {
    type: 'roster.assigned',
    label: { en: 'Serving assignments', id: 'Jadwal pelayanan' },
    description: {
      en: 'When you are scheduled to serve.',
      id: 'Saat Anda dijadwalkan melayani.',
    },
  },
] as const);
```

`defaultInApp: false` makes a type opt-in; `mandatory: true` ignores preferences (security
notices only).

## Database

### Schema folder

```text
apps/api/src/db/schema/
├── index.ts          re-exports every file below (already lists every module)
├── core.ts           users, sessions, churches, church_memberships, invitations, people, groups,
│                     events, attendance, announcements
├── access.ts         church_roles, membership_roles
├── audit.ts          audit_logs
├── notifications.ts  notifications, notification_preferences
└── <module>.ts       one file per module (admin-security, people, comms, insights, worship,
                      care, records, finance, facilities, checkin)
```

### Table rules

- Ids are `text('id').primaryKey()` filled with `newId()` (UUID v4).
- Every church-owned table has `church_id text not null references churches(id) on delete
cascade`, and every query filters by it. Child rows also carry `church_id`.
- Foreign keys to people, groups and other church rows cascade or `set null` deliberately; a
  reference never crosses churches. When a request names another row by id, load it with
  `church_id = :churchId` first and answer `404` when it is missing (no cross-church IDOR).
- Timestamps and dates are ISO strings in `text` columns (`created_at`, `updated_at` with
  `nowIso()`; dates as `YYYY-MM-DD`).
- Money is an `integer` of minor units in the church currency (`churches.currency`, default
  `IDR`; IDR has no minor unit, so one unit is one rupiah). Use `moneySchema` for input and
  `formatMoney(minor, church.currency)` for display. Never use floating point for stored money.
- Enumerations are `text('x', { enum: [...] })` backed by a constant array in the shared schema
  file. JSON columns use `text('x', { mode: 'json' }).$type<...>()` and are validated when read.
- Add indexes for every list filter (`(church_id, created_at)`, foreign keys you join on).
- Registry and finance entries are corrected or voided, never hard-deleted, and every change is
  audited.

### Module tables

Migration `0002_modules_data_model` created every module's tables up front, so modules could be
built in parallel; later migrations only add columns and indexes (`0003_finance` for offering and
expense editors, `0004_care` for task reminders, `0005_notifications_english_text` for the English
copy of notifications). Shared Zod schemas, enums, labels and pure rules for them are in
`packages/shared/src/schemas/<module>.ts`; module agents own and may extend both files.

| Module           | Tables                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin-security` | `user_two_factor`, `user_recovery_codes`, `two_factor_challenges`, `login_events` (cascade from `users`); `users.failed_login_count`, `last_failed_login_at`, `locked_until`, `password_changed_at`; `sessions.ip`                                                                                                     |
| `people`         | `areas`, `area_coordinators`, `households`, `household_members`, `person_areas`, `person_tags`, `person_tag_assignments`, `custom_field_definitions`, `custom_field_values`, `person_privacy_settings`, `group_join_requests`; `people.wedding_date`; group meeting, capacity, visibility and join columns on `groups` |
| `comms`          | `announcement_audience_roles`, `announcement_reads`, `event_registrations` (waitlist is a status), `calendar_feed_tokens`, `bulletins`; `event_series` and registration columns on `events`; audience, schedule, pin and cover columns on `announcements`                                                              |
| `insights`       | `dashboard_preferences`, `absence_alerts`; `attendance_sessions.mode` and `headcount_*`                                                                                                                                                                                                                                |
| `worship`        | `service_types`, `worship_services`, `songs`, `liturgy_items`, `serving_teams`, `serving_positions`, `serving_team_members`, `serving_member_positions`, `roster_assignments`, `volunteer_blockouts`                                                                                                                   |
| `care`           | `care_cases`, `care_case_caregivers`, `care_notes`, `care_visits`, `care_visit_visitors`, `prayer_requests`, `prayer_request_prayers`, `visitor_follow_ups`, `care_tasks`, `diakonia_aid`                                                                                                                              |
| `records`        | `registry_records`, `registry_record_people`                                                                                                                                                                                                                                                                           |
| `finance`        | `finance_funds`, `finance_accounts`, `finance_categories`, `finance_periods`, `finance_entries` (the ledger), `offering_batches`, `offering_batch_lines`, `finance_campaigns`, `finance_pledges`, `finance_contributions`, `expense_requests`, `finance_budgets`, `finance_transfers`                                  |
| `facilities`     | `facility_resources`, `facility_bookings`, `facility_booking_exceptions`, `inventory_assets`, `asset_loans`, `asset_maintenance`                                                                                                                                                                                       |
| `checkin`        | `checkin_classes`, `checkin_class_teachers`, `checkin_sessions`, `checkin_child_profiles`, `checkin_child_alerts`, `checkin_authorized_pickups`, `checkins`                                                                                                                                                            |

`apps/api/tests/data-model.test.ts` inserts a row into each table and checks that deleting the
church (or the user, for account-security tables) removes them; add new tables to its lists.
drizzle-kit drops `ON DELETE` from foreign keys added with `ALTER TABLE ... ADD`; check generated
`ADD` statements that reference another table and add the clause by hand before committing.

### Migrations

After changing schema files:

```sh
bun run db:generate --name <module>_<change>     # e.g. finance_funds_and_accounts
```

Generated SQL and snapshots are committed under `apps/api/drizzle/` and applied automatically on
start. Never edit a migration that has been committed on the main branch. Modules are built in
parallel, so migration numbers and the journal will clash when branches are integrated. When that
happens, keep the other branch's migrations, delete your own generated migration and snapshot,
and run `bun run db:generate` again on top: your schema files are unchanged, so the new migration
contains exactly your tables. Data backfills that SQL cannot express are written in code and must
be idempotent (see `seedRoleTemplates`). A column that copies a value from another table for speed (such as
`attendance_records.session_at`) is backfilled in `backfillCopiedColumns` (`db/client.ts`) for
the same reason: migrations may be regenerated, code is not.

## API modules

Every module folder already registers a status router,
`GET /api/churches/:churchId/<path>/status`, which answers the module's permissions the caller
holds, or `403 MODULE_DISABLED`. Paths: `security` (admin-security), `directory` (people), `calendar`
(comms), `insights`, `worship`, `care`, `records`, `finance`, `facilities`, `checkin`. Keep it and
add routers next to it in the module's `index.ts`.

### Skeleton

```ts
// apps/api/src/modules/finance/funds.ts
import { churchIdParamsSchema, churchParamsSchema, fundInputSchema } from '@tatagereja/shared';
import { and, asc, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { FundRow } from '../../db/schema';
import { funds } from '../../db/schema';
import type { Deps } from '../../deps';
import { notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';

export const fundsRouter = (deps: Deps) => {
  const { db } = deps;

  const loadFund = (churchId: string, id: string): FundRow => {
    const fund = db
      .select()
      .from(funds)
      .where(and(eq(funds.id, id), eq(funds.churchId, churchId)))
      .get();
    if (!fund) throw notFound('Fund');
    return fund;
  };

  return new Elysia({ prefix: '/churches/:churchId/finance/funds' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church }) => ({
        items: db
          .select()
          .from(funds)
          .where(eq(funds.churchId, church.id))
          .orderBy(asc(funds.name))
          .all(),
      }),
      { church: { module: 'finance', permission: 'finance.view' }, params: churchParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, audit, params, body }) => {
        const fund = loadFund(church.id, params.id);
        const updated = db.transaction((tx) => {
          const row = tx
            .update(funds)
            .set({ ...body, updatedAt: nowIso() })
            .where(eq(funds.id, fund.id))
            .returning()
            .get();
          if (!row) throw notFound('Fund');
          recordAudit(tx, audit, {
            module: 'finance',
            action: 'fund.update',
            entityType: 'fund',
            entityId: fund.id,
            summary: `Updated the fund ${row.name}`,
            ...changes(fund, row),
          });
          return row;
        });
        return { fund: updated };
      },
      {
        church: { module: 'finance', permission: 'finance.manage' },
        params: churchIdParamsSchema,
        body: fundInputSchema,
      },
    );
};

// apps/api/src/modules/finance/index.ts
export const financeModule = (deps: Deps) => new Elysia().use(fundsRouter(deps));
```

### The `church` macro

`authPlugin(deps)` provides two macros. `auth: true` resolves `auth` (`{ user, sessionId }`) and
an account-level `audit` context. `church: <guard>` resolves `auth`, `church`, `membership`,
`access` and a church-scoped `audit` context from `:churchId`, rejecting non-members (`403`),
unknown churches (`404`), suspended members (`403 MEMBERSHIP_SUSPENDED`), switched-off modules
(`403 MODULE_DISABLED`) and missing permissions (`403 FORBIDDEN`):

| Guard                                                                            | Requires                                  |
| -------------------------------------------------------------------------------- | ----------------------------------------- |
| `church: true`                                                                   | an active member                          |
| `church: 'finance'`                                                              | the module enabled                        |
| `church: { permission: 'people.view' }`                                          | the permission                            |
| `church: { module: 'care', permission: ['care.view', 'care.manage'] }`           | the module and any one of the permissions |
| `church: { permission: 'audit.view', message: 'You cannot view the audit log' }` | custom 403 message                        |

The guard runs before the body, query and parameters are validated, so a caller who may not use
a route gets `403`, not a `422` that reveals its schema. Guards cover route-level requirements. Rules that depend on the row (leader scope, own data,
confidentiality, segregation of duties) are checked in the handler after loading the row, with
`forbidden(...)` or a specific `HttpError`. Optional modules must declare their module on every
route. `requirePermission(access, permission)` and `requireAnyPermission` in
`services/access.ts` throw the same `403` from inside a handler.

### Errors

Throw the helpers in `lib/errors.ts` (`badRequest`, `forbidden`, `notFound`, `conflict`,
`rateLimited`, `validationError`) or `new HttpError(status, code, message)` with a code from
`ERROR_CODES` in `packages/shared/src/constants.ts`. Codes reserved for modules:
`PERIOD_CLOSED` (finance, 409), `SCHEDULING_CONFLICT` (facilities, worship, 409),
`SELF_APPROVAL` (finance, 403), `TWO_FACTOR_REQUIRED`, `TWO_FACTOR_SETUP_REQUIRED`,
`TWO_FACTOR_INVALID`, `ACCOUNT_LOCKED` (admin-security). Messages are plain English sentences;
the interface translates by code where needed.

### Audit log

Record every sensitive write in the same transaction as the change:

```ts
db.transaction((tx) => {
  tx.update(careCases).set(patch).where(eq(careCases.id, row.id)).run();
  recordAudit(tx, audit, {
    module: 'care',
    action: 'care_case.update', // <entity>.<verb>
    entityType: 'care_case',
    entityId: row.id,
    summary: `Updated a care case for ${fullName(person)}`, // no confidential text
    ...changes(pick(row), pick(next)), // only the fields that changed
  });
});
```

- `changes(before, after)` keeps only changed fields; spread it into the entry.
- `redact(value, ['nationalId', 'notes'])` replaces sensitive values with `[redacted]`.
  Passwords, tokens, secrets, TOTP secrets, recovery codes and security codes are always redacted.
- Confidential content (care notes, counselling text) never goes into `summary`, `before` or
  `after`; record which fields changed and redact their values.
- Snapshots larger than 20 000 characters are replaced by `{ truncated: true }`.
- `GET /api/churches/:churchId/audit-logs` (`audit.view`) filters by `actorUserId`, `module`,
  `action`, `entityType`, `entityId`, `from`, `to`, `q`, paginated with `page`/`limit`.

### Notifications

```ts
notify(tx, {
  churchId: church.id,
  audience: { kind: 'group', groupId }, // or { kind: 'church' }, { kind: 'permission', permission },
  //                                        { kind: 'role', roleId }; or userIds: [...]
  excludeUserIds: [access.userId],
  type: 'roster.assigned',
  title: 'You are serving on Sunday', // short, no confidential text
  body: 'Pemusik · Ibadah Umum 1',
  link: `/c/${church.id}/worship/services/${serviceId}`, // in-app path only
  entityType: 'service',
  entityId: serviceId,
});
```

Only active members of the church receive church notifications; preferences are respected unless
the type is `mandatory`; external links are dropped. The comms module owns the inbox API
(`/api/notifications`: list, unread count, mark one or all read, preferences).

### Module settings

Per-module church settings live in `churches.settings[<moduleId>]`. Define a Zod schema with
defaults in your shared schema file, read with `moduleSettings(church, 'records', schema)` and
save with `saveModuleSettings(tx, church.id, 'records', value)` (both in `services/modules.ts`).
Expose them through your own routes, guarded by `settings.manage` or your module's manage
permission.

### Rate limiting

```ts
enforceRateLimit(deps.limiters, 'checkin.checkout', `${church.id}:${ip}`, {
  windowMs: 15 * 60_000,
  max: 10,
});
```

Limiters are created on first use and shared by the process. Tests that exercise a limit can
register a strict limiter under the same name in `createTestApp(..., { limiters })`.

### Performance

Modules are measured against a large church (`scripts/seed-large.ts`, `scripts/bench-api.ts`);
[PERFORMANCE.md](./PERFORMANCE.md) has the numbers and the rules. In short:

- Count, sum and group in SQL, over an index that covers the query (`EXPLAIN QUERY PLAN`).
- Hydrate a page with one query per related table (`inArray`); never query inside a loop over rows.
- Every list has a maximum (`LIMITS.pageSizeMax`, `LIMITS.listMax`); tables that grow without
  bound page with a cursor (`lib/cursor.ts`: `decodeCursor`, `afterCursor`, `keysetPage`).
- Expensive read-only results (reports, overviews) go through
  `cachedReport(deps, { churchId, userId, limiter }, key, compute)` from
  `services/report-cache.ts`. The key names every input, including the caller's scope. Writes
  need nothing: every mutating request under `/api/churches/:churchId` drops the church's entries.
- Create date formatters with `dateTimeFormat()` from the shared package, not `new Intl.DateTimeFormat`.

### Security checklist

- Validate every body, query and param with a shared Zod schema; bound every string and array
  with `LIMITS` (add new limits to your schema file if needed).
- Scope every query by `church_id`; load referenced rows inside the church before using them.
- Check permissions on every write and on every read of sensitive data, in the API.
- Strip fields the caller may not see before serializing (private contact fields, confidential
  notes). Never return password hashes, token hashes or secrets. Any list of people that carries
  a phone, email, address or birthday goes through `withPrivacy(db, access, rows)`; a search or
  filter on one of them is wrapped in `onVisibleContact(access, column, condition)` (both in
  `services/people.ts`), so a hidden value never finds its owner.
- Leader scope is per group: a leader reads a person's attendance only through
  `personAttendanceScope` (`attendanceScopeCondition` in SQL), never through the person.
- Compare secrets with `safeEqual`; generate codes with `generateCode` (CSPRNG, unambiguous
  alphabet) and tokens with `generateToken`. Store bearer-style tokens only as `hashToken(...)`
  and show links that carry one only in the answer that made them.
- Declare confidential free text (medical, pastoral, custody, identity numbers) with
  `encryptedText(table, column)` from `db/encrypted.ts`; never filter or sort on such a column.
  See [SECURITY.md](./SECURITY.md).
- Audit sensitive writes; rate-limit guessable inputs (codes, tokens, logins).
- Request bodies are limited by kind of route (`lib/abuse.ts`: 32 KB for auth, 1 MB for long
  documents, 256 KB otherwise, imports up to `MAX_BODY_KB`) and refused with
  `413 PAYLOAD_TOO_LARGE` (`411 LENGTH_REQUIRED` for a chunked body outside imports). Every account has generous limits on writes, exports and searches
  (`account.*` limiters); route-specific limits come on top.
- Give audit entries `params` with the names the summary uses (`name`, `member`, `person`,
  counts) so the viewer can describe them in Indonesian; entries of the finance and care modules
  are redacted for viewers without that access (`auditRedactionFor`).
- `bun test tests/security-matrix.test.ts` must stay green: it calls your routes as every
  kind of caller and searches the answers for planted canaries.
- Security headers (CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS behind HTTPS)
  are set for every response in `app.ts`; do not override them.

## Interface

The web app (`apps/web`) is built from the same module boundaries. A module only creates files
in its own feature folder and edits its own `module.tsx` and `i18n.ts`; the router, sidebar,
bottom tabs, menu page, home quick actions and command palette are generated from the registry.

### Files each module owns (web)

| File                                    | What it holds                                                   |
| --------------------------------------- | --------------------------------------------------------------- |
| `apps/web/src/features/<id>/module.tsx` | The module manifest: routes, menu entries, quick actions, slots |
| `apps/web/src/features/<id>/i18n.ts`    | The module dictionary (Indonesian and English)                  |
| `apps/web/src/features/<id>/*`          | Screens, `api.ts` (queries and mutations), module components    |

Existing screens live in older folders owned by a module: `people` and `groups` (people),
`events` and `announcements` (comms), `dashboard` and `attendance` (insights), `churches`,
`profile`, `auth` and `invitations` (core and admin-security). Every folder already has an
`i18n.ts`, and `features/dictionaries.ts` and `features/registry.ts` already list every module, so
nobody edits a shared index.

### Module manifest

```tsx
// apps/web/src/features/finance/module.tsx
import { has } from '@tatagereja/shared';
import { HandCoins, Wallet } from 'lucide-react';
import { defineModule, lazyPage, type AccessRule } from '@/lib/modules';

const view: AccessRule = { anyOf: ['finance.view', 'finance.record', 'finance.manage'] };

export const financeModule = defineModule({
  id: 'finance',
  icon: Wallet,
  accent: 'emerald', // the module tone: icons, tiles and page headers
  labelKey: 'finance.nav',
  descriptionKey: 'finance.description',
  section: 'admin', // 'main' | 'ministry' | 'admin'
  routes: [
    // Paths are relative to /c/:churchId. `handle.access` guards the route.
    {
      path: 'finance',
      lazy: lazyPage(() => import('./finance-home-page'), 'FinanceHomePage'),
      handle: { access: view },
    },
    {
      path: 'finance/offerings/new',
      lazy: lazyPage(() => import('./new-offering-page'), 'NewOfferingPage'),
      handle: { access: { anyOf: ['finance.record'] } },
    },
  ],
  nav: [
    {
      id: 'finance',
      to: 'finance',
      labelKey: 'finance.nav',
      icon: Wallet,
      order: 10, // position inside the section
      access: view,
      keywords: ['persembahan', 'kolekte'], // command palette matches
      // optional count: ({ churchId }) => ({ queryKey, queryFn: () => Promise<number> })
      badge: ({ churchId }) => pendingExpensesBadge(churchId),
    },
  ],
  quickActions: [
    {
      id: 'new-offering',
      to: 'finance/offerings/new',
      labelKey: 'finance.newOffering',
      icon: HandCoins,
      order: 50,
      access: { check: ({ access }) => has(access, 'finance.record') },
    },
  ],
  commands: [], // extra command palette entries; every menu entry is already one
  topBar: [], // small components for the top bar (comms renders the notifications bell)
});
```

- Inside a church, `useChurch()` returns `{ church, membership, access, churchId, base }`. Show
  or hide actions with `can.*` and `has(access, ...)`, and modules with
  `isModuleEnabled(church.enabledModules, id)`. `church.currency` and `church.timezone` drive
  `useI18n()` formatting automatically.
- `AccessRule` is `{ anyOf?, allOf?, check? }`; `check` receives `{ church, access, churchId,
base, isEnabled }` and should use the shared `can.*` rules. Every condition must hold.
- Menu entries, tabs, tiles, quick actions and commands of a switched-off module, or whose rule
  fails, are **hidden**. A direct link to a guarded route renders a friendly "no access" state,
  and a route of a switched-off module a "module switched off" state (`ModuleRouteGuard`), so a
  page component can assume its route rule holds. The API still checks every request.
- A route without `handle.access` is open to every active member (for example a person page:
  members open their own profile; the API decides what else they see).
- Phone bottom tabs are Home, People, Events (entries with `mobileTab`), the Ministry hub
  (`/ministry`: every `ministry` entry) and the Menu (`/more`: tiles of every section).
- A new module's landing page can start as `ModuleComingSoon` (icon, accent, highlights and the
  caller's permissions in the module); replace it with the real screens.
- `/c/:churchId/ui` is a gallery of every shared component with sample data. It is routed in
  development (`bun run dev:web`) and in builds made with `VITE_UI_GALLERY=1`.

### i18n

`apps/web/src/lib/i18n` is a small typed layer: no runtime dependency, Indonesian (`id`) as the
primary language and English (`en`). Without a saved choice the app uses English only when the
browser prefers it, Indonesian otherwise. People switch in the account menu, the Menu page and
the Account page.

```ts
// apps/web/src/features/finance/i18n.ts
import { defineDictionary } from '@/lib/i18n/define';

export const financeDictionary = defineDictionary('finance', {
  en: {
    nav: 'Finance',
    entries: { one: '{count} entry', other: '{count} entries' }, // plural by `count`
    savedFund: 'Fund {name} saved',
  },
  id: { nav: 'Keuangan', entries: '{count} transaksi', savedFund: 'Kas {name} disimpan' },
});
```

```tsx
const {
  t,
  formatDate,
  formatDateTime,
  formatDateRange,
  formatRelative,
  formatNumber,
  formatCurrency,
} = useI18n();
t('finance.entries', { count: 3 }); // typed: unknown keys do not compile
formatCurrency(150000); // "Rp 150.000" in the church currency (integer minor units)
formatDate(service.date, 'dateLong'); // church time zone; `YYYY-MM-DD` days never shift
```

- English defines the keys; the compiler reports an Indonesian key that is missing. Keys are
  `<namespace>.<key>`; the namespace is the feature or module id.
- Use the Indonesian church terms: Jemaat, Majelis, Penatua, Diaken, Komisi, Wilayah/Sektor,
  Baptis, Sidi, Atestasi, Pemberkatan Nikah, Penyerahan Anak, Persembahan, Perpuluhan,
  Perkunjungan, Warta Jemaat, Jadwal Pelayanan, Liturgi.
- Labels from the shared package (`PERMISSION_GROUPS`, `MODULES`, `*_TEXT` and `*_LABELS` maps of
  `LocalizedText`) are rendered with `localize(text, locale)`.
- Outside components use `t()` from `@/lib/i18n`. `getErrorMessage(error)` translates generic
  errors (network, rate limit, module off, suspended); specific server messages are shown as sent.
- Form validation messages follow the language (zod's locale is switched with the interface).
- Every screen, including the older folders, reads its strings from a dictionary; a new screen
  never ships hard-coded text.

### Components

Shared components live in `apps/web/src/components/ui` (primitives) and
`apps/web/src/components/layout` (shell). Use them instead of building new ones:

| Need                | Component                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page frame          | `Page` (`size`: narrow, default, wide, full), `PageHeader` (title, description, eyebrow, `breadcrumbs`, `backTo`, `actions`, `icon` + `tone`; sets `document.title`), `Section`                         |
| Numbers             | `StatCard` (icon, tone, trend, link, loading), `Sparkline`, `LineChart`, `BarChart`, `DonutChart`                                                                                                       |
| Lists               | `DataList` (row anatomy and row actions), `ResponsiveTable` (table from `md`, cards below; sortable headers), `ListGroup`/`ListRow`, `RowActions`, `Pagination`, `InfiniteListFooter`                   |
| Finding             | `FilterBar` (debounced search, filter chips, sort) with `useUrlState`, `SearchInput`, `Combobox` (single or multiple, local or server search), command palette                                          |
| States              | `SkeletonList`, `SkeletonStats`, `SkeletonCards`, `SkeletonTable`, `SkeletonText`, `EmptyState` (illustration, tone, action), `ErrorState` (retry), `NoAccessState`, `Alert`                            |
| Dialogs             | `Dialog`, `Sheet` (bottom sheet on phones, side panel on desktop), `ConfirmDialog` (`confirmText` makes people type the name), `Popover`, `DropdownMenu`, `Tooltip`                                     |
| Forms               | `Field`, `Input`, `PasswordInput`, `Textarea`, `Select`, `Switch`, `Checkbox`, `Segmented`, `DateTimeInput`, `DateRangePicker` (presets first), `CurrencyInput` (integer minor units, grouped as typed) |
| Flow and structure  | `UrlTabs` (tab in the URL), `Tabs` (`variant`: pill, underline), `Stepper`, `Timeline`, `KanbanBoard`/`KanbanColumn`/`KanbanCard`, `MonthGrid` (calendar)                                               |
| Identity and status | `EntityAvatar`, `AvatarGroup`, `StatusBadge` (tones, dot), `ToneIcon`, `Badge`                                                                                                                          |
| Sharing             | `CopyButton`, `QrDisplay` (PNG download), `PrintButton`, `PrintHeader`, `PrintSheet`                                                                                                                    |

Hooks: `useUrlState` (list state in the search params; changing a filter resets the page),
`useMutationToast` (one submit at a time, success toast, `422` issues mapped to fields, API
message otherwise), `optimistic()` (optimistic cache update with rollback),
`useUnsavedChangesGuard`, `useDocumentTitle`, `useDebounced`, `useModuleMenu` and
`useModuleContext` (the registry for the current church), `useI18n`.

Design tokens are in `apps/web/src/index.css`: warm paper surfaces (`background`, `card`,
`popover`, `sunken`, `sidebar`), one terracotta `primary`, status colours, radii, shadows
(`shadow-xs`, `shadow-soft`, `shadow-raised`, `shadow-overlay`), motion (`animate-page-in`,
`animate-rise-in`, `pressable`) and the categorical chart hues `--chart-1..8`. Tones colour a
module or a status: set `data-tone="emerald"` on an element and use `bg-tone-soft`,
`text-tone-ink`, `bg-tone` and `border-tone` inside it (`brand`, `slate`, `sky`, `amber`, `teal`,
`violet`, `rose`, `indigo`, `emerald`, `olive`, `sun`, `neutral`, `success`, `warning`, `danger`,
`info`). Every tone has the same contrast in light and dark. Animations stop under
`prefers-reduced-motion`; the app chrome carries `data-print="hide"` so pages print cleanly.

### Quality bar

Every screen a module ships meets this bar:

- **Layout.** Mobile first (no horizontal scroll at 360 px), then tablet and desktop. Touch
  targets at least 44 px; safe areas respected. Use `Page size="wide"` for tables and dashboards.
- **Data views.** A skeleton while loading, an `EmptyState` with an action only the caller may
  take, an `ErrorState` with retry. Lists have search, filters and sort in the URL
  (`useUrlState`), and pagination or infinite loading.
- **Mutations.** The button shows its pending state and cannot submit twice; success and error
  toasts; `422` issues on the fields; every affected query invalidated (lists, details, counts,
  the dashboard `keys.dashboard`, notifications); optimistic updates for toggles, RSVP and marking,
  with rollback.
- **Destructive actions.** A `ConfirmDialog` that says what will be lost; irreversible ones use
  `confirmText`.
- **Forms.** React Hook Form with the shared zod schema, sensible defaults, the first field
  focused, Enter submits, `useUnsavedChangesGuard` on long forms, labels and `aria-invalid`.
- **Navigation.** Breadcrumbs or a back link on detail pages, a page title, deep links that work
  on reload; scroll restoration and page transitions come from the shell.
- **Permissions.** Hide what the caller cannot do (do not just disable it); guard routes with
  `handle.access`; decide with `can.*` and `has()`, never with the base role.
- **Language.** Every visible string in both dictionaries; dates, numbers and money through
  `useI18n()`.

Check screens visually with the screenshot script, which signs in, can seed a demo church, and
captures each route at 390×844 and 1440×900 in light and dark:

```sh
bun run build
WEB_DIST_DIR=$PWD/apps/web/dist PORT=3901 DATABASE_PATH=/tmp/shots.db bun run --cwd apps/api start &
bun scripts/screenshots.ts --port 3901 --seed --anonymous --out /tmp/shots \
  --routes "/c/:church,/c/:church/finance" --locales id,en
```

## Testing

Integration tests run the real app against an in-memory database:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp, seedChurch } from './helpers';

describe('finance funds', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let base: string;

  beforeAll(async () => {
    s = await seedChurch(t); // owner, admin, leader (of s.group), member (linked to s.memberPerson)
    base = `/api/churches/${s.church.id}/finance`;
  });

  it('lets treasurers manage funds and hides them from members', async () => {
    const created = await t.request('POST', `${base}/funds`, {
      token: s.admin.token,
      body: { name: 'Kas Pembangunan' },
    });
    expect(created.status).toBe(201);
    expect((await t.request('GET', `${base}/funds`, { token: s.member.token })).status).toBe(403);
  });
});
```

Cover, for every module:

1. The permission matrix: owner, administrator, leader, member, and a member holding a custom
   role with exactly the module's permission (create one with `POST /api/churches/:id/roles`
   and assign it with `POST /api/churches/:id/members/:membershipId/roles`; membership ids come
   from `GET /api/churches/:id/members`).
2. Cross-church access: ids from another church answer `404`.
3. `403 MODULE_DISABLED` after `PATCH /api/churches/:id/modules { modules: { <id>: false } }`
   (optional modules).
4. Validation (`422`) and conflicts (`409`) for the module's own rules.
5. Audit entries for sensitive writes (`GET /api/churches/:id/audit-logs?module=<id>`), with
   redacted values where applicable.
6. Notifications created for the right people (`GET /api/notifications` as the recipient).

Shared permission rules get unit tests in `packages/shared/tests/`. Before committing, run
`bun run format:write` and `bun run check`.
