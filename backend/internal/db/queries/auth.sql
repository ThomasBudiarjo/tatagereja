-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = ?;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = ?;

-- name: CreateUser :one
INSERT INTO users (email, password_hash, display_name, church_name, timezone)
VALUES (?, ?, ?, ?, ?) RETURNING *;

-- name: UpsertUser :one
INSERT INTO users (email, password_hash, display_name, church_name, timezone)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(email) DO UPDATE SET
    password_hash = excluded.password_hash,
    display_name  = excluded.display_name,
    church_name   = excluded.church_name,
    timezone      = excluded.timezone,
    updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ','now')
RETURNING *;

-- name: CreateSession :one
INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?) RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions
WHERE token = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now');

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token = ?;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now');
