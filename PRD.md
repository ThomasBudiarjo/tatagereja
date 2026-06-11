# TataGereja App — Product Requirements Document (PRD)

**Version:** 1.0
**Status:** Draft for MVP Build
**Last Updated:** 2026-06-11

---

## 1. Executive Summary

**TataGereja App** is a free, simple church management application designed for small-to-medium churches. The product positioning is intentionally framed as:

> "A church Google Sheet — but cleaner, safer, and easier to use."

The MVP targets core administrative workflows: member records, family relationships, service scheduling, volunteer/service role assignments, attendance tracking, and simple reporting. The application also serves as a personal stack pilot, validating a Go + SQLite + Litestream + embedded SPA architecture deployable on Heroku Eco dynos.

### 1.1 Primary Goals

- Deliver a usable CRUD-first church management dashboard quickly.
- Validate a single-binary, single-deploy architecture pattern.
- Maximize use of available Heroku Eco dynos with minimal infrastructure overhead.
- Build a foundation that can migrate to a VPS or PostgreSQL later without rewriting domain logic.

### 1.2 Non-Goals (Explicitly Out of Scope for MVP)

- Full church accounting / bookkeeping
- Payroll processing
- Complex inventory management
- WhatsApp automation or messaging integrations
- Native mobile applications
- Complex multi-branch hierarchies
- Granular, fine-grained permission systems
- Role-based access beyond owner/admin (initial release)

---

## 2. Product Philosophy

The project must adhere to these guiding principles:

| Principle | Implication |
|---|---|
| Free | No paid tiers, no licensing complexity. |
| Simple | Prefer straightforward CRUD over elaborate workflows. |
| Single repo | Monolithic repository for backend, frontend, migrations, and config. |
| Single deploy | One build artifact, one Heroku process. |
| Minimal infrastructure | No managed databases, no Redis, no message queues. |
| No PostgreSQL (yet) | SQLite is sufficient for MVP load. |
| Unified FE/BE hosting | Frontend is embedded into the Go binary via `go:embed`. |
| Heroku Eco compatible | Must run within Eco dyno constraints. |
| Portable | Easy migration path to a VPS when needed. |

---

## 3. Technology Stack

### 3.1 Backend

| Component | Choice | Rationale |
|---|---|---|
| Language | Go | Single binary, simple deployment, fast cold start, ideal for CRUD. |
| HTTP Router | `chi` (preferred) or `echo` | Lightweight, idiomatic, middleware-friendly. |
| Database | SQLite | No external DB server, fits low-traffic profile, suitable for Eco dynos. |
| SQLite Driver | `modernc.org/sqlite` | Pure Go, no CGO, simpler Heroku buildpack, compatible with Litestream Go library. |
| Backup | Litestream (as Go library) | Embedded into the app, no separate CLI binary required. |
| Deployment | Heroku Eco | Low cost, sufficient for MVP, existing capacity available. |

### 3.2 Frontend

| Component | Choice | Rationale |
|---|---|---|
| Framework | SolidJS | Lightweight, fine-grained reactivity, excellent for dashboard CRUD. |
| Build Tool | Vite | Fast dev experience, simple static build output. |
| Router | `@solidjs/router` | Official, well-maintained, no need for third-party alternatives. |
| Styling | Tailwind CSS or UnoCSS (optional) | Utility-first, fast iteration. |
| Build Output | Static files | Embedded into Go binary via `go:embed`. |

### 3.3 Frontend Stack Decision Rationale

- **SolidJS over Svelte (raw):** Svelte core lacks an official router; Solid provides an official, well-integrated routing solution.
- **SolidJS over SvelteKit:** SvelteKit is more framework-heavy and assumes a Node server runtime. Since the backend is Go, the SSR/serverless runtime is unnecessary overhead.
- **SolidJS over PocketBase:** PocketBase is appealing but the team wants full control over the Go backend to validate the architecture.

### 3.4 Deployment Architecture

```
User
  ↓
Cloudflare (DNS, HTTPS proxy, static asset cache, basic protection)
  ↓
Heroku Eco Dyno
  ↓
Go App (single binary)
  ├── /api/*        → Go HTTP handlers
  ├── /assets/*     → Embedded SolidJS static assets
  ├── /*            → SPA fallback (index.html)
  ├── SQLite DB     → Stored at /tmp on dyno filesystem
  └── Litestream    → Background goroutine replicating to object storage
```

**Object storage options:** Cloudflare R2 (preferred) or any S3-compatible bucket.

---

## 4. Heroku-Specific Behavior

### 4.1 Ephemeral Filesystem

The Heroku dyno filesystem is ephemeral. The SQLite file can be lost on dyno restart, stop, or redeploy. The application must therefore implement a strict restore-on-startup flow.

### 4.2 Dyno Sleep

Eco dynos may sleep after periods of inactivity. A 10-minute replication interval is acceptable, but the application must not rely solely on it.

### 4.3 Mandatory Startup Sequence

```
1. App starts
2. Restore SQLite from Litestream/object storage
3. If no backup exists, create a fresh database
4. Run pending migrations
5. Start HTTP server
6. Start Litestream replication worker (goroutine)
```

---

## 5. Backup and Replication Strategy

### 5.1 Strategy Overview

| Mechanism | Trigger | Purpose |
|---|---|---|
| Restore on startup | App boot | Recover state across dyno restarts. |
| Periodic sync | Every 10 minutes | Baseline safety net. |
| Debounced sync | 5–10 seconds after any write | Capture important data quickly. |
| Force sync | SIGTERM signal | Flush pending changes before shutdown. |

### 5.2 Write Flow

```
User adds a member
  → Write to SQLite
  → Mark database as dirty
  → Schedule a sync in 5–10 seconds
  → Coalesce bursts of writes into a single sync
```

### 5.3 Trade-offs

- **Risk:** A hard crash within the 5–10 second debounce window may lose the most recent write.
- **Acceptance:** This is acceptable for a free MVP. If the application becomes mission-critical, migrate to PostgreSQL.

### 5.4 Implementation Notes

- The debounced sync uses an in-process timer that resets on each new write.
- The SIGTERM handler must cancel any pending timer and trigger an immediate final sync.
- Litestream runs as a background goroutine; the main HTTP server remains the primary process.

---

## 6. Frontend Serving Strategy

### 6.1 Route Handling (Go HTTP Server)

| Path Pattern | Handler |
|---|---|
| `/api/*` | Go API handlers |
| `/assets/*` | Static asset handler (Vite build output) |
| `/*` | SPA fallback → `index.html` |

### 6.2 Cache-Control Headers

| Path | Header |
|---|---|
| `/assets/*` | `Cache-Control: public, max-age=31536000, immutable` |
| `/index.html` | `Cache-Control: no-cache` |
| `/api/*` | `Cache-Control: no-store` |

This allows Cloudflare to aggressively cache hashed JS/CSS assets while ensuring API responses and the HTML shell are always validated.

---

## 7. Build Flow

### 7.1 Heroku Buildpack Order

1. **Node buildpack**
   - Install frontend dependencies
   - Build the SolidJS frontend (`vite build`)
2. **Go buildpack**
   - Compile the Go binary
   - Embed `web/dist/` into the binary via `go:embed`

### 7.2 Output

A single Go binary that contains:
- HTTP server
- API handlers
- SQLite/Litestream logic
- The compiled SolidJS frontend

### 7.3 Procfile

```
web: ./tatagereja
```

No external Litestream CLI process is required because Litestream is linked as a Go library.

---

## 8. Repository Structure

### 8.1 Recommended Layout

```
tatagereja/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── app/
│   ├── auth/
│   ├── church/
│   ├── member/
│   ├── family/
│   ├── service/
│   ├── attendance/
│   ├── report/
│   ├── db/
│   ├── backup/
│   └── web/
├── migrations/
│   └── 001_init.sql
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       ├── pages/
│       ├── components/
│       └── layouts/
│       └── dist/                 (generated, embedded)
├── go.mod
├── go.sum
├── package.json
├── Procfile
└── PRD.md
```

### 8.2 Simplified Layout (Alternative)

For early-stage simplicity, the Go code may live at the repository root with the frontend in a `/web` subdirectory. The detailed `internal/` package structure should be introduced once the code base grows beyond a few files.

---

## 9. MVP Modules

### 9.1 Module List (V0/V1)

1. Dashboard
2. Members (Jemaat)
3. Families (Keluarga)
4. Services (Ibadah)
5. Service Roles (Pelayanan)
6. Attendance (Kehadiran)
7. Reports (Laporan)
8. Church Settings (Pengaturan Gereja)

### 9.2 Module: Members (Jemaat)

**Fields:**
- Full name
- Phone number
- Email
- Address
- Date of birth
- Gender
- Member status
- Notes

**Status values:**
- `active`
- `inactive`
- `moved`
- `deceased`
- `guest`

### 9.3 Module: Families (Keluarga)

**Capabilities:**
- Create a family
- Designate a head of family
- Add family members
- Define relationships between members

**Relationship values:**
- `father`
- `mother`
- `child`
- `spouse`
- `sibling`
- `other`

### 9.4 Module: Services (Ibadah)

**Fields:**
- Service name
- Service type
- Date
- Start time
- End time
- Location
- Notes

**Service type values:**
- `Sunday`
- `Youth`
- `Prayer`
- `Cell Group`
- `Christmas`
- `Easter`
- `Other`

### 9.5 Module: Service Roles (Pelayanan)

For each service, assign members to predefined roles:

- Preacher
- Worship Leader
- Singer
- Musician
- Multimedia
- Usher
- Collector
- Prayer
- Other

### 9.6 Module: Attendance (Kehadiran)

**Capabilities (initial scope):**
- Select a service
- Checklist of attending members
- Manually add guests
- Save attendance record

### 9.7 Module: Reports (Laporan)

**Initial reports:**
- Total active members
- Total families
- Attendance per service
- This week's service schedule
- Members with birthdays this month

**Export:**
- CSV (initial)
- Excel (deferred)

---

## 10. Data Model

### 10.1 Schema

```sql
CREATE TABLE churches (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  address      TEXT,
  created_at   DATETIME NOT NULL,
  updated_at   DATETIME NOT NULL
);

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  church_id       TEXT NOT NULL REFERENCES churches(id),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL,
  created_at      DATETIME NOT NULL,
  updated_at      DATETIME NOT NULL
);

CREATE TABLE members (
  id           TEXT PRIMARY KEY,
  church_id    TEXT NOT NULL REFERENCES churches(id),
  full_name    TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  birth_date   DATE,
  gender       TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  notes        TEXT,
  created_at   DATETIME NOT NULL,
  updated_at   DATETIME NOT NULL
);

CREATE TABLE families (
  id              TEXT PRIMARY KEY,
  church_id       TEXT NOT NULL REFERENCES churches(id),
  family_name     TEXT NOT NULL,
  head_member_id  TEXT REFERENCES members(id),
  created_at      DATETIME NOT NULL,
  updated_at      DATETIME NOT NULL
);

CREATE TABLE family_members (
  id          TEXT PRIMARY KEY,
  family_id   TEXT NOT NULL REFERENCES families(id),
  member_id   TEXT NOT NULL REFERENCES members(id),
  relation    TEXT NOT NULL,
  created_at  DATETIME NOT NULL
);

CREATE TABLE services (
  id            TEXT PRIMARY KEY,
  church_id     TEXT NOT NULL REFERENCES churches(id),
  title         TEXT NOT NULL,
  service_type  TEXT NOT NULL,
  start_time    DATETIME NOT NULL,
  end_time      DATETIME,
  location      TEXT,
  notes         TEXT,
  created_at    DATETIME NOT NULL,
  updated_at    DATETIME NOT NULL
);

CREATE TABLE service_roles (
  id          TEXT PRIMARY KEY,
  service_id  TEXT NOT NULL REFERENCES services(id),
  role_name   TEXT NOT NULL,
  member_id   TEXT NOT NULL REFERENCES members(id),
  notes       TEXT,
  created_at  DATETIME NOT NULL,
  updated_at  DATETIME NOT NULL
);

CREATE TABLE attendance (
  id          TEXT PRIMARY KEY,
  service_id  TEXT NOT NULL REFERENCES services(id),
  member_id   TEXT REFERENCES members(id),
  is_guest    BOOLEAN NOT NULL DEFAULT 0,
  guest_name  TEXT,
  created_at  DATETIME NOT NULL
);
```

### 10.2 Multi-Tenancy Rules

Because the application is free and intended for many churches, every primary table includes `church_id`.

**Critical rule:** Every query MUST filter by `church_id`. Cross-tenant data leakage is unacceptable.

Affected tables:
- `users.church_id`
- `members.church_id`
- `families.church_id`
- `services.church_id`

It is recommended to introduce a `ChurchScoped` query helper or repository base to enforce this rule consistently.

---

## 11. Authentication

### 11.1 Initial Approach

- Email + password
- Session cookie (HTTP-only, secure, same-site)
- Simple role model

### 11.2 Roles

| Role | Description |
|---|---|
| `owner` | Full control of the church account. |
| `admin` | Manage most resources. |
| `staff` | Day-to-day operational access. |
| `viewer` | Read-only access. |

### 11.3 MVP Simplification

For the earliest release, only `owner` and `admin` roles are required. Additional roles can be added incrementally.

---

## 12. API Design (Initial)

### 12.1 Authentication

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me
```

### 12.2 Members

```
GET    /api/members
POST   /api/members
GET    /api/members/:id
PATCH  /api/members/:id
DELETE /api/members/:id
```

### 12.3 Families

```
GET    /api/families
POST   /api/families
GET    /api/families/:id
PATCH  /api/families/:id
DELETE /api/families/:id
```

### 12.4 Services

```
GET    /api/services
POST   /api/services
GET    /api/services/:id
PATCH  /api/services/:id
DELETE /api/services/:id
```

### 12.5 Service Roles

```
GET    /api/services/:id/roles
POST   /api/services/:id/roles
```

### 12.6 Attendance

```
GET    /api/services/:id/attendance
POST   /api/services/:id/attendance
```

### 12.7 Reports

```
GET    /api/reports/dashboard
```

---

## 13. Frontend Routes

### 13.1 Route Map

| Path | Page |
|---|---|
| `/login` | `LoginPage` |
| `/` | `DashboardPage` |
| `/members` | `MembersPage` |
| `/members/:id` | `MemberDetailPage` |
| `/families` | `FamiliesPage` |
| `/families/:id` | `FamilyDetailPage` |
| `/services` | `ServicesPage` |
| `/services/:id` | `ServiceDetailPage` |
| `/attendance` | `AttendancePage` |
| `/attendance/:serviceId` | `AttendanceDetailPage` |
| `/reports` | `ReportsPage` |
| `/settings` | `SettingsPage` |

### 13.2 Layout

`AppLayout`:
- Sidebar
- Top bar
- Content area

All authenticated pages use `AppLayout`. `LoginPage` renders outside the layout.

---

## 14. Development Phases

### Phase 1 — Project Foundation

**Tasks:**
1. Initialize Go module
2. Initialize SolidJS + Vite in `/web`
3. Configure `go:embed` for `web/dist`
4. Implement `/api/health` endpoint
5. Set up SQLite connection
6. Implement migration runner
7. Configure Heroku `Procfile`

**Exit criteria:** Visiting the Heroku/Cloudflare domain shows the SolidJS app and `/api/health` returns `OK` from Go.

---

### Phase 2 — Authentication and Church Setup

**Tasks:**
1. Create `users` table
2. Create `churches` table
3. Seed or manually register the first church
4. Implement login endpoint
5. Issue session cookie
6. Protect API routes with middleware

**Exit criteria:** A user can log in and reach the dashboard.

---

### Phase 3 — Members CRUD

**Tasks:**
1. Create `members` table
2. Implement API CRUD for members
3. Build members list page
4. Build create member form
5. Build edit member page
6. Implement delete/archive action

**Exit criteria:** Members module is fully usable.

---

### Phase 4 — Litestream Backup

**Tasks:**
1. Integrate Litestream as a Go library
2. Restore database on startup
3. Periodic sync every 10 minutes
4. Debounced sync 5–10 seconds after writes
5. Sync on SIGTERM
6. Test data persistence across Heroku redeploys

**Exit criteria:** Data survives dyno restart and redeploy.

---

### Phase 5 — Services and Service Roles

**Tasks:**
1. Services CRUD
2. Service detail page
3. Assign volunteers to service roles
4. List upcoming service schedule

**Exit criteria:** A church can create services and assign volunteers.

---

### Phase 6 — Attendance

**Tasks:**
1. Create `attendance` table
2. Build attendance page per service
3. Checklist UI for attending members
4. Manually add guests
5. Save attendance

**Exit criteria:** A service's attendance can be recorded and retrieved.

---

### Phase 7 — Dashboard and Reports

**Tasks:**
1. Total active members
2. Total families
3. Upcoming services
4. This week's service roles
5. Recent attendance
6. Simple CSV export

**Exit criteria:** The application feels like a complete product.

---

## 15. Risks and Mitigations

### Risk 1 — SQLite on Heroku

**Description:** The filesystem is ephemeral; the SQLite file can be lost on restart or redeploy.
**Mitigation:** Restore on startup, sync after writes, sync on shutdown. Never assume local persistence.

### Risk 2 — Multiple Dynos

**Description:** Scaling to more than one web dyno will break SQLite due to single-file locking and divergent state.
**Mitigation:** Run exactly one web dyno. Document this constraint. Plan a PostgreSQL migration path for horizontal scale.

### Risk 3 — Data Loss Window

**Description:** Up to 10 minutes of data could be lost on a hard crash using periodic sync alone.
**Mitigation:** Debounced sync 5–10 seconds after each write significantly reduces this window. Acceptable for MVP.

### Risk 4 — Scope Creep

**Description:** Tempting features (finance, payroll, inventory, WhatsApp, mobile, complex permissions) can derail delivery.
**Mitigation:** Strictly prioritize core CRUD. Defer non-essential features to a post-MVP roadmap.

### Risk 5 — Cross-Tenant Data Leakage

**Description:** Forgetting to filter by `church_id` can expose data across churches.
**Mitigation:** Introduce a query helper that enforces `church_id` filtering at the data access layer. Add integration tests that assert tenant isolation.

---

## 16. Final Architecture Decisions

### 16.1 Backend Stack
- Go
- `chi` router
- `modernc.org/sqlite` driver
- Litestream Go library
- SQLite stored at `/tmp`

### 16.2 Frontend Stack
- SolidJS
- Vite
- `@solidjs/router`
- Static build output
- Embedded via `go:embed`

### 16.3 Deployment
- Heroku Eco
- Cloudflare in front (DNS, proxy, cache, protection)
- Object storage (Cloudflare R2 or S3-compatible) for Litestream backups

### 16.4 Product Definition

**TataGereja App** is a free church management application providing a simple dashboard for managing members, families, services, service roles, attendance, and reports.

---

## 17. Immediate Next Steps

The first actionable milestone is a "Hello World" deployment to validate the entire stack end-to-end.

**Steps:**
1. Initialize the repository
2. Set up the Go server
3. Set up the SolidJS frontend
4. Embed the frontend into the Go binary
5. Deploy a hello-world build to Heroku Eco

**Approximate commands:**

```bash
mkdir tatagereja
cd tatagereja
go mod init github.com/yourname/tatagereja
mkdir web
cd web
npm create vite@latest . -- --template solid-ts
npm install
npm install @solidjs/router
cd ..
mkdir -p cmd/server internal
```

**Success criteria for this milestone:**
- Visiting the deployed URL renders the SolidJS app.
- `GET /api/health` returns `OK` from the Go server.

Once this foundation is operational, subsequent phases can add SQLite, migrations, and members CRUD on a proven, deployable base.
