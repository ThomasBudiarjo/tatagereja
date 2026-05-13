-- ============================================================
-- Shepherd schema.sql — SQLite / libSQL dialect
-- Source of truth for sqlc and Atlas.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- Tenancy & auth
-- ============================================================

CREATE TABLE churches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    timezone      TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor', 'viewer')),
    is_active       INTEGER NOT NULL DEFAULT 1,
    last_login_at   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_church_id ON users(church_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- Jemaat (church members)
-- ============================================================

CREATE TABLE jemaat (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id           INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
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
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jemaat_church_id ON jemaat(church_id);
CREATE INDEX idx_jemaat_nama ON jemaat(church_id, nama_lengkap);
CREATE INDEX idx_jemaat_keluarga_id ON jemaat(keluarga_id);

-- ============================================================
-- Keluarga (family unit)
-- ============================================================

CREATE TABLE keluarga (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama_keluarga   TEXT NOT NULL,
    alamat          TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_keluarga_church_id ON keluarga(church_id);

-- ============================================================
-- Service types (jenis pelayanan)
-- ============================================================

CREATE TABLE service_types (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    deskripsi       TEXT,
    warna           TEXT,
    urutan          INTEGER NOT NULL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (church_id, nama)
);

CREATE INDEX idx_service_types_church_id ON service_types(church_id);

-- ============================================================
-- Pelayan (servants)
-- ============================================================

CREATE TABLE pelayan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    jemaat_id       INTEGER NOT NULL REFERENCES jemaat(id) ON DELETE CASCADE,
    catatan         TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (church_id, jemaat_id)
);

CREATE INDEX idx_pelayan_church_id ON pelayan(church_id);
CREATE INDEX idx_pelayan_jemaat_id ON pelayan(jemaat_id);

CREATE TABLE pelayan_service_types (
    pelayan_id          INTEGER NOT NULL REFERENCES pelayan(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    skill_level         TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced') OR skill_level IS NULL),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (pelayan_id, service_type_id)
);

CREATE INDEX idx_pelayan_st_service_type_id ON pelayan_service_types(service_type_id);

-- ============================================================
-- Kebaktian / Persekutuan (events)
-- ============================================================

CREATE TABLE kebaktian (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    tanggal         TEXT NOT NULL,
    waktu_mulai     TEXT NOT NULL,
    lokasi          TEXT,
    tema            TEXT,
    pengkhotbah     TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_kebaktian_church_id ON kebaktian(church_id);
CREATE INDEX idx_kebaktian_tanggal ON kebaktian(church_id, tanggal);

-- ============================================================
-- Jadwal pelayanan (assignments)
-- ============================================================

CREATE TABLE jadwal_pelayanan (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id           INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    kebaktian_id        INTEGER NOT NULL REFERENCES kebaktian(id) ON DELETE CASCADE,
    service_type_id     INTEGER NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
    pelayan_id          INTEGER REFERENCES pelayan(id) ON DELETE SET NULL,
    catatan             TEXT,
    status              TEXT NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN ('scheduled', 'confirmed', 'declined', 'completed')),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jadwal_church_id ON jadwal_pelayanan(church_id);
CREATE INDEX idx_jadwal_kebaktian_id ON jadwal_pelayanan(kebaktian_id);
CREATE INDEX idx_jadwal_pelayan_id ON jadwal_pelayanan(pelayan_id);

-- ============================================================
-- Audit log
-- ============================================================

CREATE TABLE audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER,
    payload_json    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_church_id ON audit_log(church_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);
