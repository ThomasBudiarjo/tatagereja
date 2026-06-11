CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  expires_at  DATETIME NOT NULL,
  created_at  DATETIME NOT NULL
);

CREATE INDEX idx_users_church          ON users(church_id);
CREATE INDEX idx_members_church        ON members(church_id);
CREATE INDEX idx_families_church       ON families(church_id);
CREATE INDEX idx_services_church       ON services(church_id);
CREATE INDEX idx_family_members_family ON family_members(family_id);
CREATE INDEX idx_family_members_member ON family_members(member_id);
CREATE INDEX idx_service_roles_service ON service_roles(service_id);
CREATE INDEX idx_attendance_service    ON attendance(service_id);
CREATE INDEX idx_sessions_user         ON sessions(user_id);
CREATE INDEX idx_sessions_expires      ON sessions(expires_at);
