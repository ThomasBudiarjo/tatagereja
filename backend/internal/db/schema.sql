-- ============================================================
-- Tata Gereja schema.sql — SQLite dialect
-- Source of truth for sqlc and the boot-time sync.
-- All CREATE TABLE use IF NOT EXISTS (idempotent).
-- Timestamps are UTC ISO 8601 strings. Booleans are INTEGER 0/1.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- Users: each user IS one church account.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    church_name     TEXT NOT NULL,
    timezone        TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- Sessions: opaque token → user. Cookie carries the token.
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================
-- Keluarga (family unit) — declared BEFORE jemaat (jemaat FKs it)
-- ============================================================

CREATE TABLE IF NOT EXISTS keluarga (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama_keluarga   TEXT NOT NULL,
    alamat          TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_keluarga_user_id ON keluarga(user_id);

-- ============================================================
-- Jemaat (church members)
-- ============================================================

CREATE TABLE IF NOT EXISTS jemaat (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama_lengkap        TEXT NOT NULL,
    nama_panggilan      TEXT,
    jenis_kelamin       TEXT CHECK (jenis_kelamin IN ('L', 'P') OR jenis_kelamin IS NULL),
    tanggal_lahir       TEXT,
    tempat_lahir        TEXT,
    alamat              TEXT,
    nomor_telepon       TEXT,
    email               TEXT,
    status_pernikahan   TEXT CHECK (
                          status_pernikahan IN ('belum_menikah', 'menikah', 'cerai', 'duda', 'janda')
                          OR status_pernikahan IS NULL
                        ),
    tanggal_baptis      TEXT,
    tanggal_sidi        TEXT,
    keluarga_id         INTEGER REFERENCES keluarga(id) ON DELETE SET NULL,
    catatan             TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_jemaat_user_id ON jemaat(user_id);
CREATE INDEX IF NOT EXISTS idx_jemaat_nama ON jemaat(user_id, nama_lengkap);
CREATE INDEX IF NOT EXISTS idx_jemaat_keluarga_id ON jemaat(keluarga_id);

-- ============================================================
-- Service types (configurable per user)
-- ============================================================

CREATE TABLE IF NOT EXISTS service_types (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    deskripsi       TEXT,
    urutan          INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, nama)
);

CREATE INDEX IF NOT EXISTS idx_service_types_user_id ON service_types(user_id);

-- ============================================================
-- Pelayan (servants) — jemaat who serve
-- ============================================================

CREATE TABLE IF NOT EXISTS pelayan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jemaat_id       INTEGER NOT NULL REFERENCES jemaat(id) ON DELETE CASCADE,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, jemaat_id)
);

CREATE INDEX IF NOT EXISTS idx_pelayan_user_id ON pelayan(user_id);
CREATE INDEX IF NOT EXISTS idx_pelayan_jemaat_id ON pelayan(jemaat_id);

CREATE TABLE IF NOT EXISTS pelayan_service_types (
    pelayan_id          INTEGER NOT NULL REFERENCES pelayan(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (pelayan_id, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_pelayan_st_service_type_id ON pelayan_service_types(service_type_id);

-- ============================================================
-- Kebaktian / Persekutuan
-- ============================================================

CREATE TABLE IF NOT EXISTS kebaktian (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    waktu_mulai     TEXT NOT NULL,
    lokasi          TEXT,
    tema            TEXT,
    pengkhotbah     TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_kebaktian_user_id ON kebaktian(user_id);
CREATE INDEX IF NOT EXISTS idx_kebaktian_waktu ON kebaktian(user_id, waktu_mulai);

-- ============================================================
-- Jadwal pelayanan
-- ============================================================

CREATE TABLE IF NOT EXISTS jadwal_pelayanan (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kebaktian_id        INTEGER NOT NULL REFERENCES kebaktian(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
    pelayan_id          INTEGER REFERENCES pelayan(id) ON DELETE SET NULL,
    catatan             TEXT,
    confirmed           INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (kebaktian_id, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_jadwal_user_id ON jadwal_pelayanan(user_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_kebaktian_id ON jadwal_pelayanan(kebaktian_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_pelayan_id ON jadwal_pelayanan(pelayan_id);
