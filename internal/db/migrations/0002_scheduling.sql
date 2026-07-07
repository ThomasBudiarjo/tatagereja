CREATE TABLE persons (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    notes      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_persons_name ON persons(name);

CREATE TABLE serving_roles (
    code       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE services (
    id                  TEXT PRIMARY KEY,
    pelayanan_type_code TEXT NOT NULL REFERENCES pelayanan_types(code),
    service_date        TEXT NOT NULL,
    start_time          TEXT NOT NULL,
    title               TEXT NOT NULL DEFAULT '',
    notes               TEXT NOT NULL DEFAULT '',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_services_date ON services(service_date);

CREATE TABLE assignments (
    id         TEXT PRIMARY KEY,
    service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    person_id  TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    role_code  TEXT NOT NULL REFERENCES serving_roles(code),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (service_id, person_id, role_code)
);

CREATE INDEX idx_assignments_service_id ON assignments(service_id);
CREATE INDEX idx_assignments_person_id ON assignments(person_id);
