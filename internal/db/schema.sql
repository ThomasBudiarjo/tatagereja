PRAGMA foreign_keys = ON;

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

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

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

CREATE TABLE IF NOT EXISTS jemaat (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama_lengkap        TEXT NOT NULL,
    nama_panggilan      TEXT,
    jenis_kelamin       TEXT CHECK (jenis_kelamin IN ('L','P') OR jenis_kelamin IS NULL),
    tanggal_lahir       TEXT,
    tempat_lahir        TEXT,
    alamat              TEXT,
    nomor_telepon       TEXT,
    email               TEXT,
    status_pernikahan   TEXT CHECK (
        status_pernikahan IN ('belum_menikah','menikah','cerai','duda','janda')
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

CREATE TABLE IF NOT EXISTS service_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama        TEXT NOT NULL,
    deskripsi   TEXT,
    urutan      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, nama)
);

CREATE TABLE IF NOT EXISTS pelayan (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jemaat_id   INTEGER NOT NULL REFERENCES jemaat(id) ON DELETE CASCADE,
    catatan     TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, jemaat_id)
);

CREATE TABLE IF NOT EXISTS pelayan_service_types (
    pelayan_id      INTEGER NOT NULL REFERENCES pelayan(id) ON DELETE CASCADE,
    service_type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    PRIMARY KEY (pelayan_id, service_type_id)
);

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
CREATE INDEX IF NOT EXISTS idx_kebaktian_waktu ON kebaktian(user_id, waktu_mulai);

CREATE TABLE IF NOT EXISTS jadwal_pelayanan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kebaktian_id    INTEGER NOT NULL REFERENCES kebaktian(id) ON DELETE CASCADE,
    service_type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
    pelayan_id      INTEGER REFERENCES pelayan(id) ON DELETE SET NULL,
    catatan         TEXT,
    confirmed       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (kebaktian_id, service_type_id)
);
