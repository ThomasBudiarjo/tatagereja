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
