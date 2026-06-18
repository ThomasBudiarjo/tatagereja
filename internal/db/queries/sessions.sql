-- name: CreateSession :one
INSERT INTO sessions (id, user_id, expires_at)
VALUES (?, ?, ?)
RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions
WHERE id = ?;

-- name: DeleteSession :exec
DELETE FROM sessions
WHERE id = ?;

-- name: DeleteSessionsForUser :exec
DELETE FROM sessions
WHERE user_id = ?;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions
WHERE expires_at < datetime('now');

-- name: GetUserBySessionID :one
SELECT u.* FROM users u
JOIN sessions s ON s.user_id = u.id
WHERE s.id = ? AND s.expires_at > datetime('now');
